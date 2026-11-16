import * as fs from "fs";
import * as path from "path";

/**
 * Paths that must never be readable or writable through agent tools.
 *
 * The process environment is the one place where provider credentials live
 * (`.env` at the workspace root). Agent code — including a shell command — is
 * untrusted with respect to those bytes: a mission must be able to work in the
 * workspace without being able to exfiltrate its own API keys.
 *
 * The list is deliberately static and narrow. It is enforced in addition to,
 * not instead of, the workspace-root containment check in `assertSafePath`.
 */
const SENSITIVE_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.backup",
  ".npmrc",
  ".netrc",
  ".git-credentials",
]);

/**
 * Directories under the workspace that agent tools must not read directly.
 *
 * Git metadata is not a secret, but it lets a command rewrite history, install
 * hooks or alter the index, so it is treated as protected configuration rather
 * than as project content.
 */
const SENSITIVE_DIRS = [".git", ".oc-isolated", ".awe-data", ".r0-work", "backups", "research"];

export interface SensitivePathOptions {
  /** Absolute workspace root. Relative checks are performed against it. */
  workspaceRoot: string;
}

function isWithin(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(parent + path.sep);
}

/**
 * Return a human-readable reason when `absolute` must not be accessed by an
 * agent tool, or `null` when access is allowed.
 *
 * Symlinks are resolved through the deepest existing ancestor so that a link
 * cannot be used to reach a blocked path.
 */
export function sensitivePathReason(absolute: string, options: SensitivePathOptions): string | null {
  const { workspaceRoot } = options;
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(absolute);

  let probe = resolved;
  while (!fs.existsSync(probe) && probe !== path.dirname(probe)) probe = path.dirname(probe);
  let real = probe;
  try {
    real = fs.realpathSync.native(probe);
  } catch {
    // A path we cannot resolve is judged from its lexical form.
  }

  for (const candidate of new Set([resolved, real])) {
    const base = path.basename(candidate);
    if (base === ".env" || /^\.env\.[A-Za-z0-9._-]+$/.test(base)) return "environment file";
    if (!isWithin(resolvedRoot, candidate)) continue;
    const first = path.relative(resolvedRoot, candidate).split(path.sep)[0];
    if (SENSITIVE_DIRS.includes(first)) {
      if (first === "research") return "restricted research material";
      if (first === ".awe-data") return "mission state directory";
      return `protected directory '${first}'`;
    }
    if (SENSITIVE_BASENAMES.has(base)) return "credential file";
  }
  return null;
}
