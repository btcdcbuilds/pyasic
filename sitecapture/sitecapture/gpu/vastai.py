"""Vast.ai marketplace adapter.

Endpoints (Vast.ai REST API v0, Bearer API key):

* ``POST /api/v0/bundles/``      search rentable offers
* ``PUT  /api/v0/asks/{id}/``    rent an offer, creating an instance
* ``GET  /api/v0/instances/{id}/``  instance details
* ``DELETE /api/v0/instances/{id}/``  destroy (stopping alone still bills disk)

Check the search filter keys and the create-instance body fields against the
current Vast.ai API reference before production use.
"""

from __future__ import annotations

import httpx

from sitecapture.gpu.base import GpuProvider, Launched, ProviderError, WorkerSpec

BASE_URL = "https://console.vast.ai/api/v0"


class VastAiProvider(GpuProvider):
    name = "vastai"

    def __init__(
        self,
        api_key: str,
        gpu_name: str = "RTX_4090",
        min_reliability: float = 0.98,
        client: httpx.Client | None = None,
    ):
        if not api_key:
            raise ProviderError("VASTAI_API_KEY is not set")
        self.gpu_name = gpu_name
        self.min_reliability = min_reliability
        self.client = client or httpx.Client(
            base_url=BASE_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )

    def _check(self, resp: httpx.Response) -> dict:
        if resp.status_code >= 400:
            raise ProviderError(f"Vast.ai {resp.status_code}: {resp.text[:500]}")
        return resp.json()

    def search_offers(self, max_hourly_usd: float, disk_gb: int) -> list[dict]:
        query = {
            "gpu_name": {"eq": self.gpu_name},
            "num_gpus": {"eq": 1},
            "rentable": {"eq": True},
            "verified": {"eq": True},
            "reliability": {"gte": self.min_reliability},
            "disk_space": {"gte": disk_gb},
            "dph_total": {"lte": max_hourly_usd},
            "type": "on-demand",
            "order": [["dph_total", "asc"]],
            "limit": 10,
        }
        data = self._check(self.client.post("/bundles/", json=query))
        return data.get("offers", [])

    def launch(self, spec: WorkerSpec, max_hourly_usd: float) -> Launched:
        offers = self.search_offers(max_hourly_usd, spec.disk_gb)
        if not offers:
            raise ProviderError(
                f"no {self.gpu_name} offers under ${max_hourly_usd:.2f}/h"
            )
        offer = offers[0]
        body = {
            "image": spec.image,
            "disk": spec.disk_gb,
            "env": spec.env,
            # "args" runs the image directly with these arguments (no SSH).
            "runtype": "args",
            "args": spec.command.split(),
            "label": spec.label,
        }
        data = self._check(self.client.put(f"/asks/{offer['id']}/", json=body))
        instance_id = data.get("new_contract")
        if not data.get("success", True) or instance_id is None:
            raise ProviderError(f"Vast.ai did not create an instance: {data}")
        return Launched(str(instance_id), offer.get("dph_total"))

    def status(self, instance_id: str) -> str:
        data = self._check(self.client.get(f"/instances/{instance_id}/"))
        inst = data.get("instances", data)
        if isinstance(inst, list):
            inst = inst[0] if inst else {}
        return str(inst.get("actual_status") or inst.get("cur_state") or "unknown")

    def terminate(self, instance_id: str) -> None:
        self._check(self.client.delete(f"/instances/{instance_id}/"))
