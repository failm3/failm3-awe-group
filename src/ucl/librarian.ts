import { capabilitiesFromText } from './classify.js';
import { digest } from './canonical.js';
import type { Store } from './db.js';
import type {
  CapabilityKind,
  NoxCapability,
  SearchHit,
  SearchQuery,
  SearchResult,
  TrustState,
} from './types.js';
import { CAPABILITY_KINDS, NOX_CAPABILITIES } from './types.js';

/**
 * The Librarian.
 *
 * Deterministic lookup: keyword and tag filters plus FTS5 BM25, all local, with
 * zero model calls. It returns *metadata* and readable evidence. It has no
 * execution authority and cannot grant permissions: `execution_authority` is
 * always false and `permissions` is always 'NONE'.
 *
 * Progressive disclosure: a hit carries a short title, a few tags and one or two
 * evidence strings. Descriptions never leave this layer wholesale, so a caller
 * cannot be flooded with thousands of schemas.
 */

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 5;

const FTS_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'is', 'are',
  'и', 'в', 'на', 'с', 'для', 'по', 'из', 'а', 'или', 'как', 'что', 'это', 'мне',
  'нужно', 'надо', 'найти', 'хочу',
]);

/**
 * Turn untrusted free text into a safe FTS5 query.
 *
 * Two problems solved here:
 *  1. FTS5 treats characters as operators. Only letters/digits survive, so no
 *     query text can ever become an operator or a syntax injection.
 *  2. FTS5 joins bare tokens with AND, so a natural phrase like
 *     "сделать скриншот браузера" could never match. We join with OR, which is
 *     the right semantics for a relevance search, and add prefix wildcards so
 *     Russian and English inflection still match.
 */
function tokenize(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !FTS_STOPWORDS.has(t));
  return [...new Set(tokens)].slice(0, 24);
}

function buildFtsQuery(tokens: readonly string[]): string {
  if (tokens.length === 0) return '';
  // Tokens are already reduced to letters/digits, so they cannot become FTS
  // operators. OR + prefix keeps relevance ranking useful across inflection.
  return tokens.map((t) => `"${t}"*`).join(' OR ');
}

export interface LibrarianOptions {
  /** Records with any hazard are hidden unless the query asks for them
   * explicitly. Default true: a hazard is a security review trigger. */
  readonly hideHazardous?: boolean;
}

export function normalizeQuery(q: SearchQuery, opts: LibrarianOptions = {}): Required<Pick<SearchQuery, 'limit' | 'hazards'>> & SearchQuery {
  const limit = q.limit ?? DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('UCL_QUERY_LIMIT');
  if (limit > MAX_LIMIT) throw new Error('UCL_QUERY_LIMIT');
  const hazards = q.hazards ?? (opts.hideHazardous === false ? 'include' : 'exclude');
  if (!['exclude', 'only', 'include'].includes(hazards)) throw new Error('UCL_QUERY_HAZARDS');
  if (q.capabilities) {
    for (const c of q.capabilities) {
      if (!(NOX_CAPABILITIES as readonly string[]).includes(c)) throw new Error('UCL_QUERY_CAPABILITY');
    }
  }
  if (q.kinds) {
    for (const k of q.kinds) {
      if (!(CAPABILITY_KINDS as readonly string[]).includes(k)) throw new Error('UCL_QUERY_KIND');
    }
  }
  if (q.text_filter !== undefined && (q.text_filter.length === 0 || q.text_filter.length > 200)) {
    throw new Error('UCL_QUERY_TEXT_FILTER');
  }
  return { ...q, limit, hazards };
}

/**
 * Search. Deterministic for identical input and database state.
 *
 * Ranking is transparent and additive, so a caller can explain any order:
 *   +40 per explicitly requested capability matched
 *   +10 when the record's kind is in the requested kinds
 *   + BM25 relevance from FTS (small, bounded contribution)
 * Ties break on canonical_id, ascending.
 */
export function search(store: Store, query: SearchQuery, opts: LibrarianOptions = {}): SearchResult {
  const q = normalizeQuery(query, opts);
  const queryDigest = digest(q);

  const needText = (q.need ?? '').trim();
  const requested = new Set<string>(q.capabilities ?? []);
  if (needText) for (const c of capabilitiesFromText(needText)) requested.add(c);

  const ftsTokens = tokenize([needText, q.text_filter ?? ''].join(' '));
  const ftsText = buildFtsQuery(ftsTokens);
  const tagsForRecord = new Map<string, { capabilities: string[]; hazards: string[] }>();

  // A query with no capability and no usable token has nothing to match on.
  // Falling through to an unfiltered SELECT would return arbitrary rows with
  // score 0 and call that OK — a fabricated result, which is the one thing this
  // library must never do. A query of pure punctuation, of stopwords only ("the"),
  // or of an empty string abstains.
  if (requested.size === 0 && ftsTokens.length === 0) {
    return {
      status: 'NOT_FOUND',
      query_digest: queryDigest,
      hits: [],
      examined: 0,
      rationale:
        'The query carries no capability and no searchable word (punctuation, stopwords or empty text only). This is an abstain, not a failure: there is nothing to match against.',
      permissions: 'NONE',
      execution_authority: false,
    };
  }

  interface Row {
    canonical_id: string;
    title: string;
    url: string;
    kind: string;
    trust_state: string;
    duplicate_count: number;
    fts_score: number;
  }

  const params: (string | number)[] = [];
  let sql: string;
  // FTS drives retrieval only when no capability was requested. With a capability
  // (explicit or derived), the tag is the hard filter and FTS merely boosts rank;
  // otherwise a need written in one language could never match a record described
  // in another, even though the capability tag matches.
  const useFts = ftsText !== '' && requested.size === 0;
  if (useFts) {
    sql = `
      SELECT c.canonical_id, c.title, c.canonical_url AS url, c.kind, c.trust_state,
             (SELECT count(*) FROM source_record s WHERE s.canonical_id = c.canonical_id) AS duplicate_count,
             bm25(capability_fts) AS fts_score
      FROM capability_fts
      JOIN capability c ON c.canonical_id = capability_fts.canonical_id
      WHERE capability_fts MATCH ?`;
    params.push(ftsText);
  } else {
    sql = `
      SELECT c.canonical_id, c.title, c.canonical_url AS url, c.kind, c.trust_state,
             (SELECT count(*) FROM source_record s WHERE s.canonical_id = c.canonical_id) AS duplicate_count,
             0 AS fts_score
      FROM capability c`;
    if (requested.size > 0) {
      const caps = [...requested];
      sql += ` WHERE c.canonical_id IN (SELECT canonical_id FROM capability_tag WHERE tag_kind = 'capability' AND tag IN (${caps.map(() => '?').join(',')}))`;
      params.push(...caps);
    }
  }

  // Build the remaining predicates. Access control is structural: a project
  // scope, when used, is resolved by the caller's ACL adapter before we get here.
  const where: string[] = [];
  if (q.kinds && q.kinds.length > 0) {
    where.push(`c.kind IN (${q.kinds.map(() => '?').join(',')})`);
    params.push(...q.kinds);
  }
  if (q.trust && q.trust.length > 0) {
    where.push(`c.trust_state IN (${q.trust.map(() => '?').join(',')})`);
    params.push(...q.trust);
  }
  if (where.length > 0) {
    sql += (useFts || requested.size > 0 ? ' AND ' : ' WHERE ') + where.join(' AND ');
  }

  // A generous cap on candidates examined, so a broad query stays bounded.
  sql += ' LIMIT 4000';

  const rows = store.db.prepare(sql).all(...params) as unknown as Row[];

  // When a capability filter drove retrieval, text relevance is a boost only.
  const ftsBoost = new Map<string, number>();
  if (ftsText !== '' && requested.size > 0) {
    const boosted = store.db
      .prepare('SELECT canonical_id, bm25(capability_fts) AS s FROM capability_fts WHERE capability_fts MATCH ? LIMIT 4000')
      .all(ftsText) as unknown as { canonical_id: string; s: number }[];
    for (const b of boosted) ftsBoost.set(b.canonical_id, Number(b.s));
  }

  const tagStmt = store.db.prepare(
    'SELECT tag, tag_kind FROM capability_tag WHERE canonical_id = ?',
  );
  const textStmt = store.db.prepare(
    'SELECT title, description FROM capability WHERE canonical_id = ?',
  );

  // A record must be relevant, not merely token-adjacent. With OR + prefix
  // matching almost anything hits something, so we require either an explicit
  // capability match or a majority of the query tokens to appear in the record.
  // Below that floor the answer is NOT_FOUND — an honest abstain.
  const requiredTokenOverlap = ftsTokens.length === 0 ? 0 : Math.ceil(ftsTokens.length * 0.5);

  const scored: { row: Row; score: number; caps: string[]; hazards: string[]; matched: string[] }[] = [];
  for (const row of rows) {
    const tags = (tagStmt.all(row.canonical_id) as { tag: string; tag_kind: string }[]) ?? [];
    const caps = tags.filter((t) => t.tag_kind === 'capability').map((t) => t.tag);
    const hazards = tags.filter((t) => t.tag_kind === 'hazard').map((t) => t.tag);
    tagsForRecord.set(row.canonical_id, { capabilities: caps, hazards });

    const matched = [...requested].filter((c) => caps.includes(c));
    // Capability filter is inclusive when capabilities were requested.
    if (requested.size > 0 && matched.length === 0) continue;

    if (q.hazards === 'exclude' && hazards.length > 0) continue;
    if (q.hazards === 'only' && hazards.length === 0) continue;

    if (ftsTokens.length > 0 && matched.length === 0) {
      const body = textStmt.get(row.canonical_id) as
        | { title: string; description: string }
        | undefined;
      const haystack = `${body?.title ?? row.title}\n${body?.description ?? ''}\n${caps.join(' ')}\n${hazards.join(' ')}`.toLowerCase();
      const overlap = ftsTokens.filter((t) => haystack.includes(t)).length;
      if (overlap < requiredTokenOverlap || overlap < 1) continue;
    }

    // BM25 returns negative values in SQLite (more negative = more relevant).
    const rawScore = ftsBoost.get(row.canonical_id) ?? row.fts_score;
    const bm25 = Number.isFinite(rawScore) ? Number(rawScore) : 0;
    const ftsContribution = bm25 < 0 ? Math.min(30, -bm25 * 2) : 0;

    const score =
      matched.length * 40 +
      (q.kinds && q.kinds.includes(row.kind as CapabilityKind) ? 10 : 0) +
      ftsContribution;

    scored.push({ row, score, caps, hazards, matched });
  }

  scored.sort((a, b) => b.score - a.score || a.row.canonical_id.localeCompare(b.row.canonical_id, 'en'));

  const hits: SearchHit[] = scored.slice(0, q.limit).map((s) => {
    const evidence: string[] = [];
    if (s.matched.length > 0) evidence.push(`capability match: ${s.matched.join(', ')}`);
    if (s.row.duplicate_count > 1) evidence.push(`${s.row.duplicate_count} catalog rows share this address`);
    if (s.hazards.length > 0) evidence.push(`hazard: ${s.hazards.join(', ')}`);
    evidence.push(`trust: ${s.row.trust_state} (not qualified by this library)`);
    return {
      canonical_id: s.row.canonical_id,
      title: s.row.title.slice(0, 200),
      url: s.row.url,
      kind: s.row.kind as CapabilityKind,
      capabilities: s.caps as NoxCapability[],
      trust_state: s.row.trust_state as TrustState,
      hazards: s.hazards as never,
      duplicate_count: s.row.duplicate_count,
      score: Math.round(s.score * 100) / 100,
      rationale:
        s.matched.length > 0
          ? `Matched ${s.matched.length} requested capability: ${s.matched.join(', ')}.`
          : 'Matched full-text query only; no capability filter applied.',
      evidence,
    };
  });

  return {
    status: hits.length > 0 ? 'OK' : 'NOT_FOUND',
    query_digest: queryDigest,
    hits,
    examined: rows.length,
    rationale:
      hits.length > 0
        ? `${hits.length} of ${scored.length} matching records returned (bounded, deterministic).`
        : 'No record matched. This is an abstain, not a failure: the library does not invent candidates.',
    permissions: 'NONE',
    execution_authority: false,
  };
}

/** Count records for a quick inventory / CLI summary. */
export function stats(store: Store): Record<string, number> {
  const one = (sql: string) =>
    Number((store.db.prepare(sql).get() as { n: number } | undefined)?.n ?? 0);
  return {
    records: one('SELECT count(*) AS n FROM capability'),
    source_rows: one('SELECT count(*) AS n FROM source_record'),
    hazardous: one("SELECT count(DISTINCT canonical_id) AS n FROM capability_tag WHERE tag_kind='hazard'"),
    qualified: one("SELECT count(*) AS n FROM capability WHERE trust_state <> 'UNVETTED'"),
  };
}
