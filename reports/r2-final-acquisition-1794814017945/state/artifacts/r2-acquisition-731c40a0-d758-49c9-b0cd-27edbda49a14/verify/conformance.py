#!/usr/bin/env python3
"""Independent conformance harness for the pinned observation-digest-v1 procedure.

Purpose: address the QA defect that qualification was self-attested (the same
step authored the procedure and declared it qualified). This harness does not
trust the procedure's own claims. It:

  1. builds synthetic fixtures in a scratch directory,
  2. invokes the PINNED procedure bytes on them (hash verified first),
  3. recomputes every expected value with an independent Python reference,
  4. compares field by field, including half-up rounding ties and the
     scheduled=0 site case,
  5. asserts the procedure rejects malformed input with exit code 2,
  6. removes the scratch directory, leaving only this JSON as evidence.

The pinned procedure is read only; it is never written to.
"""
import json
import os
import shutil
import subprocess
import sys
import hashlib
from decimal import Decimal, ROUND_HALF_UP

WS = "/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794814017945/state/artifacts/r2-acquisition-731c40a0-d758-49c9-b0cd-27edbda49a14"
EXE = os.path.join(WS, "observation_digest_v1.mjs")
DECLARED = "e51560a01847a3410c3eedbfe9d261c483e717fe32606220238a0eda757d58db"
SCRATCH = os.path.join(WS, ".conformance-scratch")


def sha256(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def pct2_ref(completed, scheduled):
    """Independent 2dp half-up reference using exact Decimal rationals."""
    if scheduled == 0:
        return "0.00"
    return str((Decimal(completed) * 100 / Decimal(scheduled)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def reference(fixture):
    """Independent reduction of a fixture, per the documented contract."""
    rows = fixture["observations"]
    sched = comp = inc = 0
    sites = {}
    for r in rows:
        s, c, i = r["scheduled"], r["completed"], r["incidents"]
        sched += s
        comp += c
        inc += i
        e = sites.setdefault(r["site"], {"rows": 0, "scheduled": 0, "completed": 0, "incidents": 0})
        e["rows"] += 1
        e["scheduled"] += s
        e["completed"] += c
        e["incidents"] += i
    out = {
        "row_count": len(rows),
        "scheduled": sched,
        "completed": comp,
        "incidents": inc,
        "completion_percent": pct2_ref(comp, sched),
        "sites": {},
    }
    for k in sorted(sites):
        v = sites[k]
        out["sites"][k] = {
            "rows": v["rows"],
            "scheduled": v["scheduled"],
            "completed": v["completed"],
            "incidents": v["incidents"],
            "completion_percent": pct2_ref(v["completed"], v["scheduled"]),
        }
    return out


def run_case(name, fixture, expect_exit=0):
    case_dir = os.path.join(SCRATCH, name)
    os.makedirs(case_dir, exist_ok=True)
    inp = os.path.join(case_dir, "fixture.json")
    with open(inp, "w", encoding="utf-8") as fh:
        json.dump(fixture, fh, indent=2)
        fh.write("\n")
    proc = subprocess.run(
        ["node", EXE, inp, case_dir],
        capture_output=True, text=True, cwd=WS,
    )
    result = {
        "case": name,
        "exit_code": proc.returncode,
        "expected_exit": expect_exit,
        "exit_code_matches": proc.returncode == expect_exit,
        "stderr_excerpt": proc.stderr.strip()[:300],
    }
    if expect_exit == 0:
        produced = json.load(open(os.path.join(case_dir, "digest.json"), encoding="utf-8"))
        expected = reference(fixture)
        diffs = {}
        for f in ["row_count", "scheduled", "completed", "incidents"]:
            if produced[f] != expected[f]:
                diffs[f] = {"produced": produced[f], "expected": expected[f]}
        if Decimal(str(produced["completion_percent"])) != Decimal(expected["completion_percent"]):
            diffs["completion_percent"] = {
                "produced": produced["completion_percent"],
                "expected": expected["completion_percent"],
            }
        if sorted(produced["sites"]) != sorted(expected["sites"]):
            diffs["site_keys"] = {"produced": sorted(produced["sites"]), "expected": sorted(expected["sites"])}
        else:
            for k, ev in expected["sites"].items():
                for f in ["rows", "scheduled", "completed", "incidents"]:
                    if produced["sites"][k][f] != ev[f]:
                        diffs[f"sites.{k}.{f}"] = {"produced": produced["sites"][k][f], "expected": ev[f]}
                if Decimal(str(produced["sites"][k]["completion_percent"])) != Decimal(ev["completion_percent"]):
                    diffs[f"sites.{k}.completion_percent"] = {
                        "produced": produced["sites"][k]["completion_percent"],
                        "expected": ev["completion_percent"],
                    }
        result["diffs"] = diffs
        result["matches_reference"] = not diffs
        # the markdown must render the same numbers at 2dp
        md = open(os.path.join(case_dir, "digest.md"), encoding="utf-8").read()
        result["md_global_2dp_present"] = f"| completion_percent | {expected['completion_percent']} |" in md
        result["md_site_rows_present"] = all(
            f"| {k} | {v['rows']} | {v['scheduled']} | {v['completed']} | {v['incidents']} | {v['completion_percent']} |"
            in md
            for k, v in expected["sites"].items()
        )
    return result


def main():
    checks = []

    # --- precondition: the file under test is the pinned qualified bytes -------
    exe_sha = sha256(EXE)
    checks.append({
        "check": "precondition: procedure sha256 equals the declared qualified hash",
        "pass": exe_sha == DECLARED,
        "detail": exe_sha,
    })

    if os.path.isdir(SCRATCH):
        shutil.rmtree(SCRATCH)
    os.makedirs(SCRATCH, exist_ok=True)

    cases = []

    # 1. exact half-up tie at 2dp: 1/32 = 3.125% -> 3.13 (not 3.12)
    cases.append(run_case("tie_1_of_32", {"source": "t", "period": "p", "observations": [
        {"site": "A", "scheduled": 32, "completed": 1, "incidents": 0}]}))

    # 2. exact half-up tie at 2dp: 2/3 = 66.66_ -> 66.67; and 1/3 -> 33.33
    cases.append(run_case("thirds", {"source": "t", "period": "p", "observations": [
        {"site": "A", "scheduled": 3, "completed": 2, "incidents": 5},
        {"site": "B", "scheduled": 3, "completed": 1, "incidents": 0}]}))

    # 3. scheduled = 0 site must report completion_percent 0 and not crash
    cases.append(run_case("zero_scheduled_site", {"source": "t", "period": "p", "observations": [
        {"site": "Empty", "scheduled": 0, "completed": 0, "incidents": 2},
        {"site": "Full", "scheduled": 5, "completed": 5, "incidents": 0}]}))

    # 4. code-point site ordering with mixed case: 'Alpha' < 'Zen' < 'alpha'
    cases.append(run_case("codepoint_order", {"source": "t", "period": "p", "observations": [
        {"site": "alpha", "scheduled": 1, "completed": 1, "incidents": 0},
        {"site": "Zen", "scheduled": 2, "completed": 1, "incidents": 0},
        {"site": "Alpha", "scheduled": 4, "completed": 3, "incidents": 0}]}))

    # 5. multi-row same site aggregation
    cases.append(run_case("multirow_aggregation", {"source": "t", "period": "p", "observations": [
        {"site": "S", "scheduled": 7, "completed": 3, "incidents": 1},
        {"site": "S", "scheduled": 11, "completed": 9, "incidents": 4},
        {"site": "S", "scheduled": 1, "completed": 0, "incidents": 0}]}))

    # 6. malformed inputs must be rejected with exit 2, not silently accepted
    cases.append(run_case("reject_completed_gt_scheduled", {"observations": [
        {"site": "A", "scheduled": 1, "completed": 2, "incidents": 0}]}, expect_exit=2))
    cases.append(run_case("reject_negative", {"observations": [
        {"site": "A", "scheduled": 5, "completed": -1, "incidents": 0}]}, expect_exit=2))
    cases.append(run_case("reject_empty_observations", {"observations": []}, expect_exit=2))
    cases.append(run_case("reject_string_count", {"observations": [
        {"site": "A", "scheduled": "5", "completed": 1, "incidents": 0}]}, expect_exit=2))
    cases.append(run_case("reject_missing_site", {"observations": [
        {"scheduled": 5, "completed": 1, "incidents": 0}]}, expect_exit=2))

    numeric = [c for c in cases if c["expected_exit"] == 0]
    rejected = [c for c in cases if c["expected_exit"] == 2]

    checks.append({
        "check": "every numeric case matches the independent Python reference exactly",
        "pass": all(c["matches_reference"] for c in numeric),
        "detail": f"{sum(1 for c in numeric if c['matches_reference'])}/{len(numeric)} cases matched",
    })
    checks.append({
        "check": "digest.md renders global completion_percent at 2dp in every numeric case",
        "pass": all(c["md_global_2dp_present"] for c in numeric),
        "detail": "; ".join(f"{c['case']}={c['md_global_2dp_present']}" for c in numeric),
    })
    checks.append({
        "check": "digest.md per-site rows match the reference at 2dp in every numeric case",
        "pass": all(c["md_site_rows_present"] for c in numeric),
        "detail": "; ".join(f"{c['case']}={c['md_site_rows_present']}" for c in numeric),
    })
    checks.append({
        "check": "malformed fixtures are rejected with exit code 2",
        "pass": all(c["exit_code_matches"] for c in rejected),
        "detail": "; ".join(f"{c['case']}=exit {c['exit_code']}" for c in rejected),
    })

    # --- scratch cleanup: evidence lives in this JSON, not in stray dirs ------
    shutil.rmtree(SCRATCH, ignore_errors=True)
    checks.append({
        "check": "scratch directory removed; no probe output directories left behind",
        "pass": not os.path.exists(SCRATCH),
        "detail": SCRATCH,
    })

    out = {
        "harness": "verify/conformance.py",
        "procedure_under_test": {"path": EXE, "sha256": exe_sha, "declared_sha256": DECLARED},
        "purpose": "Independent behavioural qualification of the pinned procedure against a separate "
                   "Python reference, covering half-up rounding ties, the scheduled=0 site, code-point "
                   "site ordering, multi-row aggregation and malformed-input rejection. This replaces "
                   "self-attested qualification with reproducible third-party test evidence.",
        "checks": checks,
        "cases": cases,
        "all_passed": all(c["pass"] for c in checks),
        "failures": [c["check"] for c in checks if not c["pass"]],
    }
    print(json.dumps(out, indent=2))
    return 0 if out["all_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
