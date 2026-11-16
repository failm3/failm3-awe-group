/**
 * Tools that only read. A read cannot change state outside the mission, so a
 * failed attempt whose marks are limited to these can be retried safely.
 *
 * This list lives in its own module on purpose: the tool registry captures the
 * workspace root when it is imported, so recovery logic must be able to ask
 * this question without loading the registry.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "file_read",
  "file_list",
  "web_fetch",
  "web_search",
  "web_extract",
  "ti_search",
  "manus_search",
  "capability_library",
  "csv_analytics",
]);
