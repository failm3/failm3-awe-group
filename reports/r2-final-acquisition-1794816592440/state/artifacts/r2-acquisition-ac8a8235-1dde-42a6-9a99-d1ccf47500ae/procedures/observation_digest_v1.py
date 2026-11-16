#!/usr/bin/env python3
"""observation-digest-v1 -- exact, reproducible operational digest of observation rows.

Stable local procedure source. It independently reads the observation fixture
JSON named by argv[1], computes exact numeric row/site totals plus the
completion percentage, and writes digest.json and digest.md into the output
directory named by argv[2].

Invocation (fixed args):
    python3 observation_digest_v1.py <input/pilot.observations.json> <outdir>

Rules implemented here:
  row_count          = number of elements in the observations array
  scheduled          = exact sum of each row's "scheduled"
  completed          = exact sum of each row's "completed"
  incidents          = exact sum of each row's "incidents"
  completion_percent = completed / scheduled * 100, rounded to 2 decimals
                       (Decimal, ROUND_HALF_UP); 0.0 when scheduled == 0
  sites              = object keyed by the row's "site" value, each with the
                       same five measures computed from that site's rows

Exactness: sums are accumulated as Decimal values built from each field's own
decimal representation, so no binary floating-point drift can enter the totals.
Nothing is written outside argv[2]; no network, no third-party packages.
"""

import json
import os
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

NAME = "observation-digest-v1"
COUNT_FIELDS = ("scheduled", "completed", "incidents")
CENT = Decimal("0.01")
MAX_INPUT_BYTES = 64 * 1024 * 1024
SCRIPT_NAME = "observation_digest_v1.py"
USAGE = "usage: python3 %s <input-observations.json> <output-dir>" % SCRIPT_NAME

EXIT_USAGE = 2
EXIT_INPUT = 3
EXIT_DATA = 4
EXIT_OUTPUT = 5


def die(code, message):
    sys.stderr.write("%s: error: %s\n" % (NAME, message))
    raise SystemExit(code)


def warn(message):
    sys.stderr.write("%s: warning: %s\n" % (NAME, message))


def read_json_text(path):
    if not os.path.exists(path):
        die(EXIT_INPUT, "input file does not exist: %s" % path)
    if not os.path.isfile(path):
        die(EXIT_INPUT, "input path is not a regular file: %s" % path)
    size = os.path.getsize(path)
    if size > MAX_INPUT_BYTES:
        die(EXIT_INPUT, "input file is larger than %d bytes: %s" % (MAX_INPUT_BYTES, path))
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def exact_number(value, field, index):
    """Convert a JSON numeric field to an exact Decimal."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        die(EXIT_DATA, "observation %d field %r must be numeric, got %r" % (index, field, value))
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        die(EXIT_DATA, "observation %d field %r is not a usable number: %r" % (index, field, value))
    if not number.is_finite():
        die(EXIT_DATA, "observation %d field %r is not finite: %r" % (index, field, value))
    return number


def number_out(value):
    """Emit an integral Decimal as int, otherwise as float."""
    if value == value.to_integral_value():
        return int(value)
    return float(value)


def completion_percent(completed, scheduled):
    if scheduled == 0:
        return 0.0
    return float((completed * Decimal(100) / scheduled).quantize(CENT, rounding=ROUND_HALF_UP))


def empty_bucket():
    return {"row_count": 0, "scheduled": Decimal(0), "completed": Decimal(0), "incidents": Decimal(0)}


def finalize_bucket(bucket):
    return {
        "row_count": bucket["row_count"],
        "scheduled": number_out(bucket["scheduled"]),
        "completed": number_out(bucket["completed"]),
        "incidents": number_out(bucket["incidents"]),
        "completion_percent": completion_percent(bucket["completed"], bucket["scheduled"]),
    }


def parse_rows(document, input_path):
    if not isinstance(document, dict):
        die(EXIT_DATA, "fixture root must be a JSON object: %s" % input_path)
    rows = document.get("observations")
    if rows is None:
        die(EXIT_DATA, "fixture has no \"observations\" array: %s" % input_path)
    if not isinstance(rows, list):
        die(EXIT_DATA, "\"observations\" must be a JSON array, got %s" % type(rows).__name__)

    parsed = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            die(EXIT_DATA, "observation %d must be a JSON object" % index)
        site = row.get("site")
        if not isinstance(site, str) or not site.strip():
            die(EXIT_DATA, "observation %d has a missing or non-string \"site\"" % index)
        entry = {"site": site}
        for field in COUNT_FIELDS:
            if field not in row:
                die(EXIT_DATA, "observation %d is missing required field %r" % (index, field))
            entry[field] = exact_number(row[field], field, index)
        parsed.append(entry)
    return parsed


def build_digest(document, rows):
    totals = empty_bucket()
    sites = {}
    for row in rows:
        totals["row_count"] += 1
        bucket = sites.get(row["site"])
        if bucket is None:
            bucket = sites[row["site"]] = empty_bucket()
        bucket["row_count"] += 1
        for field in COUNT_FIELDS:
            totals[field] += row[field]
            bucket[field] += row[field]

    digest = finalize_bucket(totals)
    digest["sites"] = {name: finalize_bucket(sites[name]) for name in sorted(sites)}
    meta = {
        "source": document.get("source") if isinstance(document.get("source"), str) else None,
        "period": document.get("period") if isinstance(document.get("period"), str) else None,
        "observation_count": len(rows),
    }
    return digest, meta


def render_markdown(digest, meta, input_path):
    lines = []
    lines.append("# Observation digest")
    lines.append("")
    lines.append("Capability: `%s`" % NAME)
    lines.append("")
    if meta["source"]:
        lines.append("- Source: %s" % meta["source"])
    if meta["period"]:
        lines.append("- Period: %s" % meta["period"])
    lines.append("- Input fixture: `%s`" % input_path)
    lines.append("- Observation rows read: %d" % meta["observation_count"])
    lines.append("")
    lines.append("## Totals")
    lines.append("")
    lines.append("| measure | value |")
    lines.append("| --- | --- |")
    lines.append("| row_count | %d |" % digest["row_count"])
    lines.append("| scheduled | %d |" % digest["scheduled"])
    lines.append("| completed | %d |" % digest["completed"])
    lines.append("| incidents | %d |" % digest["incidents"])
    lines.append("| completion_percent | %s |" % format_percent(digest["completion_percent"]))
    lines.append("")
    lines.append("## Per-site totals")
    lines.append("")
    lines.append("| site | row_count | scheduled | completed | incidents | completion_percent |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for site in sorted(digest["sites"]):
        block = digest["sites"][site]
        lines.append(
            "| %s | %d | %d | %d | %d | %s |"
            % (
                site,
                block["row_count"],
                block["scheduled"],
                block["completed"],
                block["incidents"],
                format_percent(block["completion_percent"]),
            )
        )
    lines.append("")
    lines.append("## Reproducible method")
    lines.append("")
    lines.append("1. Invoke the procedure with two arguments: the fixture path and an output directory.")
    lines.append("")
    lines.append("   ```")
    lines.append("   python3 %s %s <outdir>" % (SCRIPT_NAME, input_path))
    lines.append("   ```")
    lines.append("")
    lines.append("2. Parse the input as JSON and take the `observations` array. Its length is `row_count`.")
    lines.append("3. Sum `scheduled`, `completed` and `incidents` over every row. Each value is converted")
    lines.append("   to an exact decimal (`Decimal(str(value))`) before summation, so totals are exact and")
    lines.append("   free of binary floating-point drift.")
    lines.append("4. Group the same rows by the exact `site` string and repeat step 3 per site. Sites are")
    lines.append("   emitted in sorted key order inside a `sites` object, each with `row_count`,")
    lines.append("   `scheduled`, `completed`, `incidents` and `completion_percent`.")
    lines.append("5. Compute `completion_percent = completed / scheduled * 100`, quantized to two decimals")
    lines.append("   with `ROUND_HALF_UP`; the value is `0.0` when `scheduled` is 0. The same formula is")
    lines.append("   applied to the grand totals and to every site.")
    lines.append("6. Write `digest.json` (the five totals plus `sites`) and this `digest.md` into the output")
    lines.append("   directory. Re-running the same fixture reproduces byte-identical output.")
    lines.append("")
    lines.append("Checks cross this file: for the grand totals, `scheduled` equals the sum of the per-site")
    lines.append("`scheduled` values, and likewise for `completed`, `incidents` and `row_count`.")
    lines.append("")
    return "\n".join(lines)


def format_percent(value):
    return ("%.2f" % value)


def write_text(path, text):
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    os.replace(tmp_path, path)


def main(argv):
    if len(argv) != 3:
        sys.stderr.write(USAGE + "\n")
        die(EXIT_USAGE, "expected exactly 2 arguments, got %d" % (len(argv) - 1))

    input_path = argv[1]
    outdir = argv[2]
    if not outdir:
        die(EXIT_USAGE, "output directory argument is empty")

    text = read_json_text(input_path)
    try:
        document = json.loads(text)
    except json.JSONDecodeError as exc:
        die(EXIT_DATA, "input is not valid JSON (%s): %s" % (exc, input_path))

    rows = parse_rows(document, input_path)
    digest, meta = build_digest(document, rows)

    json_text = json.dumps(digest, indent=2, ensure_ascii=False) + "\n"
    markdown_text = render_markdown(digest, meta, input_path)

    try:
        os.makedirs(outdir, exist_ok=True)
        write_text(os.path.join(outdir, "digest.json"), json_text)
        write_text(os.path.join(outdir, "digest.md"), markdown_text)
    except OSError as exc:
        die(EXIT_OUTPUT, "cannot write digest into %s (%s)" % (outdir, exc))

    sys.stderr.write(
        "%s: %d rows, %d scheduled, %d completed, %d incidents, %s%% -> %s\n"
        % (
            NAME,
            digest["row_count"],
            digest["scheduled"],
            digest["completed"],
            digest["incidents"],
            format_percent(digest["completion_percent"]),
            outdir,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
