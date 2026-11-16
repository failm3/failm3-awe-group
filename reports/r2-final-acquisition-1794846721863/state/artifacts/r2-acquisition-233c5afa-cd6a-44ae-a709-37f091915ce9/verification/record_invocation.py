#!/usr/bin/env python3
"""Invocation receipt recorder for the qualified observation-digest-v1 procedure.

Runs the pinned procedure with its exact fixed args and records at execution time:
runtime identity, executable sha256 before and after, exact argv, a recomputable
command_sha256 (preimage stated), exit code, stdout/stderr, and the sha256 of the
output files captured immediately after the child exits.
The procedure is never modified. Nothing writes digest.json/digest.md except the procedure.

usage: record_invocation.py <attempt-id>
"""
import hashlib, json, os, subprocess, sys
from datetime import datetime, timezone

ROOT = "/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794846721863/state/artifacts/r2-acquisition-233c5afa-cd6a-44ae-a709-37f091915ce9"
MISSION_ID = "r2-acquisition-233c5afa-cd6a-44ae-a709-37f091915ce9"
ORIGINAL_ATTEMPT = "7dd43f3f-7dda-4201-87ca-74ff0d5eda72"
ORIGINAL_CLAIMED_COMMAND_SHA = "b78d6c60bd27d12679364d77630da41d9c2751b3600ef6f4bd6ddc90a443cab9"

if len(sys.argv) != 2:
    sys.exit("usage: record_invocation.py <attempt-id>")
ATTEMPT = sys.argv[1]

PROC = ROOT + "/procedures/observation-digest-v1.js"
FIXTURE = ROOT + "/input/pilot.observations.json"
ARGS = [FIXTURE, ROOT]
OUTPUT_NAMES = ["digest.json", "digest.md"]

def sha_path(p):
    try:
        with open(p, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except FileNotFoundError:
        return None

def snap():
    out = {}
    for n in OUTPUT_NAMES:
        p = ROOT + "/" + n
        out[n] = {"path": p, "bytes": os.path.getsize(p) if os.path.exists(p) else None, "sha256": sha_path(p)}
    return out

proc_before = sha_path(PROC)
proc_bytes = os.path.getsize(PROC)
runtime_bin = subprocess.run(["which", "node"], capture_output=True, text=True).stdout.strip()
runtime_ver = subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip()
runtime_sha = sha_path(runtime_bin)
pre = snap()

argv = ["node", "--", PROC, ARGS[0], ARGS[1]]
preimage = json.dumps(argv, separators=(",", ":"))
command_sha = hashlib.sha256(preimage.encode("utf-8")).hexdigest()

t0 = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
r = subprocess.run(argv, capture_output=True, text=True, cwd=ROOT)
t1 = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
post = snap()
proc_after = sha_path(PROC)

receipt = {
    "receipt_version": "invocation-receipt/1",
    "mission_id": MISSION_ID,
    "attempt_id": ATTEMPT,
    "refers_to_original_attempt": ORIGINAL_ATTEMPT,
    "relationship": ("Repair-iteration re-invocation of the same qualified bytes with the same fixed args. "
                     "This is NOT the original attempt; the original run left no receipt."),
    "capability": "observation-digest-v1",
    "invoked_at": t0,
    "completed_at": t1,
    "command_argv": argv,
    "command_sha256": command_sha,
    "command_sha256_preimage": preimage,
    "command_sha256_preimage_encoding": "UTF-8 JSON array of command_argv, separators ',' and ':', no trailing newline",
    "cwd": ROOT,
    "exit_code": r.returncode,
    "stdout": r.stdout,
    "stderr": r.stderr,
    "runtime": {"binary": runtime_bin, "version": runtime_ver, "sha256": runtime_sha},
    "executable": {"path": PROC, "bytes": proc_bytes, "sha256_before_run": proc_before,
                   "sha256_after_run": proc_after, "unchanged": proc_before == proc_after},
    "args": ARGS,
    "args_match_specification": ARGS == [FIXTURE, ROOT],
    "pre_run_outputs": pre,
    "outputs_after_run": post,
    "outputs_byte_identical_to_pre_run": all(pre[n]["sha256"] == post[n]["sha256"] for n in OUTPUT_NAMES),
    "original_claim_not_reproduced": {
        "original_command_sha256_claim": ORIGINAL_CLAIMED_COMMAND_SHA,
        "status": "unverified",
        "detail": ("This value appears only in earlier narrative. No canonical encoding of the qualified argv "
                   "that was tried (JSON array, space/NUL-joined, JSON objects, with or without '--', absolute "
                   "or relative paths, with the executable sha mixed in) reproduces it, and the original "
                   "preimage was not recorded. It is carried here as a claim, not as a verified value. The "
                   "host should compare it with its own record of attempt " + ORIGINAL_ATTEMPT + "."),
    },
}

path = ROOT + "/invocation-receipt.json"
with open(path, "w", encoding="utf-8") as f:
    json.dump(receipt, f, indent=2)
    f.write("\n")
print(json.dumps({k: receipt[k] for k in ("attempt_id", "exit_code", "command_sha256", "args_match_specification",
      "outputs_byte_identical_to_pre_run")}, indent=2))
print("exe unchanged:", receipt["executable"]["unchanged"], receipt["executable"]["sha256_after_run"])
print({n: post[n]["sha256"] for n in OUTPUT_NAMES})
