"""Render a Markdown report to an A4 PDF (PyMuPDF Story layout)."""

from __future__ import annotations

import html
from pathlib import Path

import markdown
import pymupdf

CSS = """
body { font-family: sans-serif; font-size: 10pt; line-height: 1.4; color: #1d2330; }
h1 { font-size: 16pt; margin-bottom: 4pt; }
h2 { font-size: 13pt; margin-top: 12pt; border-bottom: 1px solid #999; }
h3 { font-size: 11pt; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #999; padding: 3pt; vertical-align: top; }
th { background-color: #e8ebf0; }
"""

MARGIN = 50  # points


def markdown_to_pdf(md_text: str, out_path: Path, title: str = "") -> Path:
    body = markdown.markdown(md_text, extensions=["tables", "sane_lists"])
    if title:
        body = f"<h1>{html.escape(title)}</h1>" + body
    story = pymupdf.Story(html=body, user_css=CSS)
    page = pymupdf.paper_rect("a4")
    where = page + (MARGIN, MARGIN, -MARGIN, -MARGIN)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    writer = pymupdf.DocumentWriter(str(out_path))
    more = True
    while more:
        device = writer.begin_page(page)
        more, _ = story.place(where)
        story.draw(device)
        writer.end_page()
    writer.close()
    return out_path
