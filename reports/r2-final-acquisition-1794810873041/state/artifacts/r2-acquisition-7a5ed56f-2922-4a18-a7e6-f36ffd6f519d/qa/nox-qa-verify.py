#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
nox-qa-verify.py -- deterministic QA harness for mission
r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d.

WHAT THIS IS
    A single-file, dependency-free checker that re-derives every numeric claim in
    digest.json / digest.md directly from input/pilot.observations.json using
    exact rational arithmetic (fractions.Fraction), and re-measures the sha256 and
    byte size of every deliverable. It shares no code with the qualified procedure
    bin/observation-digest-v1.js (which uses BigInt integer arithmetic inside a
    Node process), so agreement is evidence about the bytes, not about the author.

WHAT THIS IS NOT
    Running it does NOT constitute independent Nox QA. It is the mechanism a Nox QA
    reviewer runs; the verdict belongs to that reviewer, recorded separately.

USAGE
    python3 qa/nox-qa-verify.py [--root DIR] [--json]
    Exit code 0 = all checks PASS, 1 = at least one FAIL, 2 = harness error.

READ-ONLY GUARANTEE
    Opens files for reading only. Writes nothing, re-runs no procedure, mutates no
    deliverable.
"""

import argparse
import hashlib
import json
import math
import os
import sys
from fractions import Fraction

MISSION_ID = "r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d"
DEFAULT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files whose bytes must be pinned for QA. (mission-report.md and the QA request
# are added by the caller if present; a file cannot contain its own hash.)
PINNED = [
    "digest.json",
    "digest.md",
    "receipt.json",
    "verification-report.md",
    "mission-report.md",
    "bin/observation-digest-v1.js",
    "input/pilot.observations.json",
]

checks = []


def check(cid, ok, detail):
    checks.append({"id": cid, "result": "PASS" if ok else "FAIL", "detail": detail})
    return ok


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def pct2(numerator, denominator):
    """Exact hundredths-based percentage, round half up. Returns (Fraction, q, r).

    q is the number of hundredths; value is q/100. No floating point anywhere.
    """
    if denominator == 0:
        return Fraction(0), 0, 0
    n = numerator * 10000
    q, r = divmod(n, denominator)
    if 2 * r >= denominator:          # half-up
        q += 1
    return Fraction(q, 100), q, r


def fmt2(frac):
    hundredths = int(round(frac * 100))
    sign = "-" if hundredths < 0 else ""
    a = abs(hundredths)
    return "%s%d.%02d" % (sign, a // 100, a % 100)


def main(argv=None):
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--json", action="store_true", help="emit JSON only")
    args = ap.parse_args(argv)
    root = os.path.abspath(args.root)

    def p(rel):
        return os.path.join(root, rel)

    # ---------- 1. manifest: measured bytes and hashes ----------
    manifest = []
    for rel in PINNED:
        if not os.path.isfile(p(rel)):
            check("manifest.%s" % rel, False, "missing file")
            continue
        with open(p(rel), "rb") as fh:
            b = fh.read()
        manifest.append({
            "path": rel,
            "bytes": len(b),
            "chars_utf8": len(b.decode("utf-8")),
            "sha256": hashlib.sha256(b).hexdigest(),
        })
    check("manifest.all_present", len(manifest) == len(PINNED),
          "%d/%d pinned files present" % (len(manifest), len(PINNED)))

    # ---------- 2. fixture and independent arithmetic ----------
    with open(p("input/pilot.observations.json"), "rb") as fh:
        fixture_raw = fh.read()
    fixture = json.loads(fixture_raw.decode("utf-8"))
    rows = fixture["observations"]

    tot_sched = sum(r["scheduled"] for r in rows)
    tot_comp = sum(r["completed"] for r in rows)
    tot_inc = sum(r["incidents"] for r in rows)
    total_pct, tq, tr = pct2(tot_comp, tot_sched)

    sites = {}
    for r in rows:
        s = sites.setdefault(r["site"], {"rows": 0, "scheduled": 0, "completed": 0, "incidents": 0})
        s["rows"] += 1
        s["scheduled"] += r["scheduled"]
        s["completed"] += r["completed"]
        s["incidents"] += r["incidents"]

    independent = {
        "row_count": len(rows),
        "scheduled": tot_sched,
        "completed": tot_comp,
        "incidents": tot_inc,
        "completion_percent_hundredths": tq,
        "completion_percent": fmt2(total_pct),
        "sites": {},
    }
    for name in sorted(sites):
        s = sites[name]
        f, q, rr = pct2(s["completed"], s["scheduled"])
        independent["sites"][name] = dict(s, completion_percent_hundredths=q, completion_percent=fmt2(f))

    check("arith.totals", (tot_sched, tot_comp, tot_inc, len(rows)) == (30, 26, 6, 3),
          "rows=%d scheduled=%d completed=%d incidents=%d" % (len(rows), tot_sched, tot_comp, tot_inc))
    check("arith.total_pct", tq == 8667,
          "q=%d r=%d -> %s (2*r=%d >= denominator=%d rounds up)" % (tq, tr, fmt2(total_pct), 2 * tr, tot_sched))
    check("arith.sites_sum_to_totals",
          sum(v["scheduled"] for v in sites.values()) == tot_sched
          and sum(v["completed"] for v in sites.values()) == tot_comp
          and sum(v["incidents"] for v in sites.values()) == tot_inc
          and sum(v["rows"] for v in sites.values()) == len(rows),
          "site aggregates equal whole-set aggregates")

    # ---------- 3. digest.json ----------
    with open(p("digest.json"), "rb") as fh:
        dj_raw = fh.read()
    dj = json.loads(dj_raw.decode("utf-8"))
    for k in ("row_count", "scheduled", "completed", "incidents"):
        check("digest.json.%s" % k, dj.get(k) == independent[k],
              "file=%r independent=%r" % (dj.get(k), independent[k]))
    check("digest.json.completion_percent",
          isinstance(dj.get("completion_percent"), (int, float))
          and Fraction(str(dj["completion_percent"])) == Fraction(tq, 100),
          "file=%r independent=%s (100.00 renders as the JSON number 100; JSON numbers carry no trailing zeros)"
          % (dj.get("completion_percent"), fmt2(total_pct)))
    check("digest.json.completion_percent_is_numeric",
          not isinstance(dj.get("completion_percent"), str),
          "numeric, not a string, as the criterion requires")
    check("digest.json.sites_keys",
          isinstance(dj.get("sites"), dict) and sorted(dj["sites"]) == sorted(sites),
          "sites=%r expected=%r" % (sorted(dj.get("sites") or {}), sorted(sites)))
    ok_sites = True
    for name in sorted(sites):
        e = dj.get("sites", {}).get(name) or {}
        for k in ("rows", "scheduled", "completed", "incidents"):
            ok_sites &= e.get(k) == sites[name][k]
        ok_sites &= Fraction(str(e.get("completion_percent"))) == Fraction(independent["sites"][name]["completion_percent_hundredths"], 100)
    check("digest.json.site_values", ok_sites, "every per-site field matches independent arithmetic")

    # ---------- 4. digest.md ----------
    md = p("digest.md")
    with open(md, "rb") as fh:
        md_raw = fh.read()
    md_text = md_raw.decode("utf-8")
    expected_rows = [
        "| Rows | %d |" % independent["row_count"],
        "| Scheduled | %d |" % independent["scheduled"],
        "| Completed | %d |" % independent["completed"],
        "| Incidents | %d |" % independent["incidents"],
        "| Completion percent | %s |" % independent["completion_percent"],
        "| **All sites** | **%d** | **%d** | **%d** | **%d** | **%s** |"
        % (independent["row_count"], independent["scheduled"], independent["completed"],
           independent["incidents"], independent["completion_percent"]),
    ]
    for name in sorted(sites):
        s = independent["sites"][name]
        expected_rows.append("| %s | %d | %d | %d | %d | %s |"
                             % (name, s["rows"], s["scheduled"], s["completed"],
                                s["incidents"], s["completion_percent"]))
    for line in expected_rows:
        check("digest.md.line:%s" % line[:28], line in md_text, "line present verbatim: %r" % line)
    check("digest.md.two_decimal_south", "| South | 1 | 8 | 8 | 1 | 100.00 |" in md_text,
          "South rendered as literal 100.00 in the markdown table")
    check("digest.md.method_section", "## Method (reproducible)" in md_text
          and "round half up" in md_text,
          "reproducible method section present and states the half-up integer rule")

    # ---------- 5. receipt.json ----------
    with open(p("receipt.json"), "rb") as fh:
        rc_raw = fh.read()
    rc = json.loads(rc_raw.decode("utf-8"))
    spec_args = [p("input/pilot.observations.json"), root]
    check("receipt.arguments_exact", rc.get("arguments") == spec_args,
          "receipt args equal the specification's fixed args literally")
    check("receipt.no_probe_in_args", "probe" not in json.dumps(rc.get("arguments")),
          "args[1] is the final root, not a probe directory")
    check("receipt.executable_sha256_matches_file",
          rc.get("procedure", {}).get("executable_sha256") == sha256_of(p("bin/observation-digest-v1.js")),
          "attested executable sha256 equals the measured hash of the file on disk")
    check("receipt.input_sha256_matches_file",
          rc.get("input_sha256") == hashlib.sha256(fixture_raw).hexdigest(),
          "recorded input sha256 equals the measured fixture hash")
    check("receipt.exit_code", rc.get("exit_code") == 0, "exit_code=%r" % rc.get("exit_code"))
    check("receipt.invocation_count", rc.get("invocation_count") == 1,
          "single gated invocation: %r" % rc.get("invocation_count"))
    ok_out = True
    for f in rc.get("output_files", []):
        b = open(p(f["name"]), "rb").read()
        ok_out &= f.get("sha256") == hashlib.sha256(b).hexdigest()
        ok_out &= f.get("observed_size_bytes") == len(b)
    check("receipt.output_hashes_and_sizes", ok_out and len(rc.get("output_files", [])) == 2,
          "receipt sha256 and byte size match the on-disk outputs (no null / not-measured values)")
    check("receipt.durable_fields",
          all(rc.get(k) for k in ("attempt_id", "qualification_id", "command_line", "mission_id")),
          "attempt id, qualification id, command line and mission id all present")

    # ---------- 6. integrity: procedure output == registered bytes ----------
    probe = p("probe-capability-check/digest.json")
    if os.path.isfile(probe):
        check("integrity.final_equals_probe_bytes",
              sha256_of(probe) == sha256_of(p("digest.json"))
              and sha256_of(p("probe-capability-check/digest.md")) == sha256_of(p("digest.md")),
              "final digest.json/digest.md are byte-identical to the procedure's own probe output")
    check("integrity.json_is_canonical",
          dj_raw.decode("utf-8") == json.dumps(dj, indent=2, ensure_ascii=False) + "\n",
          "digest.json re-serialises to itself (2-space indent, trailing newline, stable site key order)")

    # ---------- 7. scope hygiene ----------
    check("scope.procedure_source_unmodified",
          sha256_of(p("bin/observation-digest-v1.js")) ==
          "a2fee381effeb02550470b381804b096c59237f84df69e3f8601cd39c4d871e0",
          "pinned capability bytes equal the qualification value (immutable path untouched)")
    check("scope.no_binary_or_foreign_outputs",
          all(not n.lower().endswith((".png", ".jpg", ".jpeg", ".pdf"))
              for n in os.listdir(root)),
          "no binary deliverable was regenerated by a text tool")
    qa_note = rc.get("repair_amendments", {}).get("independent_nox_qa")
    check("scope.qa_not_self_asserted", qa_note is not None and "NOT" in (qa_note or ""),
          "the receipt does not claim a Nox QA verdict that this delegation cannot obtain")

    failed = [c for c in checks if c["result"] == "FAIL"]
    result = {
        "harness": "qa/nox-qa-verify.py",
        "harness_sha256_self": "not self-recordable; compute with sha256sum qa/nox-qa-verify.py",
        "mission_id": MISSION_ID,
        "root": root,
        "independent_arithmetic": independent,
        "manifest": manifest,
        "checks_total": len(checks),
        "checks_passed": len(checks) - len(failed),
        "checks_failed": len(failed),
        "result": "PASS" if not failed else "FAIL",
        "failures": failed,
        "checks": checks,
        "verdict_authority": "NONE -- this run is mechanical evidence only. Only an independent Nox QA "
                             "reviewer may issue the QA verdict for acceptance criterion 4.",
    }

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        for c in checks:
            print("%-5s %-46s %s" % (c["result"], c["id"], c["detail"]))
        print("\n%d/%d checks passed -> %s" % (result["checks_passed"], result["checks_total"], result["result"]))
        print("Verdict authority: none (mechanical evidence only; Nox QA verdict is separate).")
    return 0 if not failed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("harness error: %r\n" % (exc,))
        sys.exit(2)
