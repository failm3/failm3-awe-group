import * as express from "express";
import * as cors from "cors";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import {
  saveMission,
  loadMission,
  listMissions,
  updateMissionAtomic,
  DATA_DIR,
  listArtifacts,
  appendLog,
  isTerminalStatus,
  isSafeMissionId,
} from "../utils/storage.js";
import { createSpecification } from "../agents/prompt-master.js";
import {
  createMissionManager,
  getActiveMissionManager,
  cancelMission,
  resolveAmbiguousDelegation,
  MissionStateError,
} from "../agents/mission-manager.js";
import type { AmbiguousResolution, MissionManagerOptions } from "../agents/mission-manager.js";
import {
  tryAcquireMissionLease,
  readMissionLease,
  MissionLeaseError,
} from "../agents/lifecycle.js";
import type { MissionLease } from "../agents/lifecycle.js";
import type { Mission, Specification } from "../types/index.js";
import * as crypto from "crypto";
import { APPROVED_SPEC_BINDING_KEY, createApprovedSpecBinding, SpecBindingError } from "../utils/spec-binding.js";
import { resolveConfiguredMissionAdmission } from "../config/mission-policy.js";
import type { MissionAdmissionResolver } from "../config/mission-policy.js";
import { resolveConfiguredMissionExperience } from "../config/experience-policy.js";
import type { MissionExperienceResolver } from "../config/experience-policy.js";

interface ExecutionAttempt {
  ownerId: string;
  generation: number;
}

type ManagedRunner = { run: () => Promise<unknown> };

/** Local/injected doubles are supported without opening the shipped security defaults. */
export interface ApiServerDependencies {
  createSpecification?: (request: string) => Promise<Specification>;
  createMissionManager?: (
    mission: Mission,
    timeoutMs?: number,
    options?: MissionManagerOptions
  ) => ManagedRunner;
  resolveAmbiguousDelegation?: (
    missionId: string,
    resolution: AmbiguousResolution
  ) => { remaining: number; mission: Mission };
  /** Resolved in the host only; request bodies cannot supply policy functions. */
  resolveMissionAdmission?: MissionAdmissionResolver;
  resolveMissionExperience?: MissionExperienceResolver;
}

export interface ApiServerOptions {
  /** Defaults to 127.0.0.1. AWE_API_HOST is an explicit configuration alternative. */
  host?: string;
  /** A secret is mandatory; omitted values come from AWE_API_SECRET. */
  apiSecret?: string;
  /** No CORS headers are emitted unless an explicit, non-wildcard allowlist is supplied. */
  corsOrigins?: string[];
  dependencies?: ApiServerDependencies;
}

class HttpInputError extends Error {}

function executionOwner(mission: Mission): { owner_id?: unknown; generation?: unknown } | undefined {
  return mission.metadata?.execution_owner as { owner_id?: unknown; generation?: unknown } | undefined;
}

function isAttemptOwner(mission: Mission, attempt: ExecutionAttempt): boolean {
  const owner = executionOwner(mission);
  return owner?.owner_id === attempt.ownerId && owner?.generation === attempt.generation;
}

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  if (net.isIPv4(host)) {
    const first = Number(host.split(".")[0]);
    return first === 127;
  }
  return false;
}

function positiveTimeout(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new HttpInputError("timeout_ms must be a positive number");
  }
  return value;
}

export function createApiServer(port = 3420, options: ApiServerOptions = {}) {
  const configuredHost = options.host ?? process.env.AWE_API_HOST;
  const host = configuredHost?.trim() || "127.0.0.1";
  const API_SECRET = options.apiSecret ?? process.env.AWE_API_SECRET;
  if (!API_SECRET) {
    if (!isLoopbackHost(host)) {
      throw new Error(`AWE_API_SECRET is required for non-loopback listener '${host}'`);
    }
    throw new Error("AWE_API_SECRET is required; refusing to expose open mission APIs");
  }
  const configuredOrigins = options.corsOrigins ?? (
    process.env.AWE_API_CORS_ORIGINS
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
  if (configuredOrigins.includes("*")) {
    throw new Error("Wildcard CORS is not supported; configure an explicit origin allowlist");
  }

  const deps = options.dependencies ?? {};
  const specify = deps.createSpecification ?? createSpecification;
  const makeManager = deps.createMissionManager ?? createMissionManager;
  const resolveRecovery = deps.resolveAmbiguousDelegation ?? resolveAmbiguousDelegation;

  const app = express.default();
  app.disable("x-powered-by");
  if (configuredOrigins.length > 0) {
    const allowed = new Set(configuredOrigins);
    app.use(cors.default({
      origin(origin, callback) {
        // Same-origin/non-browser requests have no Origin header. Browser origins
        // are echoed only when exactly present in the configured allowlist.
        callback(null, !origin || allowed.has(origin));
      },
      credentials: false,
    }));
  }

  function requireAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const provided = (req.headers["x-api-key"] as string | undefined) ?? bearer;
    const expectedBytes = Buffer.from(API_SECRET!);
    const providedBytes = Buffer.from(provided ?? "");
    const authenticated = expectedBytes.length === providedBytes.length &&
      crypto.timingSafeEqual(expectedBytes, providedBytes);
    if (!authenticated) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  }

  // Never put credentials in query strings or logs. Redact configured/provider
  // credentials before an internal error is included in a response or log entry.
  function safeErrorMessage(err: unknown): string {
    let msg = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    const credentials = new Set<string>([
      API_SECRET,
      process.env.AWE_API_SECRET,
      process.env.ROUTER_CHEAP_API_KEY,
      process.env.OPENAI_API_KEY,
      process.env.TAVILY_API_KEY,
    ].filter((value): value is string => typeof value === "string" && value.length > 0));
    for (const credential of credentials) msg = msg.split(credential).join("[REDACTED]");
    return msg
      .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
      .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[REDACTED]");
  }

  function recordExecutionFailure(id: string, attempt: ExecutionAttempt, err: unknown): void {
    if (err instanceof MissionLeaseError || err instanceof MissionStateError) return;
    // Rejection is not proof of operation/descendant settlement. The real
    // manager owns failure terminalization and lease release; this fallback is
    // observability only and must never synthesize a terminal mission.
    const current = loadMission(id);
    if (current && !isTerminalStatus(current.status) && isAttemptOwner(current, attempt)) {
      appendLog(id, `Mission execution rejected; settlement is owned by the mission manager: ${safeErrorMessage(err)}`);
    }
  }

  async function startManagedMission(
    mission: Mission,
    lease: MissionLease,
    timeout: number | undefined,
    allowedStatuses: NonNullable<MissionManagerOptions["allowedStatuses"]>
  ): Promise<void> {
    const attempt: ExecutionAttempt = { ownerId: lease.ownerId, generation: lease.generation };
    try {
      const admission = await resolveConfiguredMissionAdmission(mission, deps.resolveMissionAdmission);
      const experience = await resolveConfiguredMissionExperience(mission, deps.resolveMissionExperience);
      // The manager takes over this exact approved/running owner generation.
      const manager = makeManager(mission, timeout, { lease, allowedStatuses, admission, experience });
      // Defer invocation so even a synchronous run() throw follows the same
      // nonterminal rejection path; the route must not release a live owner.
      const running = Promise.resolve().then(() => manager.run());
      void running.catch((err) => recordExecutionFailure(mission.id, attempt, err));
    } catch (err) {
      recordExecutionFailure(mission.id, attempt, err);
      lease.release();
      throw err;
    }
  }

  function recoveryHandler(decision: "accept" | "retry") {
    return (req: express.Request, res: express.Response): void => {
      const id = req.params.id as string;
      try {
        const body = req.body ?? {};
        const resolution: AmbiguousResolution = {
          intent_id: typeof body.intent_id === "string" ? body.intent_id.trim() : "",
          decision,
          operator: typeof body.operator === "string" ? body.operator.trim() : "",
          note: typeof body.note === "string" ? body.note.trim() : "",
          artifacts: body.artifacts,
        };
        if (!resolution.intent_id || !resolution.operator || !resolution.note) {
          throw new HttpInputError("intent_id, operator and note are required non-empty strings");
        }
        if (
          resolution.artifacts !== undefined &&
          (!Array.isArray(resolution.artifacts) || !resolution.artifacts.every((id) => typeof id === "string"))
        ) {
          throw new HttpInputError("artifacts must be an array of registered artifact ids");
        }
        // The real resolver owns all leases, checkpoint verification, artifact
        // integrity checks and metadata changes. This route never edits JSON.
        const result = resolveRecovery(id, resolution);
        res.json({
          mission_id: id,
          intent_id: resolution.intent_id,
          decision,
          remaining: result.remaining,
          mission: result.mission,
        });
      } catch (err) {
        if (err instanceof HttpInputError) {
          res.status(400).json({ error: safeErrorMessage(err) });
        } else if (err instanceof MissionStateError || err instanceof MissionLeaseError) {
          res.status(409).json({ error: safeErrorMessage(err) });
        } else {
          res.status(500).json({ error: safeErrorMessage(err) });
        }
      }
    };
  }

  // Health reveals no mission, lease, artifact, credential or log information.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "awe-group" });
  });

  // Every sensitive read and mutation below this boundary requires the key,
  // including loopback deployments. JSON errors cannot bypass authentication.
  app.use(requireAuth);
  app.use(express.default.json({ limit: "10mb" }));

  app.get("/missions", (_req, res) => {
    res.json(listMissions());
  });

  app.get("/missions/:id", (req, res) => {
    const mission = loadMission(req.params.id as string);
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    res.json(mission);
  });

  app.get("/missions/:id/artifacts", (req, res) => {
    res.json(listArtifacts(req.params.id as string));
  });

  app.get("/missions/:id/logs", (req, res) => {
    const id = req.params.id as string;
    if (!isSafeMissionId(id)) return res.status(400).json({ error: "Invalid mission log id" });
    if (!loadMission(id)) return res.status(404).json({ error: "Mission not found" });
    try {
      const logFile = path.join(DATA_DIR, `${id}.log`);
      if (!fs.existsSync(logFile)) return res.json({ logs: [] });
      const logs = fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean);
      res.json({ logs });
    } catch {
      res.status(400).json({ error: "Invalid mission log id" });
    }
  });

  app.post("/specify", async (req, res) => {
    try {
      const { request } = req.body as { request?: string };
      if (!request || typeof request !== "string") {
        return res.status(400).json({ error: "request field required (string)" });
      }
      if (request.length > 10000) {
        return res.status(400).json({ error: "request too long (max 10000 chars)" });
      }

      const spec = await specify(request);
      const mission: Mission = {
        id: crypto.randomUUID(),
        title: spec.title,
        description: request,
        objective: spec.objective,
        acceptance_criteria: spec.acceptance_criteria,
        status: "pending_approval",
        priority: "normal",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        artifacts: [],
        metadata: { specification: spec },
      };
      saveMission(mission);
      appendLog(mission.id, `Mission created from request (${request.length} chars)`);
      res.json({ mission_id: mission.id, specification: spec, mission });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err) });
    }
  });

  app.post("/missions/:id/approve", async (req, res) => {
    const id = req.params.id as string;
    let lease: MissionLease | null = null;
    try {
      const mission = loadMission(id);
      if (!mission) return res.status(404).json({ error: "Mission not found" });
      const timeout = positiveTimeout(req.body?.timeout_ms);
      lease = tryAcquireMissionLease(id, "approve");
      if (!lease) {
        const holder = readMissionLease(id);
        return res.status(409).json({
          error: "Mission is already running",
          owner: holder ? { pid: holder.pid, purpose: holder.purpose } : undefined,
        });
      }

      const claim = updateMissionAtomic(
        id,
        (cur) => {
          if (cur.status !== "pending_approval") return null;
          const binding = createApprovedSpecBinding(cur);
          if (binding.spec_hash !== createApprovedSpecBinding(mission).spec_hash) {
            throw new SpecBindingError(id, "changed during approval; reload and approve again");
          }
          return { status: "approved", metadata: { ...cur.metadata, [APPROVED_SPEC_BINDING_KEY]: binding } };
        },
        { fence: () => lease!.isHeld() }
      );
      if (!claim.applied) {
        lease.release();
        lease = null;
        const status = claim.mission?.status ?? "unknown";
        return res.status(status === "unknown" ? 404 : 409).json({
          error: `Mission is '${status}', expected 'pending_approval'`,
        });
      }

      await startManagedMission(claim.mission!, lease, timeout, ["approved"]);
      lease = null; // manager owns it, including on a later asynchronous rejection
      appendLog(id, "Mission approved via API");
      res.json({ mission_id: id, status: "approved", message: "Execution started" });
    } catch (err) {
      lease?.release();
      res.status(err instanceof SpecBindingError ? 409 : err instanceof HttpInputError ? 400 : 500).json({ error: safeErrorMessage(err) });
    }
  });

  app.post("/missions/:id/resume", async (req, res) => {
    const id = req.params.id as string;
    let lease: MissionLease | null = null;
    try {
      const mission = loadMission(id);
      if (!mission) return res.status(404).json({ error: "Mission not found" });
      if (mission.status !== "paused" && mission.status !== "approved") {
        return res.status(409).json({
          error: `Mission is '${mission.status}', expected 'paused' or approved interrupted before running`,
        });
      }
      const timeout = positiveTimeout(req.body?.timeout_ms);
      lease = tryAcquireMissionLease(id, "resume");
      if (!lease) {
        const holder = readMissionLease(id);
        return res.status(409).json({
          error: "Mission is already running",
          owner: holder ? { pid: holder.pid, purpose: holder.purpose } : undefined,
        });
      }
      // Revalidate after ownership acquisition; never reopen terminal or pending records.
      const current = loadMission(id);
      if (!current || (current.status !== "paused" && current.status !== "approved")) {
        lease.release();
        lease = null;
        return res.status(409).json({ error: "Mission changed before resume" });
      }
      await startManagedMission(current, lease, timeout, ["paused", "approved"]);
      lease = null;
      appendLog(id, "Mission resumed via API with strict unresolved-intent recovery");
      res.status(202).json({ mission_id: id, status: "resuming", message: "Execution resumed" });
    } catch (err) {
      lease?.release();
      res.status(err instanceof HttpInputError ? 400 : 500).json({ error: safeErrorMessage(err) });
    }
  });

  app.post("/missions/:id/recovery/accept", recoveryHandler("accept"));
  app.post("/missions/:id/recovery/retry", recoveryHandler("retry"));

  app.post("/missions/:id/cancel", async (req, res) => {
    const id = req.params.id as string;
    try {
      const mission = loadMission(id);
      if (!mission) return res.status(404).json({ error: "Mission not found" });
      if (isTerminalStatus(mission.status)) {
        const result = await cancelMission(id, "terminal quiescence verification via API");
        if (mission.status === "cancelled") {
          return res.status(result.quiesced ? 200 : 409).json({
            mission_id: id,
            status: "cancelled",
            already_cancelled: true,
            quiesced: result.quiesced,
            pending_operations: result.pending_operations,
            error: result.error,
          });
        }
        return res.status(400).json({
          error: result.quiesced ? `Cannot cancel a ${mission.status} mission` : result.error,
          quiesced: result.quiesced,
          pending_operations: result.pending_operations,
        });
      }
      const reason =
        typeof req.body?.reason === "string" && req.body.reason.trim()
          ? req.body.reason.trim().slice(0, 500)
          : "cancelled via API";

      const manager = getActiveMissionManager(id);
      const result = manager ? await manager.cancel(reason) : await cancelMission(id, reason);
      if (result.cancelled) {
        appendLog(id, "Mission cancelled via API");
        return res.json({
          mission_id: id,
          status: "cancelled",
          quiesced: result.quiesced,
          pending_operations: result.pending_operations,
        });
      }
      if (result.status === "completed" || result.status === "failed") {
        return res.status(409).json({ error: `Mission finished as '${result.status}' before it could be cancelled`, status: result.status });
      }
      return res.status(202).json({
        mission_id: id,
        status: "cancelling",
        message: "Cancellation requested; the owner has not confirmed it yet",
        mission_status: result.status,
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err) });
    }
  });

  // All parser failures, malformed input and uncaught route errors cross this
  // terminal boundary; Express defaults must never disclose raw internals.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    const inputError = err instanceof HttpInputError || (err as { type?: unknown })?.type === "entity.parse.failed";
    res.status(inputError ? 400 : 500).json({ error: safeErrorMessage(err) });
  });

  const server = app.listen(port, host, () => {
    const address = server.address();
    const listeningPort = typeof address === "object" && address ? address.port : port;
    const displayHost = host.includes(":") ? `[${host}]` : host;
    console.log(`AWE GROUP API server running on http://${displayHost}:${listeningPort}`);
  });
  return server;
}
