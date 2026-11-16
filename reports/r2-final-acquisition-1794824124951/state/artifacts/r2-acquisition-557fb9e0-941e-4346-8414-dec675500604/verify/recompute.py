#!/usr/bin/env python3
"""Independent recomputation of the observation digest.

Deliberately NOT derived from procedures/observation-digest-v1.js: this reads the
fixture with json, sums with plain Python ints, and computes the percentage with
Decimal quantize(ROUND_HALF_UP), then cross-checks against an integer formula
derived independently. Writes evidence only; never touches digest.json/digest.md.

Run from the mission artifact root:  python3 verify/recompute.py
"""
import json, re, sys
from decimal import Decimal, ROUND_HALF_UP, ROUND_HALF_EVEN

ROOT = "/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794824124951/state/artifacts/r2-acquisition-557fb9e0-941e-4346-8414-dec675500604"

def pct_half_up(completed, scheduled):
    """completed/scheduled*100 rounded half-up to 2 decimals, as a 2dp string."""
    if scheduled == 0:
        return "0.00"           # documented convention: 0 scheduled => 0.00
    d = (Decimal(completed) * Decimal(100)) / Decimal(scheduled)
    return str(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def pct_int_formula(completed, scheduled):
    """Independent integer derivation: hundredths = floor((2n + d) / (2d)) with
    n = completed*10000, so an exact x.xx5 tie moves away from zero."""
    if scheduled == 0:
        return "0.00"
    n = completed * 10000          # *100 percent *100 hundredths
    s = scheduled
    h = (2 * n + s) // (2 * s)
    return "%d.%02d" % (h // 100, h % 100)

# ---------------- fixture ----------------
with open(ROOT + "/input/pilot.observations.json") as f:
    fx = json.load(f)

rows = fx["observations"]
tot = {"rows": 0, "scheduled": 0, "completed": 0, "incidents": 0}
sites = {}
for r in rows:
    for k in ("scheduled", "completed", "incidents"):
        assert isinstance(r[k], int) and not isinstance(r[k], bool), k
    tot["rows"] += 1
    tot["scheduled"] += r["scheduled"]
    tot["completed"] += r["completed"]
    tot["incidents"] += r["incidents"]
    s = sites.setdefault(r["site"], {"rows": 0, "scheduled": 0, "completed": 0, "incidents": 0})
    s["rows"] += 1
    s["scheduled"] += r["scheduled"]
    s["completed"] += r["completed"]
    s["incidents"] += r["incidents"]

recomputed = {
    "row_count": tot["rows"],
    "scheduled": tot["scheduled"],
    "completed": tot["completed"],
    "incidents": tot["incidents"],
    "completion_percent": pct_half_up(tot["completed"], tot["scheduled"]),
    "sites": {name: {
        "rows": sites[name]["rows"],
        "scheduled": sites[name]["scheduled"],
        "completed": sites[name]["completed"],
        "incidents": sites[name]["incidents"],
        "completion_percent": pct_half_up(sites[name]["completed"], sites[name]["scheduled"]),
    } for name in sorted(sites)},
}
# cross-check the two independent percentage routes agree everywhere
xcheck = {"total": [recomputed["completion_percent"],
                    pct_int_formula(tot["completed"], tot["scheduled"])]}
for name in recomputed["sites"]:
    xcheck[name] = [recomputed["sites"][name]["completion_percent"],
                    pct_int_formula(sites[name]["completed"], sites[name]["scheduled"])]
cross_ok = all(a == b for a, b in xcheck.values())
invariant_ok = (sum(s["scheduled"] for s in recomputed["sites"].values()) == recomputed["scheduled"]
                and sum(s["completed"] for s in recomputed["sites"].values()) == recomputed["completed"]
                and sum(s["incidents"] for s in recomputed["sites"].values()) == recomputed["incidents"]
                and sum(s["rows"] for s in recomputed["sites"].values()) == recomputed["row_count"])

# ---------------- delivered digest.json ----------------
raw_json = open(ROOT + "/digest.json").read()
delivered = json.loads(raw_json)
# decimal-place audit on the raw JSON text: percent must be a JSON number with
# EXACTLY two decimal places (so 100.00, not 100 or 100.0).
lit = {}
for m in re.finditer(r'"completion_percent":\s*([0-9]+(?:\.[0-9]+)?)', raw_json):
    lit.setdefault(m.group(1), 0)
    lit[m.group(1)] += 1
bad_literals = [v for v in lit if "." not in v or len(v.split(".")[1]) != 2]

# ---------------- delivered digest.md ----------------
md_lines = open(ROOT + "/digest.md").read().splitlines()
def table_after(title):
    i = md_lines.index(title)
    out = []
    for ln in md_lines[i:]:
        if ln.startswith("|"):
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            out.append(cells)
        elif out:
            break
    return out[0], out[2:]     # header, data rows (skip separator)

th, trows = table_after("## Totals")
md_totals = {c[0]: c[1] for c in trows}
sh, srows = table_after("## Sites")
md_sites = {c[0]: dict(zip(sh, c)) for c in srows}

# ---------------- comparison ----------------
checks = []
def chk(cid, ok, expected, actual, note=""):
    checks.append({"id": cid, "pass": bool(ok), "expected": expected, "actual": actual, "note": note})

chk("json.row_count", delivered.get("row_count") == recomputed["row_count"],
    recomputed["row_count"], delivered.get("row_count"))
chk("json.scheduled", delivered.get("scheduled") == recomputed["scheduled"],
    recomputed["scheduled"], delivered.get("scheduled"))
chk("json.completed", delivered.get("completed") == recomputed["completed"],
    recomputed["completed"], delivered.get("completed"))
chk("json.incidents", delivered.get("incidents") == recomputed["incidents"],
    recomputed["incidents"], delivered.get("incidents"))
chk("json.completion_percent.value",
    ("%.2f" % float(delivered.get("completion_percent", "nan"))) == recomputed["completion_percent"],
    recomputed["completion_percent"], delivered.get("completion_percent"))
chk("json.completion_percent.two_decimals_as_number",
    not bad_literals and isinstance(delivered.get("completion_percent"), float),
    "JSON number with exactly 2 decimal places",
    sorted(lit.keys()), "raw literals found: " + str(sorted(lit.keys())))
chk("json.sites.keyed_by_site",
    isinstance(delivered.get("sites"), dict) and set(delivered["sites"]) == set(recomputed["sites"]),
    sorted(recomputed["sites"]), sorted(delivered.get("sites", {})))
for name in recomputed["sites"]:
    ds = delivered.get("sites", {}).get(name, {})
    rs = recomputed["sites"][name]
    for k in ("rows", "scheduled", "completed", "incidents"):
        chk("json.sites.%s.%s" % (name, k), ds.get(k) == rs[k], rs[k], ds.get(k))
    chk("json.sites.%s.completion_percent" % name,
        ("%.2f" % float(ds.get("completion_percent", "nan"))) == rs["completion_percent"],
        rs["completion_percent"], ds.get("completion_percent"))

for k, v in [("row_count", recomputed["row_count"]), ("scheduled", recomputed["scheduled"]),
             ("completed", recomputed["completed"]), ("incidents", recomputed["incidents"]),
             ("completion_percent", recomputed["completion_percent"])]:
    chk("md.totals.%s" % k, md_totals.get(k) == str(v), str(v), md_totals.get(k))
chk("md.sites.rowset", sorted(md_sites) == sorted(recomputed["sites"]),
    sorted(recomputed["sites"]), sorted(md_sites))
for name in recomputed["sites"]:
    rs = recomputed["sites"][name]
    for k in ("rows", "scheduled", "completed", "incidents", "completion_percent"):
        chk("md.sites.%s.%s" % (name, k), md_sites.get(name, {}).get(k) == str(rs[k]),
            str(rs[k]), md_sites.get(name, {}).get(k))
# md <-> json agreement (both directions, exact string form)
chk("md.matches_json.totals",
    md_totals.get("completion_percent") == "%.2f" % delivered.get("completion_percent"),
    "%.2f" % delivered.get("completion_percent"), md_totals.get("completion_percent"))
md_json_ok = all(
    md_sites.get(n, {}).get("completion_percent") == "%.2f" % delivered["sites"][n]["completion_percent"]
    and all(md_sites.get(n, {}).get(k) == str(delivered["sites"][n][k])
            for k in ("rows", "scheduled", "completed", "incidents"))
    for n in delivered.get("sites", {}))
chk("md.matches_json.sites", md_json_ok, "every md site cell equals json", md_json_ok)

md_text = open(ROOT + "/digest.md").read()
method_ok = all(t in md_text for t in ["## Method", "rounded half-up", "exactly 2 decimals", "integer"])
chk("md.documents_reproducible_method", method_ok,
    "## Method section stating row list, integer sums, half-up 2dp rule, per-site grouping",
    method_ok)
chk("md.reproduce_command", "Reproduce:" in md_text, "reproduction command present",
    "Reproduce:" in md_text)

# ---------------- rounding boundary tests ----------------
boundary = []
def bcase(completed, scheduled, expect_half_up):
    hu = pct_half_up(completed, scheduled)
    he = str((Decimal(completed) * 100 / Decimal(scheduled)).quantize(Decimal("0.01"),
             rounding=ROUND_HALF_EVEN)) if scheduled else "0.00"
    boundary.append({
        "completed": completed, "scheduled": scheduled,
        "exact": str((Decimal(completed) * 100 / Decimal(scheduled))) if scheduled else "0",
        "half_up": hu, "half_even_bankers": he,
        "int_formula": pct_int_formula(completed, scheduled),
        "expected_half_up": expect_half_up,
        "pass": hu == expect_half_up == pct_int_formula(completed, scheduled),
        "differs_from_half_even": hu != he,
    })
bcase(1, 32, "3.13")     # 3.125 exact tie -> half-up 3.13, banker's 3.12
bcase(3, 32, "9.38")     # 9.375 tie
bcase(5, 32, "15.63")    # 15.625 tie
bcase(1, 800, "0.13")    # 0.125 tie
bcase(7, 1600, "0.44")   # 0.4375 -> 0.44 (not a tie, but third-decimal 7)
bcase(1, 8, "12.50")     # exact one decimal -> must render 2 decimals
bcase(1, 3, "33.33")     # repeating, truncation not rounding-up to 33.34
bcase(2, 3, "66.67")     # repeating rounds up
bcase(0, 0, "0.00")      # documented zero-scheduled convention
bcase(0, 7, "0.00")
bcase(7, 7, "100.00")
bcase(81, 100, "81.00")
bcase(26, 30, "86.67")   # the live case, tie-free cross-check
bcase(18, 22, "81.82")   # live North
boundary_ok = all(b["pass"] for b in boundary)

evidence = {
    "capability": "observation-digest-v1",
    "independent_recomputation": {
        "method": "python3 decimal.Decimal ROUND_HALF_UP quantize to 0.01, cross-checked "
                  "against an independently derived integer formula floor((200*c+s)/(2*s)); "
                  "fixture parsed with json and summed with Python ints",
        "python_version": sys.version.split()[0],
        "fixture": "input/pilot.observations.json",
        "recomputed": recomputed,
        "percentage_routes": xcheck,
        "percentage_routes_agree": cross_ok,
        "site_sums_roll_up_to_totals": invariant_ok,
    },
    "rounding_boundary_cases": boundary,
    "rounding_boundary_all_pass": boundary_ok,
}
with open(ROOT + "/verify/recompute-evidence.json", "w") as f:
    json.dump(evidence, f, indent=2, sort_keys=False)
    f.write("\n")

fail = [c for c in checks if not c["pass"]]
print(json.dumps({
    "recomputed": recomputed,
    "checks_total": len(checks),
    "checks_failed": len(fail),
    "failures": fail,
    "cross_ok": cross_ok, "invariant_ok": invariant_ok,
    "boundary_ok": boundary_ok, "bad_literals": bad_literals,
    "md_bad": [c for c in checks if c["id"].startswith("md.") and not c["pass"]],
}, indent=2))
