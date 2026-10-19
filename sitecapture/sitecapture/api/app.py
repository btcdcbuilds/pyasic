"""HTTP API and the bundled web UI.

Run with ``uvicorn sitecapture.api.app:app``. There is no user login yet: put
it behind your own auth (VPN, reverse-proxy SSO) before exposing it.
"""

from __future__ import annotations

import datetime as dt
import hmac
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterator

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from sitecapture.config import Settings, get_settings
from sitecapture.db import (
    BimModel,
    Capture,
    Drawing,
    Frame,
    Job,
    Project,
    Report,
    make_sessionmaker,
)
from sitecapture.gpu import orchestrator
from sitecapture.pipeline import drawings as drawings_mod
from sitecapture.pipeline import frames as frames_mod
from sitecapture.pipeline import timeline
from sitecapture.storage import LocalStorage

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


# ---- request bodies -------------------------------------------------------


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ControlPointIn(BaseModel):
    frame_index: int = Field(ge=0)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class TimelapseIn(BaseModel):
    drawing_id: int
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    radius: float = Field(default=0.03, gt=0, le=0.5)
    yaw_deg: float = 0.0
    fov_deg: float = Field(default=90.0, gt=10, lt=170)
    seconds_per_frame: float = Field(default=1.0, gt=0, le=10)


class FailIn(BaseModel):
    reason: str = ""


# ---- serialisers ----------------------------------------------------------


def project_out(p: Project) -> dict:
    return {"id": p.id, "name": p.name, "created_at": p.created_at.isoformat()}


def drawing_out(d: Drawing) -> dict:
    return {
        "id": d.id,
        "project_id": d.project_id,
        "name": d.name,
        "page": d.page_index + 1,
        "width_px": d.width_px,
        "height_px": d.height_px,
        "image_url": f"/api/drawings/{d.id}/image",
    }


def capture_out(c: Capture, with_frames: bool = False) -> dict:
    out = {
        "id": c.id,
        "project_id": c.project_id,
        "drawing_id": c.drawing_id,
        "captured_at": c.captured_at.isoformat(),
        "status": c.status,
        "quality": c.quality,
        "notes": c.notes,
        "frame_count": len(c.frames),
        "placed_count": sum(1 for f in c.frames if f.x is not None),
        "control_points": c.control_points or [],
        "has_model": bool(c.model_path),
    }
    if with_frames:
        out["frames"] = [
            {
                "id": f.id,
                "index": f.index,
                "x": f.x,
                "y": f.y,
                "timestamp_s": f.timestamp_s,
                "image_url": f"/api/frames/{f.id}/image",
            }
            for f in c.frames
        ]
    return out


def job_out(j: Job) -> dict:
    return {
        "id": j.id,
        "capture_id": j.capture_id,
        "status": j.status,
        "provider": j.provider,
        "instance_id": j.provider_instance_id,
        "hourly_usd": j.hourly_usd,
        "log": j.log,
        "created_at": j.created_at.isoformat(),
        "finished_at": j.finished_at.isoformat() if j.finished_at else None,
    }


# ---- app factory ----------------------------------------------------------


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    storage = LocalStorage(settings.data_dir)
    SessionLocal = make_sessionmaker(settings.database_url)

    app = FastAPI(title="SiteCapture", version="0.1.0")
    app.state.settings = settings
    app.state.sessionmaker = SessionLocal

    def db() -> Iterator[Session]:
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    def get_or_404(session: Session, model, obj_id: int):
        obj = session.get(model, obj_id)
        if obj is None:
            raise HTTPException(404, f"{model.__name__} {obj_id} not found")
        return obj

    def file_or_404(path: str | None) -> FileResponse:
        if not path or not storage.contains(Path(path)) or not Path(path).exists():
            raise HTTPException(404, "file not found")
        return FileResponse(path)

    def process_capture(capture_id: int) -> None:
        """Background: extract frames, then start reconstruction."""
        session = SessionLocal()
        try:
            capture = session.get(Capture, capture_id)
            try:
                orchestrator.prepare_capture(session, storage, settings, capture)
            except Exception as exc:  # noqa: BLE001
                capture.status = "failed"
                capture.notes = (
                    capture.notes + f"\nframe extraction failed: {exc}"
                ).strip()
                session.commit()
                return
            orchestrator.start_reconstruction(session, settings, capture)
        finally:
            session.close()

    # -- projects --

    @app.post("/api/projects", status_code=201)
    def create_project(body: ProjectIn, session: Session = Depends(db)):
        project = Project(name=body.name)
        session.add(project)
        session.commit()
        return project_out(project)

    @app.get("/api/projects")
    def list_projects(session: Session = Depends(db)):
        return [
            project_out(p)
            for p in session.scalars(select(Project).order_by(Project.id))
        ]

    @app.get("/api/projects/{project_id}")
    def get_project(project_id: int, session: Session = Depends(db)):
        p = get_or_404(session, Project, project_id)
        return {
            **project_out(p),
            "drawings": [drawing_out(d) for d in p.drawings],
            "captures": [
                capture_out(c) for c in sorted(p.captures, key=lambda c: c.captured_at)
            ],
            "bim_models": [
                {"id": b.id, "name": b.name, "source": b.source, "summary": b.summary}
                for b in p.bim_models
            ],
        }

    # -- drawings --

    @app.post("/api/projects/{project_id}/drawings", status_code=201)
    def upload_drawing(
        project_id: int, file: UploadFile = File(...), session: Session = Depends(db)
    ):
        get_or_404(session, Project, project_id)
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(400, "drawings must be PDF files")
        directory = storage.project_dir(project_id, "drawings")
        pdf_path = storage.save(directory, file.filename, file.file)
        try:
            pages = drawings_mod.render_pages(pdf_path, directory / "pages")
        except Exception as exc:  # noqa: BLE001 - corrupt or encrypted PDF
            pdf_path.unlink(missing_ok=True)
            raise HTTPException(400, f"could not read PDF: {exc}") from exc
        created = []
        for page in pages:
            name = Path(file.filename).stem + (
                f" (p{page.page_index + 1})" if len(pages) > 1 else ""
            )
            d = Drawing(
                project_id=project_id,
                name=name,
                pdf_path=str(pdf_path),
                page_index=page.page_index,
                image_path=str(page.image_path),
                width_px=page.width_px,
                height_px=page.height_px,
            )
            session.add(d)
            created.append(d)
        session.commit()
        return [drawing_out(d) for d in created]

    @app.get("/api/drawings/{drawing_id}/image")
    def drawing_image(drawing_id: int, session: Session = Depends(db)):
        return file_or_404(get_or_404(session, Drawing, drawing_id).image_path)

    # -- captures --

    @app.post("/api/projects/{project_id}/captures", status_code=201)
    def upload_capture(
        project_id: int,
        background: BackgroundTasks,
        files: list[UploadFile] = File(...),
        captured_at: dt.datetime | None = Form(None),
        drawing_id: int | None = Form(None),
        notes: str = Form(""),
        session: Session = Depends(db),
    ):
        get_or_404(session, Project, project_id)
        if drawing_id is not None:
            drawing = get_or_404(session, Drawing, drawing_id)
            if drawing.project_id != project_id:
                raise HTTPException(400, "drawing belongs to another project")
        capture = Capture(
            project_id=project_id,
            drawing_id=drawing_id,
            captured_at=captured_at or dt.datetime.now(dt.timezone.utc),
            notes=notes,
            source_paths=[],
        )
        session.add(capture)
        session.flush()
        directory = storage.project_dir(
            project_id, "captures", str(capture.id), "source"
        )
        saved = []
        for upload in files:
            path = storage.save(directory, upload.filename or "upload", upload.file)
            try:
                frames_mod.check_media(path)
            except (frames_mod.MediaError, subprocess.CalledProcessError) as exc:
                session.rollback()
                shutil.rmtree(directory.parent, ignore_errors=True)
                raise HTTPException(400, str(exc)) from exc
            saved.append(str(path))
        capture.source_paths = saved
        session.commit()
        background.add_task(process_capture, capture.id)
        return capture_out(capture)

    @app.get("/api/captures/{capture_id}")
    def get_capture(capture_id: int, session: Session = Depends(db)):
        capture = get_or_404(session, Capture, capture_id)
        jobs = session.scalars(
            select(Job).where(Job.capture_id == capture_id).order_by(Job.id)
        ).all()
        return {
            **capture_out(capture, with_frames=True),
            "jobs": [job_out(j) for j in jobs],
        }

    @app.put("/api/captures/{capture_id}/control-points")
    def set_control_points(
        capture_id: int, points: list[ControlPointIn], session: Session = Depends(db)
    ):
        capture = get_or_404(session, Capture, capture_id)
        n = len(capture.frames)
        bad = [p.frame_index for p in points if p.frame_index >= n]
        if bad:
            raise HTTPException(
                400, f"frame_index out of range (capture has {n} frames): {bad}"
            )
        capture.control_points = [p.model_dump() for p in points]
        transform = orchestrator.apply_positions(capture)
        if capture.status == "frames_ready" and len(points) >= 2:
            capture.status = "positioned"
        session.commit()
        out = capture_out(capture, with_frames=True)
        out["alignment_rms"] = transform.rms_error if transform else None
        return out

    @app.post("/api/captures/{capture_id}/reconstruct", status_code=202)
    def reconstruct(capture_id: int, session: Session = Depends(db)):
        capture = get_or_404(session, Capture, capture_id)
        if not capture.frames:
            raise HTTPException(409, "frames have not been extracted yet")
        return job_out(orchestrator.start_reconstruction(session, settings, capture))

    @app.get("/api/frames/{frame_id}/image")
    def frame_image(frame_id: int, session: Session = Depends(db)):
        return file_or_404(get_or_404(session, Frame, frame_id).image_path)

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: int, session: Session = Depends(db)):
        return job_out(get_or_404(session, Job, job_id))

    # -- recall: timeline, time-lapse, models --

    def _drawing_captures(
        session: Session, project_id: int, drawing_id: int
    ) -> list[Capture]:
        return session.scalars(
            select(Capture).where(
                Capture.project_id == project_id, Capture.drawing_id == drawing_id
            )
        ).all()

    @app.get("/api/projects/{project_id}/timeline")
    def get_timeline(
        project_id: int,
        drawing_id: int,
        x: float,
        y: float,
        radius: float = 0.03,
        session: Session = Depends(db),
    ):
        entries = timeline.nearest_frames(
            _drawing_captures(session, project_id, drawing_id), x, y, radius
        )
        return [
            {
                "capture_id": e.capture.id,
                "captured_at": e.capture.captured_at.isoformat(),
                "frame_id": e.frame.id,
                "distance": e.distance,
                "image_url": f"/api/frames/{e.frame.id}/image",
            }
            for e in entries
        ]

    @app.post("/api/projects/{project_id}/timelapse")
    def create_timelapse(
        project_id: int, body: TimelapseIn, session: Session = Depends(db)
    ):
        entries = timeline.nearest_frames(
            _drawing_captures(session, project_id, body.drawing_id),
            body.x,
            body.y,
            body.radius,
        )
        if len(entries) < 2:
            raise HTTPException(
                409, "need photos of this spot from at least two captures"
            )
        out = storage.project_dir(project_id, "timelapses") / (
            f"d{body.drawing_id}_{body.x:.3f}_{body.y:.3f}_{dt.datetime.now():%Y%m%d%H%M%S}.mp4"
        )
        timeline.make_timelapse(
            [Path(e.frame.image_path) for e in entries],
            out,
            yaw_deg=body.yaw_deg,
            fov_deg=body.fov_deg,
            seconds_per_frame=body.seconds_per_frame,
        )
        return FileResponse(out, media_type="video/mp4", filename=out.name)

    @app.get("/api/projects/{project_id}/models")
    def list_models(project_id: int, session: Session = Depends(db)):
        """Every capture's 3D model, oldest first (used by the Blender add-on)."""
        get_or_404(session, Project, project_id)
        captures = session.scalars(
            select(Capture)
            .where(Capture.project_id == project_id, Capture.model_path.is_not(None))
            .order_by(Capture.captured_at)
        ).all()
        return [
            {
                "capture_id": c.id,
                "captured_at": c.captured_at.isoformat(),
                "format": Path(c.model_path).suffix.lstrip("."),
                "url": f"/api/captures/{c.id}/model",
            }
            for c in captures
        ]

    @app.get("/api/captures/{capture_id}/model")
    def capture_model(capture_id: int, session: Session = Depends(db)):
        return file_or_404(get_or_404(session, Capture, capture_id).model_path)

    # -- AI reports --

    @app.post("/api/captures/{capture_id}/report", status_code=201)
    def create_report(capture_id: int, session: Session = Depends(db)):
        from sitecapture.ai import reports

        capture = get_or_404(session, Capture, capture_id)
        earlier = session.scalars(
            select(Capture)
            .where(
                Capture.project_id == capture.project_id,
                Capture.drawing_id == capture.drawing_id,
                Capture.captured_at < capture.captured_at,
            )
            .order_by(Capture.captured_at.desc())
        ).first()
        try:
            markdown = reports.generate_report(
                capture.project.name, capture, earlier, model=settings.ai_model
            )
        except reports.ReportError as exc:
            raise HTTPException(409, str(exc)) from exc
        report = Report(
            project_id=capture.project_id,
            capture_id=capture.id,
            previous_capture_id=earlier.id if earlier else None,
            model=settings.ai_model,
            markdown=markdown,
        )
        session.add(report)
        session.commit()
        return {
            "id": report.id,
            "markdown": markdown,
            "previous_capture_id": report.previous_capture_id,
        }

    @app.get("/api/projects/{project_id}/reports")
    def list_reports(project_id: int, session: Session = Depends(db)):
        rows = session.scalars(
            select(Report)
            .where(Report.project_id == project_id)
            .order_by(Report.created_at.desc())
        ).all()
        return [
            {
                "id": r.id,
                "capture_id": r.capture_id,
                "created_at": r.created_at.isoformat(),
                "markdown": r.markdown,
            }
            for r in rows
        ]

    # -- BIM --

    @app.post("/api/projects/{project_id}/bim", status_code=201)
    def upload_ifc(
        project_id: int, file: UploadFile = File(...), session: Session = Depends(db)
    ):
        from sitecapture.bim import ifc

        get_or_404(session, Project, project_id)
        if not (file.filename or "").lower().endswith(".ifc"):
            raise HTTPException(
                400, "upload an .ifc file (export one from Revit/ArchiCAD)"
            )
        path = storage.save(
            storage.project_dir(project_id, "bim"), file.filename, file.file
        )
        try:
            summary = ifc.summarize(path)
        except ImportError as exc:
            raise HTTPException(
                501, "ifcopenshell is not installed (pip install .[bim])"
            ) from exc
        except Exception as exc:  # noqa: BLE001 - malformed IFC
            path.unlink(missing_ok=True)
            raise HTTPException(400, f"could not read IFC: {exc}") from exc
        model = BimModel(
            project_id=project_id,
            name=Path(file.filename).stem,
            source="ifc",
            path=str(path),
            summary=summary,
        )
        session.add(model)
        session.commit()
        return {"id": model.id, "name": model.name, "summary": summary}

    # -- GPU worker callbacks --

    def worker_job(job_id: int, token: str, session: Session) -> Job:
        job = get_or_404(session, Job, job_id)
        if not hmac.compare_digest(job.token, token or ""):
            raise HTTPException(403, "bad job token")
        if job.status not in ("launching", "running"):
            raise HTTPException(409, f"job is {job.status}")
        return job

    @app.get("/api/worker/jobs/{job_id}")
    def worker_manifest(
        job_id: int, x_job_token: str = Header(""), session: Session = Depends(db)
    ):
        job = worker_job(job_id, x_job_token, session)
        job.status = "running"
        session.commit()
        capture = session.get(Capture, job.capture_id)
        return {
            "job_id": job.id,
            "dense": True,
            "frames": [
                {"index": f.index, "url": f"/api/worker/jobs/{job.id}/frames/{f.index}"}
                for f in capture.frames
            ],
        }

    @app.get("/api/worker/jobs/{job_id}/frames/{index}")
    def worker_frame(
        job_id: int,
        index: int,
        x_job_token: str = Header(""),
        session: Session = Depends(db),
    ):
        job = worker_job(job_id, x_job_token, session)
        capture = session.get(Capture, job.capture_id)
        frame = next((f for f in capture.frames if f.index == index), None)
        return file_or_404(frame.image_path if frame else None)

    @app.post("/api/worker/jobs/{job_id}/result")
    def worker_result(
        job_id: int,
        trajectory: str = Form(...),
        model: UploadFile | None = File(None),
        x_job_token: str = Header(""),
        session: Session = Depends(db),
    ):
        job = worker_job(job_id, x_job_token, session)
        try:
            traj = {
                int(k): (float(v[0]), float(v[1]))
                for k, v in json.loads(trajectory).items()
            }
        except (ValueError, TypeError, IndexError, AttributeError) as exc:
            raise HTTPException(400, f"bad trajectory: {exc}") from exc
        model_path = None
        if model is not None:
            tmp = Path(tempfile.mkdtemp(dir=settings.data_dir))
            model_path = storage.save(tmp, model.filename or "model.ply", model.file)
        orchestrator.finish_job(session, settings, job, traj, model_path)
        if model_path:
            shutil.rmtree(model_path.parent, ignore_errors=True)
        return job_out(job)

    @app.post("/api/worker/jobs/{job_id}/fail")
    def worker_fail(
        job_id: int,
        body: FailIn,
        x_job_token: str = Header(""),
        session: Session = Depends(db),
    ):
        job = worker_job(job_id, x_job_token, session)
        orchestrator.fail_job(session, settings, job, f"worker failed: {body.reason}")
        return job_out(job)

    # -- UI --

    @app.get("/", include_in_schema=False)
    def index():
        return RedirectResponse("/ui/index.html")

    app.mount("/ui", StaticFiles(directory=STATIC_DIR), name="ui")
    return app


def __getattr__(name: str):
    # Lazily build the default app so importing this module has no side effects.
    if name == "app":
        globals()["app"] = create_app()
        return globals()["app"]
    raise AttributeError(name)
