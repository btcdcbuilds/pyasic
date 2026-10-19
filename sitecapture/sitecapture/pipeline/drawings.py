"""Render PDF drawing pages to images for the plan viewer."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pymupdf as fitz

# Large sheets (A1/A0) need a high DPI to stay legible when zoomed in.
DEFAULT_DPI = 150
MAX_PIXELS = 12000


@dataclass
class RenderedPage:
    page_index: int
    image_path: Path
    width_px: int
    height_px: int


def page_count(pdf_path: Path) -> int:
    with fitz.open(pdf_path) as doc:
        return doc.page_count


def render_pages(
    pdf_path: Path, out_dir: Path, dpi: int = DEFAULT_DPI
) -> list[RenderedPage]:
    out_dir.mkdir(parents=True, exist_ok=True)
    pages = []
    with fitz.open(pdf_path) as doc:
        for page in doc:
            # Cap the longest side so huge sheets don't produce enormous PNGs.
            longest_in = max(page.rect.width, page.rect.height) / 72
            page_dpi = min(dpi, int(MAX_PIXELS / longest_in)) if longest_in else dpi
            pix = page.get_pixmap(dpi=page_dpi)
            target = out_dir / f"{pdf_path.stem}_p{page.number + 1}.png"
            pix.save(target)
            pages.append(RenderedPage(page.number, target, pix.width, pix.height))
    return pages
