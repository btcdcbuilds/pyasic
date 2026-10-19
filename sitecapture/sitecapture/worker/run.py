"""Entry point on the rented GPU machine.

Reads ``SITECAPTURE_API``, ``SITECAPTURE_JOB_ID`` and ``SITECAPTURE_JOB_TOKEN``,
downloads the capture's frames, runs OpenSfM, and posts the results back. The
API terminates the instance when it receives the result (or a failure).
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path

import httpx

from sitecapture.pipeline import sfm


def main() -> int:
    api = os.environ["SITECAPTURE_API"].rstrip("/")
    job_id = os.environ["SITECAPTURE_JOB_ID"]
    headers = {"X-Job-Token": os.environ["SITECAPTURE_JOB_TOKEN"]}
    work = Path(os.environ.get("SITECAPTURE_WORKDIR", "/work"))
    client = httpx.Client(base_url=api, headers=headers, timeout=120)
    try:
        manifest = client.get(f"/api/worker/jobs/{job_id}").raise_for_status().json()
        frame_dir = work / "frames"
        frame_dir.mkdir(parents=True, exist_ok=True)
        paths = []
        for frame in manifest["frames"]:
            target = frame_dir / f"frame_{frame['index']:05d}.jpg"
            with client.stream("GET", frame["url"]) as resp:
                resp.raise_for_status()
                with target.open("wb") as out:
                    for chunk in resp.iter_bytes():
                        out.write(chunk)
            paths.append(target)
        print(f"downloaded {len(paths)} frames", flush=True)

        dataset = sfm.prepare_dataset(paths, work / "dataset")
        recon = sfm.run_opensfm(dataset, dense=manifest.get("dense", True))
        trajectory = sfm.ground_plane(sfm.load_trajectory(recon))
        files = {}
        ply = dataset / "undistorted" / "depthmaps" / "merged.ply"
        if ply.exists():
            files["model"] = ("model.ply", ply.open("rb"), "application/octet-stream")
        client.post(
            f"/api/worker/jobs/{job_id}/result",
            data={"trajectory": json.dumps({str(k): v for k, v in trajectory.items()})},
            files=files or None,
            timeout=None,
        ).raise_for_status()
        return 0
    except Exception:  # noqa: BLE001 - report every failure so the GPU is released
        reason = traceback.format_exc()[-4000:]
        print(reason, file=sys.stderr)
        try:
            client.post(f"/api/worker/jobs/{job_id}/fail", json={"reason": reason})
        except httpx.HTTPError:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
