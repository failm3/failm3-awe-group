import { pathToFileURL } from "node:url";
import * as path from "node:path";
import type { Mission } from "../types/index.js";
import type { MissionAdmissionPolicy } from "../utils/mission-admission.js";

/** Host composition only. Never resolve this from request/spec/tool input. */
export type MissionAdmissionResolver = (mission: Readonly<Mission>) => MissionAdmissionPolicy | undefined;

/** Explicit local host policy factory. MissionManager still verifies approved
 * spec binding, current generation, role/tool grants and final acceptance.
 * No module means no implicit qualification. Credentials/host callbacks are
 * retained in the host process, not forwarded to specialist/shell environments.
 */
export async function resolveConfiguredMissionAdmission(
  mission: Readonly<Mission>, resolver?: MissionAdmissionResolver,
): Promise<MissionAdmissionPolicy | undefined> {
  const configured = process.env.AWE_MISSION_ADMISSION_MODULE;
  if (!resolver && !configured) return undefined;
  if (configured && !path.isAbsolute(configured)) {
    throw new Error("AWE_MISSION_ADMISSION_MODULE requires an absolute host-selected module path");
  }
  if (process.env.AWE_OFFLINE_TEST === "1" && configured) {
    throw new Error("Offline fixture cannot load a product admission module");
  }
  let resolved: unknown;
  if (resolver) {
    // A dependency injection is still host code, not ambient qualification.
    resolved = resolver(mission);
    if (resolved && typeof (resolved as PromiseLike<unknown>).then === "function") {
      throw new Error("Host admission resolver must return synchronously");
    }
  } else {
    const loaded: unknown = await import(pathToFileURL(path.normalize(configured!)).href);
    const candidate = (loaded as { resolveMissionAdmission?: unknown } | null)?.resolveMissionAdmission;
    if (typeof candidate !== "function") throw new Error("Host admission module must export resolveMissionAdmission(mission)");
    resolved = await candidate(mission);
  }
  if (resolved === undefined) return undefined;
  const policy = resolved as Partial<MissionAdmissionPolicy> | null;
  if (!policy || typeof policy !== "object") throw new Error("Host admission module returned an invalid policy");
  if (policy.mode === "product" && (typeof policy.requirements !== "function" || !policy.authority)) {
    throw new Error("Host admission module returned an incomplete product policy");
  }
  if (policy.mode === "engineering-practice" && (policy.missionId !== mission.id || typeof policy.specHash !== "string")) {
    throw new Error("Host admission module returned an unbound practice policy");
  }
  if (!policy || (policy.mode !== "product" && policy.mode !== "engineering-practice") ||
      typeof policy.authorizeExecution !== "function") throw new Error("Host admission module returned an invalid policy");
  return policy as MissionAdmissionPolicy;
}
