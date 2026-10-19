"""Interface every GPU rental provider implements."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class ProviderError(RuntimeError):
    pass


@dataclass
class WorkerSpec:
    """What the rented machine must run: the worker image plus its env."""

    image: str
    env: dict[str, str] = field(default_factory=dict)
    disk_gb: int = 100
    label: str = "sitecapture"

    @property
    def command(self) -> str:
        return "python3 -m sitecapture.worker.run"


@dataclass
class Launched:
    instance_id: str
    hourly_usd: float | None


class GpuProvider(ABC):
    name: str

    @abstractmethod
    def launch(self, spec: WorkerSpec, max_hourly_usd: float) -> Launched:
        """Rent the cheapest suitable GPU under the price cap and start the worker."""

    @abstractmethod
    def status(self, instance_id: str) -> str:
        """Provider's raw status string for the instance."""

    @abstractmethod
    def terminate(self, instance_id: str) -> None:
        """Stop billing: destroy the instance."""
