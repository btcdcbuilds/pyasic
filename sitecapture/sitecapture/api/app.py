"""HTTP API and the bundled YCB web UI.

Run with ``uvicorn sitecapture.api.app:app``. Every ``/api`` route except
login and the GPU worker callbacks (which use a per-job token) needs a
logged-in user.
"""

from __future__ import annotations

import datetime as dt
import hmac
import json
import logging
import shutil
import subprocess
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Iterator
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from sitecapture import auth
from sitecapture.config import Settings, get_settings
from sitecapture.db import (
    ANNOTATION_CATEGORIES,
    DESIGN_STATUSES,
    Annotation,
    BimModel,
    Capture,
    DesignComment,
    DesignFile,
    DesignRequest,
    Drawing,
    Frame,
    Job,
    Project,
    ProjectMember,
    Report,
    Upload,
    User,
    make_sessionmaker,
)
from sitecapture.gpu import orchestrator
from sitecapture.pipeline import drawings as drawings_mod
from sitecapture.pipeline import frames as frames_mod
from sitecapture.pipeline import timeline
from sitecapture.scan.pointcloud import SCAN_EXTS
from sitecapture.storage import DbBackedStorage, LocalStorage, safe_name

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB upload chunks
log = logging.getLogger("sitecapture")


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


class LoginIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=1024)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(max_length=1024)
    new_password: str = Field(max_length=1024)


class UserCreateIn(BaseModel):
    email: str = Field(max_length=320)
    name: str = Field(default="", max_length=200)
    password: str = Field(max_length=1024)
    is_admin: bool = False
    role: str = Field(default="staff", pattern="^(staff|client)$")
    # Projects a client may view.
    project_ids: list[int] = Field(default_factory=list)


class UserUpdateIn(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    password: str | None = Field(default=None, max_length=1024)
    is_admin: bool | None = None
    is_active: bool | None = None


class UploadStartIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0)


class MemberIn(BaseModel):
    user_id: int


class AnnotationIn(BaseModel):
    yaw: float = Field(ge=-360, le=360)
    pitch: float = Field(ge=-90, le=90)
    category: str
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=5000)
    visible_to_client: bool = False
    ai_assisted: bool = False


class AnnotationUpdateIn(BaseModel):
    category: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=5000)
    status: str | None = Field(default=None, pattern="^(open|resolved)$")
    visible_to_client: bool | None = None


class SuggestIn(BaseModel):
    yaw: float = Field(ge=-360, le=360)
    pitch: float = Field(ge=-90, le=90)
    note: str = Field(default="", max_length=2000)


class DesignRequestIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    site: dict = Field(default_factory=dict)
    requirements: dict = Field(default_factory=dict)
    description: str = Field(default="", max_length=20000)
    # Staff can lodge a request on a client's behalf.
    client_id: int | None = None


class DesignUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    site: dict | None = None
    requirements: dict | None = None
    description: str | None = Field(default=None, max_length=20000)
    status: str | None = None
    assigned_to_id: int | None = None


class DesignFileIn(BaseModel):
    upload_id: int
    kind: str = Field(
        pattern="^(survey|grading|contour|sketch|drawing|photo|other|cad|render|da_set)$"
    )
    visible_to_client: bool = True


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    internal: bool = False


class DrawingFromUploadIn(BaseModel):
    upload_id: int


class CaptureFromUploadsIn(BaseModel):
    upload_ids: list[int] = Field(min_length=1, max_length=50)
    drawing_id: int | None = None
    captured_at: dt.datetime | None = None
    notes: str = Field(default="", max_length=5000)


# ---- serialisers ----------------------------------------------------------


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "is_admin": u.is_admin,
        "is_active": u.is_active,
        "role": u.role,
    }


def upload_out(u: Upload, chunk_size: int | None = None) -> dict:
    return {
        "id": u.id,
        "filename": u.filename,
        "size": u.size,
        "received": u.received,
        "chunk_size": chunk_size or CHUNK_SIZE,
        "complete": u.received == u.size,
    }


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
    Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
    SessionLocal = make_sessionmaker(settings.database_url)
    if settings.file_store == "db":
        storage: LocalStorage = DbBackedStorage(settings.data_dir, SessionLocal)
    else:
        storage = LocalStorage(settings.data_dir)
    throttle = auth.LoginThrottle()
    stop_reaper = threading.Event()

    def bootstrap_admin() -> None:
        if not (settings.admin_email and settings.admin_password):
            return
        with SessionLocal() as session:
            if auth.user_count(session) == 0:
                auth.create_user(
                    session,
                    settings.admin_email,
                    settings.admin_password,
                    name="Admin",
                    is_admin=True,
                )
                log.info("created admin account %s", settings.admin_email)

    def reaper_loop() -> None:
        interval = settings.reaper_interval_min * 60
        while not stop_reaper.wait(interval):
            try:
                with SessionLocal() as session:
                    n = orchestrator.reap_stale_jobs(session, settings)
                if n:
                    log.warning("terminated %d stuck GPU job(s)", n)
            except Exception:  # noqa: BLE001 - keep the loop alive
                log.exception("stale job check failed")

    # Run at app creation rather than in lifespan: serverless hosts may not
    # send ASGI lifespan events.
    bootstrap_admin()

    def chunk_size() -> int:
        return int(settings.chunk_mb * 1024 * 1024) if settings.chunk_mb else CHUNK_SIZE

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        thread = None
        if settings.reaper_interval_min > 0:
            thread = threading.Thread(target=reaper_loop, daemon=True)
            thread.start()
        yield
        stop_reaper.set()

    app = FastAPI(title="YCB Site Capture", version="0.2.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.sessionmaker = SessionLocal

    def db() -> Iterator[Session]:
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    public_host = urlparse(settings.public_url).netloc

    def require_user(request: Request, session: Session = Depends(db)) -> User:
        user = auth.user_for_token(session, request.cookies.get(auth.COOKIE_NAME))
        if user is None:
            raise HTTPException(401, "log in first")
        # Refuse state-changing requests sent from other sites (CSRF).
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            allowed = {request.headers.get("host"), public_host}
            if origin and urlparse(origin).netloc not in allowed:
                raise HTTPException(403, "cross-site request refused")
        return user

    def require_admin(user: User = Depends(require_user)) -> User:
        if not user.is_admin:
            raise HTTPException(403, "admins only")
        return user

    def require_staff(user: User = Depends(require_user)) -> User:
        if not user.is_staff:
            raise HTTPException(403, "this action is for the YCB team")
        return user

    staff_only = [Depends(require_staff)]

    def see_project(session: Session, user: User, project_id: int) -> Project:
        """Project if this user may view it; clients only see their own."""
        project = session.get(Project, project_id)
        if project is None or (
            not user.is_staff
            and session.get(ProjectMember, (project_id, user.id)) is None
        ):
            raise HTTPException(404, f"Project {project_id} not found")
        return project

    api = APIRouter(dependencies=[Depends(require_user)])

    def get_or_404(session: Session, model, obj_id: int):
        obj = session.get(model, obj_id)
        if obj is None:
            raise HTTPException(404, f"{model.__name__} {obj_id} not found")
        return obj

    def file_or_404(path: str | None) -> FileResponse:
        if (
            not path
            or not storage.contains(Path(path))
            or not storage.ensure(Path(path))
        ):
            raise HTTPException(404, "file not found")
        return FileResponse(path)

    def schedule(background: BackgroundTasks, capture_id: int) -> None:
        if settings.inline_processing:
            process_capture(capture_id)
        else:
            background.add_task(process_capture, capture_id)

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

    @api.post("/api/projects", status_code=201, dependencies=staff_only)
    def create_project(body: ProjectIn, session: Session = Depends(db)):
        project = Project(name=body.name)
        session.add(project)
        session.commit()
        return project_out(project)

    @api.get("/api/projects")
    def list_projects(
        user: User = Depends(require_user), session: Session = Depends(db)
    ):
        query = select(Project).order_by(Project.id)
        if not user.is_staff:
            query = query.join(
                ProjectMember, ProjectMember.project_id == Project.id
            ).where(ProjectMember.user_id == user.id)
        return [project_out(p) for p in session.scalars(query)]

    @api.get("/api/projects/{project_id}")
    def get_project(
        project_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        p = see_project(session, user, project_id)
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
            "members": (
                [
                    user_out(session.get(User, m.user_id))
                    for m in session.scalars(
                        select(ProjectMember).where(ProjectMember.project_id == p.id)
                    )
                ]
                if user.is_staff
                else []
            ),
        }

    @api.post(
        "/api/projects/{project_id}/members", status_code=201, dependencies=staff_only
    )
    def add_member(project_id: int, body: MemberIn, session: Session = Depends(db)):
        get_or_404(session, Project, project_id)
        member = get_or_404(session, User, body.user_id)
        if member.is_staff:
            raise HTTPException(400, "staff already see every project")
        if session.get(ProjectMember, (project_id, member.id)) is None:
            session.add(ProjectMember(project_id=project_id, user_id=member.id))
            session.commit()
        return user_out(member)

    @api.get("/api/clients", dependencies=staff_only)
    def list_clients(session: Session = Depends(db)):
        """Client accounts, for giving them access to projects."""
        query = select(User).where(User.role == "client", User.is_active.is_(True))
        return [
            user_out(u) for u in session.scalars(query.order_by(User.name, User.email))
        ]

    @api.delete("/api/projects/{project_id}/members/{user_id}", dependencies=staff_only)
    def remove_member(project_id: int, user_id: int, session: Session = Depends(db)):
        row = session.get(ProjectMember, (project_id, user_id))
        if row is not None:
            session.delete(row)
            session.commit()
        return {"ok": True}

    # -- drawings --

    @api.post(
        "/api/projects/{project_id}/drawings", status_code=201, dependencies=staff_only
    )
    def upload_drawing(
        project_id: int, file: UploadFile = File(...), session: Session = Depends(db)
    ):
        get_or_404(session, Project, project_id)
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(400, "drawings must be PDF files")
        directory = storage.project_dir(project_id, "drawings")
        pdf_path = storage.save(directory, file.filename, file.file)
        return create_drawings(session, project_id, pdf_path, Path(file.filename).stem)

    def create_drawings(
        session: Session, project_id: int, pdf_path: Path, title: str
    ) -> list[dict]:
        """One Drawing per page of an uploaded PDF."""
        directory = pdf_path.parent
        try:
            pages = drawings_mod.render_pages(pdf_path, directory / "pages")
            for page in pages:
                storage.persist(page.image_path)
        except Exception as exc:  # noqa: BLE001 - corrupt or encrypted PDF
            pdf_path.unlink(missing_ok=True)
            raise HTTPException(400, f"could not read PDF: {exc}") from exc
        created = []
        for page in pages:
            name = title + (f" (p{page.page_index + 1})" if len(pages) > 1 else "")
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

    @api.post(
        "/api/projects/{project_id}/drawings/from-upload",
        status_code=201,
        dependencies=staff_only,
    )
    def drawing_from_upload(
        project_id: int,
        body: DrawingFromUploadIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        """Turn a finished chunked PDF upload into drawings (for large sheets)."""
        get_or_404(session, Project, project_id)
        upload = own_upload(session, body.upload_id, user)
        if upload.project_id != project_id or not upload.filename.lower().endswith(
            ".pdf"
        ):
            raise HTTPException(400, "upload is not a PDF for this project")
        if upload.received != upload.size:
            raise HTTPException(409, f"{upload.filename} has not finished uploading")
        if upload.capture_id is not None:
            raise HTTPException(409, f"{upload.filename} has already been used")
        target = storage.project_dir(project_id, "drawings") / safe_name(
            upload.filename
        )
        storage.move(Path(upload.path), target)
        session.delete(upload)
        session.commit()
        return create_drawings(session, project_id, target, Path(upload.filename).stem)

    @api.get("/api/drawings/{drawing_id}/image")
    def drawing_image(
        drawing_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        drawing = get_or_404(session, Drawing, drawing_id)
        see_project(session, user, drawing.project_id)
        return file_or_404(drawing.image_path)

    # -- captures --

    @api.post(
        "/api/projects/{project_id}/captures", status_code=201, dependencies=staff_only
    )
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
        # Commit before writing files: storage uses its own DB connection.
        session.commit()
        directory = storage.project_dir(
            project_id, "captures", str(capture.id), "source"
        )
        saved = []
        for upload in files:
            path = storage.save(directory, upload.filename or "upload", upload.file)
            try:
                frames_mod.check_media(path)
            except (frames_mod.MediaError, subprocess.CalledProcessError) as exc:
                for done in saved + [str(path)]:
                    storage.remove(Path(done))
                session.delete(capture)
                session.commit()
                shutil.rmtree(directory.parent, ignore_errors=True)
                raise HTTPException(400, str(exc)) from exc
            saved.append(str(path))
        capture.source_paths = saved
        session.commit()
        schedule(background, capture.id)
        return capture_out(capture)

    @api.get("/api/captures/{capture_id}")
    def get_capture(
        capture_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        capture = get_or_404(session, Capture, capture_id)
        see_project(session, user, capture.project_id)
        jobs = (
            session.scalars(
                select(Job).where(Job.capture_id == capture_id).order_by(Job.id)
            ).all()
            if user.is_staff
            else []
        )
        return {
            **capture_out(capture, with_frames=True),
            "jobs": [job_out(j) for j in jobs],
        }

    @api.put("/api/captures/{capture_id}/control-points", dependencies=staff_only)
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

    @api.post(
        "/api/captures/{capture_id}/reconstruct",
        status_code=202,
        dependencies=staff_only,
    )
    def reconstruct(capture_id: int, session: Session = Depends(db)):
        capture = get_or_404(session, Capture, capture_id)
        if not capture.frames:
            raise HTTPException(409, "frames have not been extracted yet")
        return job_out(orchestrator.start_reconstruction(session, settings, capture))

    @api.get("/api/frames/{frame_id}/image")
    def frame_image(
        frame_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        frame = get_or_404(session, Frame, frame_id)
        see_project(session, user, frame.capture.project_id)
        return file_or_404(frame.image_path)

    @api.get("/api/jobs/{job_id}", dependencies=staff_only)
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

    @api.get("/api/projects/{project_id}/timeline")
    def get_timeline(
        project_id: int,
        drawing_id: int,
        x: float,
        y: float,
        radius: float = 0.03,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        see_project(session, user, project_id)
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

    @api.post("/api/projects/{project_id}/timelapse")
    def create_timelapse(
        project_id: int,
        body: TimelapseIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        see_project(session, user, project_id)
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
        for e in entries:
            storage.ensure(Path(e.frame.image_path))
        timeline.make_timelapse(
            [Path(e.frame.image_path) for e in entries],
            out,
            yaw_deg=body.yaw_deg,
            fov_deg=body.fov_deg,
            seconds_per_frame=body.seconds_per_frame,
        )
        return FileResponse(out, media_type="video/mp4", filename=out.name)

    @api.get("/api/projects/{project_id}/models")
    def list_models(
        project_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        """Every capture's 3D model, oldest first (used by the Blender add-on)."""
        see_project(session, user, project_id)
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

    @api.get("/api/captures/{capture_id}/model")
    def capture_model(
        capture_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        capture = get_or_404(session, Capture, capture_id)
        see_project(session, user, capture.project_id)
        return file_or_404(capture.model_path)

    # -- AI reports --

    @api.post(
        "/api/captures/{capture_id}/report", status_code=201, dependencies=staff_only
    )
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
        for c in (capture, earlier):
            for f in c.frames if c else []:
                if f.x is not None:
                    storage.ensure(Path(f.image_path))
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

    @api.get("/api/projects/{project_id}/reports")
    def list_reports(
        project_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        see_project(session, user, project_id)
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

    @api.post(
        "/api/projects/{project_id}/bim", status_code=201, dependencies=staff_only
    )
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

    # -- chunked uploads (large walk videos) --

    max_upload = int(settings.max_upload_gb * 1024**3)
    allowed_exts = frames_mod.VIDEO_EXTS | frames_mod.IMAGE_EXTS | SCAN_EXTS

    def own_upload(session: Session, upload_id: int, user: User) -> Upload:
        upload = get_or_404(session, Upload, upload_id)
        if upload.user_id != user.id:
            raise HTTPException(404, f"Upload {upload_id} not found")
        return upload

    @api.post(
        "/api/projects/{project_id}/uploads", status_code=201, dependencies=staff_only
    )
    def start_upload(
        project_id: int,
        body: UploadStartIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        get_or_404(session, Project, project_id)
        ext = Path(body.filename).suffix.lower()
        if ext in frames_mod.RAW_INSTA360_EXTS:
            raise HTTPException(
                400,
                f"{body.filename}: raw Insta360 file. Export it as a 360 MP4/JPG "
                "from Insta360 Studio first.",
            )
        if ext not in allowed_exts and ext != ".pdf":
            raise HTTPException(400, f"{body.filename}: unsupported file type {ext}")
        if body.size > max_upload:
            raise HTTPException(
                413, f"file is larger than the {settings.max_upload_gb:g} GB limit"
            )
        upload = Upload(
            user_id=user.id,
            project_id=project_id,
            purpose=(
                "drawing" if ext == ".pdf" else "scan" if ext in SCAN_EXTS else "media"
            ),
            filename=body.filename,
            size=body.size,
            path="",
        )
        session.add(upload)
        session.flush()
        directory = storage.project_dir(project_id, "uploads")
        path = directory / f"{upload.id}_{safe_name(body.filename)}"
        if not isinstance(storage, DbBackedStorage):
            path.touch()
        upload.path = str(path)
        session.commit()
        return upload_out(upload, chunk_size())

    @api.get("/api/uploads/{upload_id}")
    def get_upload(
        upload_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        return upload_out(own_upload(session, upload_id, user), chunk_size())

    @api.put("/api/uploads/{upload_id}")
    async def put_chunk(
        upload_id: int,
        offset: int,
        request: Request,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        upload = own_upload(session, upload_id, user)
        if upload.capture_id is not None:
            raise HTTPException(409, "upload is already attached to a capture")
        if offset != upload.received:
            # Client is out of step (e.g. a retried chunk); tell it where to resume.
            raise HTTPException(
                409, {"message": "wrong offset", "received": upload.received}
            )
        data = await request.body()
        if len(data) > chunk_size() or offset + len(data) > upload.size:
            raise HTTPException(400, "chunk too large")
        if isinstance(storage, DbBackedStorage):
            # Each chunk may reach a different machine: keep chunks in the
            # database and join them once the last one arrives.
            storage.put_part(f"upload{upload.id}/{offset:015d}", data)
        else:
            with open(upload.path, "r+b") as f:
                f.seek(offset)
                f.write(data)
        upload.received = offset + len(data)
        if upload.received == upload.size:
            if isinstance(storage, DbBackedStorage):
                Path(upload.path).parent.mkdir(parents=True, exist_ok=True)
                Path(upload.path).write_bytes(
                    b"".join(storage.pop_parts(f"upload{upload.id}"))
                )
            try:
                if Path(upload.path).suffix.lower() == ".pdf":
                    with open(upload.path, "rb") as f:
                        if f.read(5) != b"%PDF-":
                            raise frames_mod.MediaError(
                                f"{upload.filename} is not a PDF"
                            )
                elif upload.purpose == "media":
                    frames_mod.check_media(Path(upload.path))
            except (frames_mod.MediaError, subprocess.CalledProcessError) as exc:
                Path(upload.path).unlink(missing_ok=True)
                session.delete(upload)
                session.commit()
                raise HTTPException(400, str(getattr(exc, "args", [exc])[0])) from exc
            storage.persist(Path(upload.path))
        session.commit()
        return upload_out(upload, chunk_size())

    @api.post(
        "/api/projects/{project_id}/captures/from-uploads",
        status_code=201,
        dependencies=staff_only,
    )
    def capture_from_uploads(
        project_id: int,
        body: CaptureFromUploadsIn,
        background: BackgroundTasks,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        get_or_404(session, Project, project_id)
        if body.drawing_id is not None:
            drawing = get_or_404(session, Drawing, body.drawing_id)
            if drawing.project_id != project_id:
                raise HTTPException(400, "drawing belongs to another project")
        uploads = [own_upload(session, uid, user) for uid in body.upload_ids]
        for u in uploads:
            if u.project_id != project_id:
                raise HTTPException(400, f"upload {u.id} belongs to another project")
            if u.received != u.size:
                raise HTTPException(409, f"{u.filename} has not finished uploading")
            if u.capture_id is not None:
                raise HTTPException(409, f"{u.filename} is already in a capture")
            if u.filename.lower().endswith(".pdf"):
                raise HTTPException(400, f"{u.filename} is a PDF; add it as a drawing")
            if u.purpose == "scan":
                raise HTTPException(
                    400, f"{u.filename} is a point cloud; add it under As-built scans"
                )
        capture = Capture(
            project_id=project_id,
            drawing_id=body.drawing_id,
            captured_at=body.captured_at or dt.datetime.now(dt.timezone.utc),
            notes=body.notes,
            source_paths=[],
        )
        session.add(capture)
        # Commit before writing files: storage uses its own DB connection.
        session.commit()
        directory = storage.project_dir(
            project_id, "captures", str(capture.id), "source"
        )
        paths = []
        for u in uploads:
            target = directory / f"{len(paths):02d}_{safe_name(u.filename)}"
            storage.move(Path(u.path), target)
            u.path = str(target)
            u.capture_id = capture.id
            paths.append(str(target))
        capture.source_paths = paths
        session.commit()
        schedule(background, capture.id)
        return capture_out(capture)

    @api.get("/api/reports/{report_id}.pdf")
    def report_pdf(
        report_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        from sitecapture.ai import pdf

        report = get_or_404(session, Report, report_id)
        project = see_project(session, user, report.project_id)
        capture = session.get(Capture, report.capture_id)
        title = f"{project.name} – progress report {capture.captured_at:%Y-%m-%d}"
        out = storage.project_dir(project.id, "reports") / f"report_{report.id}.pdf"
        pdf.markdown_to_pdf(report.markdown, out, title=title)
        return FileResponse(out, media_type="application/pdf", filename=out.name)

    # -- accounts --

    def set_session_cookie(response: Response, token: str) -> None:
        response.set_cookie(
            auth.COOKIE_NAME,
            token,
            max_age=auth.SESSION_DAYS * 86400,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/",
        )

    @app.post("/api/auth/login")
    def login(body: LoginIn, response: Response, session: Session = Depends(db)):
        try:
            user = auth.authenticate(session, throttle, body.email, body.password)
        except auth.AuthError as exc:
            status = 429 if "too many" in str(exc) else 401
            raise HTTPException(status, str(exc)) from exc
        set_session_cookie(response, auth.start_session(session, user))
        return user_out(user)

    @app.post("/api/auth/logout")
    def logout(request: Request, response: Response, session: Session = Depends(db)):
        auth.end_session(session, request.cookies.get(auth.COOKIE_NAME))
        response.delete_cookie(auth.COOKIE_NAME, path="/")
        return {"ok": True}

    @api.get("/api/auth/me")
    def me(user: User = Depends(require_user)):
        return user_out(user)

    @api.post("/api/auth/password")
    def change_password(
        body: PasswordChangeIn,
        response: Response,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        if not auth.verify_password(body.current_password, user.password_hash):
            raise HTTPException(400, "current password is incorrect")
        try:
            auth.check_password_rules(body.new_password)
        except auth.AuthError as exc:
            raise HTTPException(400, str(exc)) from exc
        user = session.merge(user)
        user.password_hash = auth.hash_password(body.new_password)
        session.commit()
        auth.end_all_sessions(session, user.id)  # log out other devices
        set_session_cookie(response, auth.start_session(session, user))
        return {"ok": True}

    @api.get("/api/users")
    def list_users(_: User = Depends(require_admin), session: Session = Depends(db)):
        return [user_out(u) for u in session.scalars(select(User).order_by(User.id))]

    @api.post("/api/users", status_code=201)
    def add_user(
        body: UserCreateIn,
        _: User = Depends(require_admin),
        session: Session = Depends(db),
    ):
        if body.role == "client" and body.is_admin:
            raise HTTPException(400, "clients can't be admins")
        try:
            user = auth.create_user(
                session, body.email, body.password, body.name, body.is_admin
            )
        except auth.AuthError as exc:
            raise HTTPException(400, str(exc)) from exc
        user.role = body.role
        for pid in body.project_ids if body.role == "client" else []:
            get_or_404(session, Project, pid)
            session.add(ProjectMember(project_id=pid, user_id=user.id))
        session.commit()
        return user_out(user)

    @api.patch("/api/users/{user_id}")
    def update_user(
        user_id: int,
        body: UserUpdateIn,
        admin: User = Depends(require_admin),
        session: Session = Depends(db),
    ):
        user = get_or_404(session, User, user_id)
        if user.id == admin.id and (body.is_admin is False or body.is_active is False):
            raise HTTPException(400, "you can't remove your own admin access")
        if body.name is not None:
            user.name = body.name.strip()
        if body.is_admin is not None:
            user.is_admin = body.is_admin
        if body.is_active is not None:
            user.is_active = body.is_active
        if body.password is not None:
            try:
                auth.check_password_rules(body.password)
            except auth.AuthError as exc:
                raise HTTPException(400, str(exc)) from exc
            user.password_hash = auth.hash_password(body.password)
        session.commit()
        if body.password is not None or body.is_active is False:
            auth.end_all_sessions(session, user.id)
        return user_out(user)

    # -- annotations on 360 frames --

    def annotation_out(a: Annotation) -> dict:
        return {
            "id": a.id,
            "project_id": a.project_id,
            "capture_id": a.capture_id,
            "frame_id": a.frame_id,
            "yaw": a.yaw,
            "pitch": a.pitch,
            "check_id": a.check_id,
            "element_guid": a.element_guid,
            "position": a.position,
            "category": a.category,
            "title": a.title,
            "body": a.body,
            "status": a.status,
            "visible_to_client": a.visible_to_client,
            "ai_assisted": a.ai_assisted,
            "author": (a.author.name or a.author.email) if a.author else None,
            "created_at": a.created_at.isoformat(),
        }

    def check_category(category: str | None) -> None:
        if category is not None and category not in ANNOTATION_CATEGORIES:
            raise HTTPException(
                400, f"category must be one of {', '.join(ANNOTATION_CATEGORIES)}"
            )

    @api.get("/api/captures/{capture_id}/annotations")
    def list_capture_annotations(
        capture_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        capture = get_or_404(session, Capture, capture_id)
        see_project(session, user, capture.project_id)
        query = select(Annotation).where(Annotation.capture_id == capture_id)
        if not user.is_staff:
            query = query.where(Annotation.visible_to_client.is_(True))
        return [
            annotation_out(a) for a in session.scalars(query.order_by(Annotation.id))
        ]

    @api.get("/api/projects/{project_id}/annotations")
    def list_project_annotations(
        project_id: int,
        status: str | None = None,
        category: str | None = None,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        see_project(session, user, project_id)
        query = select(Annotation).where(Annotation.project_id == project_id)
        if not user.is_staff:
            query = query.where(Annotation.visible_to_client.is_(True))
        if status:
            query = query.where(Annotation.status == status)
        if category:
            query = query.where(Annotation.category == category)
        return [
            annotation_out(a)
            for a in session.scalars(query.order_by(Annotation.id.desc()))
        ]

    @api.post(
        "/api/frames/{frame_id}/annotations", status_code=201, dependencies=staff_only
    )
    def create_annotation(
        frame_id: int,
        body: AnnotationIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        frame = get_or_404(session, Frame, frame_id)
        check_category(body.category)
        a = Annotation(
            project_id=frame.capture.project_id,
            capture_id=frame.capture_id,
            frame_id=frame.id,
            author_id=user.id,
            **body.model_dump(),
        )
        session.add(a)
        session.commit()
        return annotation_out(a)

    @api.patch("/api/annotations/{annotation_id}", dependencies=staff_only)
    def update_annotation(
        annotation_id: int, body: AnnotationUpdateIn, session: Session = Depends(db)
    ):
        a = get_or_404(session, Annotation, annotation_id)
        check_category(body.category)
        for key, value in body.model_dump(exclude_none=True).items():
            setattr(a, key, value)
        session.commit()
        return annotation_out(a)

    @api.delete("/api/annotations/{annotation_id}", dependencies=staff_only)
    def delete_annotation(annotation_id: int, session: Session = Depends(db)):
        session.delete(get_or_404(session, Annotation, annotation_id))
        session.commit()
        return {"ok": True}

    @api.post("/api/frames/{frame_id}/annotations/suggest", dependencies=staff_only)
    def suggest_annotation(
        frame_id: int, body: SuggestIn, session: Session = Depends(db)
    ):
        """Opus drafts an annotation for the direction the user clicked."""
        from sitecapture.ai import annotate
        from sitecapture.ai.claude import AiError

        frame = get_or_404(session, Frame, frame_id)
        if not storage.ensure(Path(frame.image_path)):
            raise HTTPException(404, "frame image missing")
        try:
            return annotate.suggest_annotation(
                Path(frame.image_path),
                body.yaw,
                body.pitch,
                frame.capture.project.name,
                note=body.note,
                model=settings.ai_model,
            )
        except AiError as exc:
            raise HTTPException(409, str(exc)) from exc

    # -- design requests (client brief -> concept -> CAD/renders -> DA) --

    design_input_exts = {
        ".pdf",
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".heic",
        ".dwg",
        ".dxf",
        ".ifc",
        ".rvt",
        ".skp",
        ".pln",
        ".zip",
    }
    client_kinds = {
        "survey",
        "grading",
        "contour",
        "sketch",
        "drawing",
        "photo",
        "other",
    }

    def see_design(session: Session, user: User, request_id: int) -> DesignRequest:
        req = session.get(DesignRequest, request_id)
        if req is None or (not user.is_staff and req.client_id != user.id):
            raise HTTPException(404, f"Design request {request_id} not found")
        return req

    def design_file_out(f: DesignFile) -> dict:
        return {
            "id": f.id,
            "kind": f.kind,
            "filename": f.filename,
            "size": f.size,
            "visible_to_client": f.visible_to_client,
            "created_at": f.created_at.isoformat(),
            "url": f"/api/design-files/{f.id}",
        }

    def design_out(req: DesignRequest, user: User, full: bool = False) -> dict:
        out = {
            "id": req.id,
            "title": req.title,
            "status": req.status,
            "client": {
                "id": req.client.id,
                "name": req.client.name,
                "email": req.client.email,
            },
            "assigned_to_id": req.assigned_to_id,
            "created_at": req.created_at.isoformat(),
            "updated_at": req.updated_at.isoformat(),
            "file_count": sum(
                1 for f in req.files if user.is_staff or f.visible_to_client
            ),
        }
        if full:
            out.update(
                site=req.site or {},
                requirements=req.requirements or {},
                description=req.description,
                files=[
                    design_file_out(f)
                    for f in req.files
                    if user.is_staff or f.visible_to_client
                ],
                comments=[
                    {
                        "id": c.id,
                        "author": c.author.name or c.author.email,
                        "author_is_staff": c.author.is_staff,
                        "body": c.body,
                        "internal": c.internal,
                        "created_at": c.created_at.isoformat(),
                    }
                    for c in req.comments
                    if user.is_staff or not c.internal
                ],
                # The AI brief is a working document for the team.
                ai_brief=req.ai_brief if user.is_staff else None,
                ai_questions=req.ai_questions if user.is_staff else None,
                concept=req.concept if user.is_staff else None,
            )
        return out

    @api.get("/api/design-requests")
    def list_design_requests(
        user: User = Depends(require_user), session: Session = Depends(db)
    ):
        query = select(DesignRequest).order_by(DesignRequest.updated_at.desc())
        if not user.is_staff:
            query = query.where(DesignRequest.client_id == user.id)
        return [design_out(r, user) for r in session.scalars(query)]

    @api.post("/api/design-requests", status_code=201)
    def create_design_request(
        body: DesignRequestIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        client_id = user.id
        if body.client_id is not None and body.client_id != user.id:
            if not user.is_staff:
                raise HTTPException(403, "clients can only create their own requests")
            get_or_404(session, User, body.client_id)
            client_id = body.client_id
        req = DesignRequest(
            client_id=client_id,
            title=body.title,
            site=body.site,
            requirements=body.requirements,
            description=body.description,
        )
        session.add(req)
        session.commit()
        return design_out(req, user, full=True)

    @api.get("/api/design-requests/{request_id}")
    def get_design_request(
        request_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        return design_out(see_design(session, user, request_id), user, full=True)

    @api.patch("/api/design-requests/{request_id}")
    def update_design_request(
        request_id: int,
        body: DesignUpdateIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        req = see_design(session, user, request_id)
        changes = body.model_dump(exclude_none=True)
        if not user.is_staff:
            if "status" in changes or "assigned_to_id" in changes:
                raise HTTPException(403, "only the YCB team can change status")
            if req.status not in ("submitted", "in_review"):
                raise HTTPException(
                    409, "drafting has started; message the team to change the brief"
                )
        if "status" in changes and changes["status"] not in DESIGN_STATUSES:
            raise HTTPException(
                400, f"status must be one of {', '.join(DESIGN_STATUSES)}"
            )
        for key, value in changes.items():
            setattr(req, key, value)
        session.commit()
        return design_out(req, user, full=True)

    @api.post("/api/design-requests/{request_id}/uploads", status_code=201)
    def start_design_upload(
        request_id: int,
        body: UploadStartIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        see_design(session, user, request_id)
        ext = Path(body.filename).suffix.lower()
        if ext not in design_input_exts:
            raise HTTPException(
                400, f"{body.filename}: unsupported file type {ext or '(none)'}"
            )
        if body.size > max_upload:
            raise HTTPException(
                413, f"file is larger than the {settings.max_upload_gb:g} GB limit"
            )
        upload = Upload(
            user_id=user.id,
            design_request_id=request_id,
            purpose="design",
            filename=body.filename,
            size=body.size,
            path="",
        )
        session.add(upload)
        session.flush()
        directory = storage.root / "design" / str(request_id) / "uploads"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{upload.id}_{safe_name(body.filename)}"
        if not isinstance(storage, DbBackedStorage):
            path.touch()
        upload.path = str(path)
        session.commit()
        return upload_out(upload, chunk_size())

    @api.post("/api/design-requests/{request_id}/files", status_code=201)
    def add_design_file(
        request_id: int,
        body: DesignFileIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        req = see_design(session, user, request_id)
        if not user.is_staff and body.kind not in client_kinds:
            raise HTTPException(403, "only the YCB team can add deliverables")
        upload = own_upload(session, body.upload_id, user)
        if upload.design_request_id != req.id:
            raise HTTPException(400, "upload belongs to another request")
        if upload.received != upload.size:
            raise HTTPException(409, f"{upload.filename} has not finished uploading")
        target = (
            storage.root
            / "design"
            / str(req.id)
            / "files"
            / f"{upload.id}_{safe_name(upload.filename)}"
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        storage.move(Path(upload.path), target)
        f = DesignFile(
            kind=body.kind,
            filename=upload.filename,
            path=str(target),
            size=upload.size,
            visible_to_client=body.visible_to_client if user.is_staff else True,
            uploaded_by_id=user.id,
        )
        session.delete(upload)
        req.files.append(f)
        session.commit()
        return design_file_out(f)

    @api.patch("/api/design-files/{file_id}", dependencies=staff_only)
    def update_design_file(file_id: int, body: dict, session: Session = Depends(db)):
        f = get_or_404(session, DesignFile, file_id)
        if "visible_to_client" in body:
            f.visible_to_client = bool(body["visible_to_client"])
        session.commit()
        return design_file_out(f)

    @api.get("/api/design-files/{file_id}")
    def get_design_file(
        file_id: int, user: User = Depends(require_user), session: Session = Depends(db)
    ):
        f = get_or_404(session, DesignFile, file_id)
        see_design(session, user, f.request_id)
        if not user.is_staff and not f.visible_to_client:
            raise HTTPException(404, f"DesignFile {file_id} not found")
        if not storage.ensure(Path(f.path)):
            raise HTTPException(404, "file not found")
        return FileResponse(f.path, filename=f.filename)

    @api.post("/api/design-requests/{request_id}/comments", status_code=201)
    def add_design_comment(
        request_id: int,
        body: CommentIn,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        req = see_design(session, user, request_id)
        req.comments.append(
            DesignComment(
                author_id=user.id,
                body=body.body,
                internal=body.internal and user.is_staff,
            )
        )
        session.commit()
        return design_out(req, user, full=True)

    @api.post("/api/design-requests/{request_id}/ai-concept", dependencies=staff_only)
    def generate_concept(
        request_id: int,
        user: User = Depends(require_user),
        session: Session = Depends(db),
    ):
        """Opus reads the request and attachments, writes a brief and a concept plan.

        The concept is saved as DXF and PDF files (team-only until shared).
        """
        from sitecapture import design_cad
        from sitecapture.ai import design
        from sitecapture.ai.claude import AiError

        req = see_design(session, user, request_id)
        inputs = []
        for f in req.files:
            if f.kind in client_kinds and storage.ensure(Path(f.path)):
                inputs.append((f.kind, f.filename, Path(f.path)))
        try:
            result = design.generate(req, inputs, model=settings.ai_model)
        except AiError as exc:
            raise HTTPException(409, str(exc)) from exc
        req.ai_brief = result["brief_markdown"]
        req.ai_questions = result["questions"]
        req.concept = result["concept"]
        if req.status == "submitted":
            req.status = "in_review"
        directory = storage.root / "design" / str(req.id) / "files"
        directory.mkdir(parents=True, exist_ok=True)
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
        dxf_path = directory / f"concept_{stamp}.dxf"
        dxf_path.write_text(design_cad.to_dxf(req.concept, req.title))
        pdf_path = design_cad.to_pdf(
            req.concept, directory / f"concept_{stamp}.pdf", req.title
        )
        for path in (dxf_path, pdf_path):
            storage.persist(path)
            req.files.append(
                DesignFile(
                    kind="concept",
                    filename=path.name,
                    path=str(path),
                    size=path.stat().st_size,
                    visible_to_client=False,
                    uploaded_by_id=user.id,
                )
            )
        session.commit()
        return design_out(req, user, full=True)

    from sitecapture.api import scans as scans_routes

    scans_routes.register(
        api,
        SimpleNamespace(
            storage=storage,
            settings=settings,
            SessionLocal=SessionLocal,
            db=db,
            require_user=require_user,
            staff_only=staff_only,
            see_project=see_project,
            get_or_404=get_or_404,
            file_or_404=file_or_404,
            annotation_out=annotation_out,
            check_category=check_category,
            Project=Project,
        ),
    )
    app.include_router(api)

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
        capture = session.get(Capture, job.capture_id)
        if capture.model_path:
            storage.persist(Path(capture.model_path))
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

    @app.get("/healthz", include_in_schema=False)
    def healthz():
        return {"ok": True}

    app.mount("/ui", StaticFiles(directory=STATIC_DIR), name="ui")
    return app


def __getattr__(name: str):
    # Lazily build the default app so importing this module has no side effects.
    if name == "app":
        globals()["app"] = create_app()
        return globals()["app"]
    raise AttributeError(name)
