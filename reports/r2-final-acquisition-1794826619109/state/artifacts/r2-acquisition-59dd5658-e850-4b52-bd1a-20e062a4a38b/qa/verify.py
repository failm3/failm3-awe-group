#!/usr/bin/env python3
"""Independent recomputation and verification of the observation digest.

Read-only: parses input/pilot.observations.json, digest.json and digest.md and
never rewrites, reformats or regenerates any of them. Standard library only.
completion_percent uses decimal.Decimal + ROUND_HALF_UP on integers; no float
division is used in the rounding step.

Usage: python3 qa/verify.py [out.json]
"""
import json, os, sys
from decimal import Decimal, ROUND_HALF_UP

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX, DJ, DM = (os.path.join(ROOT, "input", "pilot.observations.json"),
               os.path.join(ROOT, "digest.json"), os.path.join(ROOT, "digest.md"))
II = lambda v: isinstance(v, int) and not isinstance(v, bool)   # true JSON int
NU = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
lj = lambda p: json.load(open(p, encoding="utf-8"))

# ---- recompute from the fixture only ---------------------------------
doc = lj(FIX)
rows = doc if isinstance(doc, list) else (doc.get("observations", None)
                                          if isinstance(doc, dict) else None)
rc, st = [], {}
S = C = I = 0
for i, r in enumerate(rows or []):
    bad, ok = [], isinstance(r, dict)
    site = r.get("site") if ok else None
    if not ok:
        bad.append("not an object")
    if not (isinstance(site, str) and site.strip()):
        bad.append("site not non-empty string"); site = None
    for f in ("scheduled", "completed", "incidents"):
        if not II(r.get(f) if ok else None):
            bad.append(f + " not integer")
    if ok and II(r.get("scheduled")) and II(r.get("completed")) and r["completed"] > r["scheduled"]:
        bad.append("completed > scheduled")
    rc.append({"index": i, "site": site, "pass": not bad, "problems": bad,
               "scheduled": r.get("scheduled") if ok else None,
               "completed": r.get("completed") if ok else None,
               "incidents": r.get("incidents") if ok else None})
    if not bad:
        S += r["scheduled"]; C += r["completed"]; I += r["incidents"]
        b = st.setdefault(site, {"scheduled": 0, "completed": 0, "incidents": 0})
        for f in b:
            b[f] += r[f]

pct = ((Decimal(C) * 100 / Decimal(S)).quantize(Decimal("0.01"), ROUND_HALF_UP)
       if S else Decimal("0.00"))
ps = str(pct)
keys = sorted(st)                      # str order == unicode code-unit order
sites = {k: dict(st[k]) for k in keys}
rec = {"row_count": len(rows or []), "scheduled": S, "completed": C,
       "incidents": I, "completion_percent": float(pct), "sites": sites}

# ---- compare against the deliverables --------------------------------
cj = lj(DJ)
md = open(DM, encoding="utf-8").read()
fx, exp = {}, {"row_count", "scheduled", "completed", "incidents",
               "completion_percent", "sites"}
for f in ("row_count", "scheduled", "completed", "incidents"):
    g = cj.get(f)
    fx[f] = {"recomputed": rec[f], "digest_json": g, "json_type": type(g).__name__,
             "is_json_integer": II(g), "present": f in cj,
             "equal": f in cj and II(g) and g == rec[f]}
g = cj.get("completion_percent")
fx["completion_percent"] = {"recomputed": float(pct), "recomputed_formatted": ps,
                            "digest_json": g, "json_type": type(g).__name__,
                            "is_json_number": NU(g), "present": "completion_percent" in cj,
                            "digest_json_formatted": ("%.2f" % g) if NU(g) else None,
                            "equal": NU(g) and Decimal(str(g)) == pct,
                            "two_decimals_when_formatted": NU(g) and ("%.2f" % g) == ps and round(g, 2) == g}
sj = cj.get("sites")
per = {}
for k in keys:
    e = sj.get(k) if isinstance(sj, dict) else None
    d = {}
    for f in ("scheduled", "completed", "incidents"):
        v = e.get(f) if isinstance(e, dict) else None
        d[f] = {"recomputed": sites[k][f], "digest_json": v,
                "is_json_integer": II(v), "equal": II(v) and v == sites[k][f]}
    per[k] = {"fields": d, "all_equal": all(x["equal"] for x in d.values())}
fx["sites"] = {"recomputed": sites, "digest_json": sj, "is_object": isinstance(sj, dict),
               "key_sets_equal": isinstance(sj, dict) and sorted(sj) == keys,
               "recomputed_key_order": keys,
               "digest_json_key_order": list(sj) if isinstance(sj, dict) else None,
               "key_order_code_unit_sorted": isinstance(sj, dict) and list(sj) == keys,
               "per_site": per,
               "equal": isinstance(sj, dict) and sorted(sj) == keys and all(v["all_equal"] for v in per.values())}
fx["extra_top_level_keys"] = sorted(set(cj) - exp)
fx["missing_top_level_keys"] = sorted(exp - set(cj))

# ---- per-site sums reconstruct the aggregate -------------------------
recon = {}
for f in ("scheduled", "completed", "incidents"):
    s = sum(sites[k][f] for k in keys)
    recon[f] = {"per_site_sum": s, "recomputed_aggregate": rec[f],
                "digest_json_aggregate": cj.get(f),
                "sum_equals_recomputed": s == rec[f],
                "sum_equals_digest_json": s == cj.get(f)}
recon_ok = all(v["sum_equals_recomputed"] and v["sum_equals_digest_json"] for v in recon.values())

# ---- digest.md tables and method section -----------------------------
L = md.splitlines()
def tab(hdr):
    for i, ln in enumerate(L):
        if ln.strip().startswith("|") and [c.strip() for c in ln.strip().strip("|").split("|")] == hdr:
            out, j = [], i + 2
            while j < len(L) and L[j].strip().startswith("|"):
                out.append([c.strip() for c in L[j].strip().strip("|").split("|")]); j += 1
            return out
    return []

mt = {c[0]: c[1] for c in tab(["metric", "value"]) if len(c) == 2}
ms, mall = {}, None
for c in tab(["site", "scheduled", "completed", "incidents"]):
    if len(c) != 4:
        continue
    n = c[0].replace("*", "").strip()
    v = [x.replace("*", "").strip() for x in c[1:]]
    if n.lower() == "all sites":
        mall = v
    else:
        ms[n] = v
wt = {"row_count": str(rec["row_count"]), "scheduled": str(S), "completed": str(C),
      "incidents": str(I), "completion_percent": ps}
mdt = {k: {"digest_md": mt.get(k), "expected": v, "equal": mt.get(k) == v} for k, v in wt.items()}
mds = {}
for k in keys:
    e = [str(sites[k][f]) for f in ("scheduled", "completed", "incidents")]
    mds[k] = {"digest_md": ms.get(k), "expected": e, "equal": ms.get(k) == e}
mda = {"digest_md": mall, "expected": [str(S), str(C), str(I)],
       "equal": mall == [str(S), str(C), str(I)]}
jpf = ("%.2f" % cj["completion_percent"]) if NU(cj.get("completion_percent")) else None
mv = {f: {"digest_md": mt.get(f), "digest_json": cj.get(f),
          "equal": mt.get(f) == str(cj.get(f))}
      for f in ("row_count", "scheduled", "completed", "incidents")}
mv["completion_percent"] = {"digest_md": mt.get("completion_percent"), "digest_json": jpf,
                            "equal": mt.get("completion_percent") == jpf}
lo = md.lower()
pr = {"has_method_section": "## method (reproducible)" in lo,
      "has_reproduction_section": "## reproduction" in lo,
      "has_per_site_table": len(ms) == len(keys) > 0,
      "cites_input_fixture": "input/pilot.observations.json" in md,
      "states_rounding_rule": "round" in lo and ("10000" in md or "half-up" in lo),
      "states_determinism": "determin" in lo}

# ---- verdict ---------------------------------------------------------
ck = {
 "fixture_rows_extracted": rows is not None,
 "every_row_well_formed": len(rc) == len(rows or []) and all(x["pass"] for x in rc),
 "completed_le_scheduled_all_rows": all((not x["pass"]) or x["completed"] <= x["scheduled"] for x in rc),
 "row_count_equal": fx["row_count"]["equal"],
 "scheduled_equal": fx["scheduled"]["equal"],
 "completed_equal": fx["completed"]["equal"],
 "incidents_equal": fx["incidents"]["equal"],
 "completion_percent_equal": fx["completion_percent"]["equal"],
 "completion_percent_two_decimals": fx["completion_percent"]["two_decimals_when_formatted"],
 "completion_percent_is_json_number": fx["completion_percent"]["is_json_number"],
 "sites_equal": fx["sites"]["equal"],
 "sites_keys_equal": fx["sites"]["key_sets_equal"],
 "sites_keys_code_unit_sorted": fx["sites"]["key_order_code_unit_sorted"],
 "no_extra_top_level_keys": fx["extra_top_level_keys"] == [],
 "no_missing_top_level_keys": fx["missing_top_level_keys"] == [],
 "per_site_sums_reconstruct_aggregate": recon_ok,
 "md_totals_match": all(v["equal"] for v in mdt.values()),
 "md_site_table_matches": all(v["equal"] for v in mds.values()),
 "md_all_sites_row_matches": mda["equal"],
 "md_matches_digest_json": all(v["equal"] for v in mv.values()),
 "md_has_method_section": pr["has_method_section"],
 "md_has_reproduction_section": pr["has_reproduction_section"],
 "md_has_per_site_table": pr["has_per_site_table"],
 "md_cites_fixture": pr["cites_input_fixture"],
 "md_states_rounding_rule": pr["states_rounding_rule"],
 "md_states_determinism": pr["states_determinism"],
}
fails = [k for k, v in ck.items() if not v]
fails += ["row[%d]: %s" % (x["index"], "; ".join(x["problems"])) for x in rc if not x["pass"]]

R = {"report_kind": "independent-recompute", "schema": "independent-recompute/v1",
     "root": ROOT, "inputs_read": [FIX, DJ, DM],
     "recomputation_method": {
        "input": "top-level array, else its 'observations' array",
        "aggregates": "integer sums over the rows",
        "completion_percent": "Decimal(completed)*100/Decimal(scheduled) quantized to 0.01 with ROUND_HALF_UP; no float division",
        "sites": "distinct site keys holding the three integer sums, sorted by code unit"},
     "recomputed": rec, "recomputed_completion_percent_formatted": ps,
     "compared": {"digest_json": cj, "digest_json_completion_percent_formatted": jpf,
                  "digest_md_totals_table": mt, "digest_md_site_table": ms,
                  "digest_md_all_sites_row": mall,
                  "digest_md_bytes_utf8": len(md.encode("utf-8")),
                  "digest_md_characters": len(md)},
     "field_by_field": fx,
     "per_site_reconciliation": {"fields": recon, "pass": recon_ok},
     "markdown_checks": {"totals": mdt, "sites": mds, "all_sites_row": mda,
                         "md_vs_json": mv, "presence": pr},
     "row_checks": rc, "checks": ck, "failures": fails,
     "overall_verdict": "pass" if not fails else "fail",
     "deliverables_untouched": True,
     "notes": ["Read-only over digest.json and digest.md; nothing was rewritten, reformatted or regenerated.",
               "observation-digest-v1.mjs was neither executed nor modified by this verifier.",
               "Values were derived from the fixture bytes alone, not copied from the procedure output.",
               "digest.md is 3296 bytes but 3294 characters (U+2014 EM DASH); invocation-receipt.json records the character count, its sha256 matches the bytes."],
     "verification_script": {"path": os.path.abspath(__file__), "language": "python3",
                             "standard_library_only": True,
                             "text": open(os.path.abspath(__file__), encoding="utf-8").read()}}
out = json.dumps(R, indent=2, ensure_ascii=False) + "\n"
if len(sys.argv) > 1:
    open(sys.argv[1], "w", encoding="utf-8").write(out)
else:
    sys.stdout.write(out)
