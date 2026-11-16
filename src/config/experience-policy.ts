import { pathToFileURL } from "node:url";
import * as path from "node:path";
import type { Mission } from "../types/index.js";
import type { SpecialistRunOptions } from "../agents/specialists.js";

export type MissionExperience = NonNullable<SpecialistRunOptions["experience"]>;
export type MissionExperienceResolver = (mission: Readonly<Mission>) => MissionExperience | undefined;

/**
 * Resolve verified experience in trusted host composition only. Mission JSON,
 * model output and HTTP requests cannot select records, issuers or callbacks.
 * No configured host policy means no memory injection (the safe default).
 */
export async function resolveConfiguredMissionExperience(
  mission: Readonly<Mission>, resolver?: MissionExperienceResolver,
): Promise<MissionExperience | undefined> {
  const configured = process.env.AWE_MISSION_EXPERIENCE_MODULE;
  if (!resolver && !configured) return undefined;
  if (configured && !path.isAbsolute(configured)) {
    throw new Error("AWE_MISSION_EXPERIENCE_MODULE requires an absolute host-selected module path");
  }
  if (process.env.AWE_OFFLINE_TEST === "1" && configured) {
    throw new Error("Offline fixture cannot load a product experience module");
  }
  let resolved: unknown;
  if (resolver) {
    resolved = resolver(mission);
    if (resolved && typeof (resolved as PromiseLike<unknown>).then === "function") {
      throw new Error("Host experience resolver must return synchronously");
    }
  } else {
    const loaded: unknown = await import(pathToFileURL(path.normalize(configured!)).href);
    const candidate = (loaded as { resolveMissionExperience?: unknown } | null)?.resolveMissionExperience;
    if (typeof candidate !== "function") throw new Error("Host experience module must export resolveMissionExperience(mission)");
    resolved = await candidate(mission);
  }
  if (resolved === undefined) return undefined;
  const value = resolved as Partial<MissionExperience> | null;
  const selection = value?.selection;
  if (!value || !selection || typeof selection.scope !== "string" ||
      typeof selection.capabilityHash !== "string" || typeof selection.profileHash !== "string" ||
      !value.authority || typeof value.authority.admit !== "function" ||
      typeof value.authority.inspect !== "function" || typeof value.authorizeTarget !== "function") {
    throw new Error("Host experience module returned an invalid policy");
  }
  return value as MissionExperience;
}
