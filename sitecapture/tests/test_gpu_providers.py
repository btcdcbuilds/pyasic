import json

import httpx
import pytest

from sitecapture.gpu.base import ProviderError, WorkerSpec
from sitecapture.gpu.lambdalabs import BASE_URL as LAMBDA_URL
from sitecapture.gpu.lambdalabs import LambdaProvider, cloud_init
from sitecapture.gpu.vastai import BASE_URL as VAST_URL
from sitecapture.gpu.vastai import VastAiProvider

SPEC = WorkerSpec(
    image="reg/worker:1",
    env={"SITECAPTURE_JOB_ID": "7", "SITECAPTURE_JOB_TOKEN": "t o'k"},
)


def recorder(handler):
    calls = []

    def wrapped(request: httpx.Request):
        calls.append(request)
        return handler(request)

    return calls, wrapped


def test_vastai_rents_cheapest_offer():
    def handler(req):
        if req.method == "POST" and req.url.path.endswith("/bundles/"):
            return httpx.Response(
                200,
                json={
                    "offers": [
                        {"id": 111, "dph_total": 0.42},
                        {"id": 222, "dph_total": 0.6},
                    ]
                },
            )
        if req.method == "PUT" and req.url.path.endswith("/asks/111/"):
            return httpx.Response(200, json={"success": True, "new_contract": 9001})
        if req.method == "DELETE":
            return httpx.Response(200, json={"success": True})
        return httpx.Response(404)

    calls, h = recorder(handler)
    client = httpx.Client(base_url=VAST_URL, transport=httpx.MockTransport(h))
    p = VastAiProvider("key", client=client)
    launched = p.launch(SPEC, max_hourly_usd=1.0)
    assert (launched.instance_id, launched.hourly_usd) == ("9001", 0.42)
    query = json.loads(calls[0].content)
    assert query["dph_total"] == {"lte": 1.0}
    body = json.loads(calls[1].content)
    assert body["image"] == "reg/worker:1" and body["env"]["SITECAPTURE_JOB_ID"] == "7"
    p.terminate("9001")
    assert calls[-1].method == "DELETE" and calls[-1].url.path.endswith(
        "/instances/9001/"
    )


def test_vastai_no_offers():
    client = httpx.Client(
        base_url=VAST_URL,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json={"offers": []})
        ),
    )
    with pytest.raises(ProviderError, match="no RTX_4090 offers"):
        VastAiProvider("key", client=client).launch(SPEC, 0.1)


def _lambda_types(price_cents, regions):
    return {
        "data": {
            "gpu_1x_a10": {
                "instance_type": {"price_cents_per_hour": price_cents},
                "regions_with_capacity_available": [{"name": r} for r in regions],
            }
        }
    }


def test_lambda_launch_and_terminate():
    def handler(req):
        if req.url.path.endswith("/instance-types"):
            return httpx.Response(200, json=_lambda_types(75, ["us-west-1"]))
        if req.url.path.endswith("/instance-operations/launch"):
            return httpx.Response(200, json={"data": {"instance_ids": ["abc"]}})
        if req.url.path.endswith("/instance-operations/terminate"):
            return httpx.Response(200, json={"data": {"terminated_instances": []}})
        return httpx.Response(404)

    calls, h = recorder(handler)
    client = httpx.Client(base_url=LAMBDA_URL, transport=httpx.MockTransport(h))
    p = LambdaProvider("key", region="us-east-1", client=client)
    launched = p.launch(SPEC, max_hourly_usd=1.0)
    assert (launched.instance_id, launched.hourly_usd) == ("abc", 0.75)
    body = json.loads(calls[1].content)
    assert body["region_name"] == "us-west-1"  # fell back to a region with capacity
    assert "docker run --rm --gpus all" in body["user_data"]
    p.terminate("abc")
    assert json.loads(calls[-1].content) == {"instance_ids": ["abc"]}


def test_lambda_price_cap():
    client = httpx.Client(
        base_url=LAMBDA_URL,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json=_lambda_types(250, ["us-east-1"]))
        ),
    )
    with pytest.raises(ProviderError, match="over the"):
        LambdaProvider("key", client=client).launch(SPEC, 1.0)


def test_cloud_init_quotes_env():
    script = cloud_init(SPEC)
    assert "-e 'SITECAPTURE_JOB_TOKEN=t o'\"'\"'k'" in script


def test_missing_key():
    with pytest.raises(ProviderError):
        VastAiProvider("")
    with pytest.raises(ProviderError):
        LambdaProvider("")
