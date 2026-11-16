import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Storage for the Unified Capability Library.
 *
 * Uses Node's built-in `node:sqlite` (no native build, no runtime dependency)
 * with FTS5. The database is a SEPARATE file, in a separate namespace, with no
 * relation to Nox's LibSQL data. Nox's missions, checkpoints, lessons and grants
 * are never touched. Uninstalling means deleting one file.
 */

const SCHEMA_VERSION = 1;
const DELIVERED_INDEX_SHA256 = 'ef2bee5e689d484b86c2dbff0138347cb5f6e1a5f9a4dcd45c58aef51e39e1be';
const DELIVERED_SOURCE_SHA256 = '5a83c501b290b83a17f6ffaeb0fe9cae772e26be7a6a4c5cbcb948908fc76b56';

export interface OpenOptions {
  readonly path: string;
  /** This trimmed Nox integration has no writable opening mode. */
  readonly readOnly: true;
}

export interface Store {
  readonly db: DatabaseSync;
  readonly path: string;
  close(): void;
}

export function openStore(opts: OpenOptions): Store {
  const path = opts.path === ':memory:' ? ':memory:' : resolve(opts.path);
  if (opts.readOnly) {
    // Read-only open: no mkdir, no DDL, no writes. A foreign SQLite file is refused instead of being given tables.
    if (path === ':memory:') throw new Error('UCL_READONLY_MEMORY');
    const ro = new DatabaseSync(path, { readOnly: true });
    try {
      ro.exec('PRAGMA busy_timeout = 5000');
      const meta = ro.prepare('SELECT value FROM ucl_meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
      if (!meta) throw new Error('UCL_NOT_A_UCL_INDEX');
      if (meta.value !== String(SCHEMA_VERSION)) throw new Error(`UCL_SCHEMA_VERSION_MISMATCH:${meta.value}!=${SCHEMA_VERSION}`);
    } catch (err) {
      ro.close();
      throw err;
    }
    return { db: ro, path, close: () => ro.close() };
  }
  throw new Error('UCL_READ_ONLY_REQUIRED');
}

/** Bind lookups to the delivered catalogue, not merely to a compatible schema. */
export function assertIndexFresh(store: Store): void {
  const snapshot = store.db.prepare(
    'SELECT source_sha, source_rows, body_digest FROM import_snapshot ORDER BY imported_at DESC LIMIT 1',
  ).get() as { source_sha?: string; source_rows?: number; body_digest?: string } | undefined;
  if (snapshot?.source_sha !== DELIVERED_SOURCE_SHA256 ||
      snapshot.source_rows !== 4504 || typeof snapshot.body_digest !== 'string' || !snapshot.body_digest) {
    throw new Error('UCL_STALE_OR_UNKNOWN_INDEX');
  }
  const entities = store.db.prepare('SELECT count(*) AS n FROM capability').get() as { n: number };
  const sources = store.db.prepare('SELECT count(*) AS n FROM source_record').get() as { n: number };
  if (entities.n !== 4466 || sources.n !== 4504) throw new Error('UCL_INDEX_COUNT_MISMATCH');
  // Counts and stored provenance are metadata, not content authentication. The
  // runtime consumes one immutable delivered snapshot, so bind every lookup to
  // its complete bytes. This also covers FTS contents and trust_state; a
  // count-preserving title or status edit must never be served as the snapshot.
  const actual = createHash('sha256').update(readFileSync(store.path)).digest('hex');
  if (actual !== DELIVERED_INDEX_SHA256) throw new Error('UCL_INDEX_CONTENT_MISMATCH');
}
