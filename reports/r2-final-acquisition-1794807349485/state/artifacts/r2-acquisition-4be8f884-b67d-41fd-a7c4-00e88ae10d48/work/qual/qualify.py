#!/usr/bin/env python3
"""Independent qualification of observation-digest-v1.

Revision 2 (repair iteration 1).  Changes vs revision 1 are limited to
auditability; no check was weakened or removed:

  * every check is now itemised in stdout as a single `[idx] PASS/FAIL name`
    line with its expected/actual detail, so the persisted log carries the
    per-check evidence instead of a bare aggregate count;
  * numbering is stable and the itemised set is exactly the asserted set
    (the summary is derived from the printed lines, never asserted separately);
  * explicit regression guards for the revision-1 float-coercion bug: the
    harness proves that (a) its parsing path preserves 2-decimal literals,
    (b) a plain float parse would silently collapse 100.00 -> 100.0, and
    (c) the comparison path REJECTS a 1-decimal percentage literal, so a real
    formatting regression can no longer be masked.

Expected numbers are recomputed on a SEPARATE code path: integer-only sums and
integer-only ROUND_HALF_UP on hundredths of a percent. Decimal literals in the
emitted files are preserved with parse_float=Decimal so 100.00 is not silently
flattened to 100.0 during verification.
"""
import json, re, subprocess, sys, shutil, hashlib
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROC = ROOT / "procedures" / "observation_digest_v1.py"
OUT = ROOT / "work" / "qual" / "out"
FIX = ROOT / "work" / "qual" / "fixtures"
TWO_DP = re.compile(r"^[0-9]+\.[0-9]{2}$")

checks, failures = [], []


def section(title):
    print("\n## %s" % title)


def check(name, ok, detail=""):
    ok = bool(ok)
    idx = len(checks) + 1
    checks.append((name, ok, detail))
    if not ok:
        failures.append("%s :: %s" % (name, detail))
    print("[%03d] %s  %s%s" % (idx, "PASS" if ok else "FAIL", name,
                               ("  :: " + str(detail)) if detail else ""))


def run(fixture, outdir):
    return subprocess.run([sys.executable, str(PROC), str(fixture), str(outdir)],
                          capture_output=True, text=True)


def oracle_pct(completed, scheduled):
    """Hundredths of a percent, ROUND_HALF_UP, integer arithmetic only."""
    if scheduled <= 0:
        raise ZeroDivisionError
    q, r = divmod(completed * 10000, scheduled)
    cents = q + (1 if 2 * r >= scheduled else 0)
    return cents, "%d.%02d" % divmod(cents, 100)


def oracle(doc):
    rows = doc["observations"]
    tot = {"row_count": len(rows), "scheduled": 0, "completed": 0, "incidents": 0}
    sites = {}
    for r in rows:
        s = sites.setdefault(r["site"], {"row_count": 0, "scheduled": 0,
                                          "completed": 0, "incidents": 0})
        for k in ("scheduled", "completed", "incidents"):
            s[k] += r[k]; tot[k] += r[k]
        s["row_count"] += 1
    expect = dict(tot)
    expect["pct"], expect["pct_text"] = oracle_pct(tot["completed"], tot["scheduled"])
    for s in sites.values():
        s["pct"], s["pct_text"] = oracle_pct(s["completed"], s["scheduled"])
    return expect, sites


def pct_ok(value, want_text):
    """Value must be an exact 2-decimal literal equal to the oracle text."""
    if isinstance(value, Decimal):
        text = format(value, "f")
    else:
        return False, "not a JSON decimal literal: %r" % (value,)
    return (TWO_DP.match(text) is not None and text == want_text,
            "literal %s vs oracle %s" % (text, want_text))


def verify(fixture, tag):
    od = OUT / tag
    if od.exists(): shutil.rmtree(od)
    p = run(fixture, od)
    check(f"[{tag}] exit 0", p.returncode == 0, "exit %d %s" % (p.returncode, p.stderr.strip()))
    jp, mp = od / "digest.json", od / "digest.md"
    check(f"[{tag}] digest.json exists", jp.is_file(), str(jp))
    check(f"[{tag}] digest.md exists", mp.is_file(), str(mp))
    if not (jp.is_file() and mp.is_file()): return None
    text = jp.read_text(encoding="utf-8")
    # parse_float=Decimal: a 100.00 literal stays Decimal("100.00")
    doc = json.loads(text, parse_float=Decimal)
    src = json.loads(Path(fixture).read_text(encoding="utf-8"), parse_float=Decimal)
    exp, exp_sites = oracle(src)

    for k in ("row_count", "scheduled", "completed", "incidents"):
        check(f"[{tag}] {k}={exp[k]}", doc.get(k) == exp[k],
              "got %r want %r" % (doc.get(k), exp[k]))
    for k in ("row_count", "scheduled", "completed", "incidents"):
        check(f"[{tag}] {k} is JSON int",
              isinstance(doc[k], int) and not isinstance(doc[k], bool), repr(doc[k]))

    ok, why = pct_ok(doc.get("completion_percent"), exp["pct_text"])
    check(f"[{tag}] total completion_percent exact 2dp", ok, why)
    check(f"[{tag}] total completion_percent == oracle", ok, why)

    check(f"[{tag}] sites keyed exactly", set(doc["sites"]) == set(exp_sites),
          "got %r want %r" % (sorted(doc["sites"]), sorted(exp_sites)))
    for name in sorted(exp_sites):
        got, want = doc["sites"].get(name, {}), exp_sites[name]
        for k in ("row_count", "scheduled", "completed", "incidents"):
            check(f"[{tag}] site {name}.{k}={want[k]}", got.get(k) == want[k],
                  "got %r want %r" % (got.get(k), want[k]))
        ok, why = pct_ok(got.get("completion_percent"), want["pct_text"])
        check(f"[{tag}] site {name} pct exact 2dp == oracle", ok, why)

    # every percentage literal in the file must be 2-decimal
    lits = re.findall(r'"completion_percent"\s*:\s*([^,\n]+)', text)
    check(f"[{tag}] {len(lits)} pct literals all 2dp",
          len(lits) == 1 + len(exp_sites) and all(TWO_DP.match(x.strip()) for x in lits),
          repr(lits))

    for k in ("row_count", "scheduled", "completed", "incidents"):
        check(f"[{tag}] sites reconcile with total for {k}",
              sum(s[k] for s in doc["sites"].values()) == doc[k],
              "%r vs %r" % (sum(s[k] for s in doc["sites"].values()), doc[k]))

    md = mp.read_text(encoding="utf-8")
    for k in ("row_count", "scheduled", "completed", "incidents"):
        check(f"[{tag}] digest.md states {k}={doc[k]}",
              re.search(r"\|\s*%s\s*\|\s*%d\s*\|" % (k, doc[k]), md) is not None, str(doc[k]))
    check(f"[{tag}] digest.md states total completion_percent",
          re.search(r"\|\s*completion_percent\s*\|\s*%s\s*\|" % re.escape(exp["pct_text"]), md) is not None,
          exp["pct_text"])
    check(f"[{tag}] digest.md has method section", "## Method (reproducible)" in md)
    check(f"[{tag}] digest.md states method formula", "completed / scheduled * 100" in md)
    for name in sorted(doc["sites"]):
        s = doc["sites"][name]
        row = "| %s | %d | %d | %d | %d | %s |" % (
            name, s["row_count"], s["scheduled"], s["completed"], s["incidents"],
            exp_sites[name]["pct_text"])
        check(f"[{tag}] digest.md site row {name}", row in md, row)
    return doc


print("QUALIFICATION HARNESS observation-digest-v1 (revision 2, itemised)")
print("procedure : %s" % PROC)
print("harness   : %s" % Path(__file__).resolve())
print("python    : %s" % sys.version.split()[0])

# 1. primary fixture
section("1. primary fixture (input/pilot.observations.json)")
d1 = verify(ROOT / "input" / "pilot.observations.json", "primary")

# 2. synthetic fixture (4 sites, tie-breaks, boundary percentages)
section("2. synthetic fixture (boundaries, ties, 0.00 / 100.00 / exact fractions)")
d2 = verify(FIX / "qual.synthetic.json", "synthetic")

# 3. rounding-mode discrimination: truncation would yield 3.12
section("3. rounding-mode discrimination")
check("rounding is HALF_UP not truncation",
      d2["sites"]["Tie"]["completion_percent"] == Decimal("3.13"),
      str(d2["sites"]["Tie"]["completion_percent"]))
check("zero completion renders 0.00", d2["sites"]["Zero"]["completion_percent"] == Decimal("0.00"),
      str(d2["sites"]["Zero"]["completion_percent"]))
check("full completion renders 100.00", d2["sites"]["Full"]["completion_percent"] == Decimal("100.00"),
      str(d2["sites"]["Full"]["completion_percent"]))
check("exact fraction renders 6.25", d2["sites"]["Exact"]["completion_percent"] == Decimal("6.25"),
      str(d2["sites"]["Exact"]["completion_percent"]))

# 4. sensitivity: outputs must follow the input, not be constants
section("4. input sensitivity (anti-constant)")
mut = json.loads((ROOT / "input" / "pilot.observations.json").read_text(encoding="utf-8"))
mut["observations"][0]["completed"] = 3
mutp = FIX / "mutated.json"
mutp.write_text(json.dumps(mut, indent=2), encoding="utf-8")
d3 = verify(mutp, "mutated")
check("totals respond to changed input", d3["completed"] == d1["completed"] - 8,
      "%r vs %r" % (d3["completed"], d1["completed"] - 8))
check("percentage responds to changed input",
      d3["completion_percent"] != d1["completion_percent"],
      "%s vs %s" % (d3["completion_percent"], d1["completion_percent"]))

# 5. determinism / byte reproducibility
section("5. determinism and byte reproducibility")
a, b = OUT / "det-a", OUT / "det-b"
for p in (a, b):
    if p.exists(): shutil.rmtree(p)
    run(ROOT / "input" / "pilot.observations.json", p)
for f in ("digest.json", "digest.md"):
    check(f"deterministic {f}", (a / f).read_bytes() == (b / f).read_bytes(),
          hashlib.sha256((a / f).read_bytes()).hexdigest())
check("digest.json reproducible against first run",
      (a / "digest.json").read_bytes() == (OUT / "primary" / "digest.json").read_bytes(),
      hashlib.sha256((a / "digest.json").read_bytes()).hexdigest())
check("no timestamp leakage in digest.json",
      not re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", (a / "digest.json").read_text(encoding="utf-8")))

# 6. negative controls
section("6. negative controls (must reject and write nothing)")
neg = {"bad.completed_gt_scheduled.json": "completed>scheduled",
       "bad.float_field.json": "non-integer field",
       "bad.empty_rows.json": "empty observations",
       "bad.zero_scheduled.json": "scheduled==0",
       "bad.not_json.json": "invalid JSON"}
for fname, why in neg.items():
    od = OUT / ("neg-" + fname)
    if od.exists(): shutil.rmtree(od)
    p = run(FIX / fname, od)
    check(f"rejects {why}", p.returncode != 0, "exit %d" % p.returncode)
    check(f"writes nothing on reject ({why})",
          not (od / "digest.json").exists() and not (od / "digest.md").exists())

# 7. argument contract
section("7. argument contract")
p = subprocess.run([sys.executable, str(PROC)], capture_output=True, text=True)
check("usage error on missing args", p.returncode != 0 and "usage" in p.stderr.lower(),
      p.stderr.strip())

# 8. REGRESSION GUARDS for the revision-1 float-coercion defect.
#    A latent formatting regression must FAIL, not be masked by float coercion.
section("8. float-coercion regression guards (revision-1 defect)")
lossy = json.loads('{"completion_percent": 100.00}')["completion_percent"]
check("plain json.loads does coerce 100.00 to a binary float (hazard is real)",
      isinstance(lossy, float) and repr(lossy) == "100.0",
      "parsed as %s %r (trailing zero lost)" % (type(lossy).__name__, lossy))
exact = json.loads('{"completion_percent": 100.00}', parse_float=Decimal)["completion_percent"]
check("harness parse path preserves the 100.00 literal as 2dp",
      isinstance(exact, Decimal) and format(exact, "f") == "100.00",
      format(exact, "f"))
ok, _why = pct_ok(Decimal("100.00"), "100.00")
check("harness accepts a correct 2dp literal", ok, format(Decimal("100.00"), "f"))
ok, _why = pct_ok(Decimal("100.0"), "100.00")
check("harness REJECTS a float-coerced 1dp literal (regression not masked)", not ok, _why)
ok, _why = pct_ok(lossy, "100.00")
check("harness REJECTS a raw Python float value", not ok, _why)
# end-to-end: a doctored digest with 86.7 instead of 86.67 must be caught
doctored_path = OUT / "primary" / "digest.json"
if doctored_path.is_file():
    doctored = doctored_path.read_text(encoding="utf-8").replace(
        '"completion_percent": 86.67', '"completion_percent": 86.7')
    ddoc = json.loads(doctored, parse_float=Decimal)
    ok, _why = pct_ok(ddoc.get("completion_percent"), "86.67")
    check("doctored 86.7 digest is rejected end-to-end", not ok, _why)
    lits = re.findall(r'"completion_percent"\s*:\s*([^,\n]+)', doctored)
    check("doctored digest fails the raw-literal 2dp scan",
          not all(TWO_DP.match(x.strip()) for x in lits),
          repr([x.strip() for x in lits if not TWO_DP.match(x.strip())]))

# 9. summary, derived from the itemised lines above
passed = sum(1 for c in checks if c[1])
section("summary")
print("check_count  : %d" % len(checks))
print("passed       : %d" % passed)
print("failed       : %d" % (len(checks) - passed))
print("qualified    : %s" % ("true" if not failures else "false"))
print("procedure_sha256 : %s" % hashlib.sha256(PROC.read_bytes()).hexdigest())
print("harness_sha256   : %s" % hashlib.sha256(Path(__file__).resolve().read_bytes()).hexdigest())
for n, ok, d in checks:
    if not ok:
        print("FAIL: %s :: %s" % (n, d))
print(json.dumps({"check_count": len(checks), "passed": passed,
                  "failed": len(checks) - passed, "qualified": not failures,
                  "procedure_sha256": hashlib.sha256(PROC.read_bytes()).hexdigest()}, indent=2))
sys.exit(0 if not failures else 1)
