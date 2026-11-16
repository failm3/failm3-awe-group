/**
 * Model output is text, not JSON. Extract the first JSON object from a
 * response that may be wrapped in markdown fences or surrounded by prose.
 * Brace matching ignores braces inside JSON strings and escapes, so a value
 * like `{"task": "use {braces}"}` does not terminate the object early.
 */
export function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return extractFirstObject(fenceMatch[1].trim()) ?? fenceMatch[1].trim();
  return extractFirstObject(text.trim()) ?? text.trim();
}

function extractFirstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Bounded preview for diagnostics; never dump a whole model response into a log. */
export function responsePreview(text: string, limit = 600): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit)}… (${compact.length} chars)`;
}
