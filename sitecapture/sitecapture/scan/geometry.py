"""Nearest-surface queries, rigid/similarity fits and ICP, in plain numpy.

``MeshIndex`` answers "which triangle is closest to each point, and how far"
exactly for every point within ``max_dist`` of the mesh (points further away
get ``inf``). It bins triangles into a uniform grid: each triangle is listed
in every cell its bounding box, grown by ``max_dist``, touches. Any triangle
within ``max_dist`` of a point therefore appears in that point's cell, so
checking the cell's candidates gives the exact nearest triangle.
"""

from __future__ import annotations

import numpy as np

_PAIR_BATCH = 3_000_000


def closest_on_triangles(p, a, b, c):
    """Closest point on triangles (a, b, c) to points p; all (n, 3). Ericson 5.1.5."""
    ab, ac, ap = b - a, c - a, p - a
    d1 = np.einsum("ij,ij->i", ab, ap)
    d2 = np.einsum("ij,ij->i", ac, ap)
    bp = p - b
    d3 = np.einsum("ij,ij->i", ab, bp)
    d4 = np.einsum("ij,ij->i", ac, bp)
    cp = p - c
    d5 = np.einsum("ij,ij->i", ab, cp)
    d6 = np.einsum("ij,ij->i", ac, cp)
    vc = d1 * d4 - d3 * d2
    vb = d5 * d2 - d1 * d6
    va = d3 * d6 - d5 * d4
    denom = va + vb + vc
    with np.errstate(divide="ignore", invalid="ignore"):
        v = vb / denom
        w = vc / denom
        out = a + ab * v[:, None] + ac * w[:, None]  # inside the face
        # Edge regions.
        t_ab = d1 / (d1 - d3)
        t_ac = d2 / (d2 - d6)
        t_bc = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    m = (vc <= 0) & (d1 >= 0) & (d3 <= 0)
    out[m] = a[m] + ab[m] * t_ab[m, None]
    m = (vb <= 0) & (d2 >= 0) & (d6 <= 0)
    out[m] = a[m] + ac[m] * t_ac[m, None]
    m = (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0)
    out[m] = b[m] + (c[m] - b[m]) * t_bc[m, None]
    # Vertex regions.
    m = (d1 <= 0) & (d2 <= 0)
    out[m] = a[m]
    m = (d3 >= 0) & (d4 <= d3)
    out[m] = b[m]
    m = (d6 >= 0) & (d5 <= d6)
    out[m] = c[m]
    # Degenerate (zero-area) triangles: fall back to the nearest vertex.
    bad = ~np.isfinite(out).all(axis=1)
    if bad.any():
        cand = np.stack([a[bad], b[bad], c[bad]], axis=1)
        k = np.argmin(((cand - p[bad, None]) ** 2).sum(-1), axis=1)
        out[bad] = cand[np.arange(len(k)), k]
    return out


class _Grid:
    """Uniform grid mapping integer cell keys to item ids (sorted for lookup)."""

    def __init__(self, cell: float, lo: np.ndarray):
        self.cell = float(cell)
        self.lo = lo.astype(np.float64)

    def ijk(self, pts: np.ndarray) -> np.ndarray:
        return np.floor((pts - self.lo) / self.cell).astype(np.int64)

    def key(self, ijk: np.ndarray) -> np.ndarray:
        ijk = ijk + 1  # room for the -1 neighbour
        return ijk[:, 0] + ijk[:, 1] * self.nx + ijk[:, 2] * self.nx * self.ny

    def build(
        self, cell_ijk_lo: np.ndarray, cell_ijk_hi: np.ndarray, extent_hi: np.ndarray
    ):
        """Register item i in every cell from lo[i] to hi[i] inclusive."""
        top = np.maximum(extent_hi, cell_ijk_hi.max(axis=0)) + 3
        self.nx, self.ny = int(top[0]), int(top[1])
        span = cell_ijk_hi - cell_ijk_lo + 1
        n_cells = span.prod(axis=1)
        item = np.repeat(np.arange(len(span)), n_cells)
        # Position of each repeated entry inside its item's box.
        start = np.repeat(np.cumsum(n_cells) - n_cells, n_cells)
        local = np.arange(len(item)) - start
        sx, sy = span[item, 0], span[item, 1]
        ix = local % sx
        iy = (local // sx) % sy
        iz = local // (sx * sy)
        ijk = cell_ijk_lo[item] + np.stack([ix, iy, iz], axis=1)
        keys = self.key(ijk)
        order = np.argsort(keys, kind="stable")
        self.keys = keys[order]
        self.items = item[order]

    def lookup(self, keys: np.ndarray):
        lo = np.searchsorted(self.keys, keys, side="left")
        hi = np.searchsorted(self.keys, keys, side="right")
        return lo, hi


def _expand_pairs(lo: np.ndarray, hi: np.ndarray):
    """(query index, candidate slot) for every candidate of every query."""
    counts = hi - lo
    q = np.repeat(np.arange(len(lo)), counts)
    start = np.repeat(np.cumsum(counts) - counts, counts)
    slot = lo[q] + (np.arange(len(q)) - start)
    return q, slot


def _batches(counts: np.ndarray, batch: int = _PAIR_BATCH):
    """Split queries into consecutive ranges with about ``batch`` pairs each."""
    csum = np.cumsum(counts)
    i = 0
    n = len(counts)
    while i < n:
        base = csum[i - 1] if i else 0
        j = int(np.searchsorted(csum, base + batch, side="right"))
        j = max(j, i + 1)
        yield i, min(j, n)
        i = j


class MeshIndex:
    def __init__(
        self,
        verts: np.ndarray,
        faces: np.ndarray,
        max_dist: float,
        cell: float | None = None,
    ):
        self.verts = np.asarray(verts, dtype=np.float64)
        self.faces = np.asarray(faces, dtype=np.int64)
        self.max_dist = float(max_dist)
        tri = self.verts[self.faces]  # (m, 3, 3)
        self.a, self.b, self.c = tri[:, 0], tri[:, 1], tri[:, 2]
        n = np.cross(self.b - self.a, self.c - self.a)
        norm = np.linalg.norm(n, axis=1, keepdims=True)
        self.normals = np.divide(n, norm, out=np.zeros_like(n), where=norm > 0)
        self.areas = norm[:, 0] / 2
        lo = tri.min(axis=1) - self.max_dist
        hi = tri.max(axis=1) + self.max_dist
        if cell is None:
            cell = max(self.max_dist, 0.05)
            # Keep the number of grid entries bounded for very large meshes.
            while True:
                span = np.floor(hi / cell) - np.floor(lo / cell) + 1
                if span.prod(axis=1).sum() < 40_000_000:
                    break
                cell *= 1.6
        self.grid = _Grid(cell, lo.min(axis=0))
        g_lo, g_hi = self.grid.ijk(lo), self.grid.ijk(hi)
        self.grid.build(g_lo, g_hi, g_hi.max(axis=0))

    def query(self, pts: np.ndarray):
        """Return (distance, triangle index, closest point); inf / -1 when beyond max_dist."""
        pts = np.asarray(pts, dtype=np.float64)
        n = len(pts)
        best_d2 = np.full(n, np.inf)
        best_t = np.full(n, -1, dtype=np.int64)
        best_p = np.zeros((n, 3))
        ijk = self.grid.ijk(pts)
        top = np.array([self.grid.nx - 2, self.grid.ny - 2, np.iinfo(np.int32).max])
        inside = (ijk >= 0).all(axis=1) & (ijk < top).all(axis=1)
        idx = np.nonzero(inside)[0]
        if not len(idx):
            return np.sqrt(best_d2), best_t, best_p
        lo, hi = self.grid.lookup(self.grid.key(ijk[idx]))
        for s, e in _batches(hi - lo):
            q, slot = _expand_pairs(lo[s:e], hi[s:e])
            if not len(q):
                continue
            pid = idx[s:e][q]
            tri = self.grid.items[slot]
            cp = closest_on_triangles(pts[pid], self.a[tri], self.b[tri], self.c[tri])
            d2 = ((cp - pts[pid]) ** 2).sum(axis=1)
            # Minimum per point: sort by (point, distance), take first of each point.
            order = np.lexsort((d2, pid))
            pid_s = pid[order]
            first = np.ones(len(order), bool)
            first[1:] = pid_s[1:] != pid_s[:-1]
            sel = order[first]
            better = d2[sel] < best_d2[pid[sel]]
            sel = sel[better]
            best_d2[pid[sel]] = d2[sel]
            best_t[pid[sel]] = tri[sel]
            best_p[pid[sel]] = cp[sel]
        far = best_d2 > self.max_dist**2
        best_d2[far] = np.inf
        best_t[far] = -1
        return np.sqrt(best_d2), best_t, best_p

    def signed(
        self, pts: np.ndarray, closest: np.ndarray, tri: np.ndarray
    ) -> np.ndarray:
        """Sign of each point's offset along its nearest face normal (+ = outside)."""
        s = np.zeros(len(pts))
        ok = tri >= 0
        s[ok] = np.sign(
            np.einsum("ij,ij->i", pts[ok] - closest[ok], self.normals[tri[ok]])
        )
        return s


class Occupancy:
    """Voxel occupancy of a point cloud, for fast "is there a scan point near here".

    ``near(q)`` is true when q's voxel or one of its 26 neighbours holds a
    point: always true within ``voxel`` of a point, never beyond
    ``2 * sqrt(3) * voxel``.
    """

    def __init__(self, pts: np.ndarray, voxel: float):
        self.voxel = float(voxel)
        pts = np.asarray(pts, dtype=np.float64)
        self.lo = pts.min(axis=0) - 2 * voxel
        ijk = np.floor((pts - self.lo) / voxel).astype(np.int64)
        self.dims = ijk.max(axis=0) + 3
        self.keys = np.unique(self._key(ijk))

    def _key(self, ijk):
        return (
            ijk[:, 0]
            + ijk[:, 1] * self.dims[0]
            + ijk[:, 2] * self.dims[0] * self.dims[1]
        )

    def near(self, q: np.ndarray) -> np.ndarray:
        ijk = np.floor((np.asarray(q, dtype=np.float64) - self.lo) / self.voxel).astype(
            np.int64
        )
        found = np.zeros(len(ijk), bool)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    n = ijk + (dx, dy, dz)
                    ok = ~found & (n >= 0).all(axis=1) & (n < self.dims).all(axis=1)
                    k = self._key(n[ok])
                    pos = np.searchsorted(self.keys, k).clip(max=len(self.keys) - 1)
                    found[np.nonzero(ok)[0][self.keys[pos] == k]] = True
        return found


def umeyama(src: np.ndarray, dst: np.ndarray, with_scale: bool = False) -> np.ndarray:
    """4x4 transform T minimising |T(src) - dst|^2 (rotation, translation, optional scale)."""
    src = np.asarray(src, dtype=np.float64)
    dst = np.asarray(dst, dtype=np.float64)
    if len(src) < 3:
        raise ValueError("need at least 3 point pairs")
    mu_s, mu_d = src.mean(axis=0), dst.mean(axis=0)
    xs, xd = src - mu_s, dst - mu_d
    cov = xd.T @ xs / len(src)
    u, d, vt = np.linalg.svd(cov)
    sign = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sign[2, 2] = -1
    r = u @ sign @ vt
    scale = 1.0
    if with_scale:
        var = (xs**2).sum() / len(src)
        if var <= 0:
            raise ValueError("picked points are all the same")
        scale = float(np.trace(np.diag(d) @ sign) / var)
    t = mu_d - scale * r @ mu_s
    out = np.eye(4)
    out[:3, :3] = scale * r
    out[:3, 3] = t
    return out


def apply(T: np.ndarray, pts: np.ndarray) -> np.ndarray:
    return np.asarray(pts, dtype=np.float64) @ T[:3, :3].T + T[:3, 3]


def scale_of(T: np.ndarray) -> float:
    return float(np.cbrt(abs(np.linalg.det(T[:3, :3]))))


def _point_to_plane_step(p, q, n, with_scale=False, damping=1e-6):
    """Small motion minimising sum(((T p) - q) . n)^2, linearised about the centroid.

    Unknowns: rotation (wx, wy, wz), translation, and with ``with_scale`` a
    log-scale s, so T p = c + e^s R (p - c) + t.
    """
    c = p.mean(axis=0)
    pc = p - c
    cols = [np.cross(pc, n), n]
    if with_scale:
        cols.append(np.einsum("ij,ij->i", pc, n)[:, None])
    A = np.hstack(cols)
    b = -np.einsum("ij,ij->i", p - q, n)
    H = A.T @ A
    H += damping * np.trace(H) / len(H) * np.eye(len(H))
    x = np.linalg.solve(H, A.T @ b)
    theta = float(np.linalg.norm(x[:3]))
    if theta > 1e-12:
        k = x[:3] / theta
        K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
        R = np.eye(3) + np.sin(theta) * K + (1 - np.cos(theta)) * K @ K
    else:
        R = np.eye(3)
    scale = float(np.exp(x[6])) if with_scale else 1.0
    T = np.eye(4)
    T[:3, :3] = scale * R
    T[:3, 3] = c - scale * R @ c + x[3:6]
    return T


def icp(
    pts: np.ndarray,
    mesh: MeshIndex,
    T0: np.ndarray,
    with_scale: bool = False,
    iterations: int = 50,
    min_band: float = 0.01,
    tol: float = 1e-6,
):
    """Refine ``T0`` (scan -> model) by robust ICP against the mesh surfaces.

    Each round keeps only points within a band of 2.5 x the median distance
    (never below ``min_band``, never above the mesh's ``max_dist``), so
    clutter and elements built out of position stop pulling the fit as it
    converges. Steps are point-to-plane; ``with_scale`` (for photo-derived
    clouds with unknown scale) also solves for scale. Returns (T, rms of inliers, fraction of points near the model,
    iterations used).
    """
    T = T0.copy()
    it = 0
    band = mesh.max_dist
    for it in range(1, iterations + 1):
        moved = apply(T, pts)
        d, tri, cp = mesh.query(moved)
        ok = np.isfinite(d)
        if ok.sum() < 10:
            raise ValueError(
                "too few scan points near the model to refine the alignment"
            )
        band = float(np.clip(2.5 * np.median(d[ok]), min_band, mesh.max_dist))
        use = ok & (d <= band)
        if use.sum() < 10:
            use = ok
        step = _point_to_plane_step(
            moved[use], cp[use], mesh.normals[tri[use]], with_scale=with_scale
        )
        T = step @ T
        if np.abs(step - np.eye(4)).max() < tol:
            break
    d, _, _ = mesh.query(apply(T, pts))
    ok = np.isfinite(d)
    use = ok & (d <= band)
    rms = float(np.sqrt((d[use] ** 2).mean())) if use.any() else float("inf")
    return T, rms, float(ok.mean()), it
