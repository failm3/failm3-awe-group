/**
 * AWE-READINESS-01 — QA gate regression tests.
 *
 * These tests reproduce the EXACT false positive observed in the production
 * run `61e8f64f-595d-4bf2-ba7f-a9dd07d50745`, where the QA agent returned
 * score=7 / passed=true while the produced report literally contained
 * "Pending transcription of the researcher ti_search result set".
 *
 * Run: npx tsx src/tests/qa-gate.test.ts
 */

import {
  applyQAGate,
  matchCriteria,
  findPlaceholders,
  checkDeliverables,
  similarity,
  PLACEHOLDER_MARKERS,
  QA_SCORE_THRESHOLD,
} from "../agents/qa-gate.js";
import type { Mission, QAReview } from "../types/index.js";

// ─── Test harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mission: Mission = {
  id: "test-mission",
  title: "AWE GROUP Browser Automation Practical Test",
  description: "test",
  objective: "Run screenshot script and TI search",
  acceptance_criteria: [
    "Скрипт scripts/awe-screenshot.sh выполнен без ошибок завершения (exit code 0) или задокументирована причина сбоя.",
    "PNG-файл скриншота существует по указанному пути и имеет ненулевой размер.",
    "Выполнены два поиска ti_search по категориям Product Design и AI Agent Engineering, и результаты перенесены в отчёт.",
  ],
  status: "running",
  priority: "normal",
  created_at: "2026-11-12T00:00:00.000Z",
  updated_at: "2026-11-12T00:00:00.000Z",
  artifacts: [],
  metadata: {},
};

/** The exact QA review that produced the false-positive PASS in production. */
const falsePositiveReview: QAReview = {
  passed: true,
  score: 7,
  criteria_results: [
    {
      criterion:
        "Скрипт scripts/awe-screenshot.sh выполнен без ошибок завершения (exit code 0) или задокументирована причина сбоя.",
      passed: true,
      notes: "Script executed, exit code 0.",
    },
    {
      criterion:
        "PNG-файл скриншота существует по указанному пути и имеет ненулевой размер.",
      passed: true,
      notes: "PNG confirmed: 332K, 1280x720 RGB.",
    },
    {
      criterion:
        "Выполнены два поиска ti_search по категориям Product Design и AI Agent Engineering, и результаты перенесены в отчёт.",
      passed: true,
      notes: "Both queries executed.",
    },
  ],
  defects: [],
  recommendations: [],
  verdict: "PASS: all good",
};

/** The exact evidence text produced by the production run. */
const falsePositiveEvidence = [
  {
    label: "artifact 1",
    text: `# AWE GROUP Browser Automation Practical Test Report

## 1. Screenshot Status
- Script \`scripts/awe-screenshot.sh\` executed successfully.
- Exit code: 0; \`success\`: true.
- File: \`.awe-data/artifacts/61e8f64f-.../screenshot.png\`
- Size: 339,260 bytes (332K), PNG 1280x720 RGB.

## 2. TI Tools Found
### 2.1 Product Design
Pending transcription of the researcher \`ti_search\` result set (name + short description per tool).
### 2.2 AI Agent Engineering
Pending transcription of the researcher \`ti_search\` result set (name + short description per tool).
Note: both queries were executed; the catalogue payload was not propagated to the report step.

## 3. Overall Conclusion
- Worked: screenshot script ran with exit code 0.
- Did not work: \`ti_search\` tool catalogues not transcribed into the report.`,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

section("T1 — regression: production false positive MUST be blocked");
{
  const gate = applyQAGate(mission, falsePositiveReview, falsePositiveEvidence);
  check(
    "T1.1 gate blocks the false-positive PASS",
    gate.passed === false,
    `gate.passed=${gate.passed}`
  );
  check(
    "T1.2 a placeholder blocker is reported",
    gate.blockers.some((b) => /placeholder|Pending transcription/i.test(b)),
    JSON.stringify(gate.blockers)
  );
  check(
    "T1.3 LLM verdict is preserved as advisory",
    gate.llm_passed === true && gate.llm_score === 7
  );
  check(
    "T1.4 blockers are non-empty and human-readable",
    gate.blockers.length > 0 && gate.blockers.every((b) => b.length > 10)
  );
}

section("T2 — negative: a genuinely complete mission MUST pass");
{
  const goodEvidence = [
    {
      label: "artifact 1",
      text: `# Report

## 1. Screenshot
- Script scripts/awe-screenshot.sh executed, exit code 0.
- Artifact: screenshot.png (339,260 bytes, 1280x720 PNG).

## 2. TI Tools Found
### 2.1 Product Design
- ti_search returned: Figma (Design), Framer (Design), Storybook (Docs)
### 2.2 AI Agent Engineering
- ti_search returned: LangGraph (Agents), CrewAI (Agents), AutoGen (Agents)

Both queries executed and results transcribed above.`,
    },
  ];
  const gate = applyQAGate(mission, falsePositiveReview, goodEvidence);
  check(
    "T2.1 gate passes a complete mission",
    gate.passed === true,
    `blockers=${JSON.stringify(gate.blockers)}`
  );
  check(
    "T2.2 no blockers reported",
    gate.blockers.length === 0
  );
}

section("T3 — negative: an unevaluated criterion MUST block");
{
  const partialReview: QAReview = {
    ...falsePositiveReview,
    criteria_results: [falsePositiveReview.criteria_results[0]], // only 1 of 3
  };
  const gate = applyQAGate(mission, partialReview, falsePositiveEvidence);
  check("T3.1 gate blocks when a criterion is unevaluated", gate.passed === false);
  check(
    "T3.2 blocker names the unevaluated criterion",
    gate.blockers.some((b) => /Criterion not evaluated/.test(b))
  );
  check(
    "T3.3 criterion_checks records the failure",
    gate.criterion_checks.filter((c) => !c.passed).length === 2
  );
}

section("T4 — negative: a failed criterion MUST block even with a high score");
{
  const failingReview: QAReview = {
    ...falsePositiveReview,
    score: 10,
    criteria_results: falsePositiveReview.criteria_results.map((c, i) =>
      i === 2 ? { ...c, passed: false, notes: "Results were not transcribed." } : c
    ),
  };
  const gate = applyQAGate(mission, failingReview, falsePositiveEvidence);
  check("T4.1 gate blocks a failed criterion at score 10", gate.passed === false);
  check(
    "T4.2 blocker identifies the failed criterion",
    gate.blockers.some((b) => /Criterion failed/.test(b))
  );
}

section("T5 — negative: major/critical defects MUST block");
{
  const defectReview: QAReview = {
    ...falsePositiveReview,
    defects: [{ issue: "Screenshot artifact missing from registry", severity: "major" }],
  };
  const gate = applyQAGate(mission, defectReview, falsePositiveEvidence);
  check("T5.1 gate blocks on a major defect", gate.passed === false);
  check(
    "T5.2 blocker quotes the defect",
    gate.blockers.some((b) => /missing from registry/.test(b))
  );
}

section("T6 — negative: a low score MUST block");
{
  const lowScore: QAReview = { ...falsePositiveReview, score: QA_SCORE_THRESHOLD - 1 };
  const gate = applyQAGate(mission, lowScore, falsePositiveEvidence);
  check("T6.1 gate blocks a score below the threshold", gate.passed === false);
  check(
    "T6.2 blocker mentions the threshold",
    gate.blockers.some((b) => /below the threshold/.test(b))
  );
}

section("T7 — negative: a FAIL verdict MUST never be upgraded");
{
  const failReview: QAReview = { ...falsePositiveReview, passed: false, score: 9 };
  const gate = applyQAGate(mission, failReview, falsePositiveEvidence);
  check("T7.1 gate keeps a FAIL as FAIL", gate.passed === false);
  check(
    "T7.2 blocker records the LLM FAIL",
    gate.blockers.some((b) => /LLM reviewer verdict is FAIL/.test(b))
  );
}

section("T8 — placeholder detection");
{
  const hits = findPlaceholders([
    { label: "a", text: "Pending transcription of the result set." },
    { label: "b", text: "This section is a placeholder for now." },
    { label: "c", text: "The task is TODO." },
    { label: "d", text: "Everything is complete and verified." },
  ]);
  check("T8.1 detects 'Pending transcription'", hits.some((h) => /pending transcription/i.test(h.marker)));
  check("T8.2 detects 'placeholder'", hits.some((h) => /placeholder/.test(h.marker)));
  check("T8.3 detects 'TODO'", hits.some((h) => /todo/i.test(h.marker)));
  check("T8.4 does not flag clean text", hits.filter((h) => h.source === "d").length === 0);
  check(
    "T8.5 no false positive on the word 'todos' inside another word",
    findPlaceholders([{ label: "x", text: "The todoskope identifier" }]).length === 0
  );
  check(
    "T8.6 a placeholder word inside executable code is a reference, not an unfilled section",
    findPlaceholders([{ label: "verifier", text: '#!/usr/bin/env python3\nqa("md", "no unrendered placeholders", not re.search(r"(TODO|TBD)", md), "placeholder scan")\nprint("done")' }]).length === 0
  );
  check(
    "T8.7 a TODO left in prose is still an unfilled section",
    findPlaceholders([{ label: "report", text: "Results\n\nTODO: fill in the site section once the data arrives." }]).length > 0
  );
  check(
    "T8.8 marker list is non-empty",
    PLACEHOLDER_MARKERS.length >= 10
  );

  // Run 1794841604244: a qualified procedure's own contract comment reads
  // "exactly two argument slots, no placeholders" — an assertion that none
  // exist. The gate read the word as an unfilled section and overrode a review
  // that had scored 9 and passed.
  const contractComment = [
    "#!/usr/bin/env node",
    "/*",
    " * observation-digest-v1",
    " *",
    " * Fixed invocation contract (exactly two argument slots, no placeholders):",
    " *   argv[2] = absolute path to the observations JSON file",
    " */",
    "'use strict';",
    "const fs = require('node:fs');",
  ].join("\n");
  const negated = findPlaceholders([{ label: "procedures/observation-digest-v1.js", text: contractComment }]);
  check(
    "T8.9 a negated mention in a contract comment states an absence, not an unfilled section",
    negated.length === 0,
    JSON.stringify(negated)
  );
  const otherNegation = findPlaceholders([
    { label: "docs", text: "The pipeline has no retries and never leaves placeholder values in the output." },
    { label: "docs2", text: "Output is written without TODO markers." },
  ]);
  check(
    "T8.9b negation elsewhere in prose also counts",
    otherNegation.length === 0,
    JSON.stringify(otherNegation)
  );
  check(
    "T8.10 negation does not excuse a real unfilled section",
    findPlaceholders([{ label: "report", text: "No results yet. TODO: fill in the site section once the data arrives." }]).length > 0
  );
  check(
    "T8.11 a bare marker is still an unfilled section",
    findPlaceholders([{ label: "report", text: "Site totals\n\nplaceholder\n" }]).length > 0
  );

  // Run 1794841604244: the delegation task text read "Use an exact fixed
  // no-placeholder argument array". The hyphenated negation is an assertion of
  // absence; the gate read it as an unfilled section and overrode a review
  // that had scored 9 and passed.
  check(
    "T8.12 a hyphenated negation (no-placeholder) states an absence, not an unfilled section",
    findPlaceholders([{ label: "execution output", text: "--- researcher (success) ---\nUse an exact fixed no-placeholder argument array appropriate to the approved deliverable paths." }]).length === 0
  );
  check(
    "T8.13 a negated mention does not hide a real unfilled section in the same text",
    findPlaceholders([{ label: "report", text: "Use a no-placeholder argument array. Section 3 is a placeholder for now." }]).length > 0
  );

  // Cyrillic markers never fired: JavaScript's \b is ASCII-only, so a Russian
  // "заглушка" in a deliverable was an unfilled section the gate could not see.
  check(
    "T8.14 a Russian marker in a deliverable is detected",
    findPlaceholders([{ label: "отчёт", text: "Итоги по сайтам\n\nзаглушка\n" }]).length > 0
  );
  check(
    "T8.15 a Russian marker inside a longer Russian word is not a hit",
    findPlaceholders([{ label: "отчёт", text: "Метод защиты от подделки подписей описан ниже." }]).length === 0
  );
  check(
    "T8.16 a negated Russian mention states an absence",
    findPlaceholders([{ label: "отчёт", text: "Скрипт не содержит заглушек." }]).length === 0
  );
}

section("T9 — criterion matching robustness");
{
  const matched = matchCriteria(mission.acceptance_criteria, [
    { criterion: "PNG-файл скриншота существует по указанному пути.", passed: true, notes: "" },
    { criterion: "Скрипт scripts/awe-screenshot.sh выполнен без ошибок.", passed: true, notes: "" },
    { criterion: "Выполнены два поиска ti_search по категориям Product Design.", passed: true, notes: "" },
  ]);
  check("T9.1 all three criteria matched", matched.every((m) => m.result !== null));
  check(
    "T9.2 matching survives paraphrasing",
    matched[1].result !== null && matched[1].matchScore > 0.34
  );
  check(
    "T9.3 similarity is bounded and monotone",
    similarity("alpha beta gamma", "alpha beta gamma") === 1 &&
      similarity("alpha beta gamma", "x y z") === 0 &&
      similarity("alpha beta", "alpha beta gamma") > 0 &&
      similarity("alpha beta", "alpha beta gamma") < 1
  );
}

section("T10 — deliverable presence checks");
{
  const matched = [
    { criterion: "PNG-файл скриншота существует по указанному пути.", result: null },
    { criterion: "Страница доступна по URL http://localhost:3000", result: null },
  ];
  const withDeliverables = checkDeliverables(matched, [
    { label: "artifact 1", text: "Artifact: screenshot.png (339260 bytes). URL: http://localhost:3000" },
  ]);
  check(
    "T10.1 image deliverable detected",
    withDeliverables.some((d) => d.requirement === "image" && d.satisfied)
  );
  check(
    "T10.2 url deliverable detected",
    withDeliverables.some((d) => d.requirement === "url" && d.satisfied)
  );

  const without = checkDeliverables(matched, [
    { label: "artifact 1", text: "The script ran successfully." },
  ]);
  check(
    "T10.3 missing image deliverable is reported",
    without.some((d) => d.requirement === "image" && !d.satisfied)
  );
  check(
    "T10.4 missing url deliverable is reported",
    without.some((d) => d.requirement === "url" && !d.satisfied)
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log(`QA GATE REGRESSION TESTS: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log("=".repeat(60));
process.exit(failed === 0 ? 0 : 1);
