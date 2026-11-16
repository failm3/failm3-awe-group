#!/usr/bin/env python3
"""observation-digest-v1

Bounded, dependency-free procedure that independently parses a JSON observation
fixture and emits an exact operational digest (digest.json + digest.md) into a
caller-supplied output directory.

Usage:
    observation_digest_v1.py <input-observations.json> <output-dir>

Contract:
    * argv[1] is a JSON object with an "observations" array. Every row must be a
      JSON object carrying "site" (non-empty string), "scheduled" (int >= 0),
      "completed" (int >= 0), "incidents" (int >= 0), with completed <= scheduled.
      A non-empty "cohort" string is validated when present. Booleans are NOT
      accepted where integers are required. Unknown row/root keys are tolerated
      (forward-compatible); required keys are mandatory and type-checked.
    * Aggregates are exact integer sums. completion_percent is
      completed * 100 / scheduled, rounded half-up to 2 decimal places, and is
      emitted as an unquoted JSON number rendered with exactly 2 decimals.
    * Per-site totals reconcile to the global totals (rows, scheduled, completed,
      incidents); reconciliation is re-verified before anything is written.
    * Writes digest.json and digest.md into <output-dir> (created if absent),
      atomically. Nothing is written outside <output-dir>.
    * Exit codes: 0 ok, 2 usage, 3 input read failure, 4 JSON parse failure,
      5 schema/contract failure, 6 output write failure. Diagnostics on stderr.

Stdlib only. No network, no third-party packages, no environment reads beyond
the two positional arguments.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from decimal import Decimal, ROUND_HALF_UP

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_READ = 3
EXIT_PARSE = 4
EXIT_SCHEMA = 5
EXIT_WRITE = 6

REQUIRED_INT_FIELDS = ("scheduled", "completed", "incidents")
CENT = Decimal("0.01")


class SchemaError(Exception):
    """Raised when the fixture violates the declared input contract."""


def _fail(code: int, message: str) -> "NoReturn":  # type: ignore[valid-type]
    sys.stderr.write("observation-digest-v1: error: %s\n" % message)
    raise SystemExit(code)


def _require_int(row_index: int, key: str, value: object) -> int:
    """Return value as a non-negative int, rejecting bool/float/str lookalikes."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise SchemaError(
            "observations[%d].%s must be a JSON integer, got %s"
            % (row_index, key, type(value).__name__)
        )
    if value < 0:
        raise SchemaError(
            "observations[%d].%s must be >= 0, got %d" % (row_index, key, value)
        )
    return value


def _require_str(row_index: int, key: str, value: object, *, non_empty: bool) -> str:
    if not isinstance(value, str):
        raise SchemaError(
            "observations[%d].%s must be a JSON string, got %s"
            % (row_index, key, type(value).__name__)
        )
    if non_empty and not value.strip():
        raise SchemaError("observations[%d].%s must be a non-empty string" % (row_index, key))
    return value


def load_fixture(path: str) -> tuple[dict, list[dict]]:
    """Read and strictly validate the observation fixture."""
    try:
        with open(path, "rb") as handle:
            raw = handle.read()
    except OSError as exc:
        _fail(EXIT_READ, "cannot read input %r: %s" % (path, exc))

    try:
        document = json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError as exc:
        _fail(EXIT_PARSE, "input is not valid UTF-8: %s" % exc)
    except json.JSONDecodeError as exc:
        _fail(EXIT_PARSE, "input is not valid JSON: %s (line %d col %d)" % (exc.msg, exc.lineno, exc.colno))

    if not isinstance(document, dict):
        raise SchemaError("root must be a JSON object, got %s" % type(document).__name__)

    observations = document.get("observations")
    if observations is None:
        raise SchemaError("root is missing required key 'observations'")
    if not isinstance(observations, list):
        raise SchemaError("'observations' must be a JSON array, got %s" % type(observations).__name__)
    if not observations:
        raise SchemaError("'observations' must contain at least one row")

    rows: list[dict] = []
    for index, row in enumerate(observations):
        if not isinstance(row, dict):
            raise SchemaError(
                "observations[%d] must be a JSON object, got %s" % (index, type(row).__name__)
            )
        if "site" not in row:
            raise SchemaError("observations[%d] is missing required key 'site'" % index)
        site = _require_str(index, "site", row["site"], non_empty=True)
        for field in REQUIRED_INT_FIELDS:
            if field not in row:
                raise SchemaError("observations[%d] is missing required key '%s'" % (index, field))
        scheduled = _require_int(index, "scheduled", row["scheduled"])
        completed = _require_int(index, "completed", row["completed"])
        incidents = _require_int(index, "incidents", row["incidents"])
        if completed > scheduled:
            raise SchemaError(
                "observations[%d].completed (%d) exceeds scheduled (%d)"
                % (index, completed, scheduled)
            )
        cohort = None
        if "cohort" in row:
            cohort = _require_str(index, "cohort", row["cohort"], non_empty=False)
        rows.append(
            {
                "index": index,
                "site": site,
                "cohort": cohort,
                "scheduled": scheduled,
                "completed": completed,
                "incidents": incidents,
            }
        )
    return document, rows


def percent(completed: int, scheduled: int) -> Decimal:
    """completed/scheduled as a percentage, rounded half-up to 2 decimals."""
    if scheduled == 0:
        return Decimal("0.00")
    return (Decimal(completed) * Decimal(100) / Decimal(scheduled)).quantize(
        CENT, rounding=ROUND_HALF_UP
    )


def aggregate(rows: list[dict]) -> dict:
    """Compute global totals and per-site totals, then verify reconciliation."""
    sites: dict[str, dict] = {}
    for row in rows:
        bucket = sites.setdefault(
            row["site"],
            {"row_count": 0, "scheduled": 0, "completed": 0, "incidents": 0},
        )
        bucket["row_count"] += 1
        bucket["scheduled"] += row["scheduled"]
        bucket["completed"] += row["completed"]
        bucket["incidents"] += row["incidents"]

    total_scheduled = sum(row["scheduled"] for row in rows)
    total_completed = sum(row["completed"] for row in rows)
    total_incidents = sum(row["incidents"] for row in rows)

    # Independent re-derivation of the global totals from the per-site buckets.
    if sum(b["row_count"] for b in sites.values()) != len(rows):
        raise SchemaError("per-site row totals do not reconcile to row_count")
    if sum(b["scheduled"] for b in sites.values()) != total_scheduled:
        raise SchemaError("per-site scheduled totals do not reconcile to global scheduled")
    if sum(b["completed"] for b in sites.values()) != total_completed:
        raise SchemaError("per-site completed totals do not reconcile to global completed")
    if sum(b["incidents"] for b in sites.values()) != total_incidents:
        raise SchemaError("per-site incidents totals do not reconcile to global incidents")

    site_block: dict[str, dict] = {}
    for name in sorted(sites):
        bucket = sites[name]
        if bucket["completed"] > bucket["scheduled"]:
            raise SchemaError("site %r completed exceeds scheduled" % name)
        site_block[name] = {
            "row_count": bucket["row_count"],
            "scheduled": bucket["scheduled"],
            "completed": bucket["completed"],
            "incidents": bucket["incidents"],
            "completion_percent": percent(bucket["completed"], bucket["scheduled"]),
        }

    return {
        "row_count": len(rows),
        "scheduled": total_scheduled,
        "completed": total_completed,
        "incidents": total_incidents,
        "completion_percent": percent(total_completed, total_scheduled),
        "sites": site_block,
    }


def _json_scalar(value: object) -> str:
    """Render a scalar deterministically; Decimals render with exactly 2 places."""
    if isinstance(value, Decimal):
        return format(value, ".2f")
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    raise TypeError("unsupported scalar type: %s" % type(value).__name__)


def render_json(source: object, period: object, totals: dict) -> str:
    """Serialise digest.json: stable key order, unquoted 2-decimal percentages."""
    lines = ["{"]
    head = [
        ("source", source),
        ("period", period),
        ("row_count", totals["row_count"]),
        ("scheduled", totals["scheduled"]),
        ("completed", totals["completed"]),
        ("incidents", totals["incidents"]),
        ("completion_percent", totals["completion_percent"]),
    ]
    for key, value in head:
        lines.append("  %s: %s," % (_json_scalar(key), _json_scalar(value)))
    lines.append('  "sites": {')
    names = list(totals["sites"])
    for position, name in enumerate(names):
        bucket = totals["sites"][name]
        lines.append("    %s: {" % _json_scalar(name))
        lines.append('      "row_count": %s,' % bucket["row_count"])
        lines.append('      "scheduled": %s,' % bucket["scheduled"])
        lines.append('      "completed": %s,' % bucket["completed"])
        lines.append('      "incidents": %s,' % bucket["incidents"])
        lines.append('      "completion_percent": %s' % format(bucket["completion_percent"], ".2f"))
        lines.append("    }" + ("," if position < len(names) - 1 else ""))
    lines.append("  }")
    lines.append("}")
    return "\n".join(lines) + "\n"


def render_markdown(source: object, period: object, totals: dict, input_sha256: str) -> str:
    """Human-readable digest mirroring digest.json values exactly."""
    out: list[str] = []
    out.append("# Observation Digest (observation-digest-v1)")
    out.append("")
    if isinstance(source, str):
        out.append("- **Source:** %s" % source)
    if isinstance(period, str):
        out.append("- **Period:** %s" % period)
    out.append("- **Input fixture sha256:** `%s`" % input_sha256)
    out.append("")
    out.append("## Totals")
    out.append("")
    out.append("| metric | value |")
    out.append("| --- | --- |")
    out.append("| row_count | %d |" % totals["row_count"])
    out.append("| scheduled | %d |" % totals["scheduled"])
    out.append("| completed | %d |" % totals["completed"])
    out.append("| incidents | %d |" % totals["incidents"])
    out.append("| completion_percent | %s |" % format(totals["completion_percent"], ".2f"))
    out.append("")
    out.append("## Sites")
    out.append("")
    out.append("| site | row_count | scheduled | completed | incidents | completion_percent |")
    out.append("| --- | --- | --- | --- | --- | --- |")
    for name in totals["sites"]:
        bucket = totals["sites"][name]
        out.append(
            "| %s | %d | %d | %d | %d | %s |"
            % (
                name,
                bucket["row_count"],
                bucket["scheduled"],
                bucket["completed"],
                bucket["incidents"],
                format(bucket["completion_percent"], ".2f"),
            )
        )
    out.append(
        "| **total** | %d | %d | %d | %d | %s |"
        % (
            totals["row_count"],
            totals["scheduled"],
            totals["completed"],
            totals["incidents"],
            format(totals["completion_percent"], ".2f"),
        )
    )
    out.append("")
    out.append("## Reproducible method")
    out.append("")
    out.append("1. Read the fixture path given as argument 1 and parse it as UTF-8 JSON.")
    out.append("2. Validate every row of `observations`: `site` non-empty string;")
    out.append("   `scheduled`, `completed`, `incidents` are JSON integers `>= 0`;")
    out.append("   `completed <= scheduled`. Any violation aborts with a nonzero exit.")
    out.append("3. Global totals are integer sums over all rows:")
    out.append("   `row_count` = number of rows,")
    out.append("   `scheduled` = sum(scheduled),")
    out.append("   `completed` = sum(completed),")
    out.append("   `incidents` = sum(incidents).")
    out.append("4. Per-site totals are the same sums grouped by `site`, keyed by site name")
    out.append("   in ascending order; per-site values are re-checked to reconcile to the")
    out.append("   global totals before any output is written.")
    out.append("5. `completion_percent` = completed * 100 / scheduled, computed in exact")
    out.append("   decimal arithmetic and rounded half-up to 2 decimal places; 0.00 when")
    out.append("   `scheduled` is 0. The same rule applies per site.")
    out.append("6. `digest.json` and `digest.md` are written into the directory given as")
    out.append("   argument 2, atomically, and carry the values shown above.")
    out.append("")
    return "\n".join(out)


def write_atomic(directory: str, name: str, text: str) -> str:
    target = os.path.join(directory, name)
    try:
        handle = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n", dir=directory, prefix="." + name + ".", delete=False
        )
    except OSError as exc:
        _fail(EXIT_WRITE, "cannot create temporary file in %r: %s" % (directory, exc))
    tmp_path = handle.name
    try:
        with handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, target)
    except OSError as exc:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        _fail(EXIT_WRITE, "cannot write %r: %s" % (target, exc))
    return target


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        _fail(EXIT_USAGE, "expected exactly 2 arguments (<input-json> <output-dir>), got %d" % (len(argv) - 1))

    input_path, output_dir = argv[1], argv[2]
    if not os.path.isfile(input_path):
        _fail(EXIT_READ, "input file does not exist: %r" % input_path)

    try:
        document, rows = load_fixture(input_path)
        totals = aggregate(rows)
    except SchemaError as exc:
        _fail(EXIT_SCHEMA, "schema violation: %s" % exc)

    import hashlib

    with open(input_path, "rb") as handle:
        input_sha256 = hashlib.sha256(handle.read()).hexdigest()

    json_text = render_json(document.get("source"), document.get("period"), totals)
    md_text = render_markdown(document.get("source"), document.get("period"), totals, input_sha256)

    # Self-check: the emitted JSON must reparse to the same exact values.
    parsed = json.loads(json_text)
    for key in ("row_count", "scheduled", "completed", "incidents"):
        if parsed[key] != totals[key]:
            _fail(EXIT_WRITE, "internal error: %s did not round-trip" % key)
    if format(Decimal(str(parsed["completion_percent"])), ".2f") != format(totals["completion_percent"], ".2f"):
        _fail(EXIT_WRITE, "internal error: completion_percent did not round-trip")

    try:
        os.makedirs(output_dir, exist_ok=True)
    except OSError as exc:
        _fail(EXIT_WRITE, "cannot create output directory %r: %s" % (output_dir, exc))

    json_path = write_atomic(output_dir, "digest.json", json_text)
    md_path = write_atomic(output_dir, "digest.md", md_text)

    sys.stdout.write("observation-digest-v1: ok\n")
    sys.stdout.write("  input:  %s\n" % input_path)
    sys.stdout.write("  output: %s\n" % json_path)
    sys.stdout.write("  output: %s\n" % md_path)
    sys.stdout.write(
        "  totals: row_count=%d scheduled=%d completed=%d incidents=%d completion_percent=%s\n"
        % (
            totals["row_count"],
            totals["scheduled"],
            totals["completed"],
            totals["incidents"],
            format(totals["completion_percent"], ".2f"),
        )
    )
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
