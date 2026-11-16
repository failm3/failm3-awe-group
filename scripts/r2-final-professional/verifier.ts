import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Artifact, Mission } from "../../src/types/index.js";
import {
  ANALYTICS_SCHEMA, MODEL_IDS, OPERATIONS_CSV, RESEARCH_SOURCES, analyticsFixture, expectedOperations, parseOperationsCsv, researchFixture, sha256, validateMetrics,
  validateMetricsSerialization, type MissionFixture,
} from "./fixtures.js";

export interface Check {
  check: string;
  passed: boolean;
  detail: string;
}
export interface AttributedArtifact {
  id: string;
  mission_id: string;
  name: string;
  revision: number;
  sha256: string;
  size_bytes: number;
  attributed_delegations: string[];
}
export interface DelegationInterval {
  node_id: string;
  mission_id: string;
  role: string;
  started_at: string;
  finished_at: string;
  artifact_ids: string[];
}
export interface IndependentResult {
  schema: "r2-final-professional-independent-verification-v1";
  mission_id: string;
  independent: true;
  artifacts: AttributedArtifact[];
  intervals: DelegationInterval[];
  checks: Check[];
  passed: boolean;
}
export interface DelegationTree {
  total_agents?: unknown;
  max_depth?: unknown;
  nodes?: Array<{
    id?: unknown; role?: unknown; task?: unknown; depth?: unknown; parent_id?: unknown;
    status?: unknown; children?: unknown; tools_used?: unknown; parallel_group_id?: unknown; model?: unknown;
    started_at?: unknown; finished_at?: unknown; artifacts?: unknown;
  }>;
}

export function check(name: string, passed: boolean, detail = ""): Check {
  return { check: name, passed, detail };
}
export function checked(name: string, fn: () => string | void): Check {
  try { return check(name, true, fn() ?? "verified"); }
  catch (error) { return check(name, false, error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000)); }
}
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function asRecord(value: unknown): Record<string, unknown> {
  require(value !== null && typeof value === "object" && !Array.isArray(value), "Expected a JSON object");
  return value as Record<string, unknown>;
}
function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
function allNumbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(allNumbers);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(allNumbers);
  return [];
}
export function readStableFile(file: string, maxBytes = 512_000): Buffer {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    require(before.isFile(), `Not a regular file: ${path.basename(file)}`);
    require(before.size <= BigInt(maxBytes), `File exceeds verification bound: ${path.basename(file)}`);
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      require(count > 0, "File changed while being verified");
      offset += count;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    require(before.size === after.size && before.ctimeNs === after.ctimeNs && before.mtimeNs === after.mtimeNs,
      `File changed during verification: ${path.basename(file)}`);
    return bytes;
  } finally { fs.closeSync(fd); }
}
export function readJson(file: string): unknown {
  return JSON.parse(readStableFile(file).toString("utf8"));
}

export function attributedArtifacts(artifacts: Artifact[], intervals: DelegationInterval[]): AttributedArtifact[] {
  return artifacts.map((artifact) => ({
    id: artifact.id, mission_id: artifact.mission_id, name: artifact.name,
    revision: typeof artifact.metadata.revision === "number" ? artifact.metadata.revision : 0,
    sha256: String(artifact.metadata.sha256), size_bytes: Number(artifact.metadata.size_bytes),
    attributed_delegations: intervals.filter(interval => interval.artifact_ids.includes(artifact.id))
      .map(interval => `${interval.node_id}:${interval.role}`).sort(),
    // Verification enforces one host-observed producer per accepted artifact.
  }));
}

/**
 * Symmetric reduction for one durable producer: an accepted ID stays itself, a
 * registry ID retired by an ordinary same-name rewrite resolves to the strictly
 * later current revision, and anything else is unknown (null = fail closed).
 * Both the durable claim and the host write observation go through this map so
 * a retired revision is not read as a fabrication.
 */
function resolveProjection(ids: unknown[], accepted: Set<string>, records: Artifact[]): string[] | null {
  if (!Array.isArray(ids)) return null;
  const resolved: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") return null;
    if (accepted.has(id)) { resolved.push(id); continue; }
    const original = records.find(record => record.id === id);
    if (!original) return null;
    const revisionOf = (artifact: Artifact): number =>
      typeof artifact.metadata?.revision === "number" ? artifact.metadata.revision : 0;
    const successor = records
      .filter(record => accepted.has(record.id) && record.name === original.name &&
        revisionOf(record) > revisionOf(original))
      .sort((a, b) => revisionOf(b) - revisionOf(a))[0];
    if (!successor) return null;
    resolved.push(successor.id);
  }
  return [...new Set(resolved)].sort();
}
export function verifyArtifactBytes(mission: Mission, artifacts: Artifact[], fixture: MissionFixture, intervals: DelegationInterval[], registry?: Artifact[]): Check[] {
  const checks: Check[] = [];
  const requiredNames = fixture.kind === "research" ? ["research-brief.md"] : ["metrics.json", "operations-brief.md"];
  const inputNames = new Set(Object.keys(fixture.inputs));
  const expectedCount = inputNames.size + requiredNames.length + (fixture.kind === "research" ? 2 : 0);
  checks.push(check("exact accepted artifact set includes inputs, deliverables and bounded child evidence",
    [...inputNames, ...requiredNames].every(name => artifacts.filter(artifact => artifact.name === name).length === 1) &&
    artifacts.length === expectedCount,
    artifacts.map(artifact => artifact.name).sort().join(", ")));
  if (fixture.kind === "research") checks.push(check("exactly two research extras are delegated evidence notes",
    artifacts.filter(artifact => !inputNames.has(artifact.name) && artifact.name !== "research-brief.md")
      .every(artifact => /(?:evidence|analysis|note)/i.test(artifact.name)), "two evidence-note artifacts required"));
  checks.push(check("terminal mission and supplied registry artifacts have exact unique ID-set equality",
    artifacts.length === mission.artifacts.length && new Set(artifacts.map(artifact => artifact.id)).size === artifacts.length &&
    new Set(mission.artifacts).size === mission.artifacts.length && artifacts.every(artifact => mission.artifacts.includes(artifact.id)),
    `${artifacts.length} supplied / ${mission.artifacts.length} terminal IDs`));
  const missionArtifactIds = new Set(mission.artifacts);
  const tree = mission.metadata.delegation_tree as DelegationTree | undefined;
  for (const artifact of artifacts) {
    checks.push(checked(`artifact ${artifact.name} bytes, identity and accepted attribution`, () => {
      require(artifact.mission_id === fixture.id, "Artifact belongs to another mission");
      require(missionArtifactIds.has(artifact.id), "Artifact is not in the terminal accepted artifact set");
      require(artifact.path && path.isAbsolute(artifact.path), "Artifact has no absolute backing path");
      const root = fs.realpathSync(fixture.workspace);
      const actual = fs.realpathSync(artifact.path);
      require(actual.startsWith(root + path.sep), "Artifact backing path escapes its mission workspace");
      const bytes = readStableFile(artifact.path);
      require(sha256(bytes) === artifact.metadata.sha256, "Registry hash differs from actual artifact bytes");
      require(bytes.length === artifact.metadata.size_bytes, "Registry size differs from actual artifact bytes");
      if (inputNames.has(artifact.name)) {
        require(bytes.toString("utf8") === fixture.inputs[artifact.name], "Host-provisioned input bytes changed");
        require(intervals.every(interval => !interval.artifact_ids.includes(artifact.id)), "Host input must not be claimed as a new specialist deliverable");
        return `${artifact.id}:${sha256(bytes)}; producer=trusted-host-input`;
      }
      const attributed = intervals.filter(interval => interval.artifact_ids.includes(artifact.id));
      require(attributed.length === 1, "Artifact must have exactly one host-observed specialist producer");
      const producer = attributed[0];
      require(producer.mission_id === fixture.id, "Producer belongs to another mission");
      const node = tree?.nodes?.find(node => node.id === producer.node_id && node.status === "success");
      require(node && node.role === producer.role, "Producer is not a successful node in the terminal delegation tree");
      const accepted = new Set(mission.artifacts);
      // node.artifacts is a durable acceptance claim and interval.artifact_ids is a
      // host write observation; both reduce through the same same-name retirement
      // map, so a retired revision of a still-current name is not read as a forgery
      // while a genuinely unknown ID still fails closed in either direction.
      const claimed = resolveProjection(node.artifacts, accepted, registry ?? artifacts);
      const observed = resolveProjection(producer.artifact_ids, accepted, registry ?? artifacts);
      require(claimed !== null &&
        JSON.stringify(claimed) === JSON.stringify(observed),
        "Host result and durable node terminal artifact projections differ");
      if (fixture.kind === "research") {
        if (artifact.name === "research-brief.md") require(node.depth === 0, "Final research brief must be synthesized by its coordinator");
        else require(typeof node.depth === "number" && node.depth > 0, "Research evidence note must be produced by a nested child");
      }
      return `${artifact.id}:${sha256(bytes)}; producer=${producer.node_id}`;
    }));
  }
  for (const [index, interval] of intervals.entries()) {
    checks.push(check(`observed delegation ${index + 1} has a valid mission-bound interval and unique node`,
      interval.mission_id === fixture.id && typeof interval.node_id === "string" && interval.node_id.length > 0 &&
      Number.isFinite(Date.parse(interval.started_at)) && Number.isFinite(Date.parse(interval.finished_at)) &&
      Date.parse(interval.finished_at) >= Date.parse(interval.started_at) &&
      intervals.filter(other => other.node_id === interval.node_id).length === 1 &&
      new Set(interval.artifact_ids).size === interval.artifact_ids.length &&
      (tree?.nodes ?? []).some(node => node.id === interval.node_id && node.role === interval.role && node.status === "success"),
      `${interval.node_id}:${interval.role}`));
  }
  checks.push(checked("immutable local input bytes", () => {
    for (const [name, expected] of Object.entries(fixture.inputs)) {
      const actual = readStableFile(path.join(fixture.workspace, name)).toString("utf8");
      require(actual === expected, `${name} changed from its approved bytes`);
      require(sha256(actual) === sha256(expected), `${name} digest mismatch`);
    }
    return Object.entries(fixture.inputs).map(([name, bytes]) => `${name}:${sha256(bytes)}`).join("; ");
  }));
  return checks;
}

const CITATION_PATTERN = /\[S([123])\]/g;
function citationsForParagraph(paragraph: string): string[] {
  return [...paragraph.matchAll(CITATION_PATTERN)].map(match => match[0]);
}
export function verifyResearchText(text: string): Check[] {
  const checks: Check[] = [];
  const lines = text.split("\n");
  // The spec requires "a Sources section" but no heading format, so a numbered
  // or lettered section prefix ("## (f) Sources", "## 6. Sources") is the same
  // section. Only the word itself may head the section; a trailing qualifier
  // such as "Sources and Methods" is a different heading and is not matched.
  const sourcesIndex = lines.findIndex(line => /^#{1,3}\s+(?:(?:\(?[A-Za-z0-9]{1,3}\)?|Appendix\s+[A-Z0-9]{1,3})[.):-]?\s+)?Sources\s*$/i.test(line.trim()));
  const body = sourcesIndex >= 0 ? lines.slice(0, sourcesIndex).join("\n") : text;
  const sources = sourcesIndex >= 0 ? lines.slice(sourcesIndex + 1).join("\n") : "";
  const sourceNames = Object.keys(RESEARCH_SOURCES);
  const sourceLines = sources.split("\n");
  // The approved spec fixes the citation keys and the exact input paths; it
  // imposes no list format, so a Markdown table row binds a key to its path just
  // as a bullet does. Only the key cell itself counts, never a path mention.
  const markdownCells = (line: string): string[] => line.trim().split("|").map(cell => cell.trim()).filter(Boolean);
  const sourceBinding = (line: string, index: number, name: string): boolean => {
    const cells = markdownCells(line);
    const keyCells = cells.filter(cell => /^\[?S[123]\]?$/.test(cell.replace(/[*`]/g, "")));
    if (keyCells.length === 1 && keyCells[0].replace(/[[\]`*]/g, "") === `S${index + 1}` &&
      cells.some(cell => cell.replace(/[`*]/g, "") === name)) return true;
    const match = line.replace(/\*\*/g, "").match(/^\s*-?\s*(\[?S([123])\]?)\s*(?:[:=—-]\s*|\s+)(\S+)/);
    return match?.[2] === String(index + 1) && match[3].replace(/[`*]/g, "") === name &&
      (match[1].startsWith("[") || /^\s*-?\s*S[123]\s*:/.test(line));
  };
  checks.push(check("sources section maps every citation key to an immutable input", sourcesIndex >= 0 &&
    sourceNames.every((name, index) => sourceLines.some(line => sourceBinding(line, index, name))),
    sourcesIndex >= 0 ? "Sources section found" : "Missing Sources heading"));
  const citations = [...new Set(citationsForParagraph(body))].sort();
  checks.push(check("all three source citations used in brief body", JSON.stringify(citations) === JSON.stringify(["[S1]", "[S2]", "[S3]"]), citations.join(", ")));
  const invalidCitations = [...body.matchAll(/\[(?:S\d+|s\d+|source\s+\d+)\]/gi)].filter(match => !/^\[S[123]\]$/.test(match[0]));
  checks.push(check("no malformed or invented citation keys", invalidCitations.length === 0, invalidCitations.map(match => match[0]).join(", ")));
  checks.push(check("executive recommendation is separately identified", /^#{1,3}\s+.*recommendation/im.test(body) || /\brecommend(?:ation|ed)?\b/i.test(body), "recommendation language found"));
  checks.push(check("factual findings and limitations are separately identified", /^#{1,3}\s+.*findings/im.test(body) && /^#{1,3}\s+.*limitations/im.test(body), "Findings and Limitations headings required"));
  const hasNumber = (text: string, value: number): boolean =>
    new RegExp(`(?<![A-Za-z0-9_.])${value}(?![A-Za-z0-9_])(?!\\.\\d)`).test(text);
  checks.push(check("exact site request and delay observations are bound to S2", body.split(/\n\s*\n/).some(paragraph =>
    citationsForParagraph(paragraph).includes("[S2]") &&
    [["Alder", 31], ["Brook", 43], ["Cove", 37]].every(([site, delays]) =>
      new RegExp(String(site), "i").test(paragraph) && hasNumber(paragraph, Number(delays))) &&
    ((paragraph.match(/(?<![A-Za-z0-9_.])480(?![A-Za-z0-9_.])/g)?.length ?? 0) >= 3 ||
      /\beach\b/i.test(paragraph) && hasNumber(paragraph, 480))),
    "each site's 480 requests and 31/43/37 delays must occur together with S2"));
  checks.push(check("acknowledgement median change and citation present",
    // The approved spec requires the 18-to-11 change with an S1 citation; it does
    // not fix the wording between the two figures. A bounded, digit-free gap
    // admits "18 minutes (manual baseline) to 11 minutes" without ever letting a
    // third number stand in for either figure.
    body.split(/\n\s*\n/).some(paragraph =>
      /(?<![A-Za-z0-9_.])18(?:\.0+)?\s*(?:minutes?|min)?(?:[^0-9\n]{0,40}?)(?:→|->|to)\s*11(?:\.0+)?\s*(?:minutes?|min)?/i.test(paragraph) &&
      citationsForParagraph(paragraph).includes("[S1]")),
    "18-to-11-minute change must cite S1"));
  checks.push(check("weekday/site limitations and exclusions explicit", /weekdays?/i.test(body) && /weekends?/i.test(body) && /Depot/i.test(body) &&
    /exclud|not (?:support|establish|generaliz)|cannot|no .*conclusion/i.test(body), "bounded conclusion required"));
  const affirmativeRollout = /(?:rollout|roll out|rolled out|deployment|deployed).{0,80}(?:complete|completed|successful)|(?:complete|completed|successful).{0,80}(?:rollout|roll out|rolled out|deployment|deployed)/i;
  const completedClaims = text.split(/\n\s*\n/).filter(paragraph => affirmativeRollout.test(paragraph) &&
    !/\b(?:no|not|cannot|can't|never|without|unsupported|excluded)\b/i.test(paragraph));
  checks.push(check("no completed wider-rollout claim", completedClaims.length === 0, completedClaims.join(" | ") || "future/repeated measurement only"));
  // Track each paragraph's section so a digit-free decision statement under a
  // recommendation heading can be told apart from a factual claim.
  let currentHeading = "";
  const paragraphs: Array<{ text: string; heading: string }> = [];
  for (const raw of body.split(/\n\s*\n/)) {
    const rawLines = raw.split("\n");
    for (const line of rawLines) {
      const found = line.match(/^\s*#{1,3}\s+(.*)$/);
      if (found) currentHeading = found[1];
    }
    const text = rawLines.filter(line => !/^\s*#{1,3}\s/.test(line)).join("\n");
    if (text.trim()) paragraphs.push({ text, heading: currentHeading });
  }
  // A front-matter block of labelled provenance lines (Mission:, Prepared by:,
  // Scope:, Inputs:) states no source fact, so it needs no citation. The
  // exemption is narrow: only the block immediately after the title, only known
  // labels, and never a line carrying a digit of its own.
  const frontMatterLabels = /^\s*(?:\*\*)?(?:Mission|Prepared by|Scope|Inputs?|Input basis|Evidence base)(?:\*\*)?\s*:/;
  const frontMatter = (paragraph: string): boolean => {
    const lines = paragraph.split("\n").filter(line => line.trim());
    // A mission/report identifier may contain digits; only identifier- and
    // path-shaped tokens are exempt, so a figure written in the value still
    // requires its own citation.
    const figures = (line: string): boolean =>
      /\d/.test(line.replace(/(?:\S*[-_/.:]\S*)/g, " ").replace(/\bS[123]\b/g, ""));
    return lines.length > 0 && lines.every(line => frontMatterLabels.test(line) && !figures(line));
  };
  const uncited: string[] = [];
  // The spec requires a citation for every factual or numerical claim. A decision
  // statement is neither: it is exempt only when it sits under a recommendation
  // heading, carries no digit of its own, and opens with a directive verb (or a
  // scope negation of the recommendation). Reporting verbs never qualify.
  const directive = /^\s*(?:\*\*)?\s*(?:Adopt|Extend|Carry|Proceed|Approve|Defer|Hold|Continue|Do not|We recommend|Recommend(?:ation)?:?|What this recommendation (?:does not|doesn't))\b/i;
  const decisionStatement = (paragraph: string, heading: string): boolean =>
    /recommend/i.test(heading) && !/\d/.test(paragraph) && directive.test(paragraph);
  for (const [index, { text: paragraph, heading }] of paragraphs.entries()) {
    const factual = /\d|Alder|Brook|Cove|Depot|weekday|weekend|baseline|pilot|routing|escalat|delay|sample|version\s*[12]/i.test(paragraph);
    if (factual && citationsForParagraph(paragraph).length === 0 && !(index === 0 && frontMatter(paragraph)) &&
      !decisionStatement(paragraph, heading)) {
      uncited.push(paragraph.trim().slice(0, 180));
    }
  }
  checks.push(check("every substantive factual paragraph carries a source citation", uncited.length === 0, uncited.join(" | ")));
  checks.push(check("brief remains within independent QA evidence window", Buffer.byteLength(text, "utf8") <= 24_000, `${Buffer.byteLength(text, "utf8")} bytes`));
  return checks;
}

function numericToken(text: string, value: number): boolean {
  return new RegExp(`(?<![A-Za-z0-9_.])${numberText(value).replace(".", "\\.")}(?![A-Za-z0-9_]|\\.\\d)`).test(text);
}
const NUMBER_SOURCE = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
function numberLexeme(pattern: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_.])([+\u2212-]?${pattern})(?![A-Za-z0-9_])`);
}
function parsedLexeme(match: RegExpExecArray | null): number | null {
  return match ? Number(match[1].replaceAll(",", "").replace("\u2212", "-")) : null;
}
const METRIC_COLUMNS = {
  completion: /completion/i,
  defects: /^defects?$/i,
  variance: /(?:schedule|variance)/i,
} as const;
/**
 * Read a label's metrics from a Markdown table row. The approved spec requires
 * exact values but no prose shape, so a per-team table row binds its columns by
 * header name: only a header-matched column may supply a value.
 */
function tableRowMetrics(text: string, label: string): Array<{ completion: number | null; defects: number | null; variance: number | null }> {
  const rows: Array<{ completion: number | null; defects: number | null; variance: number | null }> = [];
  const lines = text.split("\n").map(line => line.trim()).filter(line => line.startsWith("|") && line.endsWith("|"));
  let header: string[] | null = null;
  for (const line of lines) {
    const cells = line.slice(1, -1).split("|").map(cell => cell.trim());
    if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) continue;
    if (cells.some(cell => /^(?:team|group|site)$/i.test(cell))) { header = cells; continue; }
    if (!header || !new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(cells[0] ?? "")) continue;
    const read = (pattern: RegExp): number | null => {
      const index = header!.findIndex(cell => pattern.test(cell));
      if (index < 0 || index >= cells.length) return null;
      const match = cells[index].match(/^[+\u2212-]?\d+(?:,\d{3})*(?:\.\d+)?%?$/);
      return match ? Number(match[0].replaceAll(",", "").replace("%", "").replace("\u2212", "-")) : null;
    };
    rows.push({
      completion: read(METRIC_COLUMNS.completion), defects: read(METRIC_COLUMNS.defects), variance: read(METRIC_COLUMNS.variance),
    });
  }
  return rows;
}
function requirePhraseWithNumber(text: string, label: string, values: number[]): void {
  const segments: string[] = [];
  // Bind a team heading to its section, and a summary sentence to its own
  // paragraph. Never borrow a metric from an unrelated team or later section.
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (heading[1].toLowerCase().includes(label.toLowerCase())) {
      segments.push(text.slice(heading.index, headings[index + 1]?.index ?? text.length));
    }
  }
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (paragraph.toLowerCase().includes(label.toLowerCase())) segments.push(paragraph);
  }
  const found = segments.some(segment => {
    const lines = segment.split("\n");
    // The gap between a metric label and its number may contain only separators and a
    // short connector ("was", "of", ":"), so a label can never bind a distant number.
    const GAP = `(?:[\\s:=*_\`|]|\\b(?:was|were|is|are|of|at|total|totalled|reached|recorded|stood|minutes?)\\b)*`;
    const firstValue = (patterns: RegExp[]): number | null => {
      for (const line of lines) for (const pattern of patterns) {
        const match = pattern.exec(line);
        if (match) return parsedLexeme(match);
      }
      return null;
    };
    // A completion figure may be preceded by its own counts, e.g.
    // "Completion: 217 of 233 work orders completed (93.13%)". Only a figure
    // written with a percent sign is a completion percentage, so that binding is
    // tried first and the bare-number form is the fallback.
    const completion = firstValue([
      new RegExp(`completion(?:[_\\s]percent)?[^\\n]{0,60}?${numberLexeme(NUMBER_SOURCE).source}\\s*%`, "i"),
      new RegExp(`completion(?:[_\\s]percent)?${GAP}${numberLexeme(NUMBER_SOURCE).source}`, "i"),
    ]);
    const defects = firstValue([
      new RegExp(`defects?${GAP}${numberLexeme(NUMBER_SOURCE).source}`, "i"),
      new RegExp(`${numberLexeme(NUMBER_SOURCE).source}${GAP}defects?\\b`, "i"),
    ]);
    const variance = firstValue([
      new RegExp(`schedule[-_ ]variance(?:[-_ ]minutes)?[^\\n]{0,30}?${numberLexeme(NUMBER_SOURCE).source}(?:\\s*minutes)?\\b`, "i"),
      new RegExp(`${numberLexeme(NUMBER_SOURCE).source}${GAP}schedule[-_ ]variance(?:[-_ ]minutes)?\\b`, "i"),
    ]);
    return completion === values[0] && defects === values[1] && variance === values[2] &&
      values.every(value => numericToken(segment, value));
  });
  // A header-bound table row is an equally explicit claim as prose; it must be
  // exact, so a wrong cell in the right column still fails.
  const tabulated = tableRowMetrics(text, label).some(row =>
    row.completion === values[0] && row.defects === values[1] && row.variance === values[2]);
  require(found || tabulated, `${label} does not associate exact completion/defects/variance values ${values.map(numberText).join(", ")}`);
}
export function verifyAnalyticsDocuments(metricsText: string, briefText: string, inputBytes: Uint8Array): Check[] {
  const checks: Check[] = [];
  let parsed: unknown;
  checks.push(checked("metrics JSON parses", () => { parsed = JSON.parse(metricsText); return "valid JSON"; }));
  const expected = expectedOperations(inputBytes);
  const metricErrors = parsed === undefined ? ["unavailable"] : [
    ...validateMetrics(parsed, expected), ...validateMetricsSerialization(metricsText),
  ];
  checks.push(check("metrics exactly match independent raw-CSV recomputation and numeric serialization", metricErrors.length === 0,
    metricErrors.join("; ") || "all integer totals and two-decimal derived metrics match"));
  checks.push(checked("metrics schema includes exact groups and two-decimal derived JSON numbers", () => {
    require(parsed !== undefined, "metrics unavailable");
    const root = asRecord(parsed);
    require(root.row_count === expected.row_count && !!root.totals &&
      JSON.stringify(Object.keys(asRecord(root.teams))) === JSON.stringify(Object.keys(expected.teams)), "exact aggregate groups required");
    const serializationErrors = validateMetricsSerialization(metricsText);
    require(serializationErrors.length === 0, serializationErrors.join("; "));
    return "exact aggregate groups and canonical two-decimal JSON numbers";
  }));
  for (const [team, metrics] of Object.entries(expected.teams)) {
    checks.push(checked(`brief has exact ${team} operational findings`, () => {
      requirePhraseWithNumber(briefText, team, [metrics.completion_percent, metrics.defects, metrics.schedule_variance_minutes]);
      return `${metrics.completion_percent}% / ${metrics.defects} defects / ${numberText(metrics.schedule_variance_minutes)} variance minutes`;
    }));
  }
  checks.push(checked("brief has exact overall operational findings", () => {
    requirePhraseWithNumber(briefText, "overall", [expected.totals.completion_percent, expected.totals.defects, expected.totals.schedule_variance_minutes]);
    return `${expected.totals.completion_percent}% / ${expected.totals.defects} defects / ${expected.totals.schedule_variance_minutes} variance minutes`;
  }));
  checks.push(check("brief has executive recommendation and bounded six-week conclusion",
    /recommend/i.test(briefText) && /six[- ]week/i.test(briefText) && /Atlas|Birch|Cedar/.test(briefText) &&
    !/company[- ]wide|all teams|all sites|industry[- ]wide|guarantee/i.test(briefText), "recommendation must not generalize beyond supplied data"));
  checks.push(check("brief documents input and exact formulas", /#{1,3}\s+Method/i.test(briefText) && briefText.includes("input/operations.csv") &&
    /completed(?:_orders| orders)\s*(?:\/|÷| divided by)\s*(?:work_orders|work orders)/i.test(briefText) &&
    /actual(?:_minutes| minutes)\s*(?:\/|÷| divided by)\s*completed(?:_orders| orders)/i.test(briefText) &&
    /actual(?:_minutes| minutes)\s*(?:minus|[-\u2212])\s*planned(?:_minutes| minutes)/i.test(briefText) &&
    /\(?\s*completed(?:_orders| orders)\s*(?:\/|÷| divided by)\s*(?:work_orders|work orders)\s*\)?\s*(?:×|\*|x)\s*100/i.test(briefText), "three calculation formulas including ×100 required"));
  checks.push(checked("brief contains only independently supported numeric facts", () => {
    // A derived difference between two recorded groups is independently
    // recomputable from the same metrics, so it is allowed; an arbitrary or
    // mutated number still matches no metric and no group difference.
    const parsed = JSON.parse(metricsText) as { totals?: Record<string, number>; teams?: Record<string, Record<string, number>> };
    const groups = Object.values(parsed.teams ?? {});
    const differences: number[] = [];
    for (const key of Object.keys(parsed.totals ?? {})) {
      const values = groups.map(group => group[key]).filter((value): value is number => typeof value === "number");
      for (const left of values) for (const right of values) differences.push(Number(Math.abs(left - right).toFixed(10)));
    }
    const additive: number[] = [];
    for (const key of Object.keys(parsed.totals ?? {})) {
      const values = groups.map(group => group[key]).filter((value): value is number => typeof value === "number");
      const total = parsed.totals?.[key];
      if (typeof total !== "number") continue;
      for (let left = 0; left < values.length; left++) for (let right = left + 1; right < values.length; right++) {
        // A reported remainder is supported only when adding the named group's
        // value reconstructs the exact recorded total. Arbitrary pair sums of
        // unrelated metrics or an unrecorded aggregate never enter this set.
        additive.push(total - values[left], total - values[right]);
      }
    }
    const allowed = new Set([...allNumbers(JSON.parse(metricsText)), ...differences, ...additive, 6, 3, 100, 2, inputBytes.length]);
    const unsupported = [...briefText.matchAll(/(?<![A-Za-z0-9_.])[+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![A-Za-z0-9_.])/g)]
      .map(match => Number(match[0].replaceAll(",", "").replace("−", "-"))).filter(value => !allowed.has(value));
    require(unsupported.length === 0, `unsupported brief numbers: ${unsupported.join(", ")}`);
    return "all brief numbers occur in metrics, a recomputed group difference, or the bounded method";
  }));
  checks.push(check("both documents remain within independent QA evidence window", Buffer.byteLength(metricsText) + Buffer.byteLength(briefText) <= 40_000,
    `${Buffer.byteLength(metricsText) + Buffer.byteLength(briefText)} bytes`));
  return checks;
}

export function verifyDelegation(fixture: MissionFixture, mission: Mission, intervals: DelegationInterval[]): Check[] {
  const tree = mission.metadata.delegation_tree as DelegationTree | undefined;
  const nodes = tree?.nodes ?? [];
  const top = nodes.filter(node => node.depth === 0 && node.status === "success");
  const nested = nodes.filter(node => typeof node.depth === "number" && node.depth > 0 && node.status === "success");
  const checks = [check("real Head plan and successful specialist delegation tree recorded", top.length > 0 && tree?.total_agents === nodes.length,
    `${nodes.length} tree nodes; ${top.length} successful top-level nodes`)];
  const approvedTools = new Set(fixture.specification.suggested_tools);
  checks.push(check("every durable specialist used only approved tools and host-allowlisted models", nodes.length > 0 && nodes.every(node =>
    Array.isArray(node.tools_used) && node.tools_used.every(tool => typeof tool === "string" && approvedTools.has(tool)) &&
    typeof node.model === "string" && (MODEL_IDS as readonly string[]).includes(node.model)),
    nodes.map(node => `${String(node.id)}:${JSON.stringify(node.tools_used)}:${String(node.model)}`).join(" | ")));
  if (fixture.kind === "research") {
    const parents = top.filter(parent => Array.isArray(parent.tools_used) && parent.tools_used.includes("delegate") &&
      nested.filter(child => child.parent_id === parent.id).length >= 2);
    checks.push(check("exactly one top-level coordinator recursively launched exactly two real children", top.length === 1 &&
      parents.length === 1 && nested.length === 2 && nested.every(child => child.parent_id === parents[0].id),
      `${top.length} top-level / ${nested.length} nested; qualifying parents: ${parents.map(parent => String(parent.id)).join(", ") || "none"}`));
    checks.push(check("recursive children are distinct and actually overlapped in time", parents.some(parent => {
      const children = nested.filter(child => child.parent_id === parent.id);
      const distinct = new Set(children.map(child => `${String(child.role)}\u0000${String(child.task)}`)).size >= 2 &&
        Array.isArray(parent.children) && parent.children.length === children.length &&
        children.every(child => (parent.children as unknown[]).includes(child.id)) &&
        children.every(child => typeof child.parallel_group_id === "string" && child.parallel_group_id === children[0].parallel_group_id) &&
        children.every(child => Array.isArray(child.artifacts) && child.artifacts.length > 0);
      const observed = children.map(child => intervals.find(interval => interval.node_id === child.id));
      const commonStart = Math.max(...observed.map(interval => Date.parse(interval?.started_at ?? "")));
      const commonEnd = Math.min(...observed.map(interval => Date.parse(interval?.finished_at ?? "")));
      return distinct && observed.every(interval => interval && interval.mission_id === fixture.id &&
        Date.parse(interval.finished_at) > Date.parse(interval.started_at)) && commonEnd > commonStart;
    }), "one parallel reservation, artifact-producing distinct children and common host-observed overlap required"));
  } else {
    checks.push(check("at least two distinct successful production specialist delegations", top.length >= 2 &&
      new Set(top.map(node => `${String(node.role)}\u0000${String(node.task)}`)).size >= 2,
      top.map(node => `${String(node.role)}:${String(node.id)}`).join(", ")));
  }
  return checks;
}

export function verifyModelCalls(calls: Array<{ mission_id: string | null; role: string; status: string; model: string; provider: string }>, fixture: MissionFixture): Check[] {
  const relevant = calls.filter(call => call.mission_id === fixture.id);
  return [
    check("real Head model call completed", relevant.some(call => call.role === "head-agent" && call.status === "completed"),
      relevant.filter(call => call.role === "head-agent").map(call => call.status).join(", ")),
    check("independent QA model call completed", relevant.some(call => call.role === "qa-agent" && call.status === "completed"),
      relevant.filter(call => call.role === "qa-agent").map(call => call.status).join(", ")),
    check("real specialist model calls completed", relevant.some(call => !["head-agent", "qa-agent"].includes(call.role) && call.status === "completed"),
      relevant.filter(call => !["head-agent", "qa-agent"].includes(call.role)).map(call => `${call.role}:${call.status}`).join(", ")),
    check("all model ledger records are terminal and attributed to this mission", relevant.length > 0 && relevant.every(call => call.status === "completed"),
      `${relevant.length} calls`),
    check("every observed model is host-allowlisted and uses the dedicated provider route", relevant.length > 0 && relevant.every(call =>
      (MODEL_IDS as readonly string[]).includes(call.model) && call.provider === "routercheap"),
      relevant.map(call => `${call.role}:${call.model}:${call.provider}`).join(" | ")),
    check("specialist role routing uses the host-selected Sonnet route", relevant.filter(call => !["head-agent", "qa-agent"].includes(call.role))
      .every(call => call.model === "claude-sonnet-5-5"), "role overrides are host configuration, not model output"),
  ];
}

export interface CandidateEvidence {
  candidate: {
    epoch_id: string; mission_id: string; repair_iteration: number; spec_hash: string; candidate_sha256: string; created_at: string;
    artifacts: Array<{ artifact_id: string; name: string; revision: number; path?: string; sha256: string; size_bytes: number }>;
  };
  receipt: {
    mission_id: string; epoch_id: string; candidate_sha256: string; receipt_sha256: string; created_at: string;
    review: { passed: boolean }; gate: { passed: boolean };
  };
}
export function verifyCandidateEvidence(mission: Mission, artifacts: Artifact[]): { checks: Check[]; evidencePath: string | null; receipt: unknown } {
  const descriptor = mission.metadata.candidate as { evidence_path?: unknown; epoch_id?: unknown; candidate_sha256?: unknown } | undefined;
  const evidencePath = typeof descriptor?.evidence_path === "string" ? descriptor.evidence_path : null;
  const checks: Check[] = [];
  let receipt: unknown = null;
  checks.push(checked("independent candidate review receipt authenticates exact final artifact set", () => {
    require(evidencePath && path.isAbsolute(evidencePath), "No absolute candidate evidence path");
    const evidence = readJson(evidencePath) as CandidateEvidence;
    const candidate = evidence.candidate;
    const unsignedCandidate = { ...candidate } as Record<string, unknown>;
    delete unsignedCandidate.candidate_sha256; delete unsignedCandidate.created_at;
    const unsignedReceipt = { ...evidence.receipt } as Record<string, unknown>;
    delete unsignedReceipt.receipt_sha256; delete unsignedReceipt.created_at;
    require(sha256(JSON.stringify(unsignedCandidate)) === candidate.candidate_sha256, "Candidate hash mismatch");
    require(sha256(JSON.stringify(unsignedReceipt)) === evidence.receipt.receipt_sha256, "Review receipt hash mismatch");
    require(candidate.epoch_id === descriptor?.epoch_id && candidate.candidate_sha256 === descriptor?.candidate_sha256, "Terminal mission points to a different candidate");
    require(candidate.mission_id === mission.id && evidence.receipt.mission_id === mission.id, "Candidate/receipt mission identity mismatch");
    const approved = mission.metadata.approved_spec_binding as { spec_hash?: unknown } | undefined;
    require(candidate.spec_hash === approved?.spec_hash, "Candidate approved specification hash mismatch");
    const terminalDescriptor = descriptor as { repair_iteration?: unknown } | undefined;
    require(candidate.repair_iteration === terminalDescriptor?.repair_iteration, "Candidate repair iteration is not terminal");
    require(evidence.receipt.epoch_id === candidate.epoch_id && evidence.receipt.candidate_sha256 === candidate.candidate_sha256, "Receipt is not for this candidate");
    require(evidence.receipt.review.passed === true && evidence.receipt.gate.passed === true, "Independent QA/gate did not pass the exact final candidate");
    const project = (artifact: Artifact) => ({
      artifact_id: artifact.id, name: artifact.name,
      revision: typeof artifact.metadata.revision === "number" ? artifact.metadata.revision : 0,
      path: artifact.path, sha256: artifact.metadata.sha256, size_bytes: artifact.metadata.size_bytes,
    });
    const order = (a: { name: string; revision: number; artifact_id: string }, b: { name: string; revision: number; artifact_id: string }) =>
      a.name.localeCompare(b.name) || a.revision - b.revision || a.artifact_id.localeCompare(b.artifact_id);
    require(JSON.stringify(artifacts.map(project).sort(order)) === JSON.stringify([...candidate.artifacts].sort(order)),
      "QA reviewed a different complete artifact projection");
    receipt = evidence.receipt;
    return `${candidate.epoch_id}:${candidate.candidate_sha256}`;
  }));
  return { checks, evidencePath, receipt };
}

export function independentVerification(input: {
  fixture: MissionFixture;
  mission: Mission;
  artifacts: Artifact[];
  /** Every registry revision, including same-name records hidden from listArtifacts. */
  registry?: Artifact[];
  modelCalls: Array<{ mission_id: string | null; role: string; status: string; model: string; provider: string }>;
  intervals: DelegationInterval[];
}): IndependentResult {
  const { fixture, mission, artifacts } = input;
  const checks = [
    check("mission reached completed through production independent QA", mission.status === "completed", mission.status),
    ...verifyDelegation(fixture, mission, input.intervals),
    ...verifyModelCalls(input.modelCalls, fixture),
    ...verifyArtifactBytes(mission, artifacts, fixture, input.intervals, input.registry),
  ];
  if (fixture.kind === "research") {
    const brief = artifacts.find(artifact => artifact.name === "research-brief.md");
    if (brief?.path) checks.push(...verifyResearchText(readStableFile(brief.path).toString("utf8")));
    else checks.push(check("research brief available for independent citation verification", false, "missing artifact"));
  } else {
    const metrics = artifacts.find(artifact => artifact.name === "metrics.json");
    const brief = artifacts.find(artifact => artifact.name === "operations-brief.md");
    if (metrics?.path && brief?.path) checks.push(...verifyAnalyticsDocuments(
      readStableFile(metrics.path).toString("utf8"), readStableFile(brief.path).toString("utf8"),
      readStableFile(path.join(fixture.workspace, "input/operations.csv"))));
    else checks.push(check("analytics deliverables available for independent recomputation", false, "missing metrics or brief"));
  }
  return { schema: "r2-final-professional-independent-verification-v1", mission_id: fixture.id,
    independent: true, artifacts: attributedArtifacts(artifacts, input.intervals), intervals: input.intervals,
    checks, passed: checks.every(item => item.passed) };
}

/** Reference-only fixtures exercise the verifier without executing agents. */
export function validResearchBrief(): string {
  return [
    "# Northstar service reliability pilot",
    "",
    "## Executive recommendation",
    "",
    "Extend Alder routing practices to Brook and Cove for a two-week repeat measurement before any wider rollout decision. [S3]",
    "",
    "## Factual findings",
    "",
    "The four-week weekday pilot covered Alder, Brook and Cove. Routing runbook version 2 replaced version 1 during the pilot, and acknowledgement median changed from 18 minutes to 11 minutes. [S1]",
    "",
    "Each of Alder, Brook and Cove recorded 480 requests across four site-weeks. Delayed acknowledgements were 31 for Alder, 43 for Brook and 37 for Cove; supervisor escalations were 2, 4 and 3 respectively. [S2]",
    "",
    "The independent reviewer reconciled 180 sampled records to the weekly totals and identified Alder as having both the smallest delayed count and fewest escalations. [S2] [S3]",
    "",
    "## Limitations and decision boundary",
    "",
    "Observations cover weekdays only and cannot establish weekend performance. Depot was explicitly excluded, so no Depot conclusion is supported. No wider rollout has been completed. Repeat measurement is required before expansion. [S1] [S3]",
    "",
    "## Sources",
    "",
    "- [S1] sources/pilot-charter.txt",
    "- [S2] sources/weekly-observations.txt",
    "- [S3] sources/reviewer-note.txt",
    "",
  ].join("\n");
}
export function validOperationsBrief(): string {
  const expected = expectedOperations(new TextEncoder().encode((awaitlessCsv())));
  return [
    "# Six-week operations brief", "", "## Executive recommendation", "",
    `Overall completion was ${expected.totals.completion_percent.toFixed(2)}%, with ${expected.totals.defects} defects and ${expected.totals.schedule_variance_minutes} schedule-variance minutes across this six-week three-team dataset. Prioritize Cedar's schedule review and preserve Birch's completion practices; repeat measurement before changing staffing.`,
    "",
    ...Object.entries(expected.teams).flatMap(([team, metrics]) => [
      `## ${team} findings`,
      `${team} completion was ${metrics.completion_percent.toFixed(2)}%, defects were ${metrics.defects}, and schedule_variance_minutes was ${metrics.schedule_variance_minutes}. Actual minutes per completed order were ${metrics.minutes_per_completed_order.toFixed(2)}.`, "",
    ]),
    "## Method", "",
    "Source: input/operations.csv. Completion percent = completed_orders / work_orders × 100, rounded to two decimals. Minutes per completed order = actual_minutes / completed_orders, rounded to two decimals. Schedule variance minutes = actual_minutes minus planned_minutes. Conclusions are limited to the supplied six-week records for Atlas, Birch and Cedar.", "",
  ].join("\n");
}
function awaitlessCsv(): string {
  // Reference-only; never reads live mission state.
  return OPERATIONS_CSV;
}

export function protocolAttestation(here: string): Record<string, unknown> {
  const files = fs.readdirSync(here).filter(name => /\.(?:ts|md)$/.test(name)).sort().map(name => ({
    file: `scripts/r2-final-professional/${name}`, sha256: sha256(readStableFile(path.join(here, name))),
  }));
  return { schema: "r2-final-professional-attestation-v1", harness_files: files,
    source_inputs: Object.fromEntries(Object.entries(RESEARCH_SOURCES).map(([name, text]) => [name, sha256(text)])),
    analytics_input_sha256: sha256(awaitlessCsv()), analytics_schema_sha256: sha256(ANALYTICS_SCHEMA) };
}

export function fixtureNegativeControls(): {
  references: { research_passed: boolean; analytics_passed: boolean; delegation_passed: boolean; passed: boolean };
  controls: Array<{ name: string; kind: "positive" | "defect"; passed: boolean; detail: string }>;
  passed: boolean;
} {
  const validResearch = validResearchBrief();
  const validBrief = validOperationsBrief();
  const validMetrics = ANALYTICS_SCHEMA;
  const csv = awaitlessCsv();
  const controls: Array<{ name: string; kind: "positive" | "defect"; passed: boolean; detail: string }> = [];
  const control = (name: string, fn: () => Check[]) => {
    const failures = fn().filter(item => !item.passed).map(item => item.check);
    controls.push({ name, kind: "defect", passed: failures.length > 0, detail: failures.join("; ") || "no check rejected invalid fixture" });
  };
  // A positive control must be accepted: it proves the verifier does not reject valid input.
  const positiveControl = (name: string, fn: () => Check[]) => {
    const failures = fn().filter(item => !item.passed).map(item => item.check);
    controls.push({ name, kind: "positive", passed: failures.length === 0, detail: failures.join("; ") || "accepted valid fixture" });
  };
  control("research missing citation rejected", () => verifyResearchText(validResearch.replace(" [S2]", "")));
  control("research uncited site observations rejected", () => verifyResearchText(validResearch.replace("; supervisor escalations were 2, 4 and 3 respectively. [S2]", "; supervisor escalations were 2, 4 and 3 respectively.")));
  control("research unsupported Depot rollout rejected", () => verifyResearchText(validResearch + "\nDepot rollout completed successfully.\n"));
  control("analytics arithmetic mutant rejected", () => verifyAnalyticsDocuments(validMetrics.replace('"defects":18', '"defects":19'), validBrief, new TextEncoder().encode(csv)));
  control("analytics document metric mismatch rejected", () => verifyAnalyticsDocuments(validMetrics, validBrief.replace("90.48%", "99.48%"), new TextEncoder().encode(csv)));
  control("analytics unexpected root field rejected", () => verifyAnalyticsDocuments(validMetrics.replace(/}$/, ',"extra":true}'), validBrief, new TextEncoder().encode(csv)));
  control("analytics derived-number serialization rejected", () => verifyAnalyticsDocuments(validMetrics.replace('"completion_percent":93.13', '"completion_percent":93.130'), validBrief, new TextEncoder().encode(csv)));
  // A labelled overall line may state a count before its percentage; the figure
  // must still be the label's own value.
  const overallExpected = expectedOperations(new TextEncoder().encode(csv));
  const bulletedOverall = [
    "# Six-week operations brief", "", "## Overall findings", "",
    "Across the three-team operation:", "",
    `- **Completion:** ${overallExpected.totals.completed_orders} of ${overallExpected.totals.work_orders} work orders completed (${overallExpected.totals.completion_percent.toFixed(2)}%)`,
    `- **Defects:** ${overallExpected.totals.defects} total`,
    `- **Schedule variance:** +${overallExpected.totals.schedule_variance_minutes} minutes`, "",
    "Recommend a bounded review of this six-week three-team dataset.", "",
    ...Object.entries(overallExpected.teams).flatMap(([team, metrics]) => [
      `## ${team} findings`, "",
      `| Team | Completion % | Defects | Schedule variance |`,
      `| --- | --- | --- | --- |`,
      `| ${team} | ${metrics.completion_percent.toFixed(2)} | ${metrics.defects} | ${metrics.schedule_variance_minutes} |`, "",
    ]),
    "## Method", "",
    "Source: input/operations.csv. Completion percent = completed_orders / work_orders × 100. Minutes per completed order = actual_minutes / completed_orders. Schedule variance minutes = actual_minutes − planned_minutes. This six-week dataset covers Atlas, Birch and Cedar only.", "",
  ].join("\n");
  positiveControl("analytics labelled overall line accepted",
    () => verifyAnalyticsDocuments(validMetrics, bulletedOverall, new TextEncoder().encode(csv)));
  control("analytics labelled overall line with a wrong figure rejected",
    () => verifyAnalyticsDocuments(validMetrics,
      bulletedOverall.replace(/completed \(([\d.]+)%\)/, (_m, pct) => `completed (${(Number(pct) - 1).toFixed(2)}%)`), new TextEncoder().encode(csv)));
  // A division sign is a written formula; a missing or wrong operator is not.
  positiveControl("analytics division-sign formulas accepted",
    () => verifyAnalyticsDocuments(validMetrics, validBrief.replace(/(completed_orders|actual_minutes) \/ /g, "$1 ÷ "), new TextEncoder().encode(csv)));
  positiveControl("analytics parenthesized division formula accepted",
    () => verifyAnalyticsDocuments(validMetrics, validBrief.replace("completed_orders / work_orders × 100", "(completed orders ÷ work orders) × 100"), new TextEncoder().encode(csv)));
  control("analytics formula without an operator rejected",
    () => verifyAnalyticsDocuments(validMetrics, validBrief.replace("completed_orders / work_orders × 100", "completed_orders work_orders × 100"), new TextEncoder().encode(csv)));
  const recursiveFixture = researchFixture("offline-control", "/unused");
  const baseMission = { status: "completed", artifacts: [], metadata: {} } as unknown as Mission;
  const children = [
    { id: "child-a", role: "researcher", task: "Analyze S1", depth: 1, parent_id: "parent", status: "success", parallel_group_id: "group", artifacts: ["child-a-artifact"], tools_used: ["file_read", "file_write"], model: "claude-sonnet-5-5" },
    { id: "child-b", role: "researcher", task: "Analyze S2", depth: 1, parent_id: "parent", status: "success", parallel_group_id: "group", artifacts: ["child-b-artifact"], tools_used: ["file_read", "file_write"], model: "claude-sonnet-5-5" },
  ];
  const recursiveMission = (nodes: unknown[]): Mission => ({ ...baseMission, metadata: { delegation_tree: { total_agents: nodes.length + 1, max_depth: 1, nodes: [
    { id: "parent", role: "research-coordinator", task: "Synthesize", depth: 0, status: "success", tools_used: ["delegate", "file_write"], model: "claude-sonnet-5-5", children: ["child-a", "child-b"], artifacts: ["parent-artifact"] }, ...nodes,
  ] } } });
  const childIntervals: DelegationInterval[] = [
    { node_id: "child-a", mission_id: recursiveFixture.id, role: "researcher", started_at: "2026-01-01T00:00:00.000Z", finished_at: "2026-01-01T00:00:02.000Z", artifact_ids: [] },
    { node_id: "child-b", mission_id: recursiveFixture.id, role: "researcher", started_at: "2026-01-01T00:00:01.000Z", finished_at: "2026-01-01T00:00:03.000Z", artifact_ids: [] },
  ];
  control("recursive extra top-level delegation rejected", () => verifyDelegation(recursiveFixture,
    recursiveMission([...children, { ...children[0], id: "extra-top", depth: 0, parent_id: null }]), childIntervals));
  control("recursive sequential children rejected", () => verifyDelegation(recursiveFixture, recursiveMission(children), [
    { ...childIntervals[0], finished_at: "2026-01-01T00:00:01.000Z" }, { ...childIntervals[1], started_at: "2026-01-01T00:00:01.000Z" },
  ]));
  control("recursive duplicate child identities rejected", () => verifyDelegation(recursiveFixture,
    recursiveMission([children[0], { ...children[1], task: children[0].task }]), childIntervals));
  control("recursive missing parallel reservation rejected", () => verifyDelegation(recursiveFixture,
    recursiveMission(children.map(child => ({ ...child, parallel_group_id: undefined }))), childIntervals));
  control("recursive third child outside common overlap rejected", () => verifyDelegation(recursiveFixture,
    recursiveMission([...children, { ...children[0], id: "child-c", task: "Analyze S3" }]), [...childIntervals,
      { ...childIntervals[0], node_id: "child-c", started_at: "2026-01-01T00:00:04.000Z", finished_at: "2026-01-01T00:00:05.000Z" }]));
  control("research wrong-source site observation rejected", () => verifyResearchText(validResearch.replace("respectively. [S2]", "respectively. [S1]")));
  control("research heading-line citation bypass rejected", () => verifyResearchText(validResearch.replace("## Factual findings\n\nThe four-week", "## Factual findings\nUncited Depot rollout baseline 999.\n\nThe four-week")));
  // Widened rules keep a matching negative control: a table is a legal source
  // map, but a table that binds a key to the wrong path must still be rejected.
  const tableSources = validResearch.replace(
    "- [S1] sources/pilot-charter.txt\n- [S2] sources/weekly-observations.txt\n- [S3] sources/reviewer-note.txt",
    "| ID | Path |\n| --- | --- |\n| S1 | `sources/pilot-charter.txt` |\n| S2 | `sources/weekly-observations.txt` |\n| S3 | `sources/reviewer-note.txt` |");
  positiveControl("research table source map accepted", () => verifyResearchText(tableSources));
  control("research table swapped source path rejected", () => verifyResearchText(tableSources.replace("| S2 | `sources/weekly-observations.txt` |", "| S2 | `sources/pilot-charter.txt` |")));
  const boldSources = validResearch.replace(/- \[S([123])\] sources\/([^\n]+)/g, "- **[S$1]** `sources/$2` — immutable input.");
  positiveControl("research bold source keys and descriptions accepted", () => verifyResearchText(boldSources));
  control("research bold source key with wrong path rejected", () => verifyResearchText(boldSources.replace("`sources/weekly-observations.txt`", "`sources/reviewer-note.txt`")));
  const plainSources = validResearch.replace(/- \[S([123])\] sources\//g, "- S$1: `sources/").replace(/(sources\/[^\n`]+)/g, "$1`");
  positiveControl("research plain source keys with colon accepted", () => verifyResearchText(plainSources));
  control("research plain source key with wrong path rejected", () => verifyResearchText(plainSources.replace("sources/weekly-observations.txt", "sources/reviewer-note.txt")));
  positiveControl("research input-basis front matter accepted", () => verifyResearchText(validResearch.replace(
    "# Northstar service reliability pilot\n", "# Northstar service reliability pilot\n\n**Prepared by:** coordinator\n**Input basis:** immutable pilot sources only.")));
  control("research input-basis factual claim still needs citation", () => verifyResearchText(validResearch.replace(
    "# Northstar service reliability pilot\n", "# Northstar service reliability pilot\n\n**Input basis:** Alder had 31 delayed acknowledgements.")));
  positiveControl("research plain provenance front matter accepted", () => verifyResearchText(validResearch.replace(
    "# Northstar service reliability pilot\n", "# Northstar service reliability pilot\n\nPrepared by: coordinator.\nEvidence base: sources S1, S2 and S3 only.")));
  control("research plain provenance with a factual figure still needs citation", () => verifyResearchText(validResearch.replace(
    "# Northstar service reliability pilot\n", "# Northstar service reliability pilot\n\nPrepared by: coordinator.\nEvidence base: 31 delayed acknowledgements at Alder.")));
  positiveControl("research bounded parenthetical median change accepted",
    () => verifyResearchText(validResearch.replace("from 18 minutes to 11 minutes", "from 18 minutes (manual baseline) to 11 minutes (routed pilot)")));
  control("research wrong median figure rejected",
    () => verifyResearchText(validResearch.replace("from 18 minutes to 11 minutes", "from 18 minutes to 12 minutes")));
  positiveControl("research labelled front matter needs no citation", () => verifyResearchText(
    validResearch.replace("# Northstar service reliability pilot\n", "# Northstar service reliability pilot\n\n**Mission:** run-42\n**Scope:** weekdays only.")));
  control("research numeric front matter still needs a citation", () => verifyResearchText(
    validResearch.replace("# Northstar service reliability pilot\n", "# Northstar service reliability pilot\n\n**Mission:** run-42\n**Scope:** 31 delayed acknowledgements observed.")));
  control("research unrecognised front-matter label rejected", () => verifyResearchText(
    validResearch.replace("# Northstar service reliability pilot\n", "# Northstar service reliability pilot\n\n**Note:** Alder was fastest.")));
  // A numbered or lettered Sources heading is the same section; a qualified one is not.
  positiveControl("research lettered Sources heading accepted",
    () => verifyResearchText(validResearch.replace("## Sources", "## (f) Sources")));
  control("research qualified Sources heading rejected",
    () => verifyResearchText(validResearch.replace("## Sources", "## Sources and methods")));
  // A decision statement is exempt from citation only under a recommendation
  // heading, without digits, and opening with a directive verb. Each negative
  // control is scoped to the citation check so it cannot pass by failing elsewhere.
  const CITE_CHECK = "every substantive factual paragraph carries a source citation";
  const citeOnly = (text: string): Check[] => verifyResearchText(text).filter(item => item.check === CITE_CHECK);
  const recHeading = "## Executive recommendation\n\n";
  positiveControl("research directive decision statement needs no citation", () => verifyResearchText(validResearch.replace(recHeading,
    recHeading + "**Adopt the reviewer's proposal: carry Alder's routing practices into Brook and Cove, and do not authorize any wider rollout.**\n\n")));
  control("research reporting statement under recommendation still needs a citation", () => citeOnly(validResearch.replace(recHeading,
    recHeading + "Alder routing practices produced the smallest delayed count.\n\n")));
  positiveControl("research labelled directive decision needs no citation", () => verifyResearchText(validResearch.replace(recHeading,
    recHeading + "**Recommendation:** approve the reviewer's proposal and hold any wider rollout behind repeat measurement.\n\n")));
  control("research directive statement carrying a figure still needs a citation", () => citeOnly(validResearch.replace(recHeading,
    recHeading + "Adopt Alder routing practices at Brook for 2 weeks.\n\n")));
  control("research directive statement outside a recommendation section still needs a citation", () => citeOnly(validResearch.replace("## Factual findings\n\n",
    "## Factual findings\n\nAdopt Alder routing practices at Brook.\n\n")));
  // Same-name retirement must not become an escape hatch: a known retired ID
  // resolves only when a strictly later revision of that name is accepted.
  const analyticsTableBrief = [
    "# Six-week operations brief", "", "## Executive recommendation", "",
    "Recommend a bounded review limited to the six-week dataset. [S1]", "",
    "Overall completion was 93.13%, with 18 defects and 455 schedule variance minutes across the six-week dataset.", "",
    "| Team | Work orders | Completed | Completion % | Defects | Planned min | Actual min | Min per completed | Schedule variance |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| Atlas | 95 | 89 | 93.68 | 7 | 5700 | 5780 | 64.94 | 80 |",
    "| Birch | 75 | 71 | 94.67 | 3 | 4875 | 4910 | 69.15 | 35 |",
    "| Cedar | 63 | 57 | 90.48 | 8 | 4410 | 4750 | 83.33 | 340 |",
    "", "Birch handled 12 more work orders than Cedar.", "",
    "## Method", "",
    "Source: input/operations.csv. Completion percent = completed orders / work orders × 100. Minutes per completed order = actual minutes / completed orders. Schedule variance = actual minutes − planned minutes. This six-week dataset covers Atlas, Birch and Cedar only.", "",
  ].join("\n");
  positiveControl("analytics header-bound table rows accepted",
    () => verifyAnalyticsDocuments(validMetrics, analyticsTableBrief, new TextEncoder().encode(csv)));
  control("analytics table cell in the wrong column rejected", () => verifyAnalyticsDocuments(validMetrics,
    analyticsTableBrief.replace("| Atlas | 95 | 89 | 93.68 | 7 |", "| Atlas | 95 | 89 | 7 | 93.68 |"), new TextEncoder().encode(csv)));
  const formattedTable = analyticsTableBrief.replace("93.68 | 7 | 5700 | 5780 | 64.94 | 80", "93.68% | 7 | 5,700 | 5,780 | 64.94 | +80")
    .replace("Planned min | Actual min", "Planned min | Actual min");
  positiveControl("analytics grouped thousands and signed table cells accepted",
    () => verifyAnalyticsDocuments(validMetrics, formattedTable, new TextEncoder().encode(csv)));
  control("analytics wrong grouped table value rejected", () => verifyAnalyticsDocuments(validMetrics,
    formattedTable.replace("| +80 |", "| +81 |"), new TextEncoder().encode(csv)));
  positiveControl("analytics overall schedule-variance minutes accepted", () => verifyAnalyticsDocuments(validMetrics,
    validBrief.replace("455 schedule-variance minutes", "+455 minutes of schedule variance"), new TextEncoder().encode(csv)));
  control("analytics wrong schedule-variance minutes rejected", () => verifyAnalyticsDocuments(validMetrics,
    validBrief.replace("455 schedule-variance minutes", "+456 minutes of schedule variance"), new TextEncoder().encode(csv)));
  control("analytics recomputed difference mutant rejected", () => verifyAnalyticsDocuments(validMetrics,
    analyticsTableBrief.replace("12 more work orders", "13 more work orders"), new TextEncoder().encode(csv)));
  positiveControl("analytics exact aggregate remainder accepted", () => verifyAnalyticsDocuments(validMetrics,
    analyticsTableBrief.replace("Birch handled 12 more work orders than Cedar.", "Cedar accounts for 340 of 455 variance minutes; the remaining 115 are Atlas 80 plus Birch 35."), new TextEncoder().encode(csv)));
  control("analytics incorrect aggregate remainder rejected", () => verifyAnalyticsDocuments(validMetrics,
    analyticsTableBrief.replace("Birch handled 12 more work orders than Cedar.", "Cedar accounts for 340 of 455 variance minutes; the remaining 116 are Atlas 80 plus Birch 35."), new TextEncoder().encode(csv)));
  positiveControl("analytics exact immutable input byte count accepted", () => verifyAnalyticsDocuments(validMetrics,
    validBrief + `\ninput/operations.csv remains byte-identical (${Buffer.byteLength(csv)} bytes).\n`, new TextEncoder().encode(csv)));
  control("analytics wrong immutable input byte count rejected", () => verifyAnalyticsDocuments(validMetrics,
    validBrief + `\ninput/operations.csv remains byte-identical (${Buffer.byteLength(csv) + 1} bytes).\n`, new TextEncoder().encode(csv)));
  control("analytics exponential derived metric rejected", () => verifyAnalyticsDocuments(validMetrics.replace("93.13", "9.313e1"), validBrief, new TextEncoder().encode(csv)));
  control("analytics missing multiplication formula rejected", () => verifyAnalyticsDocuments(validMetrics, validBrief.replace("× 100", ""), new TextEncoder().encode(csv)));
  control("analytics Markdown signed-variance mismatch rejected", () => verifyAnalyticsDocuments(validMetrics,
    validBrief.replace("schedule_variance_minutes was 80", "schedule variance: **+81 minutes**"), new TextEncoder().encode(csv)));
  control("duplicate whole-mission concurrency interval rejected", () => {
    const interval = { mission_id: "run-research", started_at: "2026-01-01T00:00:00Z", finished_at: "2026-01-01T00:00:01Z" };
    return [check("duplicate missions incorrectly accepted", overlapProof([interval, interval]).proven === true)];
  });
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "r2-professional-attribution-"));
  try {
    const attributionFixture = analyticsFixture("offline-attribution", artifactRoot);
    const artifact = (id: string, name: string, bytes: string, revision = 1): Artifact => {
      // Each revision needs its own backing file: one path cannot carry two hashes.
      // Host inputs are the exception — the host provisions them at the workspace
      // path the mission actually reads.
      const file = attributionFixture.inputs[name] !== undefined
        ? path.join(attributionFixture.workspace, name)
        : path.join(artifactRoot, id, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
      return { id, mission_id: attributionFixture.id, type: "file", name, path: file,
        created_at: "2026-01-01T00:00:00.000Z", metadata: { sha256: sha256(bytes), size_bytes: Buffer.byteLength(bytes), revision } };
    };
    const input = artifact("input", "input/operations.csv", csv);
    const oldBrief = artifact("brief-old", "operations-brief.md", validBrief, 1);
    const finalBrief = artifact("brief-final", "operations-brief.md", validBrief, 2);
    const metrics = artifact("metrics", "metrics.json", validMetrics);
    const accepted = [input, finalBrief, metrics];
    const intervalsFor = (): DelegationInterval[] => [
      { node_id: "calc", mission_id: attributionFixture.id, role: "analyst", started_at: "2026-01-01T00:00:00Z", finished_at: "2026-01-01T00:00:01Z", artifact_ids: ["metrics"] },
      { node_id: "write", mission_id: attributionFixture.id, role: "writer", started_at: "2026-01-01T00:00:01Z", finished_at: "2026-01-01T00:00:02Z", artifact_ids: ["brief-old", "brief-final"] },
    ];
    const attributionMission = (nodeIds: string[]): Mission => ({ ...baseMission, id: attributionFixture.id,
      artifacts: accepted.map(item => item.id), metadata: { delegation_tree: { total_agents: 2, max_depth: 0, nodes: [
        { id: "calc", role: "analyst", depth: 0, status: "success", artifacts: ["metrics"] },
        { id: "write", role: "writer", depth: 0, status: "success", artifacts: nodeIds },
      ] } } });
    positiveControl("superseded artifact revision uses terminal projection", () => verifyArtifactBytes(
      attributionMission(["brief-final"]), accepted, attributionFixture, intervalsFor(), [...accepted, oldBrief]));
    // The durable claim may name the retired revision: the registry knows it, and
    // a strictly later revision of that name is accepted, so both sides agree.
    positiveControl("retired same-name claim resolves to the current revision", () => verifyArtifactBytes(
      attributionMission(["brief-old"]), accepted, attributionFixture, intervalsFor(), [...accepted, oldBrief]));
    control("retired id with no later accepted revision rejected", () => verifyArtifactBytes(
      attributionMission(["brief-old"]), accepted, attributionFixture, intervalsFor(), [...accepted, oldBrief].filter(item => item.id !== "brief-final")));
    control("terminal producer projection mismatch rejected", () => verifyArtifactBytes(
      attributionMission(["brief-final", "unexpected-final-id"]), accepted, attributionFixture, intervalsFor()));
  } finally {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
  control("CSV duplicate identity rejected", () => [checked("duplicate row parse", () => {
    parseOperationsCsv(new TextEncoder().encode(csv + "W06,Cedar,13,12,1,910,980\n"));
    throw new Error("negative control was accepted");
  })]);
  const researchReference = verifyResearchText(validResearch);
  const analyticsReference = verifyAnalyticsDocuments(validMetrics, validBrief, new TextEncoder().encode(csv));
  const expected = expectedOperations(new TextEncoder().encode(csv));
  const markdownBrief = [
    "# Six-week operations brief", "", "## Executive recommendation", "",
    `Overall completion percent was **${expected.totals.completion_percent.toFixed(2)}%**, with ${expected.totals.defects} defects and schedule variance **+${expected.totals.schedule_variance_minutes} minutes**. Recommend a bounded review.`,
    "", ...Object.entries(expected.teams).flatMap(([team, metrics]) => [
      `## ${team} findings`, `- Completion percent: **${metrics.completion_percent.toFixed(2)}%**`,
      `- Defects: **${metrics.defects}**`, `- Schedule variance: **+${metrics.schedule_variance_minutes} minutes**`, "",
    ]),
    "## Method", "", "Source: input/operations.csv. Completion percent = completed orders / work orders × 100. Minutes per completed order = actual minutes / completed orders. Schedule variance = actual minutes − planned minutes. This six-week dataset covers Atlas, Birch and Cedar only.", "",
  ].join("\n");
  const markdownReference = verifyAnalyticsDocuments(validMetrics, markdownBrief, new TextEncoder().encode(csv));
  const delegationReference = verifyDelegation(recursiveFixture, recursiveMission(children), childIntervals);
  const references = {
    research_passed: researchReference.every(item => item.passed),
    analytics_passed: analyticsReference.every(item => item.passed) && markdownReference.every(item => item.passed),
    delegation_passed: delegationReference.every(item => item.passed),
    passed: false,
  };
  references.passed = references.research_passed && references.analytics_passed && references.delegation_passed;
  return { references, controls, passed: references.passed && controls.every(item => item.passed) };
}

export function overlapProof(intervals: Array<{ mission_id: string; started_at: string; finished_at: string }>): Record<string, unknown> {
  if (intervals.length !== 2) return { claimed: false, proven: false, reason: "Exactly two whole-mission intervals are required; sequential execution proves no concurrency" };
  const [a, b] = intervals;
  if (a.mission_id === b.mission_id || !a.mission_id.endsWith("-research") || !b.mission_id.endsWith("-analytics")) {
    return { claimed: false, proven: false, reason: "Distinct research and analytics mission identities are required" };
  }
  const start = Math.max(Date.parse(a.started_at), Date.parse(b.started_at));
  const end = Math.min(Date.parse(a.finished_at), Date.parse(b.finished_at));
  const overlapMs = end - start;
  return { claimed: true, proven: Number.isFinite(overlapMs) && overlapMs > 0,
    overlap_ms: Number.isFinite(overlapMs) ? Math.max(0, overlapMs) : 0,
    method: "Intersection of real wall-clock intervals surrounding both concurrent MissionManager.run() promises; not inferred from plan flags or sequential runs",
    intervals };
}
