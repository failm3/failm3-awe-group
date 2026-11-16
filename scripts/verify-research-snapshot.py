#!/usr/bin/env python3
"""Verify an assembled AWE research snapshot; never execute mission artifacts.

Usage:
  python3 scripts/verify-research-snapshot.py /path/to/awe-group
  python3 scripts/verify-research-snapshot.py --write-manifest /path/to/awe-group

Verification checks the release manifest, the 90-entry historical evidence
manifest, and forbidden release paths. --write-manifest deliberately updates
only RELEASE-MANIFEST.sha256; run it after all other release edits, then verify.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def files(root: Path) -> dict[str, Path]:
    result = {}
    for base, dirs, names in os.walk(root):
        dirs.sort()
        for name in sorted(names):
            path = Path(base) / name
            if path.is_file() and not path.is_symlink():
                result[path.relative_to(root).as_posix()] = path
    return result


def check_manifest(root: Path, relative: str, present: dict[str, Path]) -> dict[str, object]:
    missing, mismatch = [], []
    entries = 0
    for line in (root / relative).read_text(encoding="utf-8").splitlines():
        expected, name = line.split("  ", 1)
        entries += 1
        path = present.get(name)
        if path is None:
            missing.append(name)
        elif sha256(path) != expected:
            mismatch.append(name)
    return {"entries": entries, "missing": missing, "hash_mismatch": mismatch}


def verify(root: Path) -> dict[str, object]:
    present = files(root)
    release = check_manifest(root, "RELEASE-MANIFEST.sha256", present)
    listed = {
        line.split("  ", 1)[1]
        for line in (root / "RELEASE-MANIFEST.sha256").read_text(encoding="utf-8").splitlines()
    }
    extras = sorted(set(present) - listed - {"RELEASE-MANIFEST.sha256"})
    historical = check_manifest(root, "reports/r2-final-evidence.sha256", present)
    forbidden = []
    symlinks = sorted(
        path.relative_to(root).as_posix()
        for path in root.rglob("*") if path.is_symlink()
    )
    for relative, path in present.items():
        parts = Path(relative).parts
        name = path.name
        if any(part in {"node_modules", ".oc-isolated", ".git", "CHAT-LOGS", "PROMPTS", "UPLOADS"} for part in parts):
            forbidden.append(relative)
        if name == ".env" or name.startswith(".env.") or name.endswith((".db", "-wal", "-shm", ".zip", ".tgz", ".tar", ".tar.gz")):
            forbidden.append(relative)
    passed = not any([
        release["missing"], release["hash_mismatch"], extras,
        historical["missing"], historical["hash_mismatch"], forbidden, symlinks,
    ]) and historical["entries"] == 90
    return {
        "schema": "awe.research-snapshot-verification.v1",
        "passed": passed,
        "files_including_release_manifest": len(present),
        "release": release,
        "unmanifested_files": extras,
        "historical_evidence": historical,
        "forbidden_paths": sorted(set(forbidden)),
        "symlinks": symlinks,
    }


def write_manifest(root: Path) -> int:
    entries = []
    for relative, path in files(root).items():
        if relative != "RELEASE-MANIFEST.sha256":
            entries.append(f"{sha256(path)}  {relative}\n")
    (root / "RELEASE-MANIFEST.sha256").write_text("".join(entries), encoding="utf-8")
    return len(entries)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--write-manifest", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / "reports/r2-final-evidence.sha256").is_file():
        parser.error("not an AWE research snapshot")
    if args.write_manifest:
        print(json.dumps({"manifest_entries": write_manifest(root)}, indent=2))
        return 0
    result = verify(root)
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
