import * as https from "node:https";
import type { RequestOptions } from "node:https";
import { getToolContext, throwIfAborted } from "./tool-context.js";

/** Settle promptly on abort even if the transport never emits an error.
 * Destroy the actual request as well: rejecting a promise alone is not cancel.
 */
export function searchRequest(options: RequestOptions, timeoutMs: number, signal?: AbortSignal, body?: string): Promise<{ status?: number; body: string }> {
  throwIfAborted(signal);
  const context = getToolContext();
  if (context?.fence && !context.fence()) throw new Error("Search denied: mission ownership lost");
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, result?: { status?: number; body: string }) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(result!);
    };
    throwIfAborted(signal);
    if (context?.fence && !context.fence()) { finish(new Error("Search denied: mission ownership lost")); return; }
    const req = https.request({ ...options, signal }, (res) => {
      let data = "";
      res.on("data", (chunk) => { if (!settled) data += chunk; });
      res.on("error", (error) => finish(error));
      res.on("end", () => {
        if (signal?.aborted) abort();
        else finish(undefined, { status: res.statusCode, body: data });
      });
    });
    const abort = () => {
      const reason = signal?.reason ?? new Error("Operation aborted");
      finish(reason);
      req.destroy(reason instanceof Error ? reason : new Error(String(reason)));
    };
    req.on("error", (error) => finish(error));
    req.setTimeout(timeoutMs, () => {
      const error = new Error("Search request timed out");
      finish(error);
      req.destroy(error);
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    if (context?.fence && !context.fence()) { finish(new Error("Search denied: mission ownership lost")); req.destroy(); return; }
    if (body) req.write(body);
    if (context?.fence && !context.fence()) { finish(new Error("Search denied: mission ownership lost")); req.destroy(); return; }
    req.end();
  });
}
