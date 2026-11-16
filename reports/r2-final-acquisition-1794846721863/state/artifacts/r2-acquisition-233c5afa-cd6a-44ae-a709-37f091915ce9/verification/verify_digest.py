#!/usr/bin/env python3
"""Independent verifier for observation-digest-v1 output. Python 3 stdlib only.
Read-only on the fixture, digest.json and digest.md. Writes verification-report.{md,json}
into the artifact root. Does not read or run the node procedure."""
import hashlib, json, re, sys
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
FIXTURE_SHA = "412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766"

raw = (ROOT / "input" / "pilot.observations.json").read_bytes()
fx_sha = hashlib.sha256(raw).hexdigest()
if fx_sha != FIXTURE_SHA:
    sys.exit("fixture hash mismatch: " + fx_sha)
doc = json.loads(raw)

def pct(c, s):
    """Half-up to 2 decimals via exact Fraction -> Decimal; cross-checked with integer formula."""
    if s == 0:
        return Decimal("0.00")
    exact = Fraction(c * 100, s)
    d = (Decimal(exact.numerator) / Decimal(exact.denominator))
    # exact rational compare: use integer half-up on hundredths
    hundredths = (c * 10000 * 2 + s) // (2 * s)
    q = Decimal(hundredths).scaleb(-2).quantize(Decimal("0.01"))
    q2 = Decimal(exact.numerator * 10**6 // exact.denominator).scaleb(-6)  # truncated, sanity only
    assert q == d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) or abs(q - q2) <= Decimal("0.01")
    return q

tot = dict(scheduled=0, completed=0, incidents=0)
sites = {}
rows = doc["observations"]
for r in rows:
    for k in tot:
        tot[k] += r[k]
    s = sites.setdefault(r["site"], dict(rows=0, scheduled=0, completed=0, incidents=0))
    s["rows"] += 1
    for k in tot:
        s[k] += r[k]
exp = dict(row_count=len(rows), **tot, completion_percent=pct(tot["completed"], tot["scheduled"]))
exp_sites = {n: dict(v, completion_percent=pct(v["completed"], v["scheduled"])) for n, v in sorted(sites.items())}

# ---- parse digest.json keeping literal types and text
jtext = (ROOT / "digest.json").read_text()
parsed = json.loads(jtext, parse_int=lambda t: ("int", t), parse_float=lambda t: ("float", t))

results = []
def rec(field, expected, actual_repr, ok, note=""):
    results.append(dict(field=field, expected=str(expected), actual=str(actual_repr), result="PASS" if ok else "FAIL", note=note))

def num_check(path, got, expected, is_pct):
    """got is ('int'|'float', literal) or something else (wrong type)."""
    if not (isinstance(got, tuple)):
        rec(path, expected, repr(got), False, "not a JSON number (type %s)" % type(got).__name__)
        return
    kind, lit = got
    val_ok = Decimal(lit) == Decimal(expected)
    if is_pct:
        ser_ok = re.fullmatch(r"-?\d+\.\d{2}", lit) is not None
        rec(path + " (value)", expected, lit, val_ok)
        rec(path + " (serialized 2 decimals)", "%s" % Decimal(expected).quantize(Decimal("0.01")), lit, ser_ok,
            "" if ser_ok else "literal in digest.json is `%s`; spec requires 2 decimals" % lit)
    else:
        rec(path, expected, lit, val_ok and kind == "int", "" if kind == "int" else "non-integer literal")

for k in ("row_count", "scheduled", "completed", "incidents"):
    num_check(k, parsed.get(k), exp[k], False)
num_check("completion_percent", parsed.get("completion_percent"), exp["completion_percent"], True)
rec("top-level keys", "row_count,scheduled,completed,incidents,completion_percent,sites", ",".join(parsed.keys()),
    set(parsed) == {"row_count","scheduled","completed","incidents","completion_percent","sites"})
ps = parsed.get("sites", {})
rec("sites keys (site names)", ",".join(exp_sites), ",".join(ps.keys()), list(ps.keys()) == list(exp_sites.keys()))
for n, e in exp_sites.items():
    p = ps.get(n, {})
    for k in ("rows", "scheduled", "completed", "incidents"):
        num_check("sites.%s.%s" % (n, k), p.get(k), e[k], False)
    num_check("sites.%s.completion_percent" % n, p.get("completion_percent"), e["completion_percent"], True)

# ---- reconciliation (using digest.json values)
def val(x): return int(x[1]) if isinstance(x, tuple) else None
recon = []
for k in ("scheduled", "completed", "incidents"):
    ssum = sum(val(ps[n][k]) for n in ps)
    g = val(parsed[k])
    recon.append((k, ssum, g, ssum == g))
rssum = sum(val(ps[n]["rows"]) for n in ps)
recon.append(("rows vs row_count", rssum, val(parsed["row_count"]), rssum == val(parsed["row_count"])))

# ---- digest.md
md = (ROOT / "digest.md").read_text()
def mdrow(label):
    m = re.search(r"^\| %s \| ([^|]+) \|$" % re.escape(label), md, re.M)
    return m.group(1).strip() if m else None
for k in ("row_count", "scheduled", "completed", "incidents"):
    a = mdrow(k); rec("digest.md " + k, exp[k], a, a == str(exp[k]))
a = mdrow("completion_percent"); rec("digest.md completion_percent", "%.2f" % exp["completion_percent"], a, a == "%.2f" % exp["completion_percent"])
for n, e in exp_sites.items():
    m = re.search(r"^\| %s \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+\.\d+) \|$" % re.escape(n), md, re.M)
    want = [str(e["rows"]), str(e["scheduled"]), str(e["completed"]), str(e["incidents"]), "%.2f" % e["completion_percent"]]
    got = list(m.groups()) if m else None
    rec("digest.md site row " + n, "|".join(want), "|".join(got) if got else None, got == want)
m = re.search(r"Input SHA-256: ([0-9a-f]{64})", md)
rec("digest.md Input SHA-256", FIXTURE_SHA, m.group(1) if m else None, bool(m) and m.group(1) == FIXTURE_SHA)
for lab, want in (("Source", doc["source"]), ("Period", doc["period"])):
    m = re.search(r"^- %s: (.*)$" % lab, md, re.M)
    rec("digest.md " + lab, want, m.group(1) if m else None, bool(m) and m.group(1) == want)

# ---- method replayability (structural checks; judgement noted in report)
method = md.split("## Method", 1)[1] if "## Method" in md else ""
mchecks = [
    ("method section present", "## Method" in md),
    ("row counting rule stated", "count every entry of the observations array" in method),
    ("summing rule (global and per site) stated", "Sum scheduled, completed and incidents" in method and "per site" in method),
    ("percent formula stated", "completed / scheduled * 100" in method),
    ("rounding rule stated (half-up, 2 decimals)", "half-up to 2 decimals" in method),
    ("fixture identified by sha256", FIXTURE_SHA in md),
]

fails = [r for r in results if r["result"] == "FAIL"]
mfail = [c for c in mchecks if not c[1]]
rfail = [c for c in recon if not c[3]]
verdict = "PASS" if not (fails or mfail or rfail) else "FAIL"

out = dict(
    verdict=verdict, fixture_sha256=fx_sha,
    computed=dict(exp, completion_percent=str(exp["completion_percent"]),
                  sites={n: dict(v, completion_percent=str(v["completion_percent"])) for n, v in exp_sites.items()}),
    comparisons=results, reconciliation=[dict(check=a, site_sum=b, global_value=c, ok=d) for a, b, c, d in recon],
    method_checks=[dict(check=a, ok=b) for a, b in mchecks],
    digest_sha256=dict(json=hashlib.sha256((ROOT/"digest.json").read_bytes()).hexdigest(),
                       md=hashlib.sha256((ROOT/"digest.md").read_bytes()).hexdigest()))
(ROOT / "verification" / "verification-result.json").write_text(json.dumps(out, indent=2) + "\n")
print(json.dumps(out, indent=2))
