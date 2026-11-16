import { missionArtifactDir } from "./utils/storage.js";

const SOURCE_MISSION_ID = "25be2dad-039c-4cb2-8667-d4184df47363";
export const SOURCE_DIR = missionArtifactDir(SOURCE_MISSION_ID);

/**
 * The former standalone specialist runner was removed: it bypassed the
 * mission lease, descendant settlement, artifact verification and independent
 * QA. Historical repair work must be represented as an ordinary explicitly
 * approved mission and executed through MissionManager.
 */
export async function runTargetedRepair(): Promise<never> {
  throw new Error("Standalone targeted repair is disabled; create and explicitly approve a MissionManager mission");
}
