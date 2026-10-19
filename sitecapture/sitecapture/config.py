"""Runtime settings, read from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass
class Settings:
    # Where uploads, frames and generated outputs are stored.
    data_dir: Path = field(
        default_factory=lambda: Path(_env("SITECAPTURE_DATA_DIR", "./data"))
    )
    database_url: str = field(
        default_factory=lambda: _env("SITECAPTURE_DATABASE_URL", "")
    )
    # Public URL of this API; GPU workers call back to it.
    public_url: str = field(
        default_factory=lambda: _env("SITECAPTURE_PUBLIC_URL", "http://localhost:8000")
    )

    # GPU provider: "local" (run on this machine), "vastai" or "lambda".
    gpu_provider: str = field(
        default_factory=lambda: _env("SITECAPTURE_GPU_PROVIDER", "local")
    )
    worker_image: str = field(
        default_factory=lambda: _env(
            "SITECAPTURE_WORKER_IMAGE", "ghcr.io/your-org/sitecapture-worker:latest"
        )
    )
    max_gpu_hourly_usd: float = field(
        default_factory=lambda: float(_env("SITECAPTURE_MAX_GPU_USD_PER_HOUR", "1.50"))
    )

    vastai_api_key: str = field(default_factory=lambda: _env("VASTAI_API_KEY"))
    vastai_gpu_name: str = field(
        default_factory=lambda: _env("VASTAI_GPU_NAME", "RTX_4090")
    )
    lambda_api_key: str = field(default_factory=lambda: _env("LAMBDA_API_KEY"))
    lambda_instance_type: str = field(
        default_factory=lambda: _env("LAMBDA_INSTANCE_TYPE", "gpu_1x_a10")
    )
    lambda_region: str = field(
        default_factory=lambda: _env("LAMBDA_REGION", "us-east-1")
    )
    lambda_ssh_key_name: str = field(
        default_factory=lambda: _env("LAMBDA_SSH_KEY_NAME")
    )

    # Seconds between extracted frames from a walk video.
    frame_interval_s: float = field(
        default_factory=lambda: float(_env("SITECAPTURE_FRAME_INTERVAL_S", "1.0"))
    )
    ai_model: str = field(
        default_factory=lambda: _env("SITECAPTURE_AI_MODEL", "claude-opus-5-5")
    )

    def __post_init__(self) -> None:
        self.data_dir = Path(self.data_dir).resolve()
        if not self.database_url:
            self.database_url = f"sqlite:///{self.data_dir / 'sitecapture.db'}"


def get_settings() -> Settings:
    return Settings()
