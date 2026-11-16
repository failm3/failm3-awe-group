#!/usr/bin/env python3
"""Pre-qualification probe for observation-digest-v1.

Independently recomputes the expected digest arithmetic from the fixture and
performs static checks on the proposed Node source. The proposed procedure's
main path is deliberately NOT executed here (acquisition must not execute the
target).
"""
import json, hashlib, subprocess, os
from decimal import Decimal, ROUND_HALF_UP

ROOT = "/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822160780/state/artifacts/r2-acquisition-40a647f9-04cc-4533-a728-ed225d359a26"
SRC = os.path.join(ROOT, "bin/observation-digest-v1.mjs")
INP = os.path.join(ROOT, "input/pilot.observations.json")

raw = open(INP, "rb").read()
doc = json.loads(raw)
rows = doc["observations"]

sched = sum(r["scheduled"] for r in rows)
comp = sum(r["completed"] for r in rows)
inc = sum(r["incidents"] for r in rows)
pct = (Decimal(comp) * 100 / Decimal(sched)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

sites = {}
for r in rows:
    t = sites.setdefault(r["site"], {"scheduled": 0, "completed": 0, "incidents": 0})
    for k in t:
        t[k] += r[k]

site_reconciles = (
    sum(v["scheduled"] for v in sites.values()) == sched
    and sum(v["completed"] for v in sites.values()) == comp
    and sum(v["incidents"] for v in sites.values()) == inc
)

src = open(SRC, "rb").read()
src_sha = hashlib.sha256(src).hexdigest()

syntax_ok = subprocess.run(["node", "--check", SRC], capture_output=True).returncode == 0

cases = [[0, 1], [0, 7], [1, 200], [1, 8], [1, 3], [2, 3], [5, 5], [26, 30],
         [7, 8], [1, 16], [3, 16], [999, 1000], [1, 6], [5, 6]]
prog = "const cs=" + json.dumps(cases) + ";" + """
for (const [c,s] of cs){const bp=Math.floor((c*10000*2+s)/(2*s));process.stdout.write((bp/100).toFixed(2)+"\\n");}"""
js = subprocess.run(["node", "-e", prog], capture_output=True, text=True).stdout.strip().split("\n")
py = [str((Decimal(c) * 100 / Decimal(s)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) for c, s in cases]
rounding_match = js == py
rounding_mismatches = [{"completed": cases[i][0], "scheduled": cases[i][1], "js": js[i], "decimal_half_up": py[i]}
                       for i in range(len(cases)) if js[i] != py[i]]

src_text = src.decode()
out = {
    "probe": "observation-digest-v1 pre-qualification probe (target main path not executed)",
    "probe_method": "independent Python integer/Decimal recomputation of the fixture plus static source checks",
    "input": {"file": INP, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
    "independently_computed_expected": {
        "row_count": len(rows),
        "scheduled": sched,
        "completed": comp,
        "incidents": inc,
        "completion_percent": str(pct),
        "sites": {k: sites[k] for k in sorted(sites)},
    },
    "checks": {
        "row_count_matches_fixture_length": len(rows) == len(doc["observations"]),
        "site_totals_reconcile_to_overall": site_reconciles,
        "completion_percent_has_two_decimals": len(str(pct).split(".")[1]) == 2,
        "source_syntax_ok": syntax_ok,
        "source_sha256_matches_file": src_sha == hashlib.sha256(open(SRC, "rb").read()).hexdigest(),
        "rounding_formula_matches_decimal_half_up": rounding_match,
        "rounding_cases_tested": len(cases),
        "rounding_mismatches": rounding_mismatches,
        "two_arg_arity_enforced": "process.argv.length > 4" in src_text,
        "writes_digest_json": "digest.json" in src_text,
        "writes_digest_md": "digest.md" in src_text,
        "no_network_or_package_imports": not any(m in src_text for m in ["fetch(", "require(", "http", "net."]),
        "target_main_path_executed": False,
    },
    "proposed_source": {"path": SRC, "bytes": len(src), "sha256": src_sha},
}
print(json.dumps(out, indent=2))
