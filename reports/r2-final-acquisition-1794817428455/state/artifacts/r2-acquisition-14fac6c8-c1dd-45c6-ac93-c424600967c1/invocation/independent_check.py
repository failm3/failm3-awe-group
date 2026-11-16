#!/usr/bin/env python3
"""Independent verifier. Does NOT import or exec the procedure.
Re-derives every value from the fixture with its own arithmetic, then
compares against digest.json and the tables in digest.md."""
import json, re, sys, hashlib
from fractions import Fraction
from decimal import Decimal, ROUND_HALF_UP

root = sys.argv[1]
fails, checks = [], 0

def chk(name, cond, detail=""):
    global checks
    checks += 1
    print(("PASS  " if cond else "FAIL  ") + name + (" :: " + detail if detail else ""))
    if not cond:
        fails.append(name)

# ---- independent derivation from raw fixture ----
with open(root + "/input/pilot.observations.json", "rb") as f:
    raw = f.read()
doc = json.loads(raw.decode("utf-8"))
rows = doc["observations"]

tot = {"row_count": len(rows), "scheduled": 0, "completed": 0, "incidents": 0}
per = {}
for r in rows:
    for k in ("scheduled", "completed", "incidents"):
        v = r[k]
        assert isinstance(v, int) and not isinstance(v, bool) and v >= 0, (k, v)
        tot[k] += v
    b = per.setdefault(r["site"], {"row_count": 0, "scheduled": 0, "completed": 0, "incidents": 0})
    b["row_count"] += 1
    for k in ("scheduled", "completed", "incidents"):
        b[k] += r[k]

assert all(b["completed"] <= b["scheduled"] for b in per.values())
assert sum(b["row_count"] for b in per.values()) == tot["row_count"]
assert sum(b["scheduled"] for b in per.values()) == tot["scheduled"]
assert sum(b["completed"] for b in per.values()) == tot["completed"]
assert sum(b["incidents"] for b in per.values()) == tot["incidents"]

def pct(c, s):
    """Centisec percent by pure integer arithmetic: half-up rounding of c*10000/s."""
    if s == 0:
        return "0.00"
    num, den = c * 10000, s
    q, r = divmod(num, den)
    if 2 * r >= den:          # round half-up
        q += 1
    return "%d.%02d" % (q // 100, q % 100)

exp_total_pct = pct(tot["completed"], tot["scheduled"])
exp_site = {}
for name in sorted(per):
    b = per[name]
    exp_site[name] = dict(b, completion_percent=pct(b["completed"], b["scheduled"]))

# ---- compare against digest.json (text-level, to catch numeric rendering) ----
dj_text = open(root + "/digest.json", encoding="utf-8").read()
dj = json.loads(dj_text)

chk("digest.json parses as a JSON object", isinstance(dj, dict))
for k in ("row_count", "scheduled", "completed", "incidents"):
    chk(f"digest.json {k} == independently derived {tot[k]}", dj.get(k) == tot[k], repr(dj.get(k)))
    chk(f"digest.json {k} is an unquoted JSON integer", isinstance(dj.get(k), int) and not isinstance(dj.get(k), bool))
chk("digest.json completion_percent == %s" % exp_total_pct, ("%.2f" % float(dj["completion_percent"])) == exp_total_pct, repr(dj.get("completion_percent")))
chk("completion_percent rendered with exactly 2 decimals",
    re.search(r'"completion_percent":\s*\d+\.\d{2}\s*[,}]', dj_text) is not None)
chk("no quoted completion_percent in digest.json", '"completion_percent": "' not in dj_text)
chk("source passthrough", dj.get("source") == doc.get("source"), repr(dj.get("source")))
chk("period passthrough", dj.get("period") == doc.get("period"), repr(dj.get("period")))
chk("sites keyed exactly by observed sites", sorted(dj["sites"]) == sorted(per), str(sorted(dj["sites"])))
for name in sorted(per):
    s = dj["sites"][name]
    e = exp_site[name]
    for k in ("row_count", "scheduled", "completed", "incidents"):
        chk(f"site {name} {k}", s.get(k) == e[k], f"{s.get(k)} vs {e[k]}")
    chk(f"site {name} completion_percent", ("%.2f" % float(s["completion_percent"])) == e["completion_percent"], f"{s.get('completion_percent')} vs {e['completion_percent']}")
chk("per-site row_count sums to global row_count", sum(v["row_count"] for v in dj["sites"].values()) == dj["row_count"])
chk("per-site scheduled sums to global scheduled", sum(v["scheduled"] for v in dj["sites"].values()) == dj["scheduled"])
chk("per-site completed sums to global completed", sum(v["completed"] for v in dj["sites"].values()) == dj["completed"])
chk("per-site incidents sums to global incidents", sum(v["incidents"] for v in dj["sites"].values()) == dj["incidents"])

# ---- compare against the tables in digest.md ----
md = open(root + "/digest.md", encoding="utf-8").read()
def cell(mdtext, metric):
    m = re.search(r"^\|\s*" + metric + r"\s*\|\s*([^\|]+?)\s*\|$", mdtext, re.M)
    return m.group(1) if m else None
chk("digest.md row_count cell", cell(md, "row_count") == str(tot["row_count"]), repr(cell(md, "row_count")))
chk("digest.md scheduled cell", cell(md, "scheduled") == str(tot["scheduled"]), repr(cell(md, "scheduled")))
chk("digest.md completed cell", cell(md, "completed") == str(tot["completed"]), repr(cell(md, "completed")))
chk("digest.md incidents cell", cell(md, "incidents") == str(tot["incidents"]), repr(cell(md, "incidents")))
chk("digest.md completion_percent cell", cell(md, "completion_percent") == exp_total_pct, repr(cell(md, "completion_percent")))
for name in sorted(per):
    e = exp_site[name]
    row = "| %s | %d | %d | %d | %d | %s |" % (name, e["row_count"], e["scheduled"], e["completed"], e["incidents"], e["completion_percent"])
    chk(f"digest.md site row for {name}", row in md, row if row not in md else "")
total_row = "| **total** | %d | %d | %d | %d | %s |" % (tot["row_count"], tot["scheduled"], tot["completed"], tot["incidents"], exp_total_pct)
chk("digest.md total row", total_row in md, total_row if total_row not in md else "")
chk("digest.md has a reproducible method section", "## Reproducible method" in md)
chk("digest.md states the input path", "argument 1" in md)
chk("digest.md records fixture sha256", hashlib.sha256(raw).hexdigest() in md, hashlib.sha256(raw).hexdigest())

print("\nchecks_passed=%d checks_failed=%d" % (checks - len(fails), len(fails)))
if fails:
    print("FAILED:", "; ".join(fails))
    sys.exit(1)
print("VERDICT: INDEPENDENT_PARITY_OK")
