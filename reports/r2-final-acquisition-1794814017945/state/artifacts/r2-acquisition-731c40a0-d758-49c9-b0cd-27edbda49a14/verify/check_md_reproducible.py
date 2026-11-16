#!/usr/bin/env python3
"""Reconstruct the expected digest.md bytes independently from digest.json and
from the documented method, then compare byte-for-byte with the shipped file.

This does not execute the acquired procedure; it re-implements the documented
rendering from the method section so that 'reproducible method' is tested
rather than assumed.
"""
import json
import sys
from decimal import Decimal

json_path, md_path = sys.argv[1], sys.argv[2]
d = json.load(open(json_path, encoding="utf-8"))
sites = d["sites"]
keys = sorted(sites)  # documented: code point order


def f2(v):
    return f"{Decimal(str(v)):.2f}"


L = []
L.append("# Observation Digest")
L.append("")
L.append(f"- Source: {d['source'] if d['source'] is not None else '(unspecified)'}")
L.append(f"- Period: {d['period'] if d['period'] is not None else '(unspecified)'}")
L.append(f"- Input rows: {d['row_count']}")
L.append("")
L.append("## Totals")
L.append("")
L.append("| Metric | Value |")
L.append("| --- | ---: |")
L.append(f"| row_count | {d['row_count']} |")
L.append(f"| scheduled | {d['scheduled']} |")
L.append(f"| completed | {d['completed']} |")
L.append(f"| incidents | {d['incidents']} |")
L.append(f"| completion_percent | {f2(d['completion_percent'])} |")
L.append("")
L.append("## Per-site totals")
L.append("")
L.append("| Site | rows | scheduled | completed | incidents | completion_percent |")
L.append("| --- | ---: | ---: | ---: | ---: | ---: |")
for k in keys:
    s = sites[k]
    L.append(
        f"| {k} | {s['rows']} | {s['scheduled']} | {s['completed']} | "
        f"{s['incidents']} | {f2(s['completion_percent'])} |"
    )
L.append("")
expected_body = "\n".join(L) + "\n"

actual = open(md_path, encoding="utf-8").read()

# Compare the value-bearing part (through the per-site table); the trailing
# Method prose is checked separately for presence of the documented steps.
idx = actual.find("## Method")
actual_body = actual[:idx] if idx != -1 else actual

print(json.dumps({
    "expected_body_bytes": len(expected_body.encode()),
    "actual_file_bytes": len(actual.encode()),
    "body_prefix_matches": actual_body == expected_body,
    "expected_body": expected_body,
    "actual_body": actual_body,
    "method_section_present": idx != -1,
    "method_steps_documented": all(
        s in actual for s in [
            "Sum the integer fields",
            "Group rows by `site`",
            "rounded half-up to an integer numerator",
            "Emit `digest.json`",
        ]
    ),
    "reproduce_command_documented": "node observation_digest_v1.mjs <observations.json> <output-dir>" in actual,
}, indent=2))
