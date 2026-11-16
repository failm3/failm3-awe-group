#!/usr/bin/env python3
"""Independent verification of the observation-digest deliverables.

Checks (no reliance on the produced procedure's internals):
  A. digest.json numeric fields are JSON numbers, not strings
  B. global completion_percent renders with exactly two decimal places
  C. sites is an object keyed by site name; per-site totals sum to global totals
  D. global completion_percent == completed/scheduled rounded half-up to 2dp
  E. digest.md states the identical values, and documents a reproducible method
  F. deliverables reproduce the independently re-derived totals
"""
import json
import re
import sys

json_path, md_path, indep_path = sys.argv[1], sys.argv[2], sys.argv[3]

results = []


def check(name, ok, detail):
    results.append({"criterion": name, "status": "PASS" if ok else "FAIL", "detail": detail})


d = json.load(open(json_path, encoding="utf-8"))
indep = json.load(open(indep_path, encoding="utf-8"))
md = open(md_path, encoding="utf-8").read()

# --- A: numeric typing -------------------------------------------------------
num_fields = ["row_count", "scheduled", "completed", "incidents", "completion_percent"]
bad = [(f, type(d.get(f)).__name__, d.get(f)) for f in num_fields if not isinstance(d.get(f), (int, float)) or isinstance(d.get(f), bool)]
check("row_count/scheduled/completed/incidents/completion_percent are JSON numbers, not strings",
      not bad,
      "types: " + ", ".join(f"{f}={type(d[f]).__name__}" for f in num_fields) if not bad else str(bad))

# --- B: two decimals on the global field ------------------------------------
raw = open(json_path, encoding="utf-8").read()
m = re.search(r'"completion_percent"\s*:\s*([^,\n]+)', raw)
global_tok = m.group(1).strip() if m else None
two_dp = global_tok is not None and re.fullmatch(r"-?\d+\.\d{2}", global_tok) is not None
check("global completion_percent has exactly two decimal places in digest.json",
      two_dp, f"literal token in JSON: {global_tok}")

# site-level decimal formatting is reported separately (advisory)
site_tokens = re.findall(r'"completion_percent"\s*:\s*([^,\n}]+)', raw)[1:]
site_two_dp = all(re.fullmatch(r"-?\d+\.\d{2}", t.strip()) for t in site_tokens)
check("ADVISORY: every per-site completion_percent also renders with two decimals",
      site_two_dp, "per-site literal tokens: " + ", ".join(t.strip() for t in site_tokens))

# --- C: sites object + sums --------------------------------------------------
sites = d.get("sites")
is_obj = isinstance(sites, dict)
check("sites is a JSON object keyed by site name", is_obj,
      f"keys={sorted(sites) if is_obj else sites}")
sums = {
    "scheduled": sum(v["scheduled"] for v in sites.values()),
    "completed": sum(v["completed"] for v in sites.values()),
    "incidents": sum(v["incidents"] for v in sites.values()),
    "rows": sum(v["rows"] for v in sites.values()),
}
sum_ok = (sums["scheduled"] == d["scheduled"] and sums["completed"] == d["completed"]
          and sums["incidents"] == d["incidents"] and sums["rows"] == d["row_count"])
check("per-site totals sum to the global totals", sum_ok,
      f"site sums={sums} vs global scheduled={d['scheduled']} completed={d['completed']} "
      f"incidents={d['incidents']} row_count={d['row_count']}")

# --- D: completion_percent arithmetic ---------------------------------------
from decimal import Decimal, ROUND_HALF_UP
expected = (Decimal(d["completed"]) * 100 / Decimal(d["scheduled"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
check("completion_percent equals completed/scheduled rounded to two decimals",
      Decimal(str(d["completion_percent"])) == expected,
      f"{d['completed']}/{d['scheduled']}*100 = {expected}, file says {d['completion_percent']}")

# --- F: agreement with independent reduction --------------------------------
mismatch = {}
for f in ["row_count", "scheduled", "completed", "incidents"]:
    if d[f] != indep[f]:
        mismatch[f] = (d[f], indep[f])
if Decimal(str(d["completion_percent"])) != Decimal(indep["completion_percent"]):
    mismatch["completion_percent"] = (d["completion_percent"], indep["completion_percent"])
if sorted(sites) != sorted(indep["sites"]):
    mismatch["site_keys"] = (sorted(sites), sorted(indep["sites"]))
else:
    for k, v in indep["sites"].items():
        for f in ["rows", "scheduled", "completed", "incidents"]:
            if sites[k][f] != v[f]:
                mismatch[f"sites.{k}.{f}"] = (sites[k][f], v[f])
        if Decimal(str(sites[k]["completion_percent"])) != Decimal(v["completion_percent"]):
            mismatch[f"sites.{k}.completion_percent"] = (sites[k]["completion_percent"], v["completion_percent"])
check("digest.json matches the independent reduction on every number", not mismatch,
      "all fields equal" if not mismatch else str(mismatch))

# --- E: digest.md states identical values -----------------------------------
md_req = {
    "row_count": str(d["row_count"]),
    "scheduled": str(d["scheduled"]),
    "completed": str(d["completed"]),
    "incidents": str(d["incidents"]),
    "global completion_percent": f"{Decimal(str(d['completion_percent'])):.2f}",
}
missing = {k: v for k, v in md_req.items() if v not in md}
check("digest.md states the identical global values", not missing,
      "all present" if not missing else f"missing {missing}")

site_md = []
for k in sorted(sites):
    v = sites[k]
    row = f"| {k} | {v['rows']} | {v['scheduled']} | {v['completed']} | {v['incidents']} | {Decimal(str(v['completion_percent'])):.2f} |"
    site_md.append(row)
missing_sites = [r for r in site_md if r not in md]
check("digest.md per-site table rows match digest.json exactly", not missing_sites,
      "all site rows match" if not missing_sites else f"missing {missing_sites}")

method_ok = ("## Method" in md and "Reproduce with" in md
             and md.count("completion_percent") >= 2)
check("digest.md documents a reproducible method", method_ok,
      "contains '## Method' section and a 'Reproduce with' command line")

print(json.dumps({
    "checks": results,
    "digest_json": d,
    "independent": {k: indep[k] for k in ["row_count", "scheduled", "completed", "incidents", "completion_percent"]},
    "independent_sites": indep["sites"],
    "md_expected_rows": site_md,
    "failures": [r["criterion"] for r in results if r["status"] == "FAIL"],
}, indent=2))
