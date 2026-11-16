import { createHash } from "node:crypto";

export const TARGET_COUNT = 40;
export const HIDDEN_CASES_PER_TARGET = 44;
export const MODEL_ID = "claude-fable-5-2";
export const TOOLS = ["file_read", "file_list", "file_write", "shell", "save_artifact"] as const;
export const CONTROLS = Object.freeze({ model: MODEL_ID, role: "coder", tools: TOOLS, maxSteps: 8, maxRetries: 0, wallCapMs: 240_000 });
export type SemanticVariant = "WINDOW_ONLY" | "DURATION" | "COLOR" | "FLAGS";
export type HiddenCase = { id: string; category: "valid" | "syntax-invalid" | "semantic-invalid"; input: string; expected?: unknown; error?: "INVALID_FORMAT" | "INVALID_VALUE" };
export interface TargetConfig {
  index: number; separator: ";" | "|"; trim: "strict" | "trim"; unknown: "drop" | "retain";
  file: string; exportName: string; windowMin: number; windowMax: number; rateMax: number; limitMax: number;
  variant: SemanticVariant; durationMax: number; colors: readonly string[]; colorCase: "lower" | "upper"; flagValues: readonly string[];
}
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const pad = (n: number) => String(n).padStart(2, "0");

export function targetConfig(index: number): TargetConfig {
  if (!Number.isInteger(index) || index < 0 || index >= TARGET_COUNT) throw new Error("Target index out of frozen range");
  const variants: SemanticVariant[] = ["WINDOW_ONLY", "DURATION", "COLOR", "FLAGS"];
  const variant = variants[index % variants.length];
  const lowerSets = [["red", "blue"], ["green", "amber"], ["cyan", "magenta"], ["white", "black"], ["teal", "gold"]];
  const flagSets = [["fast", "safe"], ["dry", "live"], ["cold", "warm"], ["read", "write"], ["alpha", "beta"]];
  const fileKinds = [
    ["lib/records.cjs", "parseRecords"], ["src/export.cjs", "parseExport"],
    ["lib/input.cjs", "readInput"], ["core/decoder.cjs", "decodeSeparated"],
    ["adapters/bundle.cjs", "parseBundle"],
  ] as const;
  const chosen = fileKinds[Math.floor(index / 4) % fileKinds.length];
  return Object.freeze({
    index, separator: index % 2 ? "|" : ";", trim: Math.floor(index / 2) % 2 ? "trim" : "strict",
    unknown: Math.floor(index / 4) % 2 ? "retain" : "drop", file: chosen[0], exportName: chosen[1],
    windowMin: 1 + (index % 3), windowMax: 20 + (index % 5) * 10, rateMax: 10 + (index % 4) * 10,
    limitMax: 25 + (index % 6) * 25, variant, durationMax: 30 + (index % 5) * 30,
    colors: index % 2 ? lowerSets[index % lowerSets.length].map(x => x.toUpperCase()) : lowerSets[index % lowerSets.length],
    colorCase: index % 2 ? "upper" : "lower", flagValues: flagSets[index % flagSets.length],
  });
}

export const ALL_TARGETS: readonly TargetConfig[] = Object.freeze(Array.from({ length: TARGET_COUNT }, (_, i) => targetConfig(i)));

export function referenceTargetSource(): string {
  return `'use strict';
function parse(text) {
  if (typeof text !== 'string') throw new Error('INVALID_FORMAT');
  if (text === '') return [];
  const records = []; let record = []; let field = ''; let quoted = false; let after = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (after) {
      if (c === SEP) { record.push(field); field = ''; after = false; }
      else if (c === '\\n' || c === '\\r') { record.push(field); records.push(record); record = []; field = ''; after = false; if (c === '\\r' && text[i + 1] === '\\n') i++; }
      else throw new Error('INVALID_FORMAT');
    } else if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; after = true; } }
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === '"') throw new Error('INVALID_FORMAT');
    else if (c === SEP) { record.push(field); field = ''; }
    else if (c === '\\n' || c === '\\r') { record.push(field); records.push(record); record = []; field = ''; if (c === '\\r' && text[i + 1] === '\\n') i++; }
    else field += c;
  }
  if (quoted) throw new Error('INVALID_FORMAT');
  if (after || field !== '' || record.length) { record.push(field); records.push(record); }
  return records.map((raw, row) => {
    const pairs = {}; const order = [];
    for (const item of raw) {
      const eq = item.indexOf('=');
      if (eq <= 0 || item.indexOf('=', eq + 1) !== -1) throw new Error('INVALID_FORMAT');
      const key = item.slice(0, eq); let value = item.slice(eq + 1);
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('INVALID_FORMAT');
      if (TRIM) value = value.trim();
      else if (value !== value.trim()) throw new Error('INVALID_FORMAT');
      if (Object.prototype.hasOwnProperty.call(pairs, key)) throw new Error('INVALID_FORMAT');
      pairs[key] = value; order.push(key);
    }
    if (!Object.prototype.hasOwnProperty.call(pairs, 'WINDOW') || !Object.prototype.hasOwnProperty.call(pairs, 'RATE') || !Object.prototype.hasOwnProperty.call(pairs, 'LIMIT')) throw new Error('INVALID_VALUE');
    for (const key of Object.keys(pairs)) if (!FIELDS.includes(key)) {
      if (RETAIN) continue;
      delete pairs[key];
    }
    const integer = (key, min, max) => { const value = pairs[key]; if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('INVALID_VALUE'); const n = Number(value); if (n < min || n > max) throw new Error('INVALID_VALUE'); return n; };
    const result = {};
    for (const key of FIELDS) if (Object.prototype.hasOwnProperty.call(pairs, key)) {
      if (key === 'WINDOW') result[key] = integer(key, WMIN, WMAX);
      else if (key === 'RATE') result[key] = integer(key, 0, RMAX);
      else if (key === 'LIMIT') result[key] = integer(key, 1, LMAX);
      else if (key === 'DURATION') result[key] = integer(key, 1, DMAX);
      else if (key === 'COLOR') { if (!COLORS.includes(pairs[key])) throw new Error('INVALID_VALUE'); result[key] = pairs[key]; }
      else if (key === 'FLAGS') {
        if (!/^[a-z]+(,[a-z]+)*$/.test(pairs[key])) throw new Error('INVALID_VALUE');
        const values = pairs[key].split(','); if (new Set(values).size !== values.length || values.some(v => !FLAG_VALUES.includes(v))) throw new Error('INVALID_VALUE'); result[key] = values;
      }
    }
    if (RETAIN) for (const key of order) if (!FIELDS.includes(key)) result[key] = pairs[key];
    return result;
  });
}
module.exports = { EXPORT_NAME: parse };
`;
}

export function targetSource(config: TargetConfig): string {
  return referenceTargetSource().replaceAll("SEP", JSON.stringify(config.separator))
    .replaceAll("TRIM", String(config.trim === "trim")).replaceAll("RETAIN", String(config.unknown === "retain"))
    .replaceAll("FIELDS", JSON.stringify(config.variant === "WINDOW_ONLY" ? ["WINDOW", "RATE", "LIMIT"] : ["WINDOW", "RATE", "LIMIT", config.variant]))
    .replace("WMIN", String(config.windowMin)).replace("WMAX", String(config.windowMax))
    .replace("RMAX", String(config.rateMax)).replace("LMAX", String(config.limitMax)).replace("DMAX", String(config.durationMax))
    .replace("COLORS", JSON.stringify(config.colors)).replace("FLAG_VALUES", JSON.stringify(config.flagValues))
    .replace("EXPORT_NAME", config.exportName);
}

export function stubSource(config: TargetConfig): string {
  return `function ${config.exportName}(text) {\n  return text.trim().split(/\\r?\\n/).filter(Boolean).map(line => Object.fromEntries(line.split('${config.separator}').map(part => part.split('='))));\n}\nmodule.exports = { ${config.exportName} };\n`;
}

export function formatSpec(c: TargetConfig): string {
  const optional = c.variant === "WINDOW_ONLY" ? "No additional semantic field is defined." :
    c.variant === "DURATION" ? `DURATION: decimal integer ${1}..${c.durationMax}, inclusive.` :
    c.variant === "COLOR" ? `COLOR: exactly one of ${c.colors.map(x => JSON.stringify(x)).join(", ")}; enum matching is case-sensitive.` :
    `FLAGS: comma-separated one or more values from ${c.flagValues.join(", ")}; no repeats or other values.`;
  return `# Separated key/value records\n\nRepair ${c.file}, exporting CommonJS function \`${c.exportName}(text)\`.\n\n- UTF-8 JavaScript string input; empty string returns \`[]\`. Records use LF, CRLF, or CR.\n- Each record has one or more fields separated by literal \`${c.separator}\`. Each unquoted field is exactly \`KEY=VALUE\` with one equals sign; KEY matches \`[A-Z][A-Z0-9_]*\`.\n- A whole field may be double quoted, including its key/value text. Inside quotes, two double quotes decode to one quote. Quotes may contain separators, equals signs, CR and LF. No characters may follow a closing quote except a separator or record ending. Unterminated quotes, quotes in unquoted fields, bad keys, and duplicate decoded keys throw \`Error("INVALID_FORMAT")\`.\n- Whitespace policy: ${c.trim === "trim" ? "trim leading/trailing whitespace from each decoded VALUE only" : "VALUE must already equal its trimmed form; otherwise INVALID_FORMAT"}.\n- Unknown keys: ${c.unknown === "retain" ? "retain decoded unknown string values in original record field order after known fields" : "drop unknown keys after syntax and duplicate validation"}. A prototype-looking key is still data and must not alter the result prototype.\n- Output is an array of ordinary own-key objects, in record order. Duplicate object key insertion order is known-field schema order, then retained unknown field order.\n\nRequired in every record: WINDOW, RATE, LIMIT. Missing or invalid required fields throw \`Error("INVALID_VALUE")\`.\n\n- WINDOW: canonical unsigned decimal integer (0 or nonzero without leading zero), ${c.windowMin}..${c.windowMax} inclusive.\n- RATE: canonical unsigned decimal integer, 0..${c.rateMax} inclusive.\n- LIMIT: canonical unsigned decimal integer, 1..${c.limitMax} inclusive.\n- ${optional}\n\nOnly the documented optional field is recognized. Convert valid integer values to JavaScript numbers; COLOR remains a string and FLAGS becomes an array. Syntax/duplicate/whitespace problems take precedence over semantic errors while parsing each record. Use exactly the error messages above, with no prefixes.\n`;
}

function quoteField(c: TargetConfig, value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function base(c: TargetConfig, extra = ""): string {
  const variant = c.variant === "DURATION" ? `DURATION=${Math.min(5, c.durationMax)}` : c.variant === "COLOR" ? `COLOR=${c.colors[0]}` : c.variant === "FLAGS" ? `FLAGS=${c.flagValues.join(",")}` : "";
  return [`WINDOW=${c.windowMin + 1}`, `RATE=1`, `LIMIT=2`, variant, extra].filter(Boolean).join(c.separator);
}
function makeCase(id: string, category: HiddenCase["category"], input: string, expected?: unknown, error?: HiddenCase["error"]): HiddenCase {
  return { id, category, input, ...(expected === undefined ? {} : { expected }), ...(error ? { error } : {}) };
}

/** Host only: never write these values into a solver workspace. */
export function hiddenCases(c: TargetConfig): HiddenCase[] {
  const s = c.separator;
  const expectedBase: Record<string, unknown> = { WINDOW: c.windowMin + 1, RATE: 1, LIMIT: 2 };
  if (c.variant === "DURATION") expectedBase.DURATION = Math.min(5, c.durationMax);
  if (c.variant === "COLOR") expectedBase.COLOR = c.colors[0];
  if (c.variant === "FLAGS") expectedBase.FLAGS = [...c.flagValues];
  const cases: HiddenCase[] = [
    makeCase("empty", "valid", "", []),
    makeCase("ordinary", "valid", base(c), [expectedBase]),
    makeCase("crlf-and-trailing", "valid", `${base(c)}\r\n${base(c)}\r\n`, [expectedBase, expectedBase]),
    makeCase("quoted-separator", "valid", `${base(c)}${s}${quoteField(c, `NOTE=a${s}b`)}`, [{ ...expectedBase, ...(c.unknown === "retain" ? { NOTE: `a${s}b` } : {}) }]),
    makeCase("escaped-quote", "valid", `${base(c)}${s}${quoteField(c, 'NOTE=He said "yes"')}`, [{ ...expectedBase, ...(c.unknown === "retain" ? { NOTE: 'He said "yes"' } : {}) }]),
    makeCase("quoted-required", "valid", `${quoteField(c, `WINDOW=${c.windowMin + 1}`)}${s}RATE=1${s}LIMIT=2${c.variant === "DURATION" ? `${s}DURATION=1` : c.variant === "COLOR" ? `${s}COLOR=${c.colors[0]}` : c.variant === "FLAGS" ? `${s}FLAGS=${c.flagValues[0]}` : ""}`, [{ WINDOW: c.windowMin + 1, RATE: 1, LIMIT: 2, ...(c.variant === "DURATION" ? { DURATION: 1 } : c.variant === "COLOR" ? { COLOR: c.colors[0] } : c.variant === "FLAGS" ? { FLAGS: [c.flagValues[0]] } : {}) }]),
    makeCase("quoted-newline", "valid", `${base(c)}${s}${quoteField(c, "NOTE=line1\r\nline2")}`, [{ ...expectedBase, ...(c.unknown === "retain" ? { NOTE: "line1\r\nline2" } : {}) }]),
    makeCase("cr-record", "valid", `${base(c)}\r${base(c)}`, [expectedBase, expectedBase]),
    makeCase("unknown", "valid", `${base(c)}${s}EXTRA=text`, [{ ...expectedBase, ...(c.unknown === "retain" ? { EXTRA: "text" } : {}) }]),
    makeCase("unknown-order", "valid", `ZZ=last${s}${base(c)}${s}AA=first`, [{ ...expectedBase, ...(c.unknown === "retain" ? { ZZ: "last", AA: "first" } : {}) }]),
    makeCase("numeric-bounds", "valid", `WINDOW=${c.windowMax}${s}RATE=${c.rateMax}${s}LIMIT=${c.limitMax}${c.variant === "DURATION" ? `${s}DURATION=${c.durationMax}` : c.variant === "COLOR" ? `${s}COLOR=${c.colors[1]}` : c.variant === "FLAGS" ? `${s}FLAGS=${c.flagValues[1]}` : ""}`, [{ WINDOW: c.windowMax, RATE: c.rateMax, LIMIT: c.limitMax, ...(c.variant === "DURATION" ? { DURATION: c.durationMax } : c.variant === "COLOR" ? { COLOR: c.colors[1] } : c.variant === "FLAGS" ? { FLAGS: [c.flagValues[1]] } : {}) }]),
    makeCase("unterminated", "syntax-invalid", `${base(c)}${s}"NOTE=open`, undefined, "INVALID_FORMAT"),
    makeCase("after-close", "syntax-invalid", `${base(c)}${s}"NOTE=x"tail`, undefined, "INVALID_FORMAT"),
    makeCase("bare-quote", "syntax-invalid", `${base(c)}${s}NOTE=bad"quote`, undefined, "INVALID_FORMAT"),
    makeCase("missing-equals", "syntax-invalid", `${base(c)}${s}BROKEN`, undefined, "INVALID_FORMAT"),
    makeCase("empty-key", "syntax-invalid", `${base(c)}${s}=value`, undefined, "INVALID_FORMAT"),
    makeCase("double-equals", "syntax-invalid", `${base(c)}${s}NOTE=a=b`, undefined, "INVALID_FORMAT"),
    makeCase("duplicate", "syntax-invalid", `${base(c)}${s}RATE=3`, undefined, "INVALID_FORMAT"),
    makeCase("quoted-duplicate", "syntax-invalid", `${base(c)}${s}${quoteField(c, "RATE=3")}`, undefined, "INVALID_FORMAT"),
    makeCase("lowercase-key", "syntax-invalid", `${base(c)}${s}note=x`, undefined, "INVALID_FORMAT"),
    makeCase("whitespace-policy", "syntax-invalid", `${base(c)}${s}NOTE= padded `, c.trim === "trim" ? [{ ...expectedBase, ...(c.unknown === "retain" ? { NOTE: "padded" } : {}) }] : undefined, c.trim === "trim" ? undefined : "INVALID_FORMAT"),
    makeCase("window-low", "semantic-invalid", `WINDOW=${c.windowMin - 1}${s}RATE=1${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("window-high", "semantic-invalid", `WINDOW=${c.windowMax + 1}${s}RATE=1${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("window-leading-zero", "semantic-invalid", `WINDOW=0${c.windowMin + 1}${s}RATE=1${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("window-decimal", "semantic-invalid", `WINDOW=${c.windowMin + 1}.5${s}RATE=1${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("rate-high", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=${c.rateMax + 1}${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("rate-negative", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=-1${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("rate-exponent", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1e1${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("limit-zero", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1${s}LIMIT=0`, undefined, "INVALID_VALUE"),
    makeCase("limit-high", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1${s}LIMIT=${c.limitMax + 1}`, undefined, "INVALID_VALUE"),
    makeCase("missing-window", "semantic-invalid", `RATE=1${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("missing-rate", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("missing-limit", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1`, undefined, "INVALID_VALUE"),
    makeCase("syntax-precedence", "syntax-invalid", `WINDOW=999999${s}RATE=1${s}LIMIT=2${s}BROKEN`, undefined, "INVALID_FORMAT"),
  ];
  if (c.variant === "DURATION") {
    cases.push(makeCase("duration-zero", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1${s}LIMIT=2${s}DURATION=0`, undefined, "INVALID_VALUE"));
    cases.push(makeCase("duration-high", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1${s}LIMIT=2${s}DURATION=${c.durationMax + 1}`, undefined, "INVALID_VALUE"));
  } else if (c.variant === "COLOR") {
    const wrong = c.colorCase === "lower" ? c.colors[0].toUpperCase() : c.colors[0].toLowerCase();
    cases.push(makeCase("color-case", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1${s}LIMIT=2${s}COLOR=${wrong}`, undefined, "INVALID_VALUE"));
    const invalidColor = c.colors.includes("orange") ? "not-a-color" : "orange";
    cases.push(makeCase("color-enum", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1${s}LIMIT=2${s}COLOR=${invalidColor}`, undefined, "INVALID_VALUE"));
  } else if (c.variant === "FLAGS") {
    cases.push(makeCase("flags-repeat", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1${s}LIMIT=2${s}FLAGS=${c.flagValues[0]},${c.flagValues[0]}`, undefined, "INVALID_VALUE"));
    cases.push(makeCase("flags-unknown", "semantic-invalid", `WINDOW=${c.windowMin + 1}${s}RATE=1${s}LIMIT=2${s}FLAGS=${c.flagValues[0]},invalid`, undefined, "INVALID_VALUE"));
  } else {
    cases.push(makeCase("unknown-empty", "valid", `${base(c)}${s}EMPTY=`, [{ ...expectedBase, ...(c.unknown === "retain" ? { EMPTY: "" } : {}) }]));
    cases.push(makeCase("unknown-many-equals-quoted", "syntax-invalid", `${base(c)}${s}${quoteField(c, "NOTE=a=b")}`, undefined, "INVALID_FORMAT"));
  }
  // Eight additional deterministic cases bring every schema to exactly 44.
  cases.push(
    makeCase("lf-trailing", "valid", `${base(c)}\n`, [expectedBase]),
    makeCase("two-empty-unknown", "valid", `${base(c)}${s}X=${s}Y=`, [{ ...expectedBase, ...(c.unknown === "retain" ? { X: "", Y: "" } : {}) }]),
    makeCase("rate-zero", "valid", `WINDOW=${c.windowMin}${s}RATE=0${s}LIMIT=1`, [{ WINDOW: c.windowMin, RATE: 0, LIMIT: 1 }]),
    makeCase("empty-record-field", "syntax-invalid", `${base(c)}${s}`, undefined, "INVALID_FORMAT"),
    makeCase("second-record-invalid", "semantic-invalid", `${base(c)}\nWINDOW=${c.windowMax + 1}${s}RATE=1${s}LIMIT=2`, undefined, "INVALID_VALUE"),
    makeCase("second-record-syntax", "syntax-invalid", `${base(c)}\nWINDOW=1${s}RATE=1${s}LIMIT=2${s}"OPEN=x`, undefined, "INVALID_FORMAT"),
    makeCase("quoted-key-syntax", "syntax-invalid", `${base(c)}${s}${quoteField(c, "bad-key=x")}`, undefined, "INVALID_FORMAT"),
    makeCase("duplicate-unknown", "syntax-invalid", `${base(c)}${s}NOTE=x${s}NOTE=y`, undefined, "INVALID_FORMAT"),
  );
  // Correct the categories of two whitespace-dependent valid cases.
  if (c.trim === "trim") cases[20].category = "valid";
  if (cases.length !== HIDDEN_CASES_PER_TARGET) throw new Error(`Frozen hidden case count ${cases.length}`);
  return cases;
}

export function visibleTest(c: TargetConfig): string {
  const first = base(c);
  const firstExpected: Record<string, unknown> = { WINDOW: c.windowMin + 1, RATE: 1, LIMIT: 2 };
  if (c.variant === "DURATION") firstExpected.DURATION = Math.min(5, c.durationMax);
  if (c.variant === "COLOR") firstExpected.COLOR = c.colors[0];
  if (c.variant === "FLAGS") firstExpected.FLAGS = [...c.flagValues];
  const second = `WINDOW=${c.windowMax}${s(c)}RATE=0${s(c)}LIMIT=1`;
  return `const assert = require('node:assert/strict');\nconst { ${c.exportName} } = require('./${c.file}');\nassert.deepEqual(${c.exportName}(${JSON.stringify(first)}), ${JSON.stringify([firstExpected])});\nassert.deepEqual(${c.exportName}(${JSON.stringify(second)}), ${JSON.stringify([{ WINDOW: c.windowMax, RATE: 0, LIMIT: 1 }])});\nconsole.log('visible PASS');\n`;
}
function s(c: TargetConfig): string { return c.separator; }

export const SOURCE_CONTRACT = `The input is UTF-8 delimited text. The first row is data; there is no special header treatment.\nReturn an array of rows, each an array of field strings. Empty input returns [].\nA quoted field starts and ends with a double quote. It may contain the delimiter, CR/LF newlines and empty text.\nTwo double quotes inside a quoted field decode to one literal double quote.\nUnquoted fields may be empty, including trailing fields. Accept LF and CRLF record separators.\nMalformed unterminated quotes, characters after a closing quote, or quotes inside an unquoted field must throw Error('INVALID_FORMAT').\n`;

export const SOURCE_ARTIFACT = `'use strict';
function parseLedgerCsv(text) {
  if (typeof text !== 'string') throw new Error('INVALID_FORMAT');
  if (text === '') return [];
  const rows = []; let row = []; let field = ''; let quoted = false; let after = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (after) {
      if (c === ',') { row.push(field); field = ''; after = false; }
      else if (c === '\\n' || c === '\\r') { row.push(field); rows.push(row); row = []; field = ''; after = false; if (c === '\\r' && text[i + 1] === '\\n') i++; }
      else throw new Error('INVALID_FORMAT');
    } else if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; after = true; } }
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === '"') throw new Error('INVALID_FORMAT');
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\\n' || c === '\\r') { row.push(field); rows.push(row); row = []; field = ''; if (c === '\\r' && text[i + 1] === '\\n') i++; }
    else field += c;
  }
  if (quoted) throw new Error('INVALID_FORMAT');
  if (after || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
module.exports = { parseLedgerCsv };
`;

export function sourceEdgeCorpus(): Array<{ input: string; expected?: string[][]; error?: string }> {
  return [
    { input: "", expected: [] }, { input: "a,b\n1,2\n", expected: [["a", "b"], ["1", "2"]] },
    { input: 'a,"b,c",\r\n"x","He said ""yes""","line1\r\nline2"', expected: [["a", "b,c", ""], ["x", 'He said "yes"', "line1\r\nline2"]] },
    { input: ",,\n", expected: [["", "", ""]] }, { input: 'a,b\r1,2', expected: [["a", "b"], ["1", "2"]] },
    { input: 'a,"open', error: "INVALID_FORMAT" }, { input: 'a,"closed"x', error: "INVALID_FORMAT" },
    { input: 'a,bad"quote', error: "INVALID_FORMAT" },
  ];
}

export function splitOnlyMutant(c: TargetConfig): string { return stubSource(c); }
export function escapeMutant(c: TargetConfig): string {
  return targetSource(c).replace("if (text[i + 1] === '\"') { field += '\"'; i++; } else { quoted = false; after = true; }", "quoted = false; after = true;");
}
export function duplicateMutant(c: TargetConfig): string {
  return targetSource(c).replace("if (Object.prototype.hasOwnProperty.call(pairs, key)) throw new Error('INVALID_FORMAT');", "");
}
export function rangeMutant(c: TargetConfig): string {
  return targetSource(c).replace("if (n < min || n > max)", "if (n < min || false)");
}

export function manifest() {
  return ALL_TARGETS.map(config => ({ index: config.index, config, format_sha256: sha256(formatSpec(config)), visible_sha256: sha256(visibleTest(config)),
    stub_sha256: sha256(stubSource(config)), reference_sha256: sha256(targetSource(config)), hidden_sha256: sha256(JSON.stringify(hiddenCases(config))), hidden_cases: HIDDEN_CASES_PER_TARGET }));
}
