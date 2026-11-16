import * as path from "node:path";
import type { Mission } from "../types/index.js";
import { assertApprovedSpecBinding } from "../utils/spec-binding.js";
import { missionArtifactDir, saveArtifactFile } from "../utils/storage.js";
import { verifyWebProduct } from "../capabilities/web-product.js";

/** The host verifier inspects immutable bytes and browser behavior; solver text
 * and any solver-issued receipt cannot replace this result. */
export async function webEvidenceDefects(
  mission: Mission,
  options: { signal?: AbortSignal; fence?: () => boolean } = {},
): Promise<string[]> {
  if (!mission.metadata.approved_spec_binding) return [];
  const spec = assertApprovedSpecBinding(mission).snapshot.specification;
  if (!spec.web_product) return [];
  if (path.isAbsolute(spec.web_product.directory) || path.normalize(spec.web_product.directory).startsWith(`..${path.sep}`) ||
      path.normalize(spec.web_product.directory) === "..") return ["Approved product directory escapes mission workspace"];
  try {
    options.signal?.throwIfAborted();
    if (options.fence && !options.fence()) throw new Error("Web QA ownership/admission lost");
    // The persistent target is never a temporary QA copy: browser results bind
    // the exact artifact tree that the owner will receive.
    const productRoot = path.join(missionArtifactDir(mission.id), spec.web_product.directory);
    const receipt = await verifyWebProduct({
      workspaceRoot: missionArtifactDir(mission.id), projectDir: productRoot,
    });
    options.signal?.throwIfAborted();
    if (options.fence && !options.fence()) throw new Error("Web QA ownership/admission lost after verification");
    // Evidence is outside the approved product directory: saving it must not
    // alter the candidate tree or invalidate its hash on a repair/retry.
    saveArtifactFile(mission.id, path.join(".independent-qa", "web-verification.json"),
      JSON.stringify(receipt, null, 2), "json", options);
    return receipt.outcome === "PASS" ? [] : [`Independent web product verification ${receipt.outcome}: ${receipt.issues.join("; ")}`];
  } catch (error) { return [`Independent web product verification failed: ${String(error)}`]; }
}
