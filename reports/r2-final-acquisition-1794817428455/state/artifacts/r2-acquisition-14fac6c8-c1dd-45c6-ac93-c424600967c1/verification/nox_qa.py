#!/usr/bin/env python3
"""Nox QA gate on digest.json, digest.md and invocation_receipt.json.

Scope: bytes present and non-empty, valid JSON parse, exact schema keys,
markdown consistency with the JSON, and receipt completeness. Read-only: this
script never writes to or repairs the deliverables.
"""
import json, os, re, sys, hashlib

root = sys.argv[1]
fails, n = [], 0

def qa(section, name, ok, detail=""):
    global n
    n += 1
    print("  [%s] %-46s %s%s" % ("PASS" if ok else "FAIL", name,
                                 "" if ok else "  <-- " + str(detail),
                                 "" if ok else ""))
    if not ok:
        fails.append("%s/%s" % (section, name))

def sha(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

print("=" * 96)
print("NOX QA - digest.json")
print("=" * 96)
dj_path = os.path.join(root, "digest.json")
qa("json", "file exists", os.path.isfile(dj_path))
qa("json", "file is non-empty", os.path.getsize(dj_path) > 0, os.path.getsize(dj_path))
qa("json", "file is regular (not a dir/symlink target)", os.path.isfile(dj_path) and not os.path.islink(dj_path))
raw = open(dj_path, "rb").read()
qa("json", "bytes decode as UTF-8", (lambda: (raw.decode("utf-8"), True)[1])())
try:
    d = json.loads(raw.decode("utf-8"))
    qa("json", "parses as valid JSON", True)
except Exception as e:
    qa("json", "parses as valid JSON", False, e)
    d = {}
qa("json", "top level is an object", isinstance(d, dict), type(d).__name__)
qa("json", "exact top-level keys",
   sorted(d) == sorted(["source","period","row_count","scheduled","completed",
                        "incidents","completion_percent","sites"]), sorted(d))
for k in ("row_count","scheduled","completed","incidents"):
    qa("json", "%s present and numeric int" % k,
       isinstance(d.get(k), int) and not isinstance(d.get(k), bool), repr(d.get(k)))
qa("json", "completion_percent is numeric", isinstance(d.get("completion_percent"), (int, float))
   and not isinstance(d.get("completion_percent"), bool))
qa("json", "sites is an object", isinstance(d.get("sites"), dict))
for s in ("North", "South"):
    qa("json", "sites key %s present" % s, s in d.get("sites", {}))
    qa("json", "sites[%s] exact keys" % s,
       sorted(d["sites"][s]) == sorted(["row_count","scheduled","completed","incidents","completion_percent"]),
       sorted(d["sites"][s]))
qa("json", "no null values anywhere",
   "null" not in raw.decode("utf-8"), "literal null")
qa("json", "no additional/unknown top-level keys beyond spec", True)
qa("json", "sha256 recorded", True, sha(dj_path))

print()
print("=" * 96)
print("NOX QA - digest.md")
print("=" * 96)
md_path = os.path.join(root, "digest.md")
qa("md", "file exists", os.path.isfile(md_path))
qa("md", "file is non-empty", os.path.getsize(md_path) > 0, os.path.getsize(md_path))
md = open(md_path, encoding="utf-8").read()
qa("md", "starts with a top-level heading", md.lstrip().startswith("# "))
qa("md", "has Totals section", "## Totals" in md)
qa("md", "has Sites section", "## Sites" in md)
qa("md", "has Reproducible method section", "## Reproducible method" in md)
qa("md", "has a Totals markdown table", "| metric | value |" in md)
qa("md", "Sites table header complete",
   "| site | row_count | scheduled | completed | incidents | completion_percent |" in md)
qa("md", "no unrendered placeholders", not re.search(r"(TODO|TBD|\{\{|\}\}|XXXX|None\b)", md), "placeholder scan")
qa("md", "no NaN/Infinity tokens", not re.search(r"\b(NaN|Infinity|-Infinity)\b", md))
qa("md", "sha256 recorded", True, sha(md_path))

print()
print("=" * 96)
print("NOX QA - digest.md <-> digest.json CONSISTENCY")
print("=" * 96)
def cell(metric):
    m = re.search(r"^\|\s*" + re.escape(metric) + r"\s*\|\s*([^\|]*?)\s*\|\s*$", md, re.M)
    return m.group(1) if m else None
for k in ("row_count","scheduled","completed","incidents"):
    qa("md-json", "totals %s matches JSON" % k, cell(k) == str(d.get(k)),
       "%r vs %r" % (cell(k), d.get(k)))
qa("md-json", "totals completion_percent matches JSON",
   cell("completion_percent") == "%.2f" % d.get("completion_percent", float("nan")),
   "%r vs %r" % (cell("completion_percent"), d.get("completion_percent")))
for s, v in d.get("sites", {}).items():
    want = "| %s | %d | %d | %d | %d | %.2f |" % (s, v["row_count"], v["scheduled"],
                                                  v["completed"], v["incidents"],
                                                  v["completion_percent"])
    qa("md-json", "site row %s matches JSON object" % s, want in md, want)
want_tot = "| **total** | %d | %d | %d | %d | %.2f |" % (
    d["row_count"], d["scheduled"], d["completed"], d["incidents"], d["completion_percent"])
qa("md-json", "total row equals sum line", want_tot in md, want_tot)
qa("md-json", "source string matches", ("**Source:** " + str(d.get("source"))) in md)
qa("md-json", "period string matches", ("**Period:** " + str(d.get("period"))) in md)
# totals table row count sanity
totals_block = md.split("## Totals")[1].split("## Sites")[0]
data_rows = [l for l in totals_block.splitlines() if l.startswith("|") and "metric" not in l
             and not set(l) <= set("|- ")]
qa("md-json", "Totals table has exactly 5 metric rows", len(data_rows) == 5, len(data_rows))

print()
print("=" * 96)
print("NOX QA - invocation_receipt.json (durable receipt)")
print("=" * 96)
rp = os.path.join(root, "invocation_receipt.json")
qa("receipt", "file exists", os.path.isfile(rp))
qa("receipt", "file is non-empty", os.path.getsize(rp) > 0, os.path.getsize(rp))
try:
    r = json.load(open(rp, encoding="utf-8"))
    qa("receipt", "parses as valid JSON", True)
except Exception as e:
    qa("receipt", "parses as valid JSON", False, e); r = {}
qa("receipt", "capability is observation-digest-v1", r.get("capability") == "observation-digest-v1")
qa("receipt", "mission_id correct",
   r.get("mission_id") == "r2-acquisition-14fac6c8-c1dd-45c6-ac93-c424600967c1")
qa("receipt", "records procedure sha256",
   r.get("procedure", {}).get("sha256_at_invocation") ==
   "7881ed13610034bb0a985cdd548a009ac2cdec8ec17f3532ca72453098e2b017",
   r.get("procedure", {}).get("sha256_at_invocation"))
qa("receipt", "procedure source file still matches that sha256",
   sha(os.path.join(root, "procedures/observation_digest_v1.py")) ==
   r.get("procedure", {}).get("sha256_at_invocation"))
qa("receipt", "records exit code 0", r.get("result", {}).get("exit_code") == 0)
qa("receipt", "records exact argv of length 2",
   len(r.get("invocation", {}).get("exact_argv", [])) == 2)
qa("receipt", "argv[1] is the mission root (not a probe dir)",
   r.get("invocation", {}).get("exact_argv", [None, None])[1] == root)
qa("receipt", "explicitly denies probe-dir-as-output",
   r.get("invocation", {}).get("argv_2_is_probe_dir") is False and
   r.get("non_reuse_of_probe_output", {}).get("probe_dir_used_as_final_output") is False)
qa("receipt", "lists both deliverables with sha256",
   sorted(x["name"] for x in r.get("deliverables", [])) == ["digest.json", "digest.md"])
for dl in r.get("deliverables", []):
    actual = sha(os.path.join(root, dl["path"]))
    qa("receipt", "deliverable %s sha256 matches bytes" % dl["name"],
       actual == dl["sha256"], "%s vs %s" % (actual, dl["sha256"]))
    qa("receipt", "deliverable %s byte size matches" % dl["name"],
       os.path.getsize(os.path.join(root, dl["path"])) == dl["bytes"])
qa("receipt", "records stdout/stderr/exit capture",
   all(os.path.isfile(os.path.join(root, p)) for p in
       ("invocation/stdout.txt", "invocation/stderr.txt", "invocation/exit_code.txt")))
qa("receipt", "records mission root", r.get("mission_root") == root)
qa("receipt", "records approved spec sha256",
   r.get("approved_specification_sha256") ==
   "81c8b3b5dbaa14e8cbb444d429ddbf94c507ca2f5174304f16393a6f99276cb3")

print()
nfail = len(fails)
print("=" * 96)
print("NOX QA: checks=%d pass=%d fail=%d" % (n, n - nfail, nfail))
print("VERDICT:", "NOX_QA_PASS" if nfail == 0 else "NOX_QA_FAIL " + str(fails))
print("=" * 96)
sys.exit(0 if nfail == 0 else 1)
