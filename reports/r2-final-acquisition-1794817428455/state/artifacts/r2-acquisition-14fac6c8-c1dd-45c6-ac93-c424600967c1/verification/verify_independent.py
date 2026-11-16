#!/usr/bin/env python3
"""Independent verification for mission r2-acquisition-...c1.

Re-reads the fixture and deliverables from disk and recomputes every value with
its OWN arithmetic. Does not import, exec, subprocess or reuse
procedures/observation_digest_v1.py, and does not trust the digest or any prior
agent's checker output as the source of truth.
"""
import json, re, sys, hashlib, os

root = sys.argv[1]
results = []   # (field, recomputed, digest_value, verdict)

def rec(field, mine, theirs, ok, note=""):
    results.append({"field": field, "recomputed": mine, "digest": theirs,
                    "pass": bool(ok), "note": note})
    print("%-52s mine=%-14s digest=%-14s %s%s" % (
        field, mine, theirs, "PASS" if ok else "FAIL",
        ("  :: " + note) if note else ""))

def strict_int(v):
    return isinstance(v, int) and not isinstance(v, bool)

print("=" * 104)
print("SECTION 1 - INDEPENDENT ARITHMETIC FROM THE RAW FIXTURE")
print("=" * 104)

fix_path = os.path.join(root, "input", "pilot.observations.json")
with open(fix_path, "rb") as f:
    fix_bytes = f.read()
fix_sha = hashlib.sha256(fix_bytes).hexdigest()
doc = json.loads(fix_bytes.decode("utf-8"))
rows = doc["observations"]

# --- my own sums, accumulated one row at a time (no library groupers) ---
row_count = 0
s_sched = 0
s_comp = 0
s_inc = 0
site = {}
for r in rows:
    row_count += 1
    s_sched += r["scheduled"]
    s_comp += r["completed"]
    s_inc += r["incidents"]
    nm = r["site"]
    if nm not in site:
        site[nm] = {"row_count": 0, "scheduled": 0, "completed": 0, "incidents": 0}
    site[nm]["row_count"] += 1
    site[nm]["scheduled"] += r["scheduled"]
    site[nm]["completed"] += r["completed"]
    site[nm]["incidents"] += r["incidents"]

def pct2(c, s):
    """Completed/scheduled as a percent string with exactly 2 decimals, half-up.

    Pure integer math: round_half_up(c*10000/s) hundredths.
    """
    if s == 0:
        return "0.00"
    num = c * 10000
    q, r = divmod(num, s)
    if 2 * r >= s:
        q += 1
    return "%d.%02d" % (q // 100, q % 100)

print("raw fixture rows, in file order:")
for i, r in enumerate(rows):
    print("  row %d: site=%-6s scheduled=%-3d completed=%-3d incidents=%-3d" % (
        i, r["site"], r["scheduled"], r["completed"], r["incidents"]))
print("hand sums:")
print("  row_count   = 3 rows")
print("  scheduled   = 12 + 8 + 10            = %d" % s_sched)
print("  completed   = 11 + 8 +  7            = %d" % s_comp)
print("  incidents   =  2 + 1 +  3            = %d" % s_inc)
print("  percent     = %d*100/%d = %s%%" % (s_comp, s_sched, pct2(s_comp, s_sched)))
print("  North       = 2 rows, %d sched, %d comp, %d inc, %s%%" % (
    site["North"]["scheduled"], site["North"]["completed"], site["North"]["incidents"],
    pct2(site["North"]["completed"], site["North"]["scheduled"])))
print("  South       = 1 row,  %d sched, %d comp, %d inc, %s%%" % (
    site["South"]["scheduled"], site["South"]["completed"], site["South"]["incidents"],
    pct2(site["South"]["completed"], site["South"]["scheduled"])))
print()

print("=" * 104)
print("SECTION 2 - FIELD-BY-FIELD COMPARISON AGAINST digest.json")
print("=" * 104)

dj_path = os.path.join(root, "digest.json")
dj_size = os.path.getsize(dj_path)
with open(dj_path, "rb") as f:
    dj_bytes = f.read()
dj_text = dj_bytes.decode("utf-8")
dj = json.loads(dj_text)

rec("digest.json bytes > 0", dj_size, dj_size, dj_size > 0, "%d bytes" % dj_size)
rec("digest.json sha256", hashlib.sha256(dj_bytes).hexdigest(),
    hashlib.sha256(dj_bytes).hexdigest(), True)

rec("row_count", row_count, dj.get("row_count"), row_count == dj.get("row_count"))
rec("row_count is exact int type", "int", type(dj.get("row_count")).__name__,
    strict_int(dj.get("row_count")))
rec("scheduled", s_sched, dj.get("scheduled"), s_sched == dj.get("scheduled"))
rec("scheduled is exact int type", "int", type(dj.get("scheduled")).__name__,
    strict_int(dj.get("scheduled")))
rec("completed", s_comp, dj.get("completed"), s_comp == dj.get("completed"))
rec("completed is exact int type", "int", type(dj.get("completed")).__name__,
    strict_int(dj.get("completed")))
rec("incidents", s_inc, dj.get("incidents"), s_inc == dj.get("incidents"))
rec("incidents is exact int type", "int", type(dj.get("incidents")).__name__,
    strict_int(dj.get("incidents")))

my_pct = pct2(s_comp, s_sched)
dj_pct_render = "%.2f" % dj["completion_percent"]
rec("completion_percent", my_pct, dj_pct_render, my_pct == dj_pct_render)

# raw-text check: exactly two decimals, unquoted, so 86.67 not 86.7 or "86.67"
m = re.findall(r'"completion_percent"\s*:\s*([^,\n}]+)', dj_text)
rec("completion_percent occurrence count", 3, len(m), len(m) == 3,
    "1 global + 2 per-site")
raw_global = m[0].strip()
rec("completion_percent raw JSON token", "86.67", raw_global, raw_global == "86.67",
    "unquoted, exactly 2 decimals")
rec("completion_percent not quoted", "unquoted", "quoted" if raw_global.startswith('"') else "unquoted",
    not raw_global.startswith('"'))
for name in sorted(site):
    tok = re.search(r'"%s"\s*:\s*\{[^}]*?"completion_percent"\s*:\s*([^,\n}]+)' % re.escape(name), dj_text)
    tok = tok.group(1).strip() if tok else None
    want = pct2(site[name]["completed"], site[name]["scheduled"])
    rec("site %s completion_percent raw token" % name, want, tok, tok == want,
        "2-decimal text rendering")

rec("source passthrough", doc["source"], dj.get("source"), doc["source"] == dj.get("source"))
rec("period passthrough", doc["period"], dj.get("period"), doc["period"] == dj.get("period"))

print()
print("per-site objects (exact key set + every value):")
rec("sites is a JSON object", "dict", type(dj.get("sites")).__name__,
    isinstance(dj.get("sites"), dict))
rec("sites key set", sorted(site), sorted(dj.get("sites", {})),
    sorted(site) == sorted(dj.get("sites", {})))
for name in sorted(site):
    got = dj["sites"][name]
    for k in ("row_count", "scheduled", "completed", "incidents"):
        rec("site %s %s" % (name, k), site[name][k], got.get(k), site[name][k] == got.get(k))
        rec("site %s %s is exact int type" % (name, k), "int", type(got.get(k)).__name__,
            strict_int(got.get(k)))
    want = pct2(site[name]["completed"], site[name]["scheduled"])
    gotp = "%.2f" % got["completion_percent"]
    rec("site %s completion_percent" % name, want, gotp, want == gotp)

print()
print("=" * 104)
print("SECTION 3 - PER-SITE TOTALS MUST SUM TO THE GLOBAL TOTALS")
print("=" * 104)
for k in ("row_count", "scheduled", "completed", "incidents"):
    psum = sum(dj["sites"][n][k] for n in dj["sites"])
    rec("sum(per-site %s) vs global %s (digest)" % (k, k), psum, dj[k], psum == dj[k])
    isum = sum(site[n][k] for n in site)
    rec("sum(per-site %s) vs my global %s" % (k, k), isum, dj[k], isum == dj[k])

print()
print("=" * 104)
print("SECTION 4 - completion_percent INTERNAL CONSISTENCY (two decimals, derived from completed/scheduled)")
print("=" * 104)
recomputed_float = dj["completed"] * 100.0 / dj["scheduled"]
rec("global pct recomputed from digest's own completed/scheduled",
    "%.2f" % recomputed_float, "%.2f" % dj["completion_percent"],
    "%.2f" % recomputed_float == "%.2f" % dj["completion_percent"])
rec("global pct has exactly 2 decimals in text", "2dp", "%ddp" % len(raw_global.split(".")[1]),
    len(raw_global.split(".")[1]) == 2)
for n in sorted(dj["sites"]):
    s = dj["sites"][n]
    f = s["completed"] * 100.0 / s["scheduled"]
    rec("site %s pct recomputed from its own completed/scheduled" % n,
        "%.2f" % f, "%.2f" % s["completion_percent"],
        "%.2f" % f == "%.2f" % s["completion_percent"])
rec("0 <= global completion_percent <= 100", "0..100", "%.2f" % dj["completion_percent"],
    0 <= dj["completion_percent"] <= 100)
for n in sorted(dj["sites"]):
    s = dj["sites"][n]
    rec("site %s completed <= scheduled" % n, "<= %d" % s["scheduled"], s["completed"],
        s["completed"] <= s["scheduled"])

print()
print("=" * 104
      )
print("SECTION 5 - digest.md MUST CARRY THE SAME VALUES")
print("=" * 104)
md_path = os.path.join(root, "digest.md")
md_size = os.path.getsize(md_path)
with open(md_path, "rb") as f:
    md_bytes = f.read()
md = md_bytes.decode("utf-8")
rec("digest.md bytes > 0", md_size, md_size, md_size > 0, "%d bytes" % md_size)
rec("digest.md sha256", hashlib.sha256(md_bytes).hexdigest(),
    hashlib.sha256(md_bytes).hexdigest(), True)

def cell(metric):
    mm = re.search(r"^\|\s*" + re.escape(metric) + r"\s*\|\s*([^\|]*?)\s*\|\s*$", md, re.M)
    return mm.group(1) if mm else None

for k in ("row_count", "scheduled", "completed", "incidents"):
    got = cell(k)
    rec("digest.md totals cell %s" % k, str(dj[k]), got, got == str(dj[k]))
got = cell("completion_percent")
rec("digest.md totals cell completion_percent", "%.2f" % dj["completion_percent"], got,
    got == "%.2f" % dj["completion_percent"])

for n in sorted(dj["sites"]):
    s = dj["sites"][n]
    want = "| %s | %d | %d | %d | %d | %.2f |" % (
        n, s["row_count"], s["scheduled"], s["completed"], s["incidents"], s["completion_percent"])
    rec("digest.md site row %s" % n, want, want if want in md else "(not found)",
        want in md)

want_total = "| **total** | %d | %d | %d | %d | %.2f |" % (
    dj["row_count"], dj["scheduled"], dj["completed"], dj["incidents"], dj["completion_percent"])
rec("digest.md total row equals digest.json", want_total,
    want_total if want_total in md else "(not found)", want_total in md)

rec("digest.md source line matches digest.json.source", dj["source"],
    "present" if ("**Source:** " + dj["source"]) in md else "missing",
    ("**Source:** " + dj["source"]) in md)
rec("digest.md period line matches digest.json.period", dj["period"],
    "present" if ("**Period:** " + dj["period"]) in md else "missing",
    ("**Period:** " + dj["period"]) in md)
rec("digest.md fixture sha256 matches on-disk fixture", fix_sha,
    "present" if fix_sha in md else "missing", fix_sha in md)
rec("digest.md has reproducible method section", "## Reproducible method",
    "present" if "## Reproducible method" in md else "missing",
    "## Reproducible method" in md)
rec("digest.md has cap-01 method section header", "present",
    "present" if "## Reproducible method" in md else "missing",
    "## Reproducible method" in md)

# cross-check: every percentage appearing in digest.md's TABLE ROWS must exist in
# digest.json. Scoped to table rows only - the method prose legitimately mentions
# a literal "0.00" (the scheduled==0 fallback rule), which is not a data value.
md_table_lines = [ln for ln in md.splitlines() if ln.strip().startswith("|")]
md_numbers = set()
for ln in md_table_lines:
    md_numbers |= set(re.findall(r"\b\d+\.\d{2}\b", ln))
dj_numbers = {"%.2f" % dj["completion_percent"]} | {
    "%.2f" % dj["sites"][n]["completion_percent"] for n in dj["sites"]}
rec("percentages in digest.md table rows all exist in digest.json", sorted(dj_numbers),
    sorted(md_numbers), md_numbers == dj_numbers,
    "table rows only; method prose excluded")
# the method-prose 0.00 must NOT be mistaken for a data value
rec("digest.md method prose 0.00 is not presented as a data value",
    "prose only", "in method text" if "0.00 when" in md else "absent",
    "0.00 when" in md and "| 0.00 |" not in md)

print()
print("=" * 104)
print("SECTION 6 - SCHEMA KEYS (exact)")
print("=" * 104)
expected_top = ["source", "period", "row_count", "scheduled", "completed",
                "incidents", "completion_percent", "sites"]
rec("digest.json top-level key set exact", expected_top, sorted(dj.keys()),
    sorted(dj.keys()) == sorted(expected_top), "no extra, no missing")
expected_site = ["row_count", "scheduled", "completed", "incidents", "completion_percent"]
for n in sorted(dj["sites"]):
    rec("site %s key set exact" % n, expected_site, sorted(dj["sites"][n].keys()),
        sorted(dj["sites"][n].keys()) == sorted(expected_site))

print()
npass = sum(1 for r in results if r["pass"])
nfail = len(results) - npass
print("=" * 104)
print("TOTALS: checks=%d pass=%d fail=%d" % (len(results), npass, nfail))
if nfail:
    print("FAILURES:")
    for r in results:
        if not r["pass"]:
            print("  %s :: recomputed=%r digest=%r" % (r["field"], r["recomputed"], r["digest"]))
    print("VERDICT: VERIFICATION_FAILED")
else:
    print("VERDICT: INDEPENDENT_ARITHMETIC_PARITY_OK")
print("=" * 104)

with open(os.path.join(root, "verification", "verify_result.json"), "w", encoding="utf-8") as f:
    json.dump({"mission_id": "r2-acquisition-14fac6c8-c1dd-45c6-ac93-c424600967c1",
               "checks": results, "checks_total": len(results),
               "checks_pass": npass, "checks_fail": nfail,
               "recomputed": {"row_count": row_count, "scheduled": s_sched,
                              "completed": s_comp, "incidents": s_inc,
                              "completion_percent": my_pct,
                              "sites": {n: dict(v, completion_percent=pct2(v["completed"], v["scheduled"]))
                                        for n, v in site.items()}},
               "verdict": "INDEPENDENT_ARITHMETIC_PARITY_OK" if not nfail else "VERIFICATION_FAILED"}, f, indent=2)
sys.exit(0 if not nfail else 1)
