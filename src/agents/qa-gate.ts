/**
 * AWE GROUP — Deterministic QA gate.
 *
 * The QA Agent (an LLM) produces a structured review. This module applies a
 * *deterministic* gate on top of it so that a mission can never be declared
 * COMPLETED while an acceptance criterion is unmet.
 *
 * Rationale (from AWE-READINESS-01): the QA agent is score-only — it could
 * score 7/PASS while the produced report literally said
 * "Pending transcription of the researcher ti_search result set". That is a
 * false positive. The LLM verdict is advisory; this gate is binding.
 *
 * The gate NEVER relaxes the LLM's own verdict. It can only *block* a pass.
 */

import type { Mission, QAReview } from "../types/index.js";

// ─── Configuration ───────────────────────────────────────────────────────────

/** Minimum QA score required for a pass (unchanged from prior decision). */
export const QA_SCORE_THRESHOLD = 6;

/**
 * Phrases that indicate a section was left unfilled. These are treated as
 * hard failures regardless of the LLM score, because an unfilled section is
 * a missing deliverable, not a stylistic choice.
 */
export const PLACEHOLDER_MARKERS = [
  "pending transcription",
  "pending transcription.",
  "placeholder",
  "todo",
  "tbd",
  "to be determined",
  "to be filled",
  "coming soon",
  "lorem ipsum",
  "not implemented",
  "not yet implemented",
  "fill in later",
  "will be added later",
  "здесь будет",
  "в разработке",
  "ожидает транскрипции",
  "заглушка",
];

/** Words that indicate a criterion demands a binary/image deliverable. */
const IMAGE_CRITERION_HINTS = [
  "screenshot",
  "скриншот",
  "png",
  "jpeg",
  "jpg",
  "изображение",
  "картинк",
  "визуал",
];

/** Words that indicate a criterion demands a URL / local address. */
const URL_CRITERION_HINTS = ["url", "ссылк", "адрес", "localhost", "http://", "https://"];

/** Words that indicate a criterion demands a file on disk. */
const FILE_CRITERION_HINTS = ["file", "файл", "исходник", "source", "артефакт"];

// ─── Text utilities ──────────────────────────────────────────────────────────

/**
 * Normalize a string for comparison: lowercase, strip punctuation and
 * collapse whitespace. Russian and English both survive this.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize into meaningful words, dropping very short/function words that
 * would inflate similarity scores.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
  "has", "have", "been", "will", "shall", "must", "into", "using", "use",
  "и", "в", "на", "с", "по", "для", "что", "не", "как", "или", "а", "из",
  "к", "у", "о", "за", "то", "же", "бы", "их", "им", "их", "он", "она",
  "its", "a", "an", "of", "to", "in", "on", "is", "are", "it", "as", "at",
  "by", "be", "or", "than", "then", "there", "here", "all", "any", "each",
]);

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Jaccard-style similarity between two token sets (0..1).
 * Used to match a QA-reported criterion back to the mission criterion,
 * since the LLM does not always copy criterion text verbatim.
 */
export function similarity(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  return intersection / (sa.size + sb.size - intersection);
}

/**
 * Match each mission acceptance criterion to the QA criterion result that
 * covers it.
 *
 * Returns a list of entries: `{ criterion, result | null, matchScore }`.
 * A criterion with `result === null` was NOT evaluated by the QA agent at all.
 */
export function matchCriteria(
  missionCriteria: string[],
  qaResults: QAReview["criteria_results"]
): Array<{
  criterion: string;
  result: QAReview["criteria_results"][number] | null;
  matchScore: number;
}> {
  const used = new Set<number>();

  return missionCriteria.map((criterion) => {
    const norm = normalize(criterion);
    let bestIndex = -1;
    let bestScore = 0;

    qaResults.forEach((r, idx) => {
      if (used.has(idx)) return;
      const rNorm = normalize(r.criterion);
      if (!rNorm) return; // Blank review rows cannot certify any requirement.
      let score = similarity(criterion, r.criterion);
      // Exact normalized match is authoritative.
      if (rNorm === norm) score = 1;
      // A QA result that merely mentions the criterion as a substring counts.
      if (score < 0.9 && (rNorm.includes(norm) || norm.includes(rNorm)) && norm.length > 15) {
        score = Math.max(score, 0.95);
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    });

    // Accept a match only above the similarity floor.
    const MATCH_FLOOR = 0.34;
    if (bestIndex >= 0 && bestScore >= MATCH_FLOOR) {
      used.add(bestIndex);
      return { criterion, result: qaResults[bestIndex], matchScore: bestScore };
    }
    return { criterion, result: null, matchScore: bestScore };
  });
}

// ─── Placeholder detection ───────────────────────────────────────────────────

export interface PlaceholderHit {
  marker: string;
  /** Which evidence string the marker was found in. */
  source: string;
  excerpt: string;
}

/**
 * Scan evidence for unfilled-section markers.
 *
 * Only whole-token matches are considered for short markers ("todo",
 * "placeholder", "tbd") so that words like "todos" inside other words or
 * substrings inside legitimate identifiers do not trigger false positives.
 */
export function findPlaceholders(
  evidence: Array<{ label: string; text: string }>
): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];

  for (const { label, text } of evidence) {
    if (!text) continue;
    const norm = normalize(text);
    for (const marker of PLACEHOLDER_MARKERS) {
      const mNorm = normalize(marker);
      let found = false;
      if (mNorm.includes(" ")) {
        found = norm.includes(mNorm);
      } else {
        // whole-token match
        found = markerPattern(mNorm, "i").test(norm);
      }
      if (found) {
        const idx = norm.indexOf(mNorm);
        hits.push({
          marker,
          source: label,
          excerpt: text.slice(Math.max(0, idx - 60), idx + mNorm.length + 60).trim(),
        });
      }
    }
  }
  // A marker inside executable code is a reference to the concept, not an
  // unfilled section: a verifier that scans for "TODO" or a script named
  // no-placeholder-check is complete work. Only prose occurrences count.
  return hits.filter(
    (hit) => !isCodeReference(hit, evidence) && !isNegatedReference(hit, evidence)
  );
}

/** Words that turn a following marker into an assertion of absence. */
const NEGATIONS = new Set([
  "no", "not", "never", "without", "zero", "none", "non", "nor", "neither",
  "не", "нет", "без", "никогда", "ни", "отсутствие", "отсутствуют",
]);

/** How far before a marker a negation still governs it, in words. */
const NEGATION_WINDOW = 6;

/**
 * True when the marker is negated in the clause it appears in: "no
 * placeholders", "no-placeholder", "without TODO markers", "never leaves
 * placeholder values". Those state that none exist — the opposite of an
 * unfilled section. The scan stops at sentence punctuation so a negation in a
 * previous sentence cannot excuse a real gap: "No results yet. TODO: fill in
 * the site section" still reports the TODO.
 */
function isNegatedReference(
  hit: PlaceholderHit,
  evidence: Array<{ label: string; text: string }>
): boolean {
  const source = evidence.find((item) => item.label === hit.source)?.text;
  if (!source) return false;
  const marker = markerPattern(hit.marker, "gi");
  let seen = 0;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    seen++;
    const before = source.slice(0, match.index);
    // A blank line is a paragraph break, not a clause boundary: "Totals\n\n
    // placeholder" must not present the marker as its own empty sentence
    // (which would have no negation and would still report). Only punctuation
    // and single line breaks separate clauses.
    const clauseStart = Math.max(
      before.lastIndexOf("."),
      before.lastIndexOf("!"),
      before.lastIndexOf("?"),
      before.lastIndexOf(";"),
      before.lastIndexOf(":"),
      before.lastIndexOf("\n\n")
    );
    const window = clauseWords(before.slice(clauseStart + 1)).slice(-NEGATION_WINDOW);
    // One un-negated occurrence is a real gap, whatever the others say.
    if (!window.some((word) => NEGATIONS.has(word))) return false;
  }
  return seen > 0;
}

function clauseWords(clause: string): string[] {
  return normalize(clause).split(" ").filter(Boolean);
}

/**
 * True when the marker appears in code rather than prose: its source line is a
 * comment-free statement that uses the word as a literal (assignment, string
 * quote, comparison, call, or a file full of such statements).
 */
function isCodeReference(
  hit: PlaceholderHit,
  evidence: Array<{ label: string; text: string }>
): boolean {
  const source = evidence.find((item) => item.label === hit.source)?.text;
  if (!source) return false;
  const marker = markerPattern(hit.marker, "i");
  const lines = source.split("\n");
  const codeLines: string[] = [];
  const proseLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (marker.test(trimmed)) {
      (looksLikeCode(trimmed) ? codeLines : proseLines).push(trimmed);
    } else if (looksLikeProse(line)) proseLines.push(trimmed);
  }
  if (codeLines.length === 0) return false;
  const decisive = codeLines.some((line) =>
    /[=!<>]=|=~|^if\b|\bif\s*\(|\b(re|RegExp)\s*[.(]|["'`][^"'`]*\b(?:todo|tbd|placeholder|coming soon)\b[^"'`]*["'`]|#\s*TODO:/i.test(line));
  return decisive || proseLines.length === 0;
}

function looksLikeCode(line: string): boolean {
  const trimmed = line.trim();
  if (/^(#|\/\/|\/\*|\*)/.test(trimmed)) return false;
  return /[;{}]|=>|^\s*(if|for|while|def|function|const|let|var|return|import|from|echo|qa|assert)\b|^\s*[\w.]+\s*\(|^\s*[\w.-]+\s*=\s*\S/.test(trimmed);
}

function looksLikeProse(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.split(/\s+/).length >= 5 && /[.!?:]\s*$|[a-z],[a-z]/i.test(trimmed);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-token matcher for a marker.
 *
 * `\b` in JavaScript is ASCII-only, so a Cyrillic marker ("заглушка") never
 * matched at all. Explicit Unicode letter/number boundaries fix that while
 * keeping "todos" from matching "todo".
 */
function markerPattern(marker: string, flags = ""): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegex(normalize(marker))}(?![\\p{L}\\p{N}_])`,
    flags.includes("u") ? flags : flags + "u"
  );
}

// ─── Deliverable presence checks ────────────────────────────────────────────

export interface DeliverableCheck {
  criterion: string;
  requirement: "image" | "url" | "file";
  satisfied: boolean;
  detail: string;
}

/**
 * For criteria that explicitly demand a concrete deliverable (an image, a
 * URL, a file), check that it is actually present in the evidence.
 *
 * This is what catches the case where the agent described a screenshot but
 * never produced one.
 */
export function checkDeliverables(
  matched: Array<{
    criterion: string;
    result: QAReview["criteria_results"][number] | null;
  }>,
  evidence: Array<{ label: string; text: string }>
): DeliverableCheck[] {
  const checks: DeliverableCheck[] = [];
  const allText = evidence.map((e) => e.text).join("\n");
  const allLabels = evidence.map((e) => e.label).join("\n");

  for (const { criterion } of matched) {
    const norm = normalize(criterion);

    if (IMAGE_CRITERION_HINTS.some((h) => norm.includes(normalize(h)))) {
      const hasImage = /artifact[^:\n]*:\s*\S+\.(png|jpe?g|gif|webp)/i.test(allText);
      const namedImage = /\.(png|jpe?g|gif|webp)\b/i.test(allLabels);
      checks.push({
        criterion,
        requirement: "image",
        satisfied: hasImage || namedImage,
        detail: hasImage || namedImage
          ? "image artifact found in evidence"
          : "criterion requires an image artifact but none is present in the evidence",
      });
    }

    if (URL_CRITERION_HINTS.some((h) => norm.includes(normalize(h)))) {
      const hasUrl = /https?:\/\/[^\s"'<>)]+/i.test(allText);
      checks.push({
        criterion,
        requirement: "url",
        satisfied: hasUrl,
        detail: hasUrl
          ? "URL found in evidence"
          : "criterion requires a URL but none is present in the evidence",
      });
    }

    if (FILE_CRITERION_HINTS.some((h) => norm.includes(normalize(h)))) {
      const hasFile =
        /artifact[^:\n]*:\s*\S+/i.test(allText) || /\.(md|html|css|js|ts|py|json|txt)\b/i.test(allLabels);
      checks.push({
        criterion,
        requirement: "file",
        satisfied: hasFile,
        detail: hasFile
          ? "file artifact found in evidence"
          : "criterion requires a file deliverable but none is present in the evidence",
      });
    }
  }

  return checks;
}

// ─── The gate ────────────────────────────────────────────────────────────────

export interface QAGateResult {
  /** Final binding verdict. `false` blocks mission completion. */
  passed: boolean;
  /** Why the gate blocked (empty when passed). */
  blockers: string[];
  /** Per-criterion enforcement detail, for the audit trail. */
  criterion_checks: Array<{
    criterion: string;
    passed: boolean;
    reason: string;
  }>;
  /** Score reported by the LLM reviewer (advisory). */
  llm_score: number;
  /** Whether the LLM reviewer itself said passed. */
  llm_passed: boolean;
}

/**
 * Apply the deterministic gate.
 *
 * The gate blocks when ANY of the following holds:
 *   1. The LLM reviewer did not pass.
 *   2. The LLM score is below `QA_SCORE_THRESHOLD`.
 *   3. Any acceptance criterion was not evaluated by the QA reviewer.
 *   4. Any evaluated criterion was marked failed.
 *   5. Any critical or major defect was reported.
 *   6. Placeholder markers ("Pending transcription", ...) appear in evidence.
 *   7. A criterion demanding a concrete deliverable has no such deliverable.
 *
 * It never blocks for stylistic reasons and never upgrades a FAIL to a PASS.
 */
export function applyQAGate(
  mission: Mission,
  review: QAReview,
  evidence: Array<{ label: string; text: string }>
): QAGateResult {
  const blockers: string[] = [];
  const criterion_checks: QAGateResult["criterion_checks"] = [];
  const criteria = Array.isArray(mission.acceptance_criteria) ? mission.acceptance_criteria : [];
  const nonBlankCriteria = criteria.filter(
    (criterion): criterion is string => typeof criterion === "string" && criterion.trim().length > 0
  );

  // Zero (or all-blank) criteria are a missing contract, not a vacuous PASS.
  // Keep this check independent of MissionSchema so direct callers fail closed too.
  if (nonBlankCriteria.length === 0) {
    blockers.push("At least one non-blank acceptance criterion is required");
  }
  criteria.forEach((criterion, index) => {
    if (typeof criterion !== "string" || criterion.trim().length === 0) {
      blockers.push(`Acceptance criterion ${index + 1} is blank`);
    }
  });

  // 1 + 2 — honour the LLM verdict and the score threshold.
  if (!review.passed) {
    blockers.push("LLM reviewer verdict is FAIL");
  }
  if (review.score < QA_SCORE_THRESHOLD) {
    blockers.push(
      `LLM score ${review.score} is below the threshold ${QA_SCORE_THRESHOLD}`
    );
  }

  // 3 + 4 — criterion-level enforcement.
  const matched = matchCriteria(mission.acceptance_criteria, review.criteria_results);
  for (const m of matched) {
    if (!m.result) {
      criterion_checks.push({
        criterion: m.criterion,
        passed: false,
        reason: "criterion was not evaluated by the QA reviewer",
      });
      blockers.push(`Criterion not evaluated: "${m.criterion}"`);
    } else if (!m.result.passed) {
      criterion_checks.push({
        criterion: m.criterion,
        passed: false,
        reason: m.result.notes || "QA reviewer marked this criterion as failed",
      });
      blockers.push(`Criterion failed: "${m.criterion}"`);
    } else {
      criterion_checks.push({
        criterion: m.criterion,
        passed: true,
        reason: m.result.notes || "QA reviewer marked this criterion as passed",
      });
    }
  }

  // 5 — severe defects block regardless of score.
  for (const d of review.defects ?? []) {
    if (d.severity === "critical" || d.severity === "major") {
      blockers.push(`Unresolved ${d.severity} defect: ${d.issue}`);
    }
  }

  // 6 — placeholders.
  const placeholders = findPlaceholders(evidence);
  for (const p of placeholders) {
    blockers.push(
      `Unfilled/placeholder content detected in ${p.source}: "${p.marker}"`
    );
  }

  // 7 — concrete deliverables.
  const deliverables = checkDeliverables(matched, evidence);
  for (const d of deliverables) {
    if (!d.satisfied) {
      blockers.push(`Missing deliverable (${d.requirement}): ${d.detail}`);
    }
  }

  return {
    passed: blockers.length === 0,
    blockers,
    criterion_checks,
    llm_score: review.score,
    llm_passed: review.passed,
  };
}
