import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

const directoryFlags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const proc = (fd: number, name = "") => `/proc/self/fd/${fd}${name ? `/${name}` : ""}`;

/** Linux descriptor-relative traversal. Every component is opened NOFOLLOW;
 * later replacements cannot redirect an already-open directory descriptor.
 * Node lacks openat2; /proc/self/fd provides openat-style relative access.
 * No async user callback occurs while a descriptor is held. Grants identify
 * host-controlled workspace objects: a trusted host must not relocate their
 * directories across grants while effects run. A pinned fd does not freeze
 * ancestry against an actor with unrestricted host rename permission.
 */
function withDirectory<T>(directory: string, create: boolean, effect: (fd: number) => T): T {
  if (process.platform !== "linux") throw new Error("Descriptor-relative file tools require Linux");
  let fd = fs.openSync("/", directoryFlags);
  try {
    for (const component of path.resolve(directory).split(path.sep).filter(Boolean)) {
      const next = proc(fd, component);
      if (create) {
        try { fs.mkdirSync(next); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
      const opened = fs.openSync(next, directoryFlags);
      fs.closeSync(fd);
      fd = opened;
    }
    return effect(fd);
  } finally { fs.closeSync(fd); }
}

export function readWorkspaceFile(file: string, check: (file: string) => string, maxBytes = 2_000_000): string {
  check(file);
  return withDirectory(path.dirname(file), false, (parent) => {
    const fd = fs.openSync(proc(parent, path.basename(file)), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      check(fs.realpathSync(proc(fd)));
      const before = fs.fstatSync(fd, { bigint: true });
      if (!before.isFile() || before.nlink !== 1n) throw new Error("Read requires a single-link regular file");
      if (before.size > BigInt(maxBytes)) throw new Error("File read byte limit exceeded");
      const bytes = Buffer.alloc(Number(before.size));
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!count) throw new Error("File changed during read");
        offset += count;
      }
      const after = fs.fstatSync(fd, { bigint: true });
      if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("File changed during read");
      return bytes.toString("utf8");
    } finally { fs.closeSync(fd); }
  });
}

export function writeWorkspaceFile(file: string, content: string, check: (file: string) => string): void {
  check(file);
  if (Buffer.byteLength(content) > 2_000_000) throw new Error("File write byte limit exceeded");
  withDirectory(path.dirname(file), true, (parent) => {
    const name = path.basename(file);
    check(path.join(fs.realpathSync(proc(parent)), name));
    const target = proc(parent, name);
    try {
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Write target must be a single-link regular file");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const temp = proc(parent, `.awe-write-${randomUUID()}`);
    const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try {
      fs.writeFileSync(fd, content, "utf8");
      fs.fsyncSync(fd);
      fs.renameSync(temp, target);
      fs.fsyncSync(parent);
    } finally {
      fs.closeSync(fd);
      try { fs.unlinkSync(temp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  });
}

export function listWorkspaceFiles(directory: string, recursive: boolean, check: (file: string) => string, active: () => void) {
  check(directory);
  return withDirectory(directory, false, (fd) => {
    const names: string[] = [];
    const entries: Array<{ name: string; type: string }> = [];
    let visited = 0;
    function walk(parent: number, lexical: string, depth: number) {
      active();
      check(fs.realpathSync(proc(parent)));
      const stream = fs.opendirSync(proc(parent), { bufferSize: 1 });
      try {
      while (visited < 2000 && names.length < 200 && entries.length < 200) {
        active();
        const entry = stream.readSync();
        if (!entry) break;
        visited++;
        if (entry.isSymbolicLink()) continue;
        const file = path.join(lexical, entry.name);
        try { check(file); } catch { continue; }
        if (!recursive) { entries.push({ name: entry.name, type: entry.isDirectory() ? "dir" : "file" }); continue; }
        if (entry.isDirectory() && depth < 32) {
          let child: number;
          try { child = fs.openSync(proc(parent, entry.name), directoryFlags); } catch { continue; }
          try { walk(child, file, depth + 1); } finally { fs.closeSync(child); }
        } else if (entry.isFile()) names.push(file);
      }
      } finally { stream.closeSync(); }
    }
    walk(fd, directory, 0);
    return recursive ? names : entries;
  });
}
