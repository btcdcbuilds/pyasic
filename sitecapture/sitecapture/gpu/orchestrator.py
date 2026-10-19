"""Glue between uploads, rented GPUs and results.

Flow for a new capture:

1. ``prepare_capture`` (on the API server): extract frames, place them by
   interpolation if the user has set control points.
2. ``start_reconstruction``: create a Job and either run it here
   (provider "local") or rent a GPU that runs ``sitecapture.worker.run``.
3. The worker downloads frames, runs OpenSfM and posts the trajectory and
   point cloud back; ``finish_job`` stores them, re-places the frames along the
   real path and **always** terminates the rented instance.
4. ``reap_stale_jobs`` terminates any instance whose job ran past the time
   limit, so a hung worker can't keep billing.
"""

from __future__ import annotations

import datetime as dt
import os
import shutil
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from sitecapture.config import Settings
from sitecapture.db import Capture, Frame, Job
from sitecapture.gpu.base import GpuProvider, ProviderError, WorkerSpec
from sitecapture.pipeline import alignment
from sitecapture.pipeline import frames as frames_mod
from sitecapture.pipeline import sfm
from sitecapture.storage import LocalStorage

MAX_JOB_HOURS = 6


def get_provider(settings: Settings) -> GpuProvider | None:
    """The configured rental provider, or None to run jobs on this machine."""
    if settings.gpu_provider == "vastai":
        from sitecapture.gpu.vastai import VastAiProvider

        return VastAiProvider(settings.vastai_api_key, settings.vastai_gpu_name)
    if settings.gpu_provider == "lambda":
        from sitecapture.gpu.lambdalabs import LambdaProvider

        return LambdaProvider(
            settings.lambda_api_key,
            settings.lambda_instance_type,
            settings.lambda_region,
            settings.lambda_ssh_key_name,
        )
    if settings.gpu_provider == "local":
        return None
    raise ProviderError(f"unknown GPU provider {settings.gpu_provider!r}")


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _log(job: Job, msg: str) -> None:
    job.log = (job.log or "") + f"[{_now():%Y-%m-%d %H:%M:%S}] {msg}\n"


def apply_positions(
    capture: Capture, trajectory: dict[int, tuple[float, float]] | None = None
) -> alignment.Similarity2D | None:
    """Place every frame on the drawing from control points (+ SfM path if any)."""
    if trajectory is None and capture.trajectory:
        trajectory = {int(k): tuple(v) for k, v in capture.trajectory.items()}
    cps = alignment.parse_control_points(capture.control_points or [])
    n = len(capture.frames)
    if trajectory:
        positions, transform = alignment.positions_from_trajectory(n, trajectory, cps)
    else:
        positions, transform = alignment.interpolate_positions(n, cps), None
    for frame, pos in zip(capture.frames, positions):
        frame.x, frame.y = pos if pos else (None, None)
    return transform


def prepare_capture(
    session: Session, storage: LocalStorage, settings: Settings, capture: Capture
) -> None:
    out_dir = storage.project_dir(
        capture.project_id, "captures", str(capture.id), "frames"
    )
    extracted = frames_mod.extract_frames(
        [Path(p) for p in capture.source_paths], out_dir, settings.frame_interval_s
    )
    for old in list(capture.frames):
        session.delete(old)
    session.flush()
    capture.frames = [
        Frame(index=f.index, image_path=str(f.path), timestamp_s=f.timestamp_s)
        for f in extracted
    ]
    apply_positions(capture)
    capture.status = "frames_ready"
    session.commit()


def start_reconstruction(session: Session, settings: Settings, capture: Capture) -> Job:
    provider = get_provider(settings)
    job = Job(
        capture_id=capture.id,
        kind="reconstruct",
        provider=provider.name if provider else "local",
    )
    session.add(job)
    capture.status = "positioning"
    session.commit()

    if provider is None:
        run_local(session, settings, job, capture)
        return job

    spec = WorkerSpec(
        image=settings.worker_image,
        env={
            "SITECAPTURE_API": settings.public_url,
            "SITECAPTURE_JOB_ID": str(job.id),
            "SITECAPTURE_JOB_TOKEN": job.token,
        },
        label=f"sitecapture-job-{job.id}",
    )
    job.status = "launching"
    _log(
        job,
        f"renting GPU from {provider.name} (cap ${settings.max_gpu_hourly_usd:.2f}/h)",
    )
    session.commit()
    try:
        launched = provider.launch(spec, settings.max_gpu_hourly_usd)
    except ProviderError as exc:
        job.status = "failed"
        capture.status = "frames_ready"
        _log(job, f"launch failed: {exc}")
        job.finished_at = _now()
        session.commit()
        return job
    job.provider_instance_id = launched.instance_id
    job.hourly_usd = launched.hourly_usd
    job.status = "running"
    _log(job, f"instance {launched.instance_id} at ${launched.hourly_usd}/h")
    session.commit()
    return job


def run_local(session: Session, settings: Settings, job: Job, capture: Capture) -> None:
    """Run reconstruction on this machine (development, or a GPU server you own)."""
    if not shutil.which("opensfm") and not os.environ.get("OPENSFM_BIN"):
        job.status = "skipped"
        _log(
            job,
            "OpenSfM is not installed here; frames placed by control-point interpolation only",
        )
        job.finished_at = _now()
        capture.status = "positioned" if capture.control_points else "frames_ready"
        session.commit()
        return
    dataset = Path(settings.data_dir) / "jobs" / str(job.id)
    job.status = "running"
    session.commit()
    try:
        sfm.prepare_dataset([Path(f.image_path) for f in capture.frames], dataset)
        recon = sfm.run_opensfm(dataset, log=lambda m: _log(job, m))
        trajectory = sfm.ground_plane(sfm.load_trajectory(recon))
        ply = dataset / "undistorted" / "depthmaps" / "merged.ply"
        finish_job(session, settings, job, trajectory, ply if ply.exists() else None)
    except Exception as exc:  # noqa: BLE001 - record any pipeline failure on the job
        fail_job(session, settings, job, f"{type(exc).__name__}: {exc}")


def finish_job(
    session: Session,
    settings: Settings,
    job: Job,
    trajectory: dict[int, tuple[float, float]],
    model_file: Path | None,
) -> None:
    capture = session.get(Capture, job.capture_id)
    capture.trajectory = {str(k): list(v) for k, v in trajectory.items()}
    transform = apply_positions(capture, trajectory)
    capture.quality = len(trajectory) / max(len(capture.frames), 1)
    if model_file:
        dest_dir = (
            Path(settings.data_dir) / "projects" / str(capture.project_id) / "models"
        )
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"capture_{capture.id}{model_file.suffix}"
        if Path(model_file).resolve() != dest.resolve():
            shutil.copyfile(model_file, dest)
        capture.model_path = str(dest)
    capture.status = "positioned"
    job.status = "succeeded"
    _log(
        job,
        f"registered {len(trajectory)}/{len(capture.frames)} frames"
        + (
            f", alignment RMS {transform.rms_error:.4f}"
            if transform
            else ", no alignment (need 2+ control points)"
        ),
    )
    _release(settings, job)
    session.commit()


def fail_job(session: Session, settings: Settings, job: Job, reason: str) -> None:
    capture = session.get(Capture, job.capture_id)
    job.status = "failed"
    _log(job, reason)
    capture.status = "failed"
    _release(settings, job)
    session.commit()


def _release(settings: Settings, job: Job) -> None:
    job.finished_at = _now()
    if not job.provider_instance_id or job.provider == "local":
        return
    try:
        provider = get_provider(settings)
        if provider:
            provider.terminate(job.provider_instance_id)
            _log(job, f"terminated instance {job.provider_instance_id}")
    except ProviderError as exc:
        _log(job, f"WARNING: could not terminate {job.provider_instance_id}: {exc}")


def reap_stale_jobs(session: Session, settings: Settings) -> int:
    cutoff = _now() - dt.timedelta(hours=MAX_JOB_HOURS)
    stale = session.scalars(
        select(Job).where(Job.status.in_(["launching", "running"]))
    ).all()
    count = 0
    for job in stale:
        created = (
            job.created_at
            if job.created_at.tzinfo
            else job.created_at.replace(tzinfo=dt.timezone.utc)
        )
        if created < cutoff:
            fail_job(session, settings, job, f"timed out after {MAX_JOB_HOURS}h")
            count += 1
    return count
