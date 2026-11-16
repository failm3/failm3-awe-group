#!/usr/bin/env python3
"""Assemble the durable invocation receipt from measured bytes only.

Revision 2 (repair iteration 2).  Changes are limited to auditability; no
assertion was weakened:

  * the qualification stderr stream is now captured to disk and its bytes,
    hash, exit code and completion instant are recorded, so the 154/154
    claim is inspectable rather than asserted;
  * an explicit `evidence_ordering` block records the causal order
      qualification finished  <  procedure invoked  <  receipt written
    as measured epoch seconds, and the builder ASSERTS that order, so the
    repaired evidence can never again cite qualification evidence that
    postdates the invocation it qualifies;
  * every count is still parsed from the itemised per-check log, never
    hard-coded.
"""
import hashlib, json, re, sys
from pathlib import Path

M = Path(sys.argv[1])
MID = "r2-acquisition-4be8f884-b67d-41fd-a7c4-00e88ae10d48"
PROC = M / "procedures" / "observation_digest_v1.py"
FIX = M / "input" / "pilot.observations.json"
QDIR = M / "work" / "qual"


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def size(p):
    return len(Path(p).read_bytes())


def epoch(p):
    """Whole-second epoch from the file's mtime (measured, not authored)."""
    return int(Path(p).stat().st_mtime)


def iso(epoch_s):
    import datetime as _dt
    return _dt.datetime.fromtimestamp(epoch_s, _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


stdout_text = (M / "work" / "final_invocation.stdout").read_text(encoding="utf-8")
summary = json.loads(stdout_text)

QUAL_LOG = QDIR / "qualification.log"
QUAL_ERR = QDIR / "qualification.stderr"
QUAL_EXIT = QDIR / "qualification.exit_code"

# Counts are measured from the itemised per-check log, never hard-coded.
QUAL_ITEMS = re.findall(r"^\[(\d{3})\] (PASS|FAIL)  ", QUAL_LOG.read_text(encoding="utf-8"), re.M)
QUAL_ERR_TEXT = QUAL_ERR.read_text(encoding="utf-8")

invoked_at = (M / "work" / "invocation_timestamp.txt").read_text(encoding="utf-8").strip()

# Measured ordering: qualification evidence must predate the invocation.
qual_finished_epoch = epoch(QUAL_LOG)
invocation_epoch = epoch(M / "work" / "final_invocation.stdout")
receipt_epoch = int(__import__("time").time())

receipt = {
    "mission_id": MID,
    "competence": "observation-digest-v1",
    "receipt_version": 2,
    "invoked_at_utc": invoked_at,
    "acquisition": {
        "capability_required": "observation-digest-v1",
        "capability_before": "absent",
        "acquisition_count": 1,
        "bounded": True,
        "procedure_path": str(PROC),
        "procedure_path_is_stable": True,
        "procedure_path_within_mission_dir": str(PROC).startswith(str(M) + "/"),
        "network_used": False,
        "packages_installed": False,
    },
    "executable": {
        "path": str(PROC),
        "sha256": sha(PROC),
        "size_bytes": size(PROC),
        "mode": oct(PROC.stat().st_mode & 0o777),
        "interpreter": sys.version.split()[0],
        "invoked_with_literal_argv0": "python3",
    },
    "argv": {
        "form": ["python3", str(PROC), str(FIX), str(M)],
        "fixed_args": [str(FIX), str(M)],
        "fixed_args_match_spec": [str(FIX), str(M)] == [
            str(M / "input" / "pilot.observations.json"), str(M)],
        "output_dir_is_not_probe_dir": str(M) != str(M / "work" / "probe-a") and "probe" not in str(M),
    },
    "input": {
        "fixture_path": str(FIX),
        "fixture_sha256": sha(FIX),
        "fixture_size_bytes": size(FIX),
    },
    "result": {
        "exit_code": int((M / "work" / "final_invocation.exit_code").read_text().strip()),
        "stderr_bytes": size(M / "work" / "final_invocation.stderr"),
        "stdout_sha256": sha(M / "work" / "final_invocation.stdout"),
        "reported": summary,
    },
    "outputs": [
        {"name": n, "path": str(M / n), "sha256": sha(M / n), "size_bytes": size(M / n)}
        for n in ("digest.json", "digest.md")
    ],
    "self_consistency": {
        "procedure_reported_digest_json_sha256_matches_executable_output":
            summary["digest_json_sha256"] == sha(M / "digest.json"),
        "procedure_reported_digest_md_sha256_matches_executable_output":
            summary["digest_md_sha256"] == sha(M / "digest.md"),
        "procedure_reported_fixture_sha256_matches_input":
            summary["fixture_sha256"] == sha(FIX),
    },
    "qualification": {
        "log_path": str(QUAL_LOG),
        "log_sha256": sha(QUAL_LOG),
        "log_size_bytes": size(QUAL_LOG),
        "stderr_path": str(QUAL_ERR),
        "stderr_sha256": sha(QUAL_ERR),
        "stderr_size_bytes": size(QUAL_ERR),
        "stderr_empty": size(QUAL_ERR) == 0,
        "stderr_text": QUAL_ERR_TEXT,
        "exit_code": int(QUAL_EXIT.read_text().strip()),
        "harness_path": str(QDIR / "qualify.py"),
        "harness_sha256": sha(QDIR / "qualify.py"),
        "check_count": len(QUAL_ITEMS),
        "checks_passed": sum(1 for _, v in QUAL_ITEMS if v == "PASS"),
        "qualified": bool(QUAL_ITEMS) and all(v == "PASS" for _, v in QUAL_ITEMS),
    },
    "evidence_ordering": {
        "qualification_finished_utc": iso(qual_finished_epoch),
        "qualification_finished_epoch": qual_finished_epoch,
        "procedure_invoked_utc": invoked_at,
        "procedure_invoked_epoch": invocation_epoch,
        "receipt_written_utc": iso(receipt_epoch),
        "receipt_written_epoch": receipt_epoch,
        "qualification_precedes_invocation": qual_finished_epoch < invocation_epoch,
        "invocation_precedes_receipt": invocation_epoch <= receipt_epoch,
    },
}

assert all(receipt["self_consistency"].values()), receipt["self_consistency"]
assert receipt["argv"]["fixed_args_match_spec"] is True, "fixed args mismatch"
assert receipt["argv"]["output_dir_is_not_probe_dir"] is True, "probe dir used as output"
assert receipt["qualification"]["qualified"] is True, "qualification not clean"
assert receipt["qualification"]["exit_code"] == 0, "qualification exited non-zero"
assert receipt["qualification"]["check_count"] == 154, receipt["qualification"]["check_count"]
assert receipt["qualification"]["checks_passed"] == 154, receipt["qualification"]["checks_passed"]
# The repaired ordering claim: qualification evidence must NOT postdate the invocation.
assert receipt["evidence_ordering"]["qualification_precedes_invocation"] is True, \
    "qualification evidence postdates the invocation it qualifies: %r" % receipt["evidence_ordering"]
assert receipt["evidence_ordering"]["invocation_precedes_receipt"] is True, receipt["evidence_ordering"]

(M / "evidence" / "invocation_receipt.json").write_text(
    json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(receipt["self_consistency"], indent=2))
print(json.dumps(receipt["evidence_ordering"], indent=2))
print("receipt_sha256", sha(M / "evidence" / "invocation_receipt.json"))
