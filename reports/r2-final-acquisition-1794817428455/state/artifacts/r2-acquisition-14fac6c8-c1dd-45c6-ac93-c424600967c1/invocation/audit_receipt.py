#!/usr/bin/env python3
"""Audit every hash and claim in invocation_receipt.json against actual file bytes."""
import hashlib, json, os, sys
root = sys.argv[1]
r = json.load(open(os.path.join(root, "invocation_receipt.json"), encoding="utf-8"))
fails, n = [], 0
def chk(name, cond, detail=""):
    global n
    n += 1
    print(("PASS  " if cond else "FAIL  ") + name + (("  :: " + str(detail)) if detail and not cond else ""))
    if not cond: fails.append(name)
def sha(rel):
    with open(os.path.join(root, rel), "rb") as f: return hashlib.sha256(f.read()).hexdigest()

for d in r["deliverables"]:
    chk("deliverable %s sha256 matches file" % d["name"], sha(d["path"]) == d["sha256"], sha(d["path"]))
    chk("deliverable %s byte size matches" % d["name"], os.path.getsize(os.path.join(root, d["path"])) == d["bytes"])
    chk("deliverable %s inode matches" % d["name"], os.stat(os.path.join(root, d["path"])).st_ino == d["inode"])

def walk(obj, path="$"):
    if isinstance(obj, dict):
        if set(obj) == {"path", "sha256"}:
            yield path, obj
        else:
            for k, v in obj.items():
                yield from walk(v, path + "." + k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, path + "[%d]" % i)
for p, cap in walk(r):
    rel = cap["path"]
    exists = os.path.exists(os.path.join(root, rel))
    chk("capture %s exists" % rel, exists)
    if exists:
        chk("capture %s sha256" % rel, sha(rel) == cap["sha256"], sha(rel))

chk("procedure sha256_at_invocation matches on-disk source", sha("procedures/observation_digest_v1.py") == r["procedure"]["sha256_at_invocation"])
chk("procedure unchanged at/after invocation", r["procedure"]["sha256_at_invocation"] == r["procedure"]["sha256_after_invocation"])
chk("post-invocation re-hash of source equals receipt value", sha("procedures/observation_digest_v1.py") == r["procedure"]["sha256_after_invocation"])
chk("fixture unchanged", sha("input/pilot.observations.json") == r["scope_compliance"]["input_fixture_sha256_unchanged"])

argv = r["invocation"]["exact_argv"]
compact = json.dumps(argv, separators=(",", ":"), ensure_ascii=True)
chk("argv has exactly 2 elements", len(argv) == 2)
chk("argv[0] is <root>/input/pilot.observations.json", argv[0] == os.path.join(root, "input/pilot.observations.json"))
chk("argv[1] is exactly <root>", argv[1] == root)
chk("argv[1] is not the probe dir", argv[1] != os.path.join(root, "probe/qualification-run-1"))
chk("argv sha256 reproducible from receipt's own argv", hashlib.sha256(compact.encode()).hexdigest() == r["invocation"]["exact_ordered_argv_sha256"], hashlib.sha256(compact.encode()).hexdigest())
chk("argv sha256 equals qualification receipt value", r["invocation"]["exact_ordered_argv_sha256"] == "142a50d06165bf2ab4a0aa6f728d9da9359e79b9d83f965907eb313b32c3eea1")

g = r["qualification_gate"]
chk("preflight observed == qualified source sha256", g["observed_sha256_preflight"] == g["qualified_source_sha256_per_receipt"] == r["procedure"]["sha256_at_invocation"])
chk("gate match flag true", g["match"] is True)
chk("gate was not triggered (no mismatch)", g["gate_was_triggered"] is False)
chk("all three gates match", g["all_three_gates_match"] is True)

chk("exit code 0", r["result"]["exit_code"] == 0)
chk("exit_code capture file agrees", open(os.path.join(root, "invocation/exit_code.txt")).read().strip() == "0")
chk("stderr empty", r["result"]["stderr"] == "")
chk("stdout names root digest.json", os.path.join(root, "digest.json") in r["result"]["stdout"])
chk("stdout names root digest.md", os.path.join(root, "digest.md") in r["result"]["stdout"])
chk("stdout does not name the probe dir", "probe/qualification-run-1" not in r["result"]["stdout"])
chk("single attempt, no retry", r["result"]["attempts"] == 1 and r["result"]["retried"] is False)

dj = json.load(open(os.path.join(root, "digest.json"), encoding="utf-8"))
v = r["digest_values"]
for k in ("row_count", "scheduled", "completed", "incidents", "completion_percent"):
    chk("receipt %s mirrors digest.json" % k, v[k] == dj[k])
chk("receipt sites mirror digest.json sites", v["sites"] == dj["sites"])
chk("row_count numeric and exact 3", isinstance(dj["row_count"], int) and not isinstance(dj["row_count"], bool) and dj["row_count"] == 3)
chk("scheduled numeric and exact 30", isinstance(dj["scheduled"], int) and dj["scheduled"] == 30)
chk("completed numeric and exact 26", isinstance(dj["completed"], int) and dj["completed"] == 26)
chk("incidents numeric and exact 6", isinstance(dj["incidents"], int) and dj["incidents"] == 6)
chk("completion_percent 2dp numeric 86.67", round(float(dj["completion_percent"]), 2) == 86.67)
chk("sites keys are North/South", sorted(dj["sites"]) == ["North", "South"])

f = r["freshness_evidence"]["inode_separation"]
chk("root inodes distinct from probe inodes",
    len({f["root_digest_json_inode"], f["root_digest_md_inode"], f["probe_digest_json_inode"], f["probe_digest_md_inode"]}) == 4)
nro = r["non_reuse_of_probe_output"]
chk("probe digest.json unmodified by this step",
    sha("probe/qualification-run-1/digest.json") == nro["probe_digest_json_sha256_unchanged"])
chk("probe digest.md unmodified by this step",
    sha("probe/qualification-run-1/digest.md") == nro["probe_digest_md_sha256_unchanged"])
chk("probe not used as final output", nro["probe_dir_used_as_final_output"] is False)

s = r["scope_compliance"]
chk("no writes outside mission root", s["writes_outside_mission_root"] is False)
chk("input fixture unmodified", s["input_fixture_modified"] is False)
chk("no network", s["network_used"] is False)
chk("no packages", s["packages_installed"] is False)
chk("no publishing/deployment", s["publishing_or_deployment"] is False)
chk("no external changes", s["external_changes"] is False)

print("\nreceipt_audit_checks=%d failures=%d" % (n, len(fails)))
if fails:
    print("FAILED:", "; ".join(fails)); sys.exit(1)
print("VERDICT: RECEIPT_AUDIT_CLEAN")
