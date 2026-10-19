"""File storage on local disk, laid out per project.

Kept behind a small class so an S3/R2 backend can replace it later.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import BinaryIO

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_name(name: str) -> str:
    name = _SAFE.sub("_", Path(name).name).strip("._")
    return name or "file"


class LocalStorage:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def project_dir(self, project_id: int, *parts: str) -> Path:
        path = self.root / "projects" / str(project_id)
        for part in parts:
            path = path / part
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save(self, directory: Path, filename: str, data: BinaryIO) -> Path:
        target = directory / safe_name(filename)
        with target.open("wb") as out:
            shutil.copyfileobj(data, out)
        return target

    def contains(self, path: Path) -> bool:
        try:
            Path(path).resolve().relative_to(self.root.resolve())
        except ValueError:
            return False
        return True
