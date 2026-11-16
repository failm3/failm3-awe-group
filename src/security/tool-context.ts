import { AsyncLocalStorage } from "node:async_hooks";

export interface ToolContext {
  missionId: string;
  role?: string;
  allowedTools: ReadonlySet<string>;
  /** Explicit filesystem grant provisioned by the trusted specialist runner. */
  workspaceRoot?: string;
  signal?: AbortSignal;
  /** Current mission-owner fence; stale attempts must not execute tools. */
  fence?: () => boolean;
  invokedTools?: Set<string>;
  /** Artifact ids actually saved inside this specialist's async context. */
  artifactIds?: Set<string>;
  /** Synchronously persist durable intent before a model/tool effect begins. */
  beginEffect?: (label?: string) => void;
  /** Host-only synchronous qualification + local effect fence. */
  withEffect?: <T>(effect: () => T extends PromiseLike<unknown> ? never : T, target?: {
    stage: "mission" | "delegation" | "repair" | "effect" | "acceptance";
    role?: string; tools?: readonly string[]; label?: string;
  }) => T;
  /** Trusted per-node model routing inherited by nested specialists. */
  modelRoute?: (role: string, nodeId?: string) => ReturnType<typeof import("../config/models.js").selectModelForRole>;
  /** Trusted host policy inherited by delegate; never supplied by model input. */
  experience?: import("../agents/specialists.js").SpecialistRunOptions["experience"];
  /** Qualified local target gate inherited unchanged by recursive specialists. */
  localCapability?: import("../agents/specialists.js").SpecialistRunOptions["localCapability"];
  /** Host receipts recorded by the actual shell release in this delegation tree. */
  qualifiedAttemptIds?: Map<string, string>;
  /** Trusted host executor inherited by nested specialists; never model input. */
  executeSpecialist?: import("../agents/r0-runtime-compat.js").ExecuteSpecialistFn;
}

const contextStorage = new AsyncLocalStorage<ToolContext>();

export function runWithToolContext<T>(context: ToolContext, callback: () => T): T {
  return contextStorage.run(context, callback);
}

export function getToolContext(): ToolContext | undefined {
  return contextStorage.getStore();
}

export function throwIfAborted(signal = getToolContext()?.signal): void {
  if (signal?.aborted) throw signal.reason ?? new Error("Operation aborted");
}

export function assertToolAllowed(tool: string): ToolContext {
  const context = getToolContext();
  if (!context) throw new Error(`Tool '${tool}' denied: no mission tool context`);
  if (!context.allowedTools.has(tool)) throw new Error(`Tool '${tool}' denied: not granted to mission ${context.missionId}`);
  throwIfAborted(context.signal);
  if (context.fence && !context.fence()) throw new Error(`Tool '${tool}' denied: mission ownership lost for ${context.missionId}`);
  // This synchronous durable marker precedes every actual tool boundary. If it
  // cannot be persisted, fail closed without invoking the tool; after a crash
  // the surviving marker prevents a blind retry of a possibly completed effect.
  const intent = () => context.beginEffect?.(`tool:${tool}`);
  if (context.withEffect) context.withEffect(intent, { stage: "effect", role: context.role, tools: [tool], label: "tool intent" });
  else intent();
  throwIfAborted(context.signal);
  context.invokedTools?.add(tool);
  return context;
}
