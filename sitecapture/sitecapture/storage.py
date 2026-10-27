"""File storage, laid out per project under ``data_dir``.

``LocalStorage`` keeps files on disk (VPS / Docker). ``DbBackedStorage`` also
copies every file into the database and fetches it back on demand, for
serverless hosts where each request may run on a fresh machine with an empty
disk. Code always works with local paths; it calls :meth:`persist` after
writing a file that must survive and :meth:`ensure` before reading one.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

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
        self.persist(target)
        return target

    def contains(self, path: Path) -> bool:
        try:
            Path(path).resolve().relative_to(self.root.resolve())
        except ValueError:
            return False
        return True

    # Hooks for storage backends; on local disk the file already persists.

    def persist(self, path: Path) -> None:
        pass

    def ensure(self, path: Path) -> bool:
        """Make sure ``path`` exists locally; False if it doesn't exist anywhere."""
        return Path(path).exists()

    def remove(self, path: Path) -> None:
        Path(path).unlink(missing_ok=True)

    def move(self, src: Path, dst: Path) -> None:
        self.ensure(src)
        shutil.move(src, dst)
        self.persist(dst)
        self.remove(src)

    # Temporary pieces of a chunked upload.

    def put_part(self, key: str, data: bytes) -> None:
        part = self.root / "parts" / key
        part.parent.mkdir(parents=True, exist_ok=True)
        part.write_bytes(data)

    def pop_parts(self, prefix: str) -> list[bytes]:
        directory = self.root / "parts" / prefix
        parts = sorted(directory.glob("*")) if directory.exists() else []
        data = [p.read_bytes() for p in parts]
        shutil.rmtree(directory, ignore_errors=True)
        return data


class DbBackedStorage(LocalStorage):
    """Local disk as a cache, with the database as the durable copy."""

    def __init__(self, root: Path, sessions: sessionmaker):
        super().__init__(root)
        self.sessions = sessions

    def _key(self, path: Path) -> str:
        return Path(path).resolve().relative_to(self.root.resolve()).as_posix()

    def _put(self, key: str, data: bytes) -> None:
        from sitecapture.db import StoredFile

        with self.sessions() as session:
            row = session.get(StoredFile, key)
            if row is None:
                session.add(StoredFile(key=key, data=data, size=len(data)))
            else:
                row.data, row.size = data, len(data)
            session.commit()

    def persist(self, path: Path) -> None:
        self._put(self._key(path), Path(path).read_bytes())

    def ensure(self, path: Path) -> bool:
        from sitecapture.db import StoredFile

        path = Path(path)
        if path.exists():
            return True
        if not self.contains(path):
            return False
        with self.sessions() as session:
            row = session.get(StoredFile, self._key(path))
            if row is None:
                return False
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(row.data)
        return True

    def remove(self, path: Path) -> None:
        from sitecapture.db import StoredFile

        key = self._key(path)
        with self.sessions() as session:
            row = session.get(StoredFile, key)
            if row is not None:
                session.delete(row)
                session.commit()
        Path(path).unlink(missing_ok=True)

    def put_part(self, key: str, data: bytes) -> None:
        self._put(f"parts/{key}", data)

    def pop_parts(self, prefix: str) -> list[bytes]:
        from sitecapture.db import StoredFile

        with self.sessions() as session:
            rows = session.scalars(
                select(StoredFile)
                .where(StoredFile.key.startswith(f"parts/{prefix}/"))
                .order_by(StoredFile.key)
            ).all()
            data = [r.data for r in rows]
            for r in rows:
                session.delete(r)
            session.commit()
        return data
