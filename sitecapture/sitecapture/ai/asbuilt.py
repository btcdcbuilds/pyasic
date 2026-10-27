"""As-built check report: computed tables plus Opus commentary.

Every figure in the report's tables comes from the deviation analysis, not
from the model. Opus only writes the commentary and recommended actions, and
is given the figures it may cite.
"""

from __future__ import annotations

import json

from sitecapture.ai.claude import ask_json
from sitecapture.scan.deviation import by_type

SYSTEM = """You are a construction QA engineer reviewing an as-built check: a \
site scan aligned to the design (IFC) model, with measured deviations per \
element. Write for a site manager.

Rules:
- Use only the figures provided. Do not invent measurements, dates, trades or \
causes. When you mention a number, copy it exactly.
- "not_seen" means no scan points on the element's surfaces inside the scanned \
area: it may be not built yet, hidden (behind other work, inside a ceiling), \
or moved further than the cutoff. Say that it needs a visual check; do not \
claim it is missing.
- "deviates"/"check" mean many scan points on the element are further from \
the design surface than the tolerance. The signed median is + when the built \
surface sits outside the modelled surface and - when inside.
- Mention the alignment quality if the RMS is more than half the tolerance, \
because then deviations may partly be alignment error."""

SCHEMA = {
    "type": "object",
    "properties": {
        "overview": {"type": "string", "description": "2-4 sentences"},
        "priorities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "element": {"type": "string"},
                    "finding": {"type": "string"},
                    "action": {"type": "string"},
                },
                "required": ["element", "finding", "action"],
                "additionalProperties": False,
            },
        },
        "limitations": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["overview", "priorities", "limitations"],
    "additionalProperties": False,
}

SEVERITY = {"deviates": 0, "check": 1, "not_seen": 2}


def flagged(elements: list[dict], limit: int = 40) -> list[dict]:
    rows = [e for e in elements if e["status"] in SEVERITY]
    rows.sort(key=lambda e: (SEVERITY[e["status"]], -(e["median_mm"] or 0)))
    return rows[:limit]


def _label(e: dict) -> str:
    name = e["name"] or e["guid"]
    return f"{name} ({e['type'].removeprefix('Ifc')}{', ' + e['storey'] if e['storey'] else ''})"


def tables_markdown(project: str, scan_name: str, model_name: str, check) -> str:
    s, a = check.summary, check.alignment
    lines = [
        f"# As-built check: {scan_name} vs {model_name}",
        "",
        f"Project: {project}",
        "",
        "## Result",
        "",
        "| Measure | Value |",
        "|---|---|",
        f"| Tolerance | {s['tolerance_mm']} mm |",
        f"| Scan points analysed | {s['points_analysed']:,} |",
        f"| Points within tolerance (of points near the model) | {s['within_tolerance_pct']}% |",
        f"| Points near the model (within {s['cutoff_mm']} mm) | {s['near_model_pct']}% |",
        f"| Points not in the model | {s['not_in_model_pct']}% |",
        f"| RMS distance, points near the model | {s['rms_mm']} mm |",
        f"| Alignment | {a['method']}, RMS {a['rms_mm']} mm, scale {a['scale']} |",
        "",
        "## Elements by status",
        "",
        "| Status | Elements |",
        "|---|---|",
    ]
    for k, v in s["status_counts"].items():
        lines.append(f"| {k.replace('_', ' ')} | {v} |")
    lines += [
        "",
        "## By element type",
        "",
        "| Type | Total | OK | Check | Deviates | Not seen | Outside scan |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in by_type(check.elements):
        lines.append(
            f"| {r['type'].removeprefix('Ifc')} | {r['total']} | {r['ok']} | {r['check']} | {r['deviates']} | {r['not_seen']} | {r['outside_scan']} |"
        )
    rows = flagged(check.elements)
    if rows:
        lines += [
            "",
            "## Flagged elements",
            "",
            "| Element | Status | Within tol. | Median | 95th pct | Signed median | Coverage |",
            "|---|---|---|---|---|---|---|",
        ]
        for e in rows:
            mm = lambda v: "-" if v is None else f"{v} mm"  # noqa: E731
            lines.append(
                f"| {_label(e)} | {e['status'].replace('_', ' ')} | {e['within_pct']}% | {mm(e['median_mm'])} | {mm(e['p95_mm'])} | {mm(e['signed_median_mm'])} | {e['coverage_pct']}% |"
            )
    return "\n".join(lines)


def write_report(
    project: str, scan_name: str, model_name: str, check, model: str
) -> str:
    tables = tables_markdown(project, scan_name, model_name, check)
    facts = {
        "summary": check.summary,
        "alignment": check.alignment,
        "by_type": by_type(check.elements),
        "flagged_elements": [
            {
                k: e[k]
                for k in (
                    "name",
                    "type",
                    "storey",
                    "status",
                    "within_pct",
                    "median_mm",
                    "p95_mm",
                    "signed_median_mm",
                    "coverage_pct",
                    "points",
                )
            }
            for e in flagged(check.elements)
        ],
    }
    result = ask_json(
        [
            {
                "type": "text",
                "text": "As-built check results (JSON):\n"
                + json.dumps(facts, indent=1),
            }
        ],
        SCHEMA,
        SYSTEM,
        model=model,
        effort="medium",
        max_tokens=16000,
    )
    out = [tables, "", "## Commentary (Opus)", "", result["overview"].strip(), ""]
    if result["priorities"]:
        out += [
            "## Recommended actions",
            "",
            "| Element | Finding | Action |",
            "|---|---|---|",
        ]
        for p in result["priorities"]:
            cells = [
                p[k].replace("|", "/").replace("\n", " ")
                for k in ("element", "finding", "action")
            ]
            out.append("| " + " | ".join(cells) + " |")
        out.append("")
    if result["limitations"]:
        out += ["## Limitations", ""] + [f"- {x}" for x in result["limitations"]]
    return "\n".join(out)
