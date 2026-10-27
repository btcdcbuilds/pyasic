"""Lambda Cloud adapter.

Endpoints (Lambda Cloud API v1, Bearer API key):

* ``GET  /instance-types``                 prices and regions with capacity
* ``POST /instance-operations/launch``     launch instances
* ``GET  /instances/{id}``                 instance details
* ``POST /instance-operations/terminate``  terminate (``instance_ids`` list)

Lambda rents whole VMs rather than containers, so the worker is started by a
cloud-init ``user_data`` script that runs the worker image with Docker. Confirm
that your Lambda account/API version accepts ``user_data``; if it doesn't, the
orchestrator has to SSH in with ``ssh_key_names`` and run the same script.
"""

from __future__ import annotations

import shlex

import httpx

from sitecapture.gpu.base import GpuProvider, Launched, ProviderError, WorkerSpec

BASE_URL = "https://cloud.lambdalabs.com/api/v1"


def cloud_init(spec: WorkerSpec) -> str:
    env_flags = " ".join(
        f"-e {shlex.quote(f'{k}={v}')}" for k, v in sorted(spec.env.items())
    )
    return (
        "#!/bin/bash\n"
        "set -euo pipefail\n"
        f"docker run --rm --gpus all {env_flags} {shlex.quote(spec.image)} "
        f"{spec.command}\n"
    )


class LambdaProvider(GpuProvider):
    name = "lambda"

    def __init__(
        self,
        api_key: str,
        instance_type: str = "gpu_1x_a10",
        region: str = "us-east-1",
        ssh_key_name: str = "",
        client: httpx.Client | None = None,
    ):
        if not api_key:
            raise ProviderError("LAMBDA_API_KEY is not set")
        self.instance_type = instance_type
        self.region = region
        self.ssh_key_name = ssh_key_name
        self.client = client or httpx.Client(
            base_url=BASE_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )

    def _check(self, resp: httpx.Response) -> dict:
        if resp.status_code >= 400:
            raise ProviderError(f"Lambda {resp.status_code}: {resp.text[:500]}")
        return resp.json()

    def _price_and_region(self) -> tuple[float | None, str]:
        data = self._check(self.client.get("/instance-types")).get("data", {})
        entry = data.get(self.instance_type)
        if not entry:
            raise ProviderError(f"unknown Lambda instance type {self.instance_type}")
        cents = entry.get("instance_type", {}).get("price_cents_per_hour")
        regions = [r["name"] for r in entry.get("regions_with_capacity_available", [])]
        if not regions:
            raise ProviderError(f"no capacity for {self.instance_type} right now")
        region = self.region if self.region in regions else regions[0]
        return (cents / 100 if cents is not None else None), region

    def launch(self, spec: WorkerSpec, max_hourly_usd: float) -> Launched:
        price, region = self._price_and_region()
        if price is not None and price > max_hourly_usd:
            raise ProviderError(
                f"{self.instance_type} costs ${price:.2f}/h, over the ${max_hourly_usd:.2f}/h cap"
            )
        body = {
            "region_name": region,
            "instance_type_name": self.instance_type,
            "ssh_key_names": [self.ssh_key_name] if self.ssh_key_name else [],
            "quantity": 1,
            "name": spec.label,
            "user_data": cloud_init(spec),
        }
        data = self._check(self.client.post("/instance-operations/launch", json=body))
        ids = data.get("data", {}).get("instance_ids", [])
        if not ids:
            raise ProviderError(f"Lambda did not launch an instance: {data}")
        return Launched(ids[0], price)

    def status(self, instance_id: str) -> str:
        data = self._check(self.client.get(f"/instances/{instance_id}"))
        return str(data.get("data", {}).get("status", "unknown"))

    def terminate(self, instance_id: str) -> None:
        self._check(
            self.client.post(
                "/instance-operations/terminate", json={"instance_ids": [instance_id]}
            )
        )
