"""Read point clouds from common scanner formats and thin them for analysis.

Readers stream the file in chunks and voxel-downsample as they go, so a
multi-GB scan never has to fit in memory at full density.

Formats:

* PLY (ascii, binary little/big endian; vertex x/y/z, optional red/green/blue)
* LAS 1.0-1.4, uncompressed (any point format). LAZ needs ``laspy[lazrs]``.
* E57 needs ``pye57`` (scan poses are applied).
* XYZ / PTS / TXT / CSV text: x y z [intensity] [r g b]

Coordinates are kept in float64 while reading, then stored relative to an
``origin`` (whole metres) in float32 so georeferenced scans keep mm precision.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import numpy as np

SCAN_EXTS = {".ply", ".las", ".laz", ".e57", ".xyz", ".pts", ".txt", ".csv"}
CHUNK = 2_000_000  # points per read


class PointCloudError(ValueError):
    pass


@dataclass
class Cloud:
    xyz: np.ndarray  # (N, 3) float32, relative to origin
    rgb: np.ndarray  # (N, 3) uint8
    origin: np.ndarray  # (3,) float64
    voxel_m: float
    raw_points: int
    has_color: bool
    meta: dict = field(default_factory=dict)


# ---- readers: each yields (xyz float64 (n,3), rgb uint8 (n,3) | None) ----


_PLY_TYPES = {
    "char": "i1",
    "int8": "i1",
    "uchar": "u1",
    "uint8": "u1",
    "short": "i2",
    "int16": "i2",
    "ushort": "u2",
    "uint16": "u2",
    "int": "i4",
    "int32": "i4",
    "uint": "u4",
    "uint32": "u4",
    "float": "f4",
    "float32": "f4",
    "double": "f8",
    "float64": "f8",
}


def _read_ply(path: Path) -> Iterator[tuple[np.ndarray, np.ndarray | None]]:
    with open(path, "rb") as f:
        if f.readline().strip() != b"ply":
            raise PointCloudError("not a PLY file")
        fmt, elements = None, []
        while True:
            line = f.readline()
            if not line:
                raise PointCloudError("PLY header has no end_header")
            words = line.decode("ascii", "replace").split()
            if not words or words[0] in ("comment", "obj_info"):
                continue
            if words[0] == "format":
                fmt = words[1]
            elif words[0] == "element":
                elements.append({"name": words[1], "count": int(words[2]), "props": []})
            elif words[0] == "property":
                if words[1] == "list":
                    elements[-1]["props"].append((words[4], None))
                else:
                    elements[-1]["props"].append((words[2], words[1]))
            elif words[0] == "end_header":
                break
        data_start = f.tell()
    vertex_i = next((i for i, e in enumerate(elements) if e["name"] == "vertex"), None)
    if vertex_i is None:
        raise PointCloudError("PLY file has no vertex element")
    vertex = elements[vertex_i]
    names = [n for n, _ in vertex["props"]]
    if not {"x", "y", "z"} <= set(names):
        raise PointCloudError("PLY vertices have no x/y/z")
    color = next(
        (
            c
            for c in (
                ("red", "green", "blue"),
                ("r", "g", "b"),
                ("diffuse_red", "diffuse_green", "diffuse_blue"),
            )
            if set(c) <= set(names)
        ),
        None,
    )
    count = vertex["count"]
    if fmt == "ascii":
        with open(path, "rb") as f:
            f.seek(data_start)
            for e in elements[:vertex_i]:  # skip lines of earlier elements
                for _ in range(e["count"]):
                    f.readline()
            idx = {n: i for i, n in enumerate(names)}
            done = 0
            while done < count:
                n = min(CHUNK, count - done)
                block = np.loadtxt(f, max_rows=n, ndmin=2, usecols=range(len(names)))
                if not len(block):
                    break
                xyz = block[:, [idx["x"], idx["y"], idx["z"]]]
                rgb = block[:, [idx[c] for c in color]] if color else None
                yield xyz, _to_u8(rgb) if rgb is not None else None
                done += len(block)
        return
    if fmt not in ("binary_little_endian", "binary_big_endian"):
        raise PointCloudError(f"unsupported PLY format {fmt}")
    if any(t is None for e in elements[: vertex_i + 1] for _, t in e["props"]):
        raise PointCloudError(
            "PLY with list properties before the vertices is not supported"
        )
    end = "<" if fmt == "binary_little_endian" else ">"
    offset = data_start
    for e in elements[:vertex_i]:
        offset += (
            e["count"]
            * np.dtype([(n, end + _PLY_TYPES[t]) for n, t in e["props"]]).itemsize
        )
    dtype = np.dtype([(n, end + _PLY_TYPES[t]) for n, t in vertex["props"]])
    arr = np.memmap(path, dtype=dtype, mode="r", offset=offset, shape=(count,))
    for s in range(0, count, CHUNK):
        part = arr[s : s + CHUNK]
        xyz = np.stack([part["x"], part["y"], part["z"]], axis=1).astype(np.float64)
        rgb = np.stack([part[c] for c in color], axis=1) if color else None
        yield xyz, _to_u8(rgb) if rgb is not None else None


def _to_u8(rgb: np.ndarray) -> np.ndarray:
    rgb = np.asarray(rgb, dtype=np.float64)
    top = rgb.max() if rgb.size else 0
    if top > 255:
        rgb = rgb / 257.0  # 16-bit colour
    elif 0 < top <= 1.0:
        rgb = rgb * 255.0  # float colour 0-1
    return np.clip(rgb, 0, 255).astype(np.uint8)


# LAS point format -> byte offset of the RGB fields in each record.
_LAS_RGB_OFFSET = {2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30}


def _read_las(path: Path) -> Iterator[tuple[np.ndarray, np.ndarray | None]]:
    with open(path, "rb") as f:
        head = f.read(375)
    if head[:4] != b"LASF":
        raise PointCloudError("not a LAS file")
    version = (head[24], head[25])
    offset_to_points = struct.unpack_from("<I", head, 96)[0]
    fmt_byte = head[104]
    record_len = struct.unpack_from("<H", head, 105)[0]
    count = struct.unpack_from("<I", head, 107)[0]
    scale = np.array(struct.unpack_from("<3d", head, 131))
    offset = np.array(struct.unpack_from("<3d", head, 155))
    if version >= (1, 4) and len(head) >= 255:
        count = struct.unpack_from("<Q", head, 247)[0] or count
    point_format = fmt_byte & 0x3F
    if fmt_byte & 0xC0:  # compression bits: this is LAZ
        yield from _read_laz(path)
        return
    size = path.stat().st_size
    count = min(count, (size - offset_to_points) // record_len)
    raw = np.memmap(
        path,
        dtype=np.uint8,
        mode="r",
        offset=offset_to_points,
        shape=(count, record_len),
    )
    rgb_at = _LAS_RGB_OFFSET.get(point_format)
    for s in range(0, count, CHUNK):
        block = np.ascontiguousarray(raw[s : s + CHUNK])
        ints = block[:, :12].copy().view("<i4").reshape(-1, 3)
        xyz = ints * scale + offset
        rgb = None
        if rgb_at is not None:
            rgb = _to_u8(
                block[:, rgb_at : rgb_at + 6].copy().view("<u2").reshape(-1, 3)
            )
        yield xyz, rgb


def _read_laz(path: Path) -> Iterator[tuple[np.ndarray, np.ndarray | None]]:
    try:
        import laspy
    except ImportError as exc:
        raise PointCloudError(
            "LAZ needs laspy with lazrs (pip install 'laspy[lazrs]'), or export LAS/E57/PLY"
        ) from exc
    with laspy.open(str(path)) as reader:
        has_rgb = "red" in reader.header.point_format.dimension_names
        for pts in reader.chunk_iterator(CHUNK):
            xyz = np.stack(
                [np.asarray(pts.x), np.asarray(pts.y), np.asarray(pts.z)], axis=1
            )
            rgb = (
                _to_u8(np.stack([pts.red, pts.green, pts.blue], axis=1))
                if has_rgb
                else None
            )
            yield xyz, rgb


def _read_e57(path: Path) -> Iterator[tuple[np.ndarray, np.ndarray | None]]:
    try:
        import pye57
    except ImportError as exc:
        raise PointCloudError(
            "E57 needs pye57 (pip install pye57), or export LAS/PLY"
        ) from exc
    e57 = pye57.E57(str(path))
    for i in range(e57.scan_count):
        header = e57.get_header(i)
        fields = set(header.point_fields)
        colors = {"colorRed", "colorGreen", "colorBlue"} <= fields
        data = e57.read_scan(
            i, colors=colors, ignore_missing_fields=True, transform=True
        )
        xyz = np.stack(
            [data["cartesianX"], data["cartesianY"], data["cartesianZ"]], axis=1
        ).astype(np.float64)
        rgb = None
        if colors:
            rgb = _to_u8(
                np.stack(
                    [data["colorRed"], data["colorGreen"], data["colorBlue"]], axis=1
                )
            )
        ok = np.isfinite(xyz).all(axis=1)
        for s in range(0, len(xyz), CHUNK):
            sl = slice(s, s + CHUNK)
            yield xyz[sl][ok[sl]], rgb[sl][ok[sl]] if rgb is not None else None


def _read_text(path: Path) -> Iterator[tuple[np.ndarray, np.ndarray | None]]:
    with open(path, "r", errors="replace") as f:
        first = f.readline()
        # PTS files start with a point count line.
        if len(first.split()) == 1 and first.strip().isdigit():
            first = f.readline()
        delim = "," if "," in first else None
        try:
            ncols = len([float(v) for v in first.replace(",", " ").split()])
        except ValueError:  # header row
            first = f.readline()
            delim = "," if "," in first else None
            ncols = len(first.replace(",", " ").split())
        if ncols < 3:
            raise PointCloudError("text point cloud needs x y z columns")
        # x y z | x y z i | x y z r g b | x y z i r g b
        rgb_cols = {6: [3, 4, 5], 7: [4, 5, 6]}.get(ncols)
        pending = [first]
        while True:
            lines = pending + [ln for _, ln in zip(range(CHUNK), f)]
            pending = []
            if not lines:
                break
            block = np.loadtxt(
                lines, delimiter=delim, ndmin=2, usecols=range(min(ncols, 7))
            )
            if not len(block):
                break
            rgb = _to_u8(block[:, rgb_cols]) if rgb_cols else None
            yield block[:, :3], rgb
            if len(lines) < CHUNK:
                break


def iter_points(path: Path) -> Iterator[tuple[np.ndarray, np.ndarray | None]]:
    ext = path.suffix.lower()
    if ext == ".ply":
        return _read_ply(path)
    if ext == ".las":
        return _read_las(path)
    if ext == ".laz":
        return _read_laz(path)
    if ext == ".e57":
        return _read_e57(path)
    if ext in (".xyz", ".pts", ".txt", ".csv"):
        return _read_text(path)
    raise PointCloudError(f"unsupported point cloud format {ext}")


# ---- downsampling ---------------------------------------------------------------


def _voxel_keys(xyz: np.ndarray, voxel: float) -> np.ndarray:
    ijk = np.floor(xyz / voxel).astype(np.int64) + (1 << 20)
    if (ijk < 0).any() or (ijk >= 1 << 21).any():
        raise PointCloudError("scan is too large for this voxel size")
    return ijk[:, 0] | (ijk[:, 1] << 21) | (ijk[:, 2] << 42)


def voxel_downsample(xyz: np.ndarray, rgb: np.ndarray, voxel: float):
    """Keep one point (the first) per voxel."""
    if not len(xyz):
        return xyz, rgb
    _, first = np.unique(_voxel_keys(xyz, voxel), return_index=True)
    first.sort()
    return xyz[first], rgb[first]


def load(path: Path, voxel_m: float = 0.01, max_points: int = 4_000_000) -> Cloud:
    """Read a scan, thinned to at most one point per ``voxel_m`` cube.

    If the result would exceed ``max_points`` the voxel is doubled until it
    fits, so huge scans still load; the voxel actually used is returned.
    """
    origin = None
    keep_xyz: list[np.ndarray] = []
    keep_rgb: list[np.ndarray] = []
    kept = raw = 0
    has_color = False
    voxel = voxel_m
    for xyz, rgb in iter_points(Path(path)):
        ok = np.isfinite(xyz).all(axis=1)
        xyz = xyz[ok]
        if not len(xyz):
            continue
        raw += len(xyz)
        if origin is None:
            origin = np.floor(xyz.min(axis=0))
        if rgb is None:
            rgb = np.full((len(xyz), 3), 200, np.uint8)
        else:
            rgb = rgb[ok]
            has_color = True
        local = (xyz - origin).astype(np.float32)
        local, rgb = voxel_downsample(local, rgb, voxel)
        keep_xyz.append(local)
        keep_rgb.append(rgb)
        kept += len(local)
        if kept > 1.5 * max_points or len(keep_xyz) > 8:
            # Merge chunks (removes cross-chunk duplicates) and coarsen if needed.
            all_xyz, all_rgb = voxel_downsample(
                np.concatenate(keep_xyz), np.concatenate(keep_rgb), voxel
            )
            while len(all_xyz) > max_points:
                voxel *= 2
                all_xyz, all_rgb = voxel_downsample(all_xyz, all_rgb, voxel)
            keep_xyz, keep_rgb, kept = [all_xyz], [all_rgb], len(all_xyz)
    if origin is None:
        raise PointCloudError("the file contains no points")
    xyz, rgb = voxel_downsample(
        np.concatenate(keep_xyz), np.concatenate(keep_rgb), voxel
    )
    while len(xyz) > max_points:
        voxel *= 2
        xyz, rgb = voxel_downsample(xyz, rgb, voxel)
    return Cloud(
        xyz=xyz,
        rgb=rgb,
        origin=origin,
        voxel_m=voxel,
        raw_points=raw,
        has_color=has_color,
    )


def thin(xyz: np.ndarray, rgb: np.ndarray, max_points: int, voxel: float):
    """Coarser copy (e.g. for the web viewer); returns (xyz, rgb, voxel)."""
    while len(xyz) > max_points:
        voxel *= 1.5
        xyz, rgb = voxel_downsample(xyz, rgb, voxel)
    return xyz, rgb, voxel


# ---- storage ----------------------------------------------------------------------


def save_npz(path: Path, cloud: Cloud) -> None:
    with open(path, "wb") as f:
        np.savez(f, xyz=cloud.xyz, rgb=cloud.rgb, origin=cloud.origin)


def load_npz(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    with np.load(path) as d:
        return d["xyz"], d["rgb"], d["origin"]


def write_viewer_bin(path: Path, xyz: np.ndarray, rgb: np.ndarray) -> None:
    """``[uint32 count][float32 xyz * n][uint8 rgb * n]`` little endian, for the browser."""
    with open(path, "wb") as f:
        f.write(struct.pack("<I", len(xyz)))
        f.write(np.ascontiguousarray(xyz, dtype="<f4").tobytes())
        f.write(np.ascontiguousarray(rgb, dtype=np.uint8).tobytes())


def bounds(xyz: np.ndarray) -> dict:
    lo, hi = xyz.min(axis=0), xyz.max(axis=0)
    return {
        "min": [round(float(v), 4) for v in lo],
        "max": [round(float(v), 4) for v in hi],
    }
