import * as fs from "node:fs";
import * as path from "node:path";
import { sensitivePathReason } from "./paths.js";

export interface ShellSandboxSpec {
  workdir: string;
  gateDir?: string;
  scratchDirs?: string[];
  artifactsDir?: string;
  missionArtifactDir?: string;
  dataDir?: string;
  /** Fixed project runtime exposed read-only, separate from writable mission grants. */
  runtimeRoot?: string;
}

const within = (root: string, file: string) => file === root || file.startsWith(root + path.sep);

/** Build a fresh filesystem, not a read-only view of the host filesystem.
 * Sources are opened by bubblewrap from the host namespace. Mount ordering
 * determines the destination view only. No host home, /run socket or /tmp is
 * inherited. Production release uses a supervisor pipe; no process registry
 * mount is needed. gateDir is retained only for explicitly trusted adapters.
 */
export function shellSandboxArgs(spec: ShellSandboxSpec, workspaceRoot: string): string[] {
  const root = fs.realpathSync(workspaceRoot);
  const workdir = fs.realpathSync(spec.workdir);
  const runtime = fs.realpathSync(spec.runtimeRoot ?? root);
  if (!within(runtime, root) && !within(root, runtime)) throw new Error("Shell runtime and workspace overlap");
  if (!within(root, workdir)) throw new Error("Shell cwd escapes granted workspace");
  const args = ["--unshare-net", "--unshare-ipc", "--unshare-uts", "--cap-drop", "ALL"];
  for (const dir of ["/usr", "/bin", "/sbin", "/lib", "/lib64"]) {
    if (fs.existsSync(dir)) args.push("--ro-bind", dir, dir);
  }
  args.push("--dir", "/etc");
  for (const file of ["/etc/ld.so.cache", "/etc/alternatives", "/etc/ssl/certs"]) {
    if (fs.existsSync(file)) args.push("--ro-bind", file, file);
  }
  const chromiumLibs = path.join(runtime, ".chromium-deps", "usr", "lib", "x86_64-linux-gnu");
  args.push("--tmpfs", "/tmp", "--dir", "/tmp/home", "--setenv", "HOME", "/tmp/home",
    "--setenv", "TMPDIR", "/tmp", "--setenv", "PATH", "/usr/bin:/bin",
    "--unsetenv", "LD_LIBRARY_PATH", "--ro-bind", root, root, "--bind", workdir, workdir);
  if (fs.existsSync(chromiumLibs)) args.push("--setenv", "LD_LIBRARY_PATH", chromiumLibs);

  // These are host control/state trees, never executable mission inputs.
  for (const name of [".git", ".oc-isolated", ".awe-data", ".r0-work", "backups", "research"]) {
    const dir = path.join(root, name);
    // The narrowly mounted browser cache below is the sole exception.
    if (name === ".oc-isolated" && fs.existsSync(path.join(dir, "cache", "ms-playwright"))) continue;
    if (!fs.existsSync(dir)) continue;
    // Linked Git worktrees expose .git as a file rather than a directory.
    // Overlay it with the same empty read-only inode used for denied files;
    // --tmpfs would require a directory and make every sandbox launch fail.
    if (fs.lstatSync(dir).isDirectory()) args.push("--tmpfs", dir);
    else args.push("--ro-bind", "/dev/null", dir);
  }
  // The preinstalled browser is an executable capability, not control-plane
  // state. Expose only its immutable cache; the rest of .oc-isolated stays hidden.
  const browserCache = path.join(runtime, ".oc-isolated", "cache", "ms-playwright");
  if (fs.existsSync(browserCache)) {
    const cacheParent = path.join(root, ".oc-isolated", "cache");
    args.push("--dir", path.join(root, ".oc-isolated"), "--dir", cacheParent,
      "--ro-bind", browserCache, browserCache);
  }
  if (runtime !== root) {
    for (const relative of ["scripts/browser-screenshot.cjs", "node_modules", ".chromium-deps"]) {
      const resource = path.join(runtime, relative);
      if (fs.existsSync(resource)) {
        for (let parent = path.dirname(resource); parent !== runtime; parent = path.dirname(parent)) {
          args.push("--dir", parent);
        }
        args.push("--ro-bind", resource, resource);
      }
    }
  }
  if (spec.dataDir && fs.existsSync(spec.dataDir)) args.push("--tmpfs", spec.dataDir);
  if (spec.artifactsDir) args.push("--tmpfs", spec.artifactsDir);
  if (spec.missionArtifactDir && fs.existsSync(spec.missionArtifactDir)) {
    args.push("--bind", spec.missionArtifactDir, spec.missionArtifactDir);
  }

  // Deny dotenv/credential files at any depth, including variants. A readonly
  // /dev/null bind overlays the inode without creating files beside a secret.
  const visit = (dir: string) => {
    if (dir === browserCache || dir.startsWith(browserCache + path.sep)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const denied = [path.join(root, ".oc-isolated"), path.dirname(browserCache), browserCache].includes(file) && fs.existsSync(browserCache)
        ? null : sensitivePathReason(file, { workspaceRoot: root });
      if (denied) {
        args.push(entry.isDirectory() ? "--tmpfs" : "--ro-bind", ...(entry.isDirectory() ? [file] : ["/dev/null", file]));
      } else if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".r0-")) {
        visit(file);
      }
    }
  };
  visit(root);
  if (spec.gateDir) args.push("--ro-bind", spec.gateDir, spec.gateDir);
  return args;
}
