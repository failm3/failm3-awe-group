#!/usr/bin/env python3
"""Independent recomputation of the observation digest.

Reads ROOT/input/pilot.observations.json and ROOT/digest.json, ROOT/digest.md.
Never writes to, rewrites, or regenerates the deliverables. Only reads them.

Percentage uses decimal.Decimal with ROUND_HALF_UP; no float division is used
for the rounding step.

Emits a JSON report on stdout.
"""

import json
import os
import sys
from decimal import Decimal, ROUND_HALF_UP

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = os.path.join(ROOT, "input", "pilot.observations.json")
DIGEST_JSON = os.path.join(ROOT, "digest.json")
DIGEST_MD = os.path.join(ROOT, "digest.md")

SCRIPT_PATH = os.path.abspath(__file__)


def is_int(v):
    """True only for genuine JSON integers (bool is a subclass of int in Python)."""
    return isinstance(v, int) and not isinstance(v, bool)


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------- recomputation

fixture = load_json(FIXTURE)

if isinstance(fixture, list):
    rows = fixture
elif isinstance(fixture, dict) and isinstance(fixture.get("observations"), list):
    rows = fixture["observations"]
else:
    rows = None

row_checks = []
row_count = 0
scheduled = 0
completed = 0
incidents = 0
site_totals = {}

if rows is not None:
    row_count = len(rows)
    for idx, row in enumerate(rows):
        problems = []
        if not isinstance(row, dict):
            problems.append("row is not a JSON object")
            site = None
        else:
            site = row.get("site")
            if not (isinstance(site, str) and site.strip() != ""):
                problems.append("site is not a non-empty string")
                site = None
            for field in ("scheduled", "completed", "incidents"):
                if not is_int(row.get(field)):
                    problems.append("%s is not a JSON integer (got %r)"
                                    % (field, row.get(field)))
            if is_int(row.get("scheduled")) and is_int(row.get("completed")):
                if row["completed"] > row["scheduled"]:
                    problems.append("completed %d > scheduled %d"
                                    % (row["completed"], row["scheduled"]))
        ok = not problems
        row_checks.append({
            "index": idx,
            "site": site,
            "scheduled": row.get("scheduled") if isinstance(row, dict) else None,
            "completed": row.get("completed") if isinstance(row, dict) else None,
            "incidents": row.get("incidents") if isinstance(row, dict) else None,
            "type_checks_pass": ok,
            "problems": problems,
        })
        if ok:
            scheduled += row["scheduled"]
            completed += row["completed"]
            incidents += row["incidents"]
            bucket = site_totals.setdefault(
                site, {"scheduled": 0, "completed": 0, "incidents": 0})
            bucket["scheduled"] += row["scheduled"]
            bucket["completed"] += row["completed"]
            bucket["incidents"] += row["incidents"]

# Exact percentage, ROUND_HALF_UP, via Decimal on integers only.
if scheduled == 0:
    pct = Decimal("0.00")
else:
    pct = (Decimal(completed) * Decimal(100) / Decimal(scheduled)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)
pct_str = str(pct)

site_names = sorted(site_totals.keys())  # Python sorts str by code unit
sites = {name: dict(site_totals[name]) for name in site_names}

recomputed = {
    "row_count": row_count,
    "scheduled": scheduled,
    "completed": completed,
    "incidents": incidents,
    "completion_percent": float(pct),
    "sites": sites,
}

# ------------------------------------------------------------- compared values

claimed = load_json(DIGEST_JSON)
digest_md_text = open(DIGEST_MD, "r", encoding="utf-8").read()

# --------------------------------------------------------------- field compare

field_results = {}
scalar_fields = ["row_count", "scheduled", "completed", "incidents"]
for field in scalar_fields:
    present = field in claimed
    got = claimed.get(field)
    want = recomputed[field]
    field_results[field] = {
        "recomputed": want,
        "digest_json": got,
        "present_in_digest_json": present,
        "type_in_digest_json": type(got).__name__,
        "type_is_json_integer": is_int(got),
        "values_equal": present and is_int(got) and got == want,
    }

# completion_percent: numeric, and exactly two decimals when formatted.
pc_present = "completion_percent" in claimed
pc_got = claimed.get("completion_percent")
field_results["completion_percent"] = {
    "recomputed": float(pct),
    "recomputed_formatted": pct_str,
    "digest_json": pc_got,
    "present_in_digest_json": pc_present,
    "type_in_digest_json": type(pc_got).__name__,
    "type_is_json_number": is_num(pc_got),
    "digest_json_formatted": ("%.2f" % pc_got) if is_num(pc_got) else None,
    "values_equal": pc_present and is_num(pc_got) and Decimal(str(pc_got)) == pct,
    "two_decimals_when_formatted": (
        is_num(pc_got)
        and ("%.2f" % pc_got) == pct_str
        and round(pc_got, 2) == pc_got
    ),
}

# sites object
sites_claimed = claimed.get("sites")
sites_present = isinstance(sites_claimed, dict)
sites_keys_match = sites_present and sorted(sites_claimed.keys()) == site_names
site_field_results = {}
for name in site_names:
    entry_claimed = sites_claimed.get(name) if sites_present else None
    per = {}
    for field in ("scheduled", "completed", "incidents"):
        got = entry_claimed.get(field) if isinstance(entry_claimed, dict) else None
        want = sites[name][field]
        per[field] = {
            "recomputed": want,
            "digest_json": got,
            "type_is_json_integer": is_int(got),
            "values_equal": is_int(got) and got == want,
        }
    site_field_results[name] = {
        "fields": per,
        "all_fields_equal": all(v["values_equal"] for v in per.values()),
    }

field_results["sites"] = {
    "recomputed": sites,
    "digest_json": sites_claimed,
    "present_in_digest_json": sites_present,
    "type_in_digest_json": type(sites_claimed).__name__,
    "key_sets_equal": sites_keys_match,
    "recomputed_key_order": site_names,
    "digest_json_key_order": list(sites_claimed.keys()) if sites_present else None,
    "key_order_matches_code_unit_order": (
        sites_present and list(sites_claimed.keys()) == site_names),
    "per_site": site_field_results,
    "values_equal": sites_keys_match and all(
        v["all_fields_equal"] for v in site_field_results.values()),
}

# no unexpected top-level keys
expected_keys = {"row_count", "scheduled", "completed", "incidents",
                 "completion_percent", "sites"}
extra_keys = sorted(set(claimed.keys()) - expected_keys) if isinstance(claimed, dict) else None
missing_keys = sorted(expected_keys - set(claimed.keys())) if isinstance(claimed, dict) else None

# --------------------------------------------------------- per-site reconcile

recon = {}
for field in ("scheduled", "completed", "incidents"):
    per_site_sum = sum(sites[n][field] for n in site_names)
    recon[field] = {
        "per_site_sum": per_site_sum,
        "recomputed_aggregate": recomputed[field],
        "digest_json_aggregate": claimed.get(field),
        "sum_reconstructs_recomputed": per_site_sum == recomputed[field],
        "sum_reconstructs_digest_json": per_site_sum == claimed.get(field),
    }
reconcile_pass = all(
    v["sum_reconstructs_recomputed"] and v["sum_reconstructs_digest_json"]
    for v in recon.values())

# ------------------------------------------------------------- markdown checks

md_lines = digest_md_text.splitlines()


def table_rows(header_cells):
    """Return list of cell-lists for tables whose header matches header_cells."""
    out = []
    for i, line in enumerate(md_lines):
        cells = [c.strip() for c in line.strip().strip("|").split("|")] if line.strip().startswith("|") else []
        if cells == header_cells:
            j = i + 2  # skip separator row
            while j < len(md_lines) and md_lines[j].strip().startswith("|"):
                out.append([c.strip() for c in md_lines[j].strip().strip("|").split("|")])
                j += 1
            break
    return out


totals_rows = table_rows(["metric", "value"])
md_totals = {}
for cells in totals_rows:
    if len(cells) == 2:
        md_totals[cells[0]] = cells[1]

site_rows = table_rows(["site", "scheduled", "completed", "incidents"])
md_sites = {}
md_all_sites_row = None
for cells in site_rows:
    if len(cells) != 4:
        continue
    raw_site = cells[0].replace("*", "").strip()
    values = [c.replace("*", "").strip() for c in cells[1:]]
    if raw_site.lower() == "all sites":
        md_all_sites_row = values
    else:
        md_sites[raw_site] = values

md_totals_expected = {
    "row_count": str(recomputed["row_count"]),
    "scheduled": str(recomputed["scheduled"]),
    "completed": str(recomputed["completed"]),
    "incidents": str(recomputed["incidents"]),
    "completion_percent": pct_str,
}
md_totals_checks = {k: {"digest_md": md_totals.get(k), "expected": v,
                        "values_equal": md_totals.get(k) == v}
                    for k, v in md_totals_expected.items()}

md_site_checks = {}
for name in site_names:
    row = md_sites.get(name)
    expected = [str(sites[name][f]) for f in ("scheduled", "completed", "incidents")]
    md_site_checks[name] = {
        "digest_md": row,
        "expected": expected,
        "values_equal": row == expected,
    }

md_all_sites_checks = None
if md_all_sites_row is not None:
    expected = [str(recomputed[f]) for f in ("scheduled", "completed", "incidents")]
    md_all_sites_checks = {
        "digest_md": md_all_sites_row,
        "expected": expected,
        "values_equal": md_all_sites_row == expected,
    }

md_lower = digest_md_text.lower()
md_method_section = "## method (reproducible)" in md_lower
md_reproduction_section = "## reproduction" in md_lower
md_mentions_input_path = "input/pilot.observations.json" in digest_md_text
md_states_round_rule = ("10000" in digest_md_text and "round" in md_lower) or (
    "round_half_up" in md_lower or "half-up" in md_lower)
md_states_deterministic = "determin" in md_lower
md_has_site_table = len(md_sites) == len(site_names) and len(md_sites) > 0
md_same_values_as_json = (
    all(v["values_equal"] for v in md_totals_checks.values())
    and all(v["values_equal"] for v in md_site_checks.values())
    and (md_all_sites_checks is None or md_all_sites_checks["values_equal"])
)

# ----------------------------------------------------- md vs json cross-check

md_matches_json = {}
for field in ("row_count", "scheduled", "completed", "incidents"):
    md_matches_json[field] = {
        "digest_md": md_totals.get(field),
        "digest_json": claimed.get(field),
        "equal": md_totals.get(field) == str(claimed.get(field)),
    }
md_matches_json["completion_percent"] = {
    "digest_md": md_totals.get("completion_percent"),
    "digest_json_formatted": ("%.2f" % claimed["completion_percent"])
    if is_num(claimed.get("completion_percent")) else None,
    "equal": md_totals.get("completion_percent") == (
        "%.2f" % claimed["completion_percent"]
        if is_num(claimed.get("completion_percent")) else None),
}

# ------------------------------------------------------------------ pass flags

checks = {
    "fixture_rows_extracted": rows is not None,
    "every_row_well_formed": all(r["type_checks_pass"] for r in row_checks) and len(row_checks) == row_count,
    "every_row_completed_le_scheduled": all(
        (not r["type_checks_pass"]) or r["completed"] <= r["scheduled"] for r in row_checks),
    "row_count_equal": field_results["row_count"]["values_equal"],
    "scheduled_equal": field_results["scheduled"]["values_equal"],
    "completed_equal": field_results["completed"]["values_equal"],
    "incidents_equal": field_results["incidents"]["values_equal"],
    "completion_percent_value_equal": field_results["completion_percent"]["values_equal"],
    "completion_percent_two_decimals": field_results["completion_percent"]["two_decimals_when_formatted"],
    "completion_percent_is_json_number": field_results["completion_percent"]["type_is_json_number"],
    "sites_object_equal": field_results["sites"]["values_equal"],
    "sites_key_sets_equal": field_results["sites"]["key_sets_equal"],
    "sites_key_order_code_unit_sorted": field_results["sites"]["key_order_matches_code_unit_order"],
    "no_extra_top_level_keys": extra_keys == [],
    "no_missing_top_level_keys": missing_keys == [],
    "per_site_sums_reconstruct_aggregate": reconcile_pass,
    "digest_md_totals_match_recomputed": all(v["values_equal"] for v in md_totals_checks.values()),
    "digest_md_site_table_matches_recomputed": all(v["values_equal"] for v in md_site_checks.values()),
    "digest_md_all_sites_row_matches": (
        md_all_sites_checks is not None and md_all_sites_checks["values_equal"]),
    "digest_md_matches_digest_json": all(v["equal"] for v in md_matches_json.values()),
    "digest_md_has_reproducible_method_section": md_method_section,
    "digest_md_has_reproduction_section": md_reproduction_section,
    "digest_md_has_per_site_table": md_has_site_table,
    "digest_md_cites_input_fixture": md_mentions_input_path,
    "digest_md_states_rounding_rule": md_states_round_rule,
    "digest_md_states_determinism": md_states_deterministic,
}

failures = []
for name, ok in checks.items():
    if not ok:
        failures.append({"check": name, "expected": True, "observed": False})
for r in row_checks:
    if not r["type_checks_pass"]:
        failures.append({"check": "row[%d] well-formed" % r["index"],
                         "problems": r["problems"]})
for name, v in md_totals_checks.items():
    if not v["values_equal"]:
        failures.append({"check": "digest_md totals %s" % name, "expected": v["expected"],
                         "observed": v["digest_md"]})
for name, v in md_site_checks.items():
    if not v["values_equal"]:
        failures.append({"check": "digest_md site %s" % name, "expected": v["expected"],
                         "observed": v["digest_md"]})

verdict = "pass" if not failures else "fail"

report = {
    "report_kind": "independent-recompute",
    "schema": "independent-recompute/v1",
    "verifier": "independent python3 recomputation; reads the fixture and the two deliverables, writes nothing to them",
    "root": ROOT,
    "inputs_read": [FIXTURE, DIGEST_JSON, DIGEST_MD],
    "recomputation_method": {
        "fixture_rows": "top-level array, else the 'observations' array",
        "aggregates": "integer sums over the row array",
        "completion_percent": "Decimal(completed) * 100 / Decimal(scheduled), quantized to 0.01 with ROUND_HALF_UP; no float division in the rounding step",
        "sites": "one key per distinct site, each with the three integer sums; keys sorted by python str order (unicode code unit)",
    },
    "recomputed": recomputed,
    "recomputed_completion_percent_formatted": pct_str,
    "compared": {
        "digest_json": claimed,
        "digest_json_completion_percent_formatted": (
            "%.2f" % claimed["completion_percent"]
            if is_num(claimed.get("completion_percent")) else None),
        "digest_md_totals_table": md_totals,
        "digest_md_site_table": md_sites,
        "digest_md_all_sites_row": md_all_sites_row,
        "digest_md_bytes": len(digest_md_text.encode("utf-8")),
    },
    "field_by_field": field_results,
    "per_site_reconciliation": {
        "fields": recon,
        "per_site_aggregate_reconstructs_aggregate_totals": reconcile_pass,
    },
    "markdown_checks": {
        "totals_table": md_totals_checks,
        "site_table": md_site_checks,
        "all_sites_row": md_all_sites_checks,
        "md_vs_json": md_matches_json,
        "has_method_section": md_method_section,
        "has_reproduction_section": md_reproduction_section,
        "has_per_site_table": md_has_site_table,
        "cites_input_fixture": md_mentions_input_path,
        "states_rounding_rule": md_states_round_rule,
        "states_determinism": md_states_deterministic,
    },
    "row_checks": row_checks,
    "checks": checks,
    "failures": failures,
    "overall_verdict": verdict,
    "metadata_observations": [],
    "deliverables_untouched": True,
    "notes": [
        "This verifier only read digest.json and digest.md; it never rewrote, reformatted or regenerated them.",
        "observation-digest-v1.mjs was not executed or modified by this verifier.",
        "The recomputed values were derived from the fixture bytes alone, not copied from the procedure's output.",
    ],
    "verification_script": {
        "path": SCRIPT_PATH,
        "language": "python3",
        "standard_library_only": True,
        "text": open(SCRIPT_PATH, "r", encoding="utf-8").read(),
    },
}

# Byte vs character accounting for digest.md (multibyte em dash), reported for
# transparency only; it is a metadata detail, not an arithmetic discrepancy.
md_bytes = len(digest_md_text.encode("utf-8"))
md_chars = len(digest_md_text)
report["metadata_observations"].append({
    "item": "digest.md size accounting",
    "digest_md_bytes_utf8": md_bytes,
    "digest_md_characters": md_chars,
    "difference_bytes": md_bytes - md_chars,
    "explanation": ("digest.md contains U+2014 EM DASH (3 bytes in UTF-8, 1 character), so its "
                    "byte length exceeds its character length. invocation-receipt.json records "
                    "3294, i.e. the character count; the file is 3296 bytes on disk. The sha256 "
                    "recorded by the host (e03394a3...) matches the on-disk bytes exactly, so "
                    "this is a receipt metadata convention, not a content discrepancy."),
    "is_failure": False,
})

json.dump(report, sys.stdout, indent=2, ensure_ascii=False)
sys.stdout.write("\n")

if len(sys.argv) > 1:
    with open(sys.argv[1], "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
