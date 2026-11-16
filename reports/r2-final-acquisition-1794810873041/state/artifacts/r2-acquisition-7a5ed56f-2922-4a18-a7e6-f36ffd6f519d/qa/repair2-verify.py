#!/usr/bin/env python3
# repair2-verify.py  --  repair iteration 2 mechanical verification
#
# WHAT THIS IS:
#   A from-scratch, independent *implementation* check of the digest values and
#   file bytes. It parses the fixture with Python's own json module, recomputes
#   every figure with Fraction/Decimal, and re-serialises digest.json and
#   digest.md from scratch to compare by sha256.
#
# WHAT THIS IS NOT:
#   NOT Nox QA. It was written and run by the same agent that produced the
#   deliverables. Running it does NOT constitute independent Nox QA, and no
#   document in this mission may cite it as one. See section E.
#
# Read-only with respect to the deliverables: it never writes into the root.

import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction

ROOT = "/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794810873041/state/artifacts/r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d"
INPUT = os.path.join(ROOT, "input", "pilot.observations.json")
PROC = os.path.join(ROOT, "bin", "observation-digest-v1.js")


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def read_bytes(p):
    with open(p, "rb") as f:
        return f.read()


# ---------------------------------------------------------------- arithmetic
def hundredths(numerator, denominator):
    """Exact hundredths of numerator/denominator*100, half-up, integer only."""
    if denominator == 0:
        return 0
    n = numerator * 10000
    q, r = divmod(n, denominator)
    if r * 2 >= denominator:
        q += 1
    return q


def fmt2(h):
    """Two-decimal text for an integer number of hundredths."""
    sign = "-" if h < 0 else ""
    h = abs(h)
    return "%s%d.%02d" % (sign, h // 100, h % 100)


def main():
    out = {}
    fixture_raw = read_bytes(INPUT)
    doc = json.loads(fixture_raw.decode("utf-8"))
    rows = doc["observations"]

    # --- per-site and total accumulation, done here from scratch -----------
    sites = {}
    s_tot = c_tot = i_tot = 0
    for r in rows:
        site = r["site"]
        s, c, i = r["scheduled"], r["completed"], r["incidents"]
        for v in (s, c, i):
            assert isinstance(v, int) and not isinstance(v, bool) and v >= 0
        s_tot += s
        c_tot += c
        i_tot += i
        acc = sites.setdefault(site, {"rows": 0, "scheduled": 0, "completed": 0, "incidents": 0})
        acc["rows"] += 1
        acc["scheduled"] += s
        acc["completed"] += c
        acc["incidents"] += i

    tot_h = hundredths(c_tot, s_tot)
    site_names = sorted(sites.keys())
    site_h = {n: hundredths(sites[n]["completed"], sites[n]["scheduled"]) for n in site_names}

    # --- mechanism 2: Decimal cross-check ----------------------------------
    dec_tot = (Decimal(c_tot) / Decimal(s_tot) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    dec_north = (Decimal(sites["North"]["completed"]) / Decimal(sites["North"]["scheduled"]) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    dec_south = (Decimal(sites["South"]["completed"]) / Decimal(sites["South"]["scheduled"]) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # --- mechanism 3: Fraction cross-check --------------------------------
    fr_tot = Fraction(c_tot, s_tot) * 100
    fr_north = Fraction(sites["North"]["completed"], sites["North"]["scheduled"]) * 100
    fr_south = Fraction(sites["South"]["completed"], sites["South"]["scheduled"]) * 100

    arithmetic = {
        "row_count": len(rows),
        "scheduled_sum": "%s = %d" % (" + ".join(str(r["scheduled"]) for r in rows), s_tot),
        "completed_sum": "%s = %d" % (" + ".join(str(r["completed"]) for r in rows), c_tot),
        "incidents_sum": "%s = %d" % (" + ".join(str(r["incidents"]) for r in rows), i_tot),
        "total_hundredths": tot_h,
        "total_percent": fmt2(tot_h),
        "decimal_cross_check": str(dec_tot),
        "fraction_cross_check": "%d/%d = %s (%.6f...)" % (c_tot, s_tot, str(fr_tot), float(fr_tot)),
        "sites": {},
    }
    for n in site_names:
        t = sites[n]
        arithmetic["sites"][n] = {
            "rows": t["rows"],
            "scheduled": t["scheduled"],
            "completed": t["completed"],
            "incidents": t["incidents"],
            "hundredths": site_h[n],
            "percent": fmt2(site_h[n]),
            "decimal_cross_check": str(dec_north if n == "North" else dec_south),
            "fraction_cross_check": "%d/%d = %s (%.6f...)" % (t["completed"], t["scheduled"], str(fr_north if n == "North" else fr_south), float(fr_north if n == "North" else fr_south)),
        }
    arithmetic["sites_sum_to_totals"] = {
        "rows": "%d = %d" % (sum(sites[n]["rows"] for n in site_names), len(rows)),
        "scheduled": "%d = %d" % (sum(sites[n]["scheduled"] for n in site_names), s_tot),
        "completed": "%d = %d" % (sum(sites[n]["completed"] for n in site_names), c_tot),
        "incidents": "%d = %d" % (sum(sites[n]["incidents"] for n in site_names), i_tot),
    }
    out["independent_arithmetic"] = arithmetic

    # ------------------------------------------------ rebuild digest.json
    # Rendering rules taken from the documented method in digest.md step 7
    # (2-space indent, trailing newline) and from the field order the method
    # prescribes. Percentages are emitted exactly as the procedure does: an
    # integer-valued multiple of 0.01 has no trailing fraction in JSON.
    def num(h):
        return ("%d" % (h // 100)) if h % 100 == 0 else fmt2(h)

    L = []
    L.append("{")
    L.append('  "source": %s,' % json.dumps(doc["source"]))
    L.append('  "period": %s,' % json.dumps(doc["period"]))
    L.append('  "row_count": %d,' % len(rows))
    L.append('  "scheduled": %d,' % s_tot)
    L.append('  "completed": %d,' % c_tot)
    L.append('  "incidents": %d,' % i_tot)
    L.append('  "completion_percent": %s,' % num(tot_h))
    L.append('  "sites": {')
    for idx, n in enumerate(site_names):
        t = sites[n]
        L.append('    %s: {' % json.dumps(n))
        L.append('      "rows": %d,' % t["rows"])
        L.append('      "scheduled": %d,' % t["scheduled"])
        L.append('      "completed": %d,' % t["completed"])
        L.append('      "incidents": %d,' % t["incidents"])
        L.append('      "completion_percent": %s' % num(site_h[n]))
        L.append('    }%s' % ("," if idx < len(site_names) - 1 else ""))
    L.append('  }')
    L.append('}')
    rebuilt_json = ("\n".join(L) + "\n").encode("utf-8")

    # ------------------------------------------------ rebuild digest.md
    M = []
    M.append("# Operational digest")
    M.append("")
    if doc.get("source"):
        M.append("- Source: %s" % doc["source"])
    if doc.get("period"):
        M.append("- Period: %s" % doc["period"])
    M.append("- Input: `%s`" % os.path.abspath(INPUT))
    M.append("")
    M.append("## Totals")
    M.append("")
    M.append("| Metric | Value |")
    M.append("| --- | --- |")
    M.append("| Rows | %d |" % len(rows))
    M.append("| Scheduled | %d |" % s_tot)
    M.append("| Completed | %d |" % c_tot)
    M.append("| Incidents | %d |" % i_tot)
    M.append("| Completion percent | %s |" % fmt2(tot_h))
    M.append("")
    M.append("## By site")
    M.append("")
    M.append("| Site | Rows | Scheduled | Completed | Incidents | Completion percent |")
    M.append("| --- | --- | --- | --- | --- | --- |")
    for n in site_names:
        t = sites[n]
        M.append("| %s | %d | %d | %d | %d | %s |" % (n, t["rows"], t["scheduled"], t["completed"], t["incidents"], fmt2(site_h[n])))
    M.append("| **All sites** | **%d** | **%d** | **%d** | **%d** | **%s** |" % (len(rows), s_tot, c_tot, i_tot, fmt2(tot_h)))
    M.append("")
    M.append("## Method (reproducible)")
    M.append("")
    M.append("1. Read the single JSON fixture at the path given as argument 1 (UTF-8, `JSON.parse`).")
    M.append("2. Take the `observations` array as the row set; each row contributes its `site` string and its `scheduled`, `completed`, `incidents` integers. Non-negative integers are enforced; any other value aborts with exit code 2.")
    M.append("3. `row_count` = number of elements of `observations`.")
    M.append("4. `scheduled`, `completed`, `incidents` = exact integer sums over all rows (also reported per site).")
    M.append("5. `completion_percent` = `completed / scheduled * 100`, computed in exact integer arithmetic as hundredths: `q = (completed * 10000) / scheduled` with remainder `r`; if `r * 2 >= scheduled` then `q = q + 1` (round half up); result = `q / 100`. Division by zero yields `0.00`. No floating-point rounding is involved, so the value is host-independent.")
    M.append("6. `sites` = object keyed by every distinct `site`, keys sorted by Unicode code point (ascending); each entry carries `rows`, `scheduled`, `completed`, `incidents` and its own `completion_percent` computed by step 5.")
    M.append("7. Write `digest.json` (2-space indented JSON, trailing newline) and `digest.md` (this file) into the output root given as argument 2.")
    M.append("")
    M.append("Verification example: `%d / %d * 100` = %s \u2192 rounded half up to 2 decimals = %s." % (c_tot, s_tot, fmt2(hundredths(c_tot, s_tot)), fmt2(tot_h)))
    M.append("")
    rebuilt_md = ("\n".join(M)).encode("utf-8")

    disk_json = read_bytes(os.path.join(ROOT, "digest.json"))
    disk_md = read_bytes(os.path.join(ROOT, "digest.md"))
    disk_receipt = read_bytes(os.path.join(ROOT, "receipt.json"))

    out["byte_reconstruction"] = {
        "digest.json": {
            "disk_bytes": len(disk_json),
            "disk_sha256": sha256_bytes(disk_json),
            "rebuilt_bytes": len(rebuilt_json),
            "rebuilt_sha256": sha256_bytes(rebuilt_json),
            "identical": disk_json == rebuilt_json,
        },
        "digest.md": {
            "disk_bytes": len(disk_md),
            "disk_chars": len(disk_md.decode("utf-8")),
            "disk_sha256": sha256_bytes(disk_md),
            "rebuilt_bytes": len(rebuilt_md),
            "rebuilt_sha256": sha256_bytes(rebuilt_md),
            "identical": disk_md == rebuilt_md,
        },
    }

    # ------------------------------------------------ parsed-value comparison
    dj = json.loads(disk_json.decode("utf-8"))
    checks = []
    checks.append(("row_count", dj["row_count"], len(rows)))
    checks.append(("scheduled", dj["scheduled"], s_tot))
    checks.append(("completed", dj["completed"], c_tot))
    checks.append(("incidents", dj["incidents"], i_tot))
    checks.append(("completion_percent", dj["completion_percent"], tot_h / 100))
    for n in site_names:
        e = dj["sites"][n]
        checks.append(("sites.%s.rows" % n, e["rows"], sites[n]["rows"]))
        checks.append(("sites.%s.scheduled" % n, e["scheduled"], sites[n]["scheduled"]))
        checks.append(("sites.%s.completed" % n, e["completed"], sites[n]["completed"]))
        checks.append(("sites.%s.incidents" % n, e["incidents"], sites[n]["incidents"]))
        checks.append(("sites.%s.completion_percent" % n, e["completion_percent"], site_h[n] / 100))
    out["value_comparison"] = [
        {"field": f, "digest_json": a, "independent": b, "match": a == b} for f, a, b in checks
    ]
    out["all_values_match"] = all(c["match"] for c in out["value_comparison"])

    # JSON-number trailing-zero finding, stated numerically
    south_raw = None
    for line in disk_json.decode("utf-8").splitlines():
        pass
    south_json_text = num(site_h["South"])
    out["completion_percent_rendering"] = {
        "note": "JSON numbers cannot carry trailing zeros: 100.00 and 100 are the same JSON number. The literal two-decimal rendering is available in digest.md and in this field.",
        "South_digest_json_literal": south_json_text,
        "South_hundredths": site_h["South"],
        "South_two_decimal_text": fmt2(site_h["South"]),
        "South_numerically_exactly_100_00": site_h["South"] == 10000,
        "South_digest_md_literal": "100.00",
        "per_field_two_decimal_rendering": {
            "total": fmt2(tot_h),
            **{n: fmt2(site_h[n]) for n in site_names},
        },
    }

    # ------------------------------------------------ receipt cross-check
    rc = json.loads(disk_receipt.decode("utf-8"))
    proc_bytes = read_bytes(PROC)
    measurable = {
        "receipt.attempt_id": rc.get("attempt_id"),
        "receipt.qualification_id": rc.get("qualification_id"),
        "receipt.invocation_count": rc.get("invocation_count"),
        "receipt.exit_code": rc.get("exit_code"),
        "receipt.arguments": rc.get("arguments"),
        "arguments_equal_spec_fixed_args": rc.get("arguments") == [os.path.abspath(INPUT), ROOT],
        "receipt.executable_path": rc["procedure"]["executable_path"],
        "executable_path_is_procedure": os.path.abspath(rc["procedure"]["executable_path"]) == os.path.abspath(PROC),
        "receipt.executable_sha256": rc["procedure"]["executable_sha256"],
        "measured_executable_sha256": sha256_bytes(proc_bytes),
        "executable_sha256_match": rc["procedure"]["executable_sha256"] == sha256_bytes(proc_bytes),
        "measured_executable_bytes": len(proc_bytes),
        "receipt.executable_bytes": rc["procedure"].get("executable_bytes"),
        "receipt.input_sha256": rc.get("input_sha256"),
        "measured_input_sha256": sha256_bytes(fixture_raw),
        "input_sha256_match": rc.get("input_sha256") == sha256_bytes(fixture_raw),
        "receipt_says_output_root_is_final": rc.get("output_root_is_final_root_not_probe"),
        "receipt_mentions_probe_in_args_or_command": ("probe" in (rc.get("command_line") or "")) or any("probe" in str(a) for a in (rc.get("arguments") or [])),
        "stderr_empty": rc.get("stderr") == "",
    }
    for rec in rc.get("output_files", []):
        name = rec["name"]
        disk = read_bytes(os.path.join(ROOT, name))
        measurable["receipt.output_files[%s].sha256" % name] = rec.get("sha256")
        measurable["measured.output_files[%s].sha256" % name] = sha256_bytes(disk)
        measurable["output_file_sha256_match[%s]" % name] = rec.get("sha256") == sha256_bytes(disk)
        measurable["receipt.output_files[%s].observed_size_bytes" % name] = rec.get("observed_size_bytes")
        measurable["measured.output_files[%s].bytes" % name] = len(disk)
        measurable["output_file_size_match[%s]" % name] = rec.get("observed_size_bytes") == len(disk)
    out["receipt_cross_check"] = measurable

    # ------------------------------------------------ manifest
    manifest = []
    for rel in ["digest.json", "digest.md", "receipt.json", "verification-report.md", "mission-report.md",
                "observation.json", "bin/observation-digest-v1.js", "input/pilot.observations.json",
                "qa/repair2-verify.py", "qa/nox-qa-verify.py", "qa/qa-run-result.json"]:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            b = read_bytes(p)
            try:
                chars = len(b.decode("utf-8"))
            except UnicodeDecodeError:
                chars = None
            manifest.append({"path": rel, "bytes": len(b), "chars_utf8": chars, "sha256": sha256_bytes(b)})
        else:
            manifest.append({"path": rel, "exists": False})
    out["manifest"] = manifest

    # ------------------------------------------------ Nox QA availability probe
    probe = {
        "section": "E. Nox QA reachability probe (negative evidence)",
        "path_env": os.environ.get("PATH"),
        "candidates_searched": ["nox", "nox-qa", "noxqa", "nox_qa", "qa", "gate", "harness", "reviewer", "llm-reviewer"],
        "found_on_path": {},
        "filesystem_glob": "find / -maxdepth 6 -iname '*nox*qa*' -o -iname '*qa*nox*'",
        "filesystem_matches": [],
        "http_probe": "skipped: no network permitted by scope, and no QA endpoint is specified anywhere in the approved specification",
        "conclusion": "No Nox QA facility is reachable from this delegation. Nox QA was NOT performed and is NOT claimed.",
    }
    for c in probe["candidates_searched"]:
        probe["found_on_path"][c] = shutil.which(c)
    try:
        r = subprocess.run(["sh", "-c", "find / -maxdepth 6 \\( -iname '*nox*qa*' -o -iname '*qa*nox*' \\) -not -path '/proc/*' 2>/dev/null"],
                           capture_output=True, text=True, timeout=60)
        probe["filesystem_matches"] = [x for x in r.stdout.splitlines() if x.strip()][:20]
    except Exception as e:
        probe["filesystem_probe_error"] = str(e)
    out["nox_qa_probe"] = probe

    out["self_label"] = {
        "harness": "qa/repair2-verify.py",
        "harness_sha256": sha256_bytes(read_bytes(os.path.abspath(__file__))),
        "author": "the same agent that produced the deliverables (repair iteration 2)",
        "is_independent_nox_qa": False,
        "statement": "This is same-agent mechanical verification, not an independent Nox QA verdict. It narrows the surface for an error but does not substitute for an independent authority.",
    }

    out["environment"] = {"python": platform.python_version(), "platform": platform.platform()}

    print(json.dumps(out, indent=2, sort_keys=False))


if __name__ == "__main__":
    main()
