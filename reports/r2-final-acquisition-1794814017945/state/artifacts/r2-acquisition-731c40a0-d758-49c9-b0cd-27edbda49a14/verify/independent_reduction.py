#!/usr/bin/env python3
"""Independent re-derivation of the observation digest totals.

Deliberately implemented in Python with a different reduction strategy from
the produced Node procedure (locale-free sorted dict, Decimal ROUND_HALF_UP
on exact rational arithmetic) so that agreement is evidence, not a repeat of
the same code path.
"""
import json
import sys
from decimal import Decimal, ROUND_HALF_UP

path = sys.argv[1]
raw = open(path, "rb").read()
doc = json.loads(raw.decode("utf-8"))
rows = doc["observations"]

scheduled = completed = incidents = 0
sites = {}
for r in rows:
    s, c, i = int(r["scheduled"]), int(r["completed"]), int(r["incidents"])
    scheduled += s
    completed += c
    incidents += i
    site = r["site"]
    if site not in sites:
        sites[site] = {"rows": 0, "scheduled": 0, "completed": 0, "incidents": 0}
    sites[site]["rows"] += 1
    sites[site]["scheduled"] += s
    sites[site]["completed"] += c
    sites[site]["incidents"] += i


def pct2(c, s):
    if s == 0:
        return Decimal("0.00")
    # exact rational -> 2dp half-up
    return (Decimal(c) * 100 / Decimal(s)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


out = {
    "row_count": len(rows),
    "scheduled": scheduled,
    "completed": completed,
    "incidents": incidents,
    "completion_percent": str(pct2(completed, scheduled)),
    "sites": {},
}
for k in sorted(sites):
    v = sites[k]
    out["sites"][k] = {
        "rows": v["rows"],
        "scheduled": v["scheduled"],
        "completed": v["completed"],
        "incidents": v["incidents"],
        "completion_percent": str(pct2(v["completed"], v["scheduled"])),
    }

# arithmetic self-checks
checks = {
    "site_scheduled_sum_equals_global": sum(v["scheduled"] for v in sites.values()) == scheduled,
    "site_completed_sum_equals_global": sum(v["completed"] for v in sites.values()) == completed,
    "site_incidents_sum_equals_global": sum(v["incidents"] for v in sites.values()) == incidents,
    "site_rows_sum_equals_row_count": sum(v["rows"] for v in sites.values()) == len(rows),
    "completed_le_scheduled": completed <= scheduled,
}
out["_arithmetic_checks"] = checks
print(json.dumps(out, indent=2, sort_keys=False))
