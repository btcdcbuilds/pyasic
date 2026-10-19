"""Database models.

Positions on a drawing are stored normalised to the page: (0, 0) is the
top-left corner and (1, 1) the bottom-right, so they survive re-rendering the
PDF at any resolution.
"""

from __future__ import annotations

import datetime as dt
import secrets

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    sessionmaker,
)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    drawings: Mapped[list["Drawing"]] = relationship(back_populates="project")
    captures: Mapped[list["Capture"]] = relationship(back_populates="project")
    bim_models: Mapped[list["BimModel"]] = relationship(back_populates="project")


class Drawing(Base):
    """One page of an uploaded PDF drawing (e.g. a level floor plan)."""

    __tablename__ = "drawings"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(String(200))
    pdf_path: Mapped[str] = mapped_column(Text)
    page_index: Mapped[int] = mapped_column(Integer, default=0)
    image_path: Mapped[str] = mapped_column(Text)
    width_px: Mapped[int] = mapped_column(Integer)
    height_px: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    project: Mapped[Project] = relationship(back_populates="drawings")


class Capture(Base):
    """One site walk: a 360 video or a set of 360 photos taken on one date."""

    __tablename__ = "captures"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    drawing_id: Mapped[int | None] = mapped_column(ForeignKey("drawings.id"))
    captured_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    source_paths: Mapped[list] = mapped_column(JSON, default=list)
    # uploaded -> frames_ready -> positioning -> positioned | failed
    status: Mapped[str] = mapped_column(String(32), default="uploaded")
    # [{"frame_index": int, "x": float, "y": float}, ...] placed by the user.
    control_points: Mapped[list] = mapped_column(JSON, default=list)
    # SfM camera path on the ground plane, {"frame_index": [x, y]}, kept so
    # frames can be re-placed when control points change.
    trajectory: Mapped[dict | None] = mapped_column(JSON)
    # Fraction of frames registered by structure-from-motion (0-1), if run.
    quality: Mapped[float | None] = mapped_column(Float)
    model_path: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    project: Mapped[Project] = relationship(back_populates="captures")
    frames: Mapped[list["Frame"]] = relationship(
        back_populates="capture", order_by="Frame.index"
    )


class Frame(Base):
    """A single equirectangular 360 image from a capture."""

    __tablename__ = "frames"

    id: Mapped[int] = mapped_column(primary_key=True)
    capture_id: Mapped[int] = mapped_column(ForeignKey("captures.id"))
    index: Mapped[int] = mapped_column(Integer)
    image_path: Mapped[str] = mapped_column(Text)
    timestamp_s: Mapped[float] = mapped_column(Float, default=0.0)
    # Position on the capture's drawing, normalised 0-1. None until placed.
    x: Mapped[float | None] = mapped_column(Float)
    y: Mapped[float | None] = mapped_column(Float)
    # Camera heading in degrees relative to drawing "up", if known.
    heading_deg: Mapped[float | None] = mapped_column(Float)

    capture: Mapped[Capture] = relationship(back_populates="frames")


class Job(Base):
    """Background processing, run locally or on a rented GPU."""

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    capture_id: Mapped[int] = mapped_column(ForeignKey("captures.id"))
    kind: Mapped[str] = mapped_column(String(32))  # "reconstruct"
    # queued -> launching -> running -> succeeded | failed
    status: Mapped[str] = mapped_column(String(32), default="queued")
    provider: Mapped[str] = mapped_column(String(32))
    provider_instance_id: Mapped[str | None] = mapped_column(String(128))
    hourly_usd: Mapped[float | None] = mapped_column(Float)
    # Secret the worker presents when fetching inputs and posting results.
    token: Mapped[str] = mapped_column(
        String(64), default=lambda: secrets.token_urlsafe(32)
    )
    log: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    capture_id: Mapped[int] = mapped_column(ForeignKey("captures.id"))
    previous_capture_id: Mapped[int | None] = mapped_column(ForeignKey("captures.id"))
    model: Mapped[str] = mapped_column(String(64))
    markdown: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )


class BimModel(Base):
    __tablename__ = "bim_models"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(32))  # "ifc", "acc", "procore"
    path: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    project: Mapped[Project] = relationship(back_populates="bim_models")


def make_sessionmaker(database_url: str) -> sessionmaker:
    connect_args = (
        {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    )
    engine = create_engine(database_url, connect_args=connect_args)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
