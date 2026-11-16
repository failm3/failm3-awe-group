import { createHash } from 'node:crypto';

/**
 * Canonical JSON + digest, byte-compatible with Nox's
 * `awe/tool_registry/common.mjs` (sorted keys, recursive). Compatibility is
 * deliberate: a digest produced here must equal the digest Nox computes over
 * the same value, otherwise a cross-boundary contract test is meaningless.
 */
/**
 * Query objects routinely carry `undefined` for absent options. JSON has no
 * `undefined`, and Nox's canonicalizer throws on it, so we drop those keys
 * before digesting. The result stays byte-identical to Nox for any value that
 * contains no `undefined`.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as unknown as T;
  }
  return value;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(obj)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(obj[k]))
        .join(',') +
      '}'
    );
  }
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error('UCL_CANONICAL');
  return text;
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** `sha256:<64 hex>`, matching Nox's digest format. */
export function digest(value: unknown): string {
  return 'sha256:' + sha256Hex(canonical(stripUndefined(value)));
}

/**
 * Canonical URL key for deduplication. Preserves scheme, host, path, query and
 * hash differences: a `?x=1` variant or an `http:` twin is a *distinct*
 * address, and the catalog's own audit already counted them separately.
 */
export function urlKey(raw: string): string {
  const u = new URL(raw);
  if (!['https:', 'http:'].includes(u.protocol)) throw new Error('UCL_URL_SCHEME');
  if (u.username || u.password) throw new Error('UCL_URL_CREDENTIALS');
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${host}${u.port ? ':' + u.port : ''}${path}${u.search}${u.hash}`;
}

export function hostOf(raw: string): string {
  return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
}

/** Deterministic, namespaced id derivation. */
export function stableId(prefix: string, key: string, length = 40): string {
  return `${prefix}_${sha256Hex(key).slice(0, length)}`;
}
