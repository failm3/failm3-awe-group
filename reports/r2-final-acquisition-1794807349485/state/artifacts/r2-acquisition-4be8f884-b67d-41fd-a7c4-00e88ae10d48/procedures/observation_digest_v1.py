#!/usr/bin/env python3
"""observation-digest-v1

Acquired competence: independently read a JSON observation fixture, compute
exact row/site totals and completion percentage, and persist digest.json and
digest.md into the supplied output directory.

Contract
    argv[1] : input fixture path (JSON)
    argv[2] : output directory (digest.json and digest.md are written there)

Method
    * totals are plain integer sums over observation rows
    * completion percentage uses exact Decimal arithmetic:
          completion_percent = completed / scheduled * 100
      rounded to 2 decimals with ROUND_HALF_UP and rendered with exactly two
      decimal places (never via binary floats)
    * keys sorted, UTF-8, LF newlines, trailing newline; no timestamps are
      embedded, so runs are byte-reproducible
"""
import hashlib
import json
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

VERSION = "observation-digest-v1"
CENT = Decimal("0.01")
INT_FIELDS = ("scheduled", "completed", "incidents")


class Raw:
    """A pre-rendered JSON numeric token (preserves exact 2-decimal text)."""

    __slots__ = ("raw",)

    def __init__(self, raw):
        self.raw = raw


def render(obj, level=0):
    pad = "  " * (level + 1)
    if isinstance(obj, Raw):
        return obj.raw
    if isinstance(obj, bool):
        return "true" if obj else "false"
    if isinstance(obj, int):
        return str(obj)
    if isinstance(obj, str):
        return json.dumps(obj, ensure_ascii=False)
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        body = ",\n".join(
            "%s%s: %s" % (pad, json.dumps(k, ensure_ascii=False), render(v, level + 1))
            for k, v in sorted(obj.items())
        )
        return "{\n" + body + "\n" + "  " * level + "}"
    if isinstance(obj, list):
        if not obj:
            return "[]"
        body = ",\n".join(pad + render(v, level + 1) for v in obj)
        return "[\n" + body + "\n" + "  " * level + "]"
    raise TypeError("unsupported type: %r" % (type(obj),))


def percentage(completed, scheduled):
    """Exact completed/scheduled*100, 2 decimals, ROUND_HALF_UP."""
    if scheduled <= 0:
        raise ValueError(
            "scheduled must be > 0 to compute completion_percent (got %d)" % scheduled
        )
    value = Decimal(completed) * Decimal(100) / Decimal(scheduled)
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def load_fixture(path):
    raw = path.read_bytes()
    try:
        doc = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("fixture is not valid UTF-8 JSON: %s" % exc)
    if not isinstance(doc, dict):
        raise ValueError("fixture root must be a JSON object")
    rows = doc.get("observations")
    if not isinstance(rows, list) or not rows:
        raise ValueError("fixture must contain a non-empty 'observations' array")
    clean = []
    for index, row in enumerate(rows):
        where = "observations[%d]" % index
        if not isinstance(row, dict):
            raise ValueError("%s must be a JSON object" % where)
        site = row.get("site")
        if not isinstance(site, str) or not site.strip():
            raise ValueError("%s.site must be a non-empty string" % where)
        for field in INT_FIELDS:
            value = row.get(field)
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError("%s.%s must be an integer" % (where, field))
            if value < 0:
                raise ValueError("%s.%s must be >= 0" % (where, field))
        if row["completed"] > row["scheduled"]:
            raise ValueError(
                "%s: completed (%d) exceeds scheduled (%d)"
                % (where, row["completed"], row["scheduled"])
            )
        clean.append(row)
    return doc, clean, hashlib.sha256(raw).hexdigest()


def build(doc, rows):
    total = {"row_count": 0, "scheduled": 0, "completed": 0, "incidents": 0}
    sites = {}
    for row in rows:
        bucket = sites.setdefault(
            row["site"], {"row_count": 0, "scheduled": 0, "completed": 0, "incidents": 0}
        )
        for key in ("scheduled", "completed", "incidents"):
            bucket[key] += row[key]
            total[key] += row[key]
        bucket["row_count"] += 1
        total["row_count"] += 1

    site_obj = {}
    for site in sorted(sites):
        b = sites[site]
        b["completion_percent"] = Raw("%.2f" % percentage(b["completed"], b["scheduled"]))
        site_obj[site] = b

    return {
        "source": doc.get("source", ""),
        "period": doc.get("period", ""),
        "row_count": total["row_count"],
        "scheduled": total["scheduled"],
        "completed": total["completed"],
        "incidents": total["incidents"],
        "completion_percent": Raw("%.2f" % percentage(total["completed"], total["scheduled"])),
        "sites": site_obj,
    }


def build_markdown(digest, fixture_name, fixture_sha):
    lines = []
    add = lines.append
    add("# Operational digest — %s" % digest["period"])
    add("")
    add("Competence: `%s`" % VERSION)
    add("")
    add("| field | value |")
    add("| --- | --- |")
    add("| source | %s |" % digest["source"])
    add("| period | %s |" % digest["period"])
    add("| row_count | %d |" % digest["row_count"])
    add("| scheduled | %d |" % digest["scheduled"])
    add("| completed | %d |" % digest["completed"])
    add("| incidents | %d |" % digest["incidents"])
    add("| completion_percent | %s |" % digest["completion_percent"].raw)
    add("")
    add("## Per-site totals")
    add("")
    add("| site | row_count | scheduled | completed | incidents | completion_percent |")
    add("| --- | ---: | ---: | ---: | ---: | ---: |")
    for site in sorted(digest["sites"]):
        s = digest["sites"][site]
        add(
            "| %s | %d | %d | %d | %d | %s |"
            % (
                site,
                s["row_count"],
                s["scheduled"],
                s["completed"],
                s["incidents"],
                s["completion_percent"].raw,
            )
        )
    add("")
    add("## Method (reproducible)")
    add("")
    add("1. Read `%s` as UTF-8 JSON; sha256 `%s`." % (fixture_name, fixture_sha))
    add("2. Validate every row: `site` a non-empty string; `scheduled`, `completed`")
    add("   and `incidents` non-negative integers; `completed` <= `scheduled`.")
    add("3. `row_count` is the number of entries in `observations`; `scheduled`,")
    add("   `completed` and `incidents` are plain integer sums over all rows.")
    add("4. Per site: the same four quantities summed over the rows carrying that")
    add("   exact `site` label.")
    add("5. `completion_percent = completed / scheduled * 100`, computed in exact")
    add("   decimal arithmetic (never binary floats) and rounded to 2 decimals")
    add("   with ROUND_HALF_UP, then rendered with exactly two decimal places.")
    add("6. Each site percentage uses the same formula on that site's own counts,")
    add("   so it is not derived from the grand total.")
    add("")
    add("Reproduce from the mission directory:")
    add("")
    add("```")
    add("python3 procedures/observation_digest_v1.py input/%s ." % fixture_name)
    add("```")
    add("")
    add("Outputs are deterministic: no timestamps are embedded, keys are sorted,")
    add("newlines are LF, and a trailing newline is present.")
    add("")
    return "\n".join(lines)


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("usage: observation_digest_v1.py <fixture.json> <output-dir>\n")
        return 2
    fixture_path = Path(argv[1])
    out_dir = Path(argv[2])
    try:
        doc, rows, fixture_sha = load_fixture(fixture_path)
        digest = build(doc, rows)
        markdown = build_markdown(digest, fixture_path.name, fixture_sha)
    except (OSError, ValueError) as exc:
        sys.stderr.write("%s: error: %s\n" % (VERSION, exc))
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    json_bytes = (render(digest) + "\n").encode("utf-8")
    md_bytes = markdown.encode("utf-8")
    (out_dir / "digest.json").write_bytes(json_bytes)
    (out_dir / "digest.md").write_bytes(md_bytes)

    sys.stdout.write(
        json.dumps(
            {
                "competence": VERSION,
                "fixture": str(fixture_path),
                "fixture_sha256": fixture_sha,
                "output_dir": str(out_dir),
                "row_count": digest["row_count"],
                "scheduled": digest["scheduled"],
                "completed": digest["completed"],
                "incidents": digest["incidents"],
                "completion_percent": digest["completion_percent"].raw,
                "digest_json_sha256": hashlib.sha256(json_bytes).hexdigest(),
                "digest_md_sha256": hashlib.sha256(md_bytes).hexdigest(),
            },
            sort_keys=True,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
