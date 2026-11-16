import { createHash } from "node:crypto";
import type { Specification } from "../../src/types/index.js";

export type MissionKind = "research" | "analytics";
export const LOCAL_TOOLS = ["file_read", "file_list", "file_write", "save_artifact"] as const;
export const RESEARCH_TOOLS = [...LOCAL_TOOLS, "delegate"] as const;

export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const RESEARCH_SOURCES = {
  "sources/pilot-charter.txt": [
    "PROGRAM: Northstar service reliability pilot",
    "WINDOW: 2026-01-05 through 2026-01-30 (four operating weeks)",
    "SITES: Alder, Brook, Cove; the Depot trial is explicitly excluded.",
    "OWNER: Service Operations",
    "BASELINE: 120 requests per site-week; manual acknowledgement median 18 minutes.",
    "PILOT: routed acknowledgement median 11 minutes; acknowledgement uses receipt timestamps.",
    "CHANGE: routing runbook version 2 replaced version 1 on 2026-01-12.",
    "LIMIT: observations cover weekdays only; no weekend or Depot conclusion is supported.",
  ].join("\n") + "\n",
  "sources/weekly-observations.txt": [
    "SOURCE: Service Operations pilot observation log, revision 2026-02-02",
    "ALDER: 4 site-weeks, 480 requests, 31 delayed acknowledgements, 2 supervisor escalations.",
    "BROOK: 4 site-weeks, 480 requests, 43 delayed acknowledgements, 4 supervisor escalations.",
    "COVE: 4 site-weeks, 480 requests, 37 delayed acknowledgements, 3 supervisor escalations.",
    "DELAY: elapsed acknowledgement time greater than 15 minutes, measured after routing.",
    "CONTROL: one independent reviewer sampled 60 acknowledgement records per site.",
    "DATA_QUALITY: no missing weekday records; the log does not identify individual customers.",
  ].join("\n") + "\n",
  "sources/reviewer-note.txt": [
    "INDEPENDENT REVIEW NOTE: Operations Quality, 2026-02-03",
    "The 180 sampled records reconcile to the weekly observation totals.",
    "Alder has the smallest delayed-acknowledgement count and the fewest escalations.",
    "Recommendation: extend Alder routing practices to Brook and Cove for two weeks.",
    "Decision gate: repeat measurement before any wider rollout.",
    "Caution: this pilot cannot establish weekend performance or Depot outcomes.",
  ].join("\n") + "\n",
} as const;

export const OPERATIONS_CSV = [
  "week,team,work_orders,completed_orders,defects,planned_minutes,actual_minutes",
  "W01,Atlas,14,13,1,840,805",
  "W02,Atlas,16,15,2,960,1010",
  "W03,Atlas,12,12,0,720,690",
  "W04,Atlas,18,16,2,1080,1140",
  "W05,Atlas,15,15,1,900,875",
  "W06,Atlas,20,18,1,1200,1260",
  "W01,Birch,10,10,0,650,630",
  "W02,Birch,11,10,1,715,760",
  "W03,Birch,13,12,1,845,820",
  "W04,Birch,12,12,0,780,750",
  "W05,Birch,14,13,1,910,945",
  "W06,Birch,15,14,0,975,1005",
  "W01,Cedar,9,8,2,630,700",
  "W02,Cedar,10,9,1,700,735",
  "W03,Cedar,11,11,1,770,805",
  "W04,Cedar,8,7,1,560,610",
  "W05,Cedar,12,10,2,840,920",
  "W06,Cedar,13,12,1,910,980",
].join("\n") + "\n";

export interface CsvRecord {
  week: string;
  team: string;
  work_orders: number;
  completed_orders: number;
  defects: number;
  planned_minutes: number;
  actual_minutes: number;
}
export interface Metrics {
  work_orders: number;
  completed_orders: number;
  defects: number;
  planned_minutes: number;
  actual_minutes: number;
  completion_percent: number;
  minutes_per_completed_order: number;
  schedule_variance_minutes: number;
}

const INTEGER = /^-?(?:0|[1-9]\d*)$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)\.\d{2}$/;

function exactNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return null;
}
function exactDecimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}
function field(record: Record<string, string>, key: string): number {
  const value = record[key];
  const parsed = INTEGER.test(value) ? Number(value) : null;
  if (parsed === null || parsed < 0) throw new Error(`Invalid non-negative integer in ${key}`);
  return parsed;
}

export function parseOperationsCsv(bytes: Uint8Array): CsvRecord[] {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const lines = text.split("\n");
  if (lines.at(-1) !== "" || lines.length < 2) throw new Error("CSV must end with one newline and contain records");
  lines.pop();
  const columns = ["week", "team", "work_orders", "completed_orders", "defects", "planned_minutes", "actual_minutes"];
  if (lines[0] !== columns.join(",")) throw new Error("Unexpected CSV header");
  const identities = new Set<string>();
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    if (cells.length !== columns.length) throw new Error("CSV field count mismatch");
    const record = Object.fromEntries(columns.map((key, index) => [key, cells[index]]));
    if (!/^W(?:0[1-9]|[1-9]\d*)$/.test(record.week) || !/^[A-Za-z][A-Za-z0-9 _-]{0,40}$/.test(record.team)) {
      throw new Error("Invalid week or team identity");
    }
    const identity = `${record.week}\u0000${record.team}`;
    if (identities.has(identity)) throw new Error("Duplicate week/team record");
    identities.add(identity);
    const parsed = { week: record.week, team: record.team,
      work_orders: field(record, "work_orders"), completed_orders: field(record, "completed_orders"),
      defects: field(record, "defects"), planned_minutes: field(record, "planned_minutes"),
      actual_minutes: field(record, "actual_minutes") };
    if (parsed.work_orders < 1 || parsed.completed_orders > parsed.work_orders) throw new Error("Impossible work-order counts");
    return parsed;
  });
}

function aggregate(records: CsvRecord[]): Metrics {
  const totals = { work_orders: 0, completed_orders: 0, defects: 0, planned_minutes: 0, actual_minutes: 0 };
  for (const record of records) for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += record[key];
  return { ...totals,
    completion_percent: round2(totals.completed_orders / totals.work_orders * 100),
    minutes_per_completed_order: round2(totals.actual_minutes / totals.completed_orders),
    schedule_variance_minutes: totals.actual_minutes - totals.planned_minutes };
}
export function expectedOperations(bytes: Uint8Array): { row_count: number; totals: Metrics; teams: Record<string, Metrics> } {
  const records = parseOperationsCsv(bytes);
  const teams = [...new Set(records.map(record => record.team))].sort();
  return { row_count: records.length, totals: aggregate(records),
    teams: Object.fromEntries(teams.map(team => [team, aggregate(records.filter(record => record.team === team))])) };
}

/** Validate raw JSON value tokens, excluding digits inside property names/strings. */
export function validateMetricsSerialization(text: string): string[] {
  const errors: string[] = [];
  const value = JSON.parse(text) as unknown;
  const lexemes: string[] = [];
  let index = 0;
  const space = () => { while (/\s/.test(text[index] ?? "")) index++; };
  const string = () => {
    if (text[index++] !== '"') throw new Error("expected JSON string");
    while (index < text.length) {
      if (text[index] === '"') { index++; return; }
      if (text[index] === "\\") index += 2;
      else index++;
    }
    throw new Error("unterminated JSON string");
  };
  const walk = () => {
    space();
    if (text[index] === '"') { string(); return; }
    if (text[index] === "{") {
      index++; space();
      if (text[index] === "}") { index++; return; }
      while (index < text.length) {
        string(); space();
        if (text[index++] !== ":") throw new Error("expected object colon");
        walk(); space();
        if (text[index] === "}") { index++; return; }
        if (text[index++] !== ",") throw new Error("expected object comma");
        space();
      }
    }
    if (text[index] === "[") {
      index++; space();
      if (text[index] === "]") { index++; return; }
      while (index < text.length) {
        walk(); space();
        if (text[index] === "]") { index++; return; }
        if (text[index++] !== ",") throw new Error("expected array comma");
      }
    }
    if (text.startsWith("true", index)) { index += 4; return; }
    if (text.startsWith("false", index)) { index += 5; return; }
    if (text.startsWith("null", index)) { index += 4; return; }
    const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) throw new Error(`invalid JSON value at ${index}`);
    lexemes.push(match[0]); index += match[0].length;
  };
  walk(); space();
  if (index !== text.length) throw new Error("trailing JSON content");
  const leaves: Array<{ path: string; value: unknown }> = [];
  const collect = (node: unknown, path: string) => {
    if (typeof node === "number") leaves.push({ path, value: node });
    else if (Array.isArray(node)) node.forEach((child, i) => collect(child, `${path}[${i}]`));
    else if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) collect(child, path ? `${path}.${key}` : key);
    }
  };
  collect(value, "");
  if (lexemes.length !== leaves.length) return ["metrics numeric tokenization does not match its JSON values"];
  for (const [i, leaf] of leaves.entries()) {
    const lexeme = lexemes[i];
    if (leaf.path.endsWith("completion_percent") || leaf.path.endsWith("minutes_per_completed_order")) {
      if (!DECIMAL.test(lexeme)) errors.push(`${leaf.path} must use a fixed-point JSON number with exactly two decimals`);
    } else if (!INTEGER.test(lexeme)) errors.push(`${leaf.path} must use a canonical integer JSON number`);
    if (Number(lexeme) !== leaf.value) errors.push(`${leaf.path} numeric lexeme does not match its value`);
  }
  return errors;
}

export function validateMetrics(value: unknown, expected: ReturnType<typeof expectedOperations>): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["metrics.json root is not an object"];
  const root = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(root)) !== JSON.stringify(["row_count", "totals", "teams"])) errors.push("metrics root keys must exactly match the approved schema and order");
  if (JSON.stringify(Object.keys(root).sort()) !== JSON.stringify(["row_count", "teams", "totals"])) errors.push("metrics.json has missing or unexpected root fields");
  if (exactNumber(root.row_count) !== expected.row_count) errors.push("row_count differs from independent recomputation");
  for (const [label, target] of [["totals", expected.totals], ...Object.entries(expected.teams).map(([team, metrics]) => [`teams.${team}`, metrics] as const)] as const) {
    const actual = label === "totals" ? root.totals : (root.teams as Record<string, unknown> | undefined)?.[label.slice(6)];
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) { errors.push(`${label} is missing or not an object`); continue; }
    if (JSON.stringify(Object.keys(actual)) !== JSON.stringify(Object.keys(target))) errors.push(`${label} must exactly match the approved metric fields and order`);
    for (const [key, expectedValue] of Object.entries(target)) {
      const observed = (actual as Record<string, unknown>)[key];
      const parsed = ["completion_percent", "minutes_per_completed_order"].includes(key) ? exactDecimal(observed) : exactNumber(observed);
      if (parsed !== expectedValue) errors.push(`${label}.${key} expected ${expectedValue}, observed ${String(observed)}`);

    }
  }
  const actualTeams = root.teams && typeof root.teams === "object" && !Array.isArray(root.teams) ? Object.keys(root.teams).sort() : [];
  if (JSON.stringify(actualTeams) !== JSON.stringify(Object.keys(expected.teams))) errors.push("team keys differ from source data");
  if (root.teams && typeof root.teams === "object" && !Array.isArray(root.teams) && JSON.stringify(Object.keys(root.teams)) !== JSON.stringify(Object.keys(expected.teams))) {
    errors.push("teams must exactly match the approved sorted keys");
  }
  return errors;
}

export const ANALYTICS_SCHEMA = [
  '{"row_count":18,"totals":{"work_orders":233,"completed_orders":217,"defects":18,"planned_minutes":14985,',
  '"actual_minutes":15440,"completion_percent":93.13,"minutes_per_completed_order":71.15,"schedule_variance_minutes":455},',
  '"teams":{"Atlas":{"work_orders":95,"completed_orders":89,"defects":7,"planned_minutes":5700,"actual_minutes":5780,',
  '"completion_percent":93.68,"minutes_per_completed_order":64.94,"schedule_variance_minutes":80},',
  '"Birch":{"work_orders":75,"completed_orders":71,"defects":3,"planned_minutes":4875,"actual_minutes":4910,',
  '"completion_percent":94.67,"minutes_per_completed_order":69.15,"schedule_variance_minutes":35},',
  '"Cedar":{"work_orders":63,"completed_orders":57,"defects":8,"planned_minutes":4410,"actual_minutes":4750,',
  '"completion_percent":90.48,"minutes_per_completed_order":83.33,"schedule_variance_minutes":340}}}',
].join("");

export interface MissionFixture {
  kind: MissionKind;
  id: string;
  workspace: string;
  specification: Specification;
  inputs: Record<string, string>;
}

export function researchFixture(runId: string, workspace: string): MissionFixture {
  const criteria = [
    "Persist research-brief.md with an executive recommendation, separate factual findings and limitations, and inline citations in the exact form [S1], [S2], or [S3]. Also retain the bounded evidence notes produced by delegated children as attributed artifacts.",
    "Include a Sources section mapping S1 to sources/pilot-charter.txt, S2 to sources/weekly-observations.txt, and S3 to sources/reviewer-note.txt; cite every substantive factual or numerical claim and do not invent sources. Put an inline citation on every factual bullet and every factual Markdown table row, including the site-totals rows.",
    "State the three 480-request site totals, 31/43/37 delayed acknowledgements for Alder/Brook/Cove, and the 18-to-11-minute acknowledgement median change with supporting citations.",
    "Explicitly bound conclusions to weekday pilot sites Alder, Brook and Cove and exclude weekend and Depot generalization; do not claim a completed wider rollout.",
    "Use the real Head/MissionManager with exactly one top-level research-coordinator delegation and no other top-level delegation; that coordinator must use the delegate tool to launch exactly two distinct children in parallel before synthesizing the cited brief.",
  ];
  const specification: Specification = {
    title: "Source-grounded service pilot decision brief",
    objective: "Synthesize a decision-ready, independently checkable analytical brief from the three immutable local pilot sources.",
    scope: `Engineering practice only. Work only in ${workspace}. Read only sources/pilot-charter.txt, sources/weekly-observations.txt and sources/reviewer-note.txt as factual mission inputs; these input files must remain byte-identical. Deliver research-brief.md as the substantive final artifact plus bounded child evidence notes required by recursive execution. Use exactly one top-level research-coordinator delegation. It must perform all source inventory, recursion and final synthesis itself: recursively delegate exactly two distinct source-analysis children in one parallel delegate call, save their substantive outputs exactly as evidence-alder.md and evidence-brook-cove.md, then synthesize their persisted contributions into research-brief.md. Do not add separate top-level analysts, reviewers or writers; production independent QA runs only after the coordinator returns. Children and coordinator may read/write only within this workspace. No web/network, packages, external actions, publication, deployment, credentials or other files. Use no experience records.`,
    acceptance_criteria: criteria,
    suggested_tools: [...RESEARCH_TOOLS], suggested_agents: ["research-coordinator", "researcher", "writer"],
    estimated_complexity: "complex", risks: ["Citation drift or unsupported extrapolation must fail", "Parallel recursion must be observed in the production tree, not inferred from prose"],
  };
  return { kind: "research", id: `${runId}-research`, workspace, specification, inputs: { ...RESEARCH_SOURCES } };
}

export function analyticsFixture(runId: string, workspace: string): MissionFixture {
  const criteria = [
    "Persist metrics.json containing exactly the root keys row_count, totals and teams in that order. Each totals/team object must contain exactly work_orders, completed_orders, defects, planned_minutes, actual_minutes, completion_percent, minutes_per_completed_order and schedule_variance_minutes in that order. teams must contain exactly Atlas, Birch and Cedar in that order. Values must match independent recomputation; all integer metrics must be JSON numbers and completion_percent/minutes_per_completed_order must have exactly two decimal places when serialized.",
    "Persist operations-brief.md containing a concise executive recommendation and exact overall and per-team completion, defects and schedule-variance findings derived only from input/operations.csv.",
    "Include a Method section in operations-brief.md naming input/operations.csv and the exact formulas: completed/work orders ×100, actual/completed minutes, and actual minus planned minutes; do not invent records or convert units.",
    "Keep input/operations.csv immutable and deliver only metrics.json and operations-brief.md as substantive artifacts, with all conclusions limited to the supplied six-week three-team dataset.",
    "Use the real Head/MissionManager and at least two distinct specialist delegations for independent extraction/calculation and document synthesis; no workflow-specific direct specialist call is permitted.",
  ];
  const specification: Specification = {
    title: "Six-week operations analytics and management brief",
    objective: "Compute exact team operations metrics from an independent local CSV and produce a reproducible management document.",
    scope: `Engineering practice only. Work only in ${workspace}. The sole factual input is input/operations.csv and it must remain byte-identical. Deliver metrics.json and operations-brief.md. metrics.json must use this exact shape and no extra fields: ${ANALYTICS_SCHEMA} Head should assign at least two genuinely distinct specialist delegations; calculation and document synthesis may be sequential when the document depends on exact metrics. Use ordinary local file tools only: no shell, web/network, packages, external actions, publication, deployment, credentials or other files. Use no experience records.`,
    acceptance_criteria: criteria,
    suggested_tools: [...LOCAL_TOOLS], suggested_agents: ["analyst", "writer"],
    estimated_complexity: "moderate", risks: ["Rounded aggregates must be recomputed from raw integers", "Document totals must match the independently parsed metrics"],
  };
  return { kind: "analytics", id: `${runId}-analytics`, workspace, specification, inputs: { "input/operations.csv": OPERATIONS_CSV } };
}

export const LIVE_APPROVAL = "Operator explicitly approved these two bounded Nox engineering-practice specifications by invoking the dedicated live flag; no external action or product admission is approved.";
export const HOST_EXPERIENCE_POLICY = Object.freeze({
  composition: "trusted-host-only",
  behavior: "fail-closed: no host-configured experience policy means no retrieval and no experience option",
  selection_inputs: ["trusted host composition only"],
  prohibited_selection_inputs: ["mission request metadata", "model output", "model-authored configuration", "HTTP request fields"],
});
export const HOST_MODEL_POLICY = Object.freeze({
  composition: "trusted-host-only",
  behavior: "allowlisted model IDs with exact role overrides; model/request metadata is never consulted",
});
export const MODEL_IDS = ["claude-opus-5-5", "claude-sonnet-5-5", "deepseek-v4-flash", "claude-fable-5-2"] as const;
