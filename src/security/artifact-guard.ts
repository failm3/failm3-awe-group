import * as path from "node:path";

/**
 * A registered artifact's backing file is evidence: its path and hash are what
 * QA reviewed. Deleting that file leaves a record pointing at nothing, and the
 * terminal integrity gate then fails the mission for a file the agent treated
 * as scratch (run 1794828929614: `probe/repair/tool-probe-before.txt` was
 * reconciled into the registry at 12:02:00 and removed seconds later).
 *
 * This guard refuses the deletion up front instead. It is advisory in the sense
 * that it matches command text, so an interpreter invocation can still delete a
 * file; the terminal gate stays the authority. Its job is to stop the ordinary
 * mistake early, with a message that says what to do instead.
 */
const DELETERS = new Set(["rm", "rmdir", "unlink", "shred", "truncate", "mv"]);

const within = (root: string, candidate: string) => candidate === root || candidate.startsWith(root + path.sep);

/** Split a command line into words, honouring simple single and double quotes. */
function words(segment: string): string[] {
  const found = segment.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
  return found.map((word) => word.replace(/^(['"])(.*)\1$/s, "$2"));
}

/**
 * Resolve the paths a command would remove, in command order, tracking `cd` so
 * a later segment is judged against the directory the shell will actually use.
 */
function deletionTargets(command: string, workdir: string): string[] {
  const targets: string[] = [];
  let current = path.resolve(workdir);
  for (const segment of command.split(/[;&|\n]+/)) {
    const tokens = words(segment.replace(/^\s*(?:sudo\s+|env\s+\S+\s+)*/, ""));
    if (tokens.length === 0) continue;
    const verb = path.basename(tokens[0]);
    if (verb === "cd") {
      const next = tokens.slice(1).find((token) => !token.startsWith("-"));
      if (next) current = path.resolve(current, next);
      continue;
    }
    if (!DELETERS.has(verb)) continue;
    // `mv` only breaks evidence at its source operands; the destination is new.
    const operands = tokens.slice(1).filter((token) => !token.startsWith("-") && token !== "--");
    const sources = verb === "mv" && operands.length > 1 ? operands.slice(0, -1) : operands;
    for (const source of sources) targets.push(path.resolve(current, source));
  }
  return targets;
}

/**
 * Return the registered artifact paths a shell command would delete, including
 * a directory whose removal takes a registered artifact with it. An empty array
 * means the command leaves every registered byte in place.
 */
export function deletedRegisteredArtifacts(
  command: string,
  workdir: string,
  registered: ReadonlyArray<{ name: string; path?: string }>
): string[] {
  const removed = deletionTargets(command, workdir);
  if (removed.length === 0) return [];
  const hits: string[] = [];
  for (const artifact of registered) {
    if (!artifact.path) continue;
    const pinned = path.resolve(artifact.path);
    if (removed.some((target) => within(target, pinned))) hits.push(artifact.name);
  }
  return hits;
}
