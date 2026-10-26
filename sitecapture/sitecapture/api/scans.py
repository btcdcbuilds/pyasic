"""As-built check routes: scans, IFC meshes, alignment checks, 3D issues, reports."""

from __future__ import annotations

import datetime as dt
import logging
from pathlib import Path
from types import SimpleNamespace

from fastapi import BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from sitecapture.db import Annotation, BimModel, Capture, Scan, ScanCheck, Upload, User
from sitecapture.storage import safe_name

log = logging.getLogger("sitecapture.scans")

Vec3 = list[float]


class ScanIn(BaseModel):
    upload_id: int
    name: str = Field(default="", max_length=200)
    captured_at: dt.datetime | None = None


class CheckIn(BaseModel):
    bim_model_id: int
    # [[scan x, y, z], [model x, y, z]] in each one's local coordinates.
    pairs: list[list[Vec3]] = Field(default_factory=list, max_length=50)
    tolerance_mm: float = Field(default=25, ge=1, le=500)


class CheckAnnotationIn(BaseModel):
    position: Vec3
    element_guid: str | None = Field(default=None, max_length=64)
    category: str
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=5000)
    visible_to_client: bool = False
    ai_assisted: bool = False


def scan_out(s: Scan) -> dict:
    return {
        "id": s.id,
        "project_id": s.project_id,
        "name": s.name,
        "source": s.source,
        "capture_id": s.capture_id,
        "captured_at": s.captured_at.isoformat(),
        "metric": s.metric,
        "status": s.status,
        "error": s.error,
        "raw_points": s.raw_points,
        "points": s.points,
        "voxel_m": s.voxel_m,
        "viewer_points": s.viewer_points,
        "has_color": s.has_color,
        "origin": s.origin,
        "bounds": s.bounds,
        "points_url": f"/api/scans/{s.id}/points" if s.viewer_path else None,
        "checks": [check_out(c) for c in s.checks],
        "created_at": s.created_at.isoformat(),
    }


def check_out(c: ScanCheck, full: bool = False) -> dict:
    out = {
        "id": c.id,
        "scan_id": c.scan_id,
        "bim_model_id": c.bim_model_id,
        "bim_model_name": c.bim_model.name if c.bim_model else None,
        "status": c.status,
        "error": c.error,
        "tolerance_mm": round(1000 * c.tolerance_m, 1),
        "alignment": c.alignment,
        "summary": c.summary,
        "has_report": bool(c.report_markdown),
        "created_at": c.created_at.isoformat(),
    }
    if full:
        out.update(
            pairs=c.pairs,
            transform=c.transform,
            elements=c.elements or [],
            deviation_url=f"/api/checks/{c.id}/deviation" if c.deviation_path else None,
            report_markdown=c.report_markdown,
        )
    return out


def register(api, h: SimpleNamespace) -> None:
    """Add the routes to ``api``. ``h`` carries helpers from ``create_app``."""
    from sitecapture.scan import service

    storage, settings = h.storage, h.settings
    db, require_user, staff_only = h.db, h.require_user, h.staff_only
    see_project, get_or_404, file_or_404 = h.see_project, h.get_or_404, h.file_or_404

    def run_later(background: BackgroundTasks, fn, obj_id: int) -> None:
        if settings.inline_processing:
            fn(obj_id)
        else:
            background.add_task(fn, obj_id)

    def process_scan(scan_id: int) -> None:
        session = h.SessionLocal()
        try:
            scan = session.get(Scan, scan_id)
            scan.status = "processing"
            session.commit()
            try:
                service.process_scan(storage, scan)
            except Exception as exc:  # noqa: BLE001 - shown to the user
                log.exception("scan %s failed", scan_id)
                scan.status, scan.error = "failed", str(exc)[:2000]
            session.commit()
        finally:
            session.close()

    def process_check(check_id: int) -> None:
        session = h.SessionLocal()
        try:
            check = session.get(ScanCheck, check_id)
            check.status = "running"
            session.commit()
            try:
                service.run_check(storage, check)
            except Exception as exc:  # noqa: BLE001
                log.exception("check %s failed", check_id)
                check.status, check.error = "failed", str(exc)[:2000]
            session.commit()
        finally:
            session.close()

    def see_scan(session, user, scan_id) -> Scan:
        scan = get_or_404(session, Scan, scan_id)
        see_project(session, user, scan.project_id)
        return scan

    def see_check(session, user, check_id) -> ScanCheck:
        check = get_or_404(session, ScanCheck, check_id)
        see_project(session, user, check.project_id)
        return check

    # -- scans --

    @api.get("/api/projects/{project_id}/scans")
    def list_scans(
        project_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        see_project(session, user, project_id)
        rows = session.scalars(
            select(Scan)
            .where(Scan.project_id == project_id)
            .order_by(Scan.captured_at.desc())
        )
        return [scan_out(s) for s in rows]

    @api.post(
        "/api/projects/{project_id}/scans", status_code=201, dependencies=staff_only
    )
    def create_scan(
        project_id: int,
        body: ScanIn,
        background: BackgroundTasks,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        upload = get_or_404(session, Upload, body.upload_id)
        if upload.user_id != user.id or upload.project_id != project_id:
            raise HTTPException(404, f"Upload {body.upload_id} not found")
        if upload.purpose != "scan":
            raise HTTPException(400, f"{upload.filename} is not a point cloud file")
        if upload.received != upload.size:
            raise HTTPException(409, f"{upload.filename} has not finished uploading")
        scan = Scan(
            project_id=project_id,
            name=body.name.strip() or Path(upload.filename).stem,
            source="file",
            source_path="",
            captured_at=body.captured_at or dt.datetime.now(dt.timezone.utc),
            metric=True,
        )
        session.add(scan)
        session.commit()
        target = (
            storage.project_dir(project_id, "scans", str(scan.id))
            / f"source_{safe_name(upload.filename)}"
        )
        storage.move(Path(upload.path), target)
        scan.source_path = str(target)
        session.delete(upload)
        session.commit()
        run_later(background, process_scan, scan.id)
        session.refresh(scan)
        return scan_out(scan)

    @api.post(
        "/api/captures/{capture_id}/scan", status_code=201, dependencies=staff_only
    )
    def scan_from_capture(
        capture_id: int, background: BackgroundTasks, session: Session = Depends(db)
    ):
        """Use the dense point cloud the GPU reconstruction made from a 360 walk."""
        capture = get_or_404(session, Capture, capture_id)
        if not capture.model_path:
            raise HTTPException(
                409,
                "this walk has no point cloud yet: run the reconstruction on a GPU first",
            )
        scan = Scan(
            project_id=capture.project_id,
            name=f"360 walk {capture.captured_at:%Y-%m-%d}",
            source="capture",
            capture_id=capture.id,
            source_path=capture.model_path,
            captured_at=capture.captured_at,
            # Structure-from-motion from photos has no true scale.
            metric=False,
        )
        session.add(scan)
        session.commit()
        run_later(background, process_scan, scan.id)
        session.refresh(scan)
        return scan_out(scan)

    @api.get("/api/scans/{scan_id}")
    def get_scan(
        scan_id: int, user: User = Depends(require_user), session: Session = Depends(db)
    ):
        return scan_out(see_scan(session, user, scan_id))

    @api.get("/api/scans/{scan_id}/points")
    def scan_points(
        scan_id: int, user: User = Depends(require_user), session: Session = Depends(db)
    ):
        return file_or_404(see_scan(session, user, scan_id).viewer_path)

    @api.delete("/api/scans/{scan_id}", dependencies=staff_only)
    def delete_scan(scan_id: int, session: Session = Depends(db)):
        scan = get_or_404(session, Scan, scan_id)
        for c in scan.checks:
            for a in session.scalars(
                select(Annotation).where(Annotation.check_id == c.id)
            ):
                session.delete(a)
            if c.deviation_path:
                storage.remove(Path(c.deviation_path))
            session.delete(c)
        for p in (scan.cloud_path, scan.viewer_path):
            if p:
                storage.remove(Path(p))
        if scan.source == "file" and scan.source_path:
            storage.remove(Path(scan.source_path))
        session.delete(scan)
        session.commit()
        return {"ok": True}

    # -- design model geometry for the viewer --

    @api.get("/api/bim/{bim_id}/mesh")
    def bim_mesh(
        bim_id: int, user: User = Depends(require_user), session: Session = Depends(db)
    ):
        bim = get_or_404(session, BimModel, bim_id)
        see_project(session, user, bim.project_id)
        if not bim.mesh_meta:
            try:
                service.ensure_mesh(storage, bim)
            except ImportError as exc:
                raise HTTPException(
                    501, "ifcopenshell is not installed (pip install .[bim])"
                ) from exc
            except Exception as exc:  # noqa: BLE001 - bad geometry
                raise HTTPException(
                    400, f"could not build the 3D model: {exc}"
                ) from exc
            session.commit()
        return {**bim.mesh_meta, "mesh_url": f"/api/bim/{bim.id}/mesh.bin"}

    @api.get("/api/bim/{bim_id}/mesh.bin")
    def bim_mesh_bin(
        bim_id: int, user: User = Depends(require_user), session: Session = Depends(db)
    ):
        bim = get_or_404(session, BimModel, bim_id)
        see_project(session, user, bim.project_id)
        return file_or_404(bim.mesh_viewer_path)

    # -- checks --

    @api.post("/api/scans/{scan_id}/checks", status_code=201, dependencies=staff_only)
    def create_check(
        scan_id: int,
        body: CheckIn,
        background: BackgroundTasks,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        scan = get_or_404(session, Scan, scan_id)
        bim = get_or_404(session, BimModel, body.bim_model_id)
        if bim.project_id != scan.project_id:
            raise HTTPException(400, "the model belongs to another project")
        if scan.status != "ready":
            raise HTTPException(409, "the scan is still processing")
        if body.pairs and len(body.pairs) < 3:
            raise HTTPException(
                400,
                "pick at least 3 matching points (or none to use shared coordinates)",
            )
        for p in body.pairs:
            if len(p) != 2 or any(len(v) != 3 for v in p):
                raise HTTPException(
                    400, "each pair is [[scan x, y, z], [model x, y, z]]"
                )
        check = ScanCheck(
            project_id=scan.project_id,
            scan_id=scan.id,
            bim_model_id=bim.id,
            pairs=body.pairs,
            tolerance_m=body.tolerance_mm / 1000,
            created_by_id=user.id,
        )
        session.add(check)
        session.commit()
        run_later(background, process_check, check.id)
        session.refresh(check)
        return check_out(check, full=True)

    @api.get("/api/checks/{check_id}")
    def get_check(
        check_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        return check_out(see_check(session, user, check_id), full=True)

    @api.get("/api/checks/{check_id}/deviation")
    def check_deviation(
        check_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        return file_or_404(see_check(session, user, check_id).deviation_path)

    @api.delete("/api/checks/{check_id}", dependencies=staff_only)
    def delete_check(check_id: int, session: Session = Depends(db)):
        check = get_or_404(session, ScanCheck, check_id)
        for a in session.scalars(
            select(Annotation).where(Annotation.check_id == check.id)
        ):
            session.delete(a)
        if check.deviation_path:
            storage.remove(Path(check.deviation_path))
        session.delete(check)
        session.commit()
        return {"ok": True}

    @api.get("/api/checks/{check_id}/annotations")
    def check_annotations(
        check_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        see_check(session, user, check_id)
        query = select(Annotation).where(Annotation.check_id == check_id)
        if not user.is_staff:
            query = query.where(Annotation.visible_to_client.is_(True))
        return [
            h.annotation_out(a) for a in session.scalars(query.order_by(Annotation.id))
        ]

    @api.post(
        "/api/checks/{check_id}/annotations", status_code=201, dependencies=staff_only
    )
    def create_check_annotation(
        check_id: int,
        body: CheckAnnotationIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        check = get_or_404(session, ScanCheck, check_id)
        h.check_category(body.category)
        if len(body.position) != 3:
            raise HTTPException(400, "position is [x, y, z]")
        a = Annotation(
            project_id=check.project_id,
            check_id=check.id,
            author_id=user.id,
            **body.model_dump(),
        )
        session.add(a)
        session.commit()
        return h.annotation_out(a)

    @api.post("/api/checks/{check_id}/report", dependencies=staff_only)
    def check_report(check_id: int, session: Session = Depends(db)):
        from sitecapture.ai import asbuilt
        from sitecapture.ai.claude import AiError

        check = get_or_404(session, ScanCheck, check_id)
        if check.status != "ready":
            raise HTTPException(409, "the check has not finished")
        project = session.get(h.Project, check.project_id)
        try:
            check.report_markdown = asbuilt.write_report(
                project.name,
                check.scan.name,
                check.bim_model.name,
                check,
                settings.ai_model,
            )
        except AiError as exc:
            raise HTTPException(409, str(exc)) from exc
        session.commit()
        return check_out(check, full=True)

    @api.get("/api/checks/{check_id}/report.pdf")
    def check_report_pdf(
        check_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        from sitecapture.ai import pdf

        check = see_check(session, user, check_id)
        if not check.report_markdown:
            raise HTTPException(404, "no report yet")
        out = (
            storage.project_dir(check.project_id, "reports") / f"asbuilt_{check.id}.pdf"
        )
        pdf.markdown_to_pdf(
            check.report_markdown, out, title=f"As-built check {check.scan.name}"
        )
        return FileResponse(out, media_type="application/pdf", filename=out.name)
