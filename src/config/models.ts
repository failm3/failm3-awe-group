/**
 * Model configuration for AWE GROUP.
 *
 * Router.Cheap configuration with deterministic role defaults. Head currently
 * selects roles, not model IDs. Trusted hosts can construct an explicit router.
 */

const OFFLINE_TEST = process.env.AWE_OFFLINE_TEST === "1";
const apiKey = process.env.ROUTER_CHEAP_API_KEY || (OFFLINE_TEST ? "offline-test-only" : undefined);

if (!apiKey) {
  throw new Error(
    "Nox Runtime credentials are not loaded. Launch through scripts/run-nox-runtime.sh " +
    "with AWE_RUNTIME_ENV_FILE selecting the dedicated runtime secret file."
  );
}

const BASE_URL = OFFLINE_TEST ? "http://127.0.0.1:9/v1" : "https://router.cheap/v1";

/**
 * Get a Mastra-compatible model config for any Router.Cheap model ID.
 * Usage: getModel("gpt-6-astra"), getModel("kimi-k3.1-pro"), etc.
 */
export function getModel(modelId: string) {
  return {
    id: `routercheap/${modelId}` as const,
    providerId: "routercheap",
    modelId,
    url: BASE_URL,
    apiKey,
    api: "chat" as const,
  };
}

/**
 * Historical development observations (not current availability guarantees):
 *   ✅ claude-opus-5-5    — works
 *   ✅ claude-sonnet-5-5  — works
 *   ✅ gpt-6-astra        — works
 *   ✅ kimi-k3.1-pro      — works
 *   ✅ deepseek-v4-flash  — works
 *   ❌ claude-haiku-4-5   — 403 (needs Claude Max source)
 *   ❌ claude-haiku-5-5   — 403 (needs Claude Max source)
 *   ❌ kimi-k2.7-code     — 403 (needs Kimi Reserve source)
 */

/** Fast research/classification model — deepseek is cheap and fast */
export const fastModel = getModel("deepseek-v4-flash");

/** Smart model for planning, analysis, complex reasoning */
export const smartModel = getModel("claude-opus-5-5");

/** Coding specialist — kimi-k3.1-pro has strong code capabilities */
export const codeModel = getModel("kimi-k3.1-pro");

/** Static role defaults; availability must be verified separately by the host. */
export const MODEL_CATALOG = {
  // Planning and reasoning — best quality
  "planning": "claude-opus-5-5",
  "analysis": "deepseek-v4-flash",
  "qa": "claude-opus-5-5",

  // Research and web — fast + capable
  "research": "deepseek-v4-flash",
  "fast": "deepseek-v4-flash",

  // Coding — Kimi remains the default for coding subtasks. The top-level coder
  // uses Fable for the controlled resume after Kimi's 450s AI_APICallError;
  // this is a scoped fallback, not a claim that the Kimi route is broken.
  "coding": "kimi-k3.1-pro",
  "code": "kimi-k3.1-pro",
  "code-review": "claude-opus-5-5",
  "coder": "claude-fable-5-2",

  // Writing
  "writing": "claude-sonnet-5-5",
  "writer": "claude-sonnet-5-5",

  // Data analysis — deepseek is efficient
  "data": "deepseek-v4-flash",
  "analyst": "deepseek-v4-flash",

  // General / creative
  "creative": "gpt-6-astra",
  "general": "claude-sonnet-5-5",
} as const;

const ROLE_ALIASES: Readonly<Record<string, keyof typeof MODEL_CATALOG>> = Object.freeze({
  researcher: "research", reviewer: "qa", "code-reviewer": "code-review",
});

const normalizeRole = (role: string): string => role.trim().toLowerCase().replace(/[\s_]+/g, "-");

/** Whole role segments only; longest compound wins, conflicting ties use the
 * planning default. Never let object prototypes or catalog insertion order route.
 */
export function selectModelForRole(role: string): ReturnType<typeof getModel> {
  const normalized = normalizeRole(role);
  const entries = [
    ...Object.entries(MODEL_CATALOG),
    ...Object.entries(ROLE_ALIASES).map(([alias, key]) => [alias, MODEL_CATALOG[key]]),
  ];
  const exact = entries.find(([key]) => key === normalized);
  if (exact) return getModel(exact[1]);
  const matches = entries.filter(([key]) => `-${normalized}-`.includes(`-${key}-`));
  const specificity = Math.max(0, ...matches.map(([key]) => key.split("-").length));
  const models = new Set(matches.filter(([key]) => key.split("-").length === specificity).map(([, id]) => id));
  return models.size === 1 ? getModel([...models][0]) : smartModel;
}

export interface HostModelRoutingPolicy {
  /** Host-approved IDs; syntax validation does not prove provider availability. */
  allowedModels: readonly string[];
  /** Exact stable host agent/node IDs; never read these from model tool input. */
  byAgent?: Readonly<Record<string, string>>;
  /** Normalized exact roles; no substring matching for overrides. */
  byRole?: Readonly<Record<string, string>>;
}

/** Build once in trusted host configuration. Copies validated overrides into a
 * private snapshot so concurrent agents cannot change each other's routing.
 * Priority: exact host agent ID, exact role override, deterministic defaults.
 * This is an opt-in host API, not an authorization boundary for arbitrary JS.
 */
export function createHostModelRouter(policy: HostModelRoutingPolicy) {
  const validId = (value: unknown): value is string =>
    typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
  if (!policy || !Array.isArray(policy.allowedModels) || !policy.allowedModels.length ||
      !policy.allowedModels.every(validId)) throw new Error("Host model allowlist must contain valid model IDs");
  const allowed = new Set(policy.allowedModels);
  const snapshot = (value: HostModelRoutingPolicy["byAgent"], roles: boolean) => {
    const result = new Map<string, string>();
    if (value === undefined) return result;
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Invalid host model overrides");
    for (const [rawKey, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      const key = roles ? normalizeRole(rawKey) : rawKey;
      if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(key) || result.has(key) ||
          !Object.hasOwn(descriptor, "value") || !validId(descriptor.value) || !allowed.has(descriptor.value)) {
        throw new Error("Invalid or unapproved host model override");
      }
      result.set(key, descriptor.value);
    }
    return result;
  };
  const agents = snapshot(policy.byAgent, false);
  const roles = snapshot(policy.byRole, true);
  return (role: string, agentId?: string): ReturnType<typeof getModel> => {
    const override = (agentId === undefined ? undefined : agents.get(agentId)) ?? roles.get(normalizeRole(role));
    const model = override ? getModel(override) : selectModelForRole(role);
    if (!allowed.has(model.modelId)) throw new Error("Selected model is not in host model allowlist");
    return model;
  };
}
