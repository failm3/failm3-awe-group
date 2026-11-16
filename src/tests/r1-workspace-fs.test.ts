import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { readWorkspaceFile, writeWorkspaceFile, listWorkspaceFiles } from "../security/workspace-fs.js";

test("descriptor file operations deny parent replacement, final links and hardlink aliases", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".r1-fd-"));
  try {
    const work = path.join(root, "work"); const host = path.join(root, "host");
    fs.mkdirSync(work); fs.mkdirSync(host);
    const secret = path.join(host, "secret"); fs.writeFileSync(secret, "synthetic host bytes");
    const check = (file: string) => { assert.ok(file === work || file.startsWith(work + path.sep)); return file; };
    const output = path.join(work, "nested", "output");
    writeWorkspaceFile(output, "verified", check);
    assert.equal(readWorkspaceFile(output, check), "verified");
    assert.deepEqual(listWorkspaceFiles(work, true, check, () => {}), [output]);
    for (const link of ["symlink", "hardlink"]) {
      const alias = path.join(work, link);
      if (link === "symlink") fs.symlinkSync(secret, alias); else fs.linkSync(secret, alias);
      assert.throws(() => readWorkspaceFile(alias, check));
      assert.throws(() => writeWorkspaceFile(alias, "forbidden", check));
    }
    const nested = path.join(work, "nested");
    let swapped = false;
    const swap = (file: string) => {
      check(file);
      if (!swapped) { swapped = true; fs.renameSync(nested, `${nested}-original`); fs.symlinkSync(host, nested); }
      return file;
    };
    assert.throws(() => writeWorkspaceFile(path.join(nested, "secret"), "forbidden", swap));
    assert.equal(fs.readFileSync(secret, "utf8"), "synthetic host bytes");
    assert.throws(() => readWorkspaceFile(path.join(nested, "secret"), check));
    assert.throws(() => listWorkspaceFiles(nested, true, check, () => {}));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("file reads are bounded and reject special files; list checks cancellation", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".r1-fd-bounds-"));
  try {
    const file = path.join(root, "bytes"); fs.writeFileSync(file, "12345");
    assert.throws(() => readWorkspaceFile(file, x => x, 4), /limit/);
    assert.throws(() => readWorkspaceFile(root, x => x), /regular/);
    assert.throws(() => listWorkspaceFiles(root, true, x => x, () => { throw Error("cancelled"); }), /cancelled/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
