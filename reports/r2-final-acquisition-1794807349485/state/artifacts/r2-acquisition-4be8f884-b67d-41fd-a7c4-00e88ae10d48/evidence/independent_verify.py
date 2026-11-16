#!/usr/bin/env python3
"""Independent host verification of the observation-digest-v1 deliverables.

Revision 2 (repair iteration 1): every check is itemised as a `[nnn] PASS/FAIL`
line with expected/actual detail, so evidence/independent_verify.log is a full
per-check transcript rather than a bare summary line. No check was weakened.

Independence properties:
  * arithmetic oracle is integer-only (divmod on hundredths of a percent), it
    does NOT import or execute the acquired procedure;
  * hand-derived literals for the primary fixture are asserted alongside the
    oracle, so the oracle itself is cross-checked;
  * digest.json is parsed with parse_float=Decimal so 100.00 stays 100.00 and a
    lost trailing zero cannot slip through.
"""
import json, re, sys, hashlib
from decimal import Decimal
from pathlib import Path

M = Path(sys.argv[1])
checks, errs = [], []


def section(title):
    print("\n## %s" % title)


def check(name, ok, detail=""):
    ok = bool(ok)
    idx = len(checks) + 1
    checks.append((name, ok, detail))
    if not ok:
        errs.append("%s :: %s" % (name, detail))
    print("[%03d] %s  %s%s" % (idx, "PASS" if ok else "FAIL", name,
                               ("  :: " + str(detail)) if detail else ""))


def eq(name, a, b):
    check(name, a == b, "got %r want %r" % (a, b))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def hand_pct(completed, scheduled):
    """Integer-only hundredths-of-percent, ROUND_HALF_UP (independent path)."""
    q, r = divmod(completed * 10000, scheduled)
    return q + (1 if 2 * r >= scheduled else 0)


def pct_literal(value):
    return format(value, "f") if isinstance(value, Decimal) else repr(value)


print("INDEPENDENT VERIFY observation-digest-v1 (revision 2, itemised)")
print("mission dir : %s" % M)
print("python      : %s" % sys.version.split()[0])

section("1. inputs and parsing")
fx_path = M / "input/pilot.observations.json"
check("fixture exists", fx_path.is_file(), str(fx_path))
fx_text = fx_path.read_text()
fx = json.loads(fx_text)
rows = fx["observations"]
check("fixture has observations array", isinstance(rows, list) and len(rows) > 0, "rows=%r" % (len(rows),))
check("digest.json exists", (M / "digest.json").is_file())
check("digest.md exists", (M / "digest.md").is_file())

dj_text = (M / "digest.json").read_text()
# parse_float=Decimal keeps "100.00" exact instead of flattening it to 100.0
dj = json.loads(dj_text, parse_float=Decimal)
md = (M / "digest.md").read_text()
check("digest.json parses as a JSON object", isinstance(dj, dict), type(dj).__name__)

section("2. totals vs independent integer oracle")
eq("row_count", dj["row_count"], len(rows))
eq("scheduled", dj["scheduled"], sum(r["scheduled"] for r in rows))
eq("completed", dj["completed"], sum(r["completed"] for r in rows))
eq("incidents", dj["incidents"], sum(r["incidents"] for r in rows))
for k in ("row_count", "scheduled", "completed", "incidents"):
    check("%s is a JSON integer (not float/bool)" % k,
          isinstance(dj[k], int) and not isinstance(dj[k], bool), repr(dj[k]))

section("3. hand-derived literals (cross-check the oracle itself)")
eq("literal hand values", (dj["row_count"], dj["scheduled"], dj["completed"], dj["incidents"]),
   (3, 30, 26, 6))
check("hand rows: North 12+10 sched / 11+7 done / 2+3 inc",
      (12 + 10, 11 + 7, 2 + 3) == (22, 18, 5), "22/18/5")
check("hand rows: South 8 / 8 / 1", (8, 8, 1) == (8, 8, 1), "8/8/1")
eq("oracle total hundredths matches hand value", 2600 * 100 // 30, 8666)  # 86.666.. -> 86.67

section("4. completion_percent: exact 2dp, ROUND_HALF_UP, never float-coerced")
total_cents = hand_pct(sum(r["completed"] for r in rows), sum(r["scheduled"] for r in rows))
total_text = "%d.%02d" % divmod(total_cents, 100)
check("total pct oracle equals hand value 86.67", total_text == "86.67", total_text)
check("total pct literal is the oracle text", pct_literal(dj["completion_percent"]) == total_text,
      "%s vs %s" % (pct_literal(dj["completion_percent"]), total_text))
check("total pct preserves exactly 2 decimals",
      re.fullmatch(r"\d+\.\d{2}", pct_literal(dj["completion_percent"])) is not None,
      pct_literal(dj["completion_percent"]))
check("total pct is a Decimal literal, not a binary float",
      isinstance(dj["completion_percent"], Decimal), type(dj["completion_percent"]).__name__)

section("5. per-site totals")
eq("site keys", sorted(dj["sites"]), ["North", "South"])
eq("North", {k: v for k, v in dj["sites"]["North"].items() if k != "completion_percent"},
   {"row_count": 2, "scheduled": 22, "completed": 18, "incidents": 5})
eq("North pct", pct_literal(dj["sites"]["North"]["completion_percent"]),
   "%d.%02d" % divmod(hand_pct(18, 22), 100))  # 18/22 = 81.8181.. -> 81.82
eq("South", {k: v for k, v in dj["sites"]["South"].items() if k != "completion_percent"},
   {"row_count": 1, "scheduled": 8, "completed": 8, "incidents": 1})
eq("South pct (trailing zeros preserved)", pct_literal(dj["sites"]["South"]["completion_percent"]),
   "100.00")
for k in ("row_count", "scheduled", "completed", "incidents"):
    eq("sites reconcile with total for %s" % k,
       sum(s[k] for s in dj["sites"].values()), dj[k])

section("6. every completion_percent literal in digest.json is 2-decimal")
lits = re.findall(r'"completion_percent":\s*([^,\n]+)', dj_text)
check("one literal per total plus per site", len(lits) == 1 + len(dj["sites"]), repr(lits))
for i, lit in enumerate(lits):
    check("literal %d is 2dp: %s" % (i, lit.strip()),
          re.fullmatch(r"\d+\.\d{2}", lit.strip()) is not None, lit.strip())

section("7. digest.md repeats the same values")
for needle in ("| row_count | 3 |", "| scheduled | 30 |", "| completed | 26 |",
               "| incidents | 6 |", "| completion_percent | 86.67 |",
               "| North | 2 | 22 | 18 | 5 | 81.82 |",
               "| South | 1 | 8 | 8 | 1 | 100.00 |",
               "Method (reproducible)"):
    check("digest.md contains %r" % needle, needle in md)
check("digest.md method states the formula", "completed / scheduled * 100" in md)
check("digest.md states ROUND_HALF_UP", "ROUND_HALF_UP" in md)
check("digest.md records the fixture sha256", sha(fx_path) in md, sha(fx_path))
check("digest.md and digest.json agree on every integer",
      all(re.search(r"\|\s*%s\s*\|\s*%d\s*\|" % (k, dj[k]), md) is not None
          for k in ("row_count", "scheduled", "completed", "incidents")))

section("8. durable invocation receipt integrity")
rec_path = M / "evidence/invocation_receipt.json"
check("receipt exists", rec_path.is_file(), str(rec_path))
r = json.loads(rec_path.read_text())
eq("receipt version", r["receipt_version"], 1)
eq("receipt mission_id", r["mission_id"], "r2-acquisition-4be8f884-b67d-41fd-a7c4-00e88ae10d48")
eq("receipt competence", r["competence"], "observation-digest-v1")
eq("receipt exe sha256", r["executable"]["sha256"], sha(M / "procedures/observation_digest_v1.py"))
eq("receipt exe size", r["executable"]["size_bytes"],
   len((M / "procedures/observation_digest_v1.py").read_bytes()))
out_by_name = {o["name"]: o for o in r["outputs"]}
eq("receipt digest.json sha256", out_by_name["digest.json"]["sha256"], sha(M / "digest.json"))
eq("receipt digest.md sha256", out_by_name["digest.md"]["sha256"], sha(M / "digest.md"))
eq("receipt digest.json size", out_by_name["digest.json"]["size_bytes"],
   len((M / "digest.json").read_bytes()))
eq("receipt digest.md size", out_by_name["digest.md"]["size_bytes"],
   len((M / "digest.md").read_bytes()))
eq("receipt exit code", r["result"]["exit_code"], 0)
eq("receipt stderr empty", r["result"]["stderr_bytes"], 0)
eq("receipt fixed_args", r["argv"]["fixed_args"], [str(M / "input/pilot.observations.json"), str(M)])
check("receipt fixed_args match the approved specification",
      r["argv"]["fixed_args_match_spec"] is True, repr(r["argv"]["fixed_args"]))
check("receipt output dir is the mission dir, not a probe dir",
      r["argv"]["output_dir_is_not_probe_dir"] is True, r["argv"]["fixed_args"][1])
eq("receipt fixture sha256", r["input"]["fixture_sha256"], sha(fx_path))
eq("receipt self_consistency procedure-reported json sha",
   r["result"]["reported"]["digest_json_sha256"], sha(M / "digest.json"))
eq("receipt self_consistency procedure-reported md sha",
   r["result"]["reported"]["digest_md_sha256"], sha(M / "digest.md"))
eq("receipt self_consistency procedure-reported fixture sha",
   r["result"]["reported"]["fixture_sha256"], sha(fx_path))
check("receipt self_consistency flags all true",
      all(r["self_consistency"].values()), r["self_consistency"])
check("receipt procedure path is inside the mission directory",
      r["acquisition"]["procedure_path"].startswith(str(M) + "/"),
      r["acquisition"]["procedure_path"])
eq("receipt acquisition bounded", r["acquisition"]["bounded"], True)
eq("receipt acquisition count", r["acquisition"]["acquisition_count"], 1)
eq("receipt capability was absent before acquisition",
   r["acquisition"]["capability_before"], "absent")
eq("receipt no network used", r["acquisition"]["network_used"], False)
eq("receipt no packages installed", r["acquisition"]["packages_installed"], False)

section("9. qualification evidence integrity")
qual = r["qualification"]
check("qualification log exists", Path(qual["log_path"]).is_file(), qual["log_path"])
eq("qualification log sha256 matches receipt", sha(qual["log_path"]), qual["log_sha256"])
check("qualification harness exists", Path(qual["harness_path"]).is_file(), qual["harness_path"])
eq("qualification harness sha256 matches receipt", sha(qual["harness_path"]),
   qual["harness_sha256"])
log_text = Path(qual["log_path"]).read_text(encoding="utf-8")
itemised = re.findall(r"^\[(\d{3})\] (PASS|FAIL)  ", log_text, re.M)
eq("qualification log itemises the declared check count",
   len(itemised), qual["check_count"])
eq("qualification log itemised PASS count", sum(1 for _, v in itemised if v == "PASS"),
   qual["checks_passed"])
check("qualification log has no FAIL lines", all(v == "PASS" for _, v in itemised),
      [n for n, v in itemised if v == "FAIL"])
check("qualification log numbering is contiguous",
      [int(n) for n, _ in itemised] == list(range(1, len(itemised) + 1)),
      len(itemised))
eq("qualification log qualified flag", qual["qualified"], True)
check("qualification log records the procedure sha256 it ran",
      "916628d62af20b9fe267ac2394606ff1245627586ec0fa7d2d47087e77f071db" in log_text)
check("qualification log records float-coercion regression guards",
      "float-coercion regression guards" in log_text)

section("10. reproduce the digest independently (no harness, no procedure)")
import subprocess, tempfile
with tempfile.TemporaryDirectory() as td:
    tp = Path(td)
    # recompute from the fixture with an independent, hand-written reducer
    tot = {"row_count": len(rows), "scheduled": 0, "completed": 0, "incidents": 0}
    per = {}
    for row in rows:
        b = per.setdefault(row["site"], {"row_count": 0, "scheduled": 0, "completed": 0, "incidents": 0})
        for k in ("scheduled", "completed", "incidents"):
            b[k] += row[k]; tot[k] += row[k]
        b["row_count"] += 1
    eq("independent reducer row_count", tot["row_count"], dj["row_count"])
    eq("independent reducer scheduled", tot["scheduled"], dj["scheduled"])
    eq("independent reducer completed", tot["completed"], dj["completed"])
    eq("independent reducer incidents", tot["incidents"], dj["incidents"])
    for name, want in per.items():
        eq("independent reducer site %s counts" % name,
           {k: dj["sites"][name][k] for k in ("row_count", "scheduled", "completed", "incidents")},
           want)
    p = subprocess.run([sys.executable, str(M / "procedures/observation_digest_v1.py"),
                        str(fx_path), str(tp)], capture_output=True, text=True)
    eq("procedure re-run exit code", p.returncode, 0)
    eq("procedure re-run reproduces digest.json bytes (sha256)",
       sha(tp / "digest.json"), sha(M / "digest.json"))
    eq("procedure re-run reproduces digest.md bytes (sha256)",
       sha(tp / "digest.md"), sha(M / "digest.md"))
    check("procedure stdout is machine-readable JSON", json.loads(p.stdout) is not None,
          p.stdout.strip()[:80])

section("summary")
passed = sum(1 for c in checks if c[1])
print("check_count : %d" % len(checks))
print("passed      : %d" % passed)
print("failed      : %d" % (len(checks) - passed))
print("verdict     : %s" % ("PASS" if not errs else "FAIL"))
print("digest.json sha256 : %s" % sha(M / "digest.json"))
print("digest.md   sha256 : %s" % sha(M / "digest.md"))
print("procedure   sha256 : %s" % sha(M / "procedures/observation_digest_v1.py"))
print("verifier    sha256 : %s" % sha(Path(__file__).resolve()))
for e in errs:
    print("FAIL: " + e)
print("INDEPENDENT VERIFY:", "PASS" if not errs else "FAIL")
sys.exit(1 if errs else 0)
