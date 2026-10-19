# GPU worker image: OpenSfM + the sitecapture worker entry point.
# Build from the sitecapture/ folder:
#   docker build -f docker/worker.Dockerfile -t <registry>/sitecapture-worker:0.1.0 .
# then set SITECAPTURE_WORKER_IMAGE to that tag and push it somewhere the
# rented machines can pull from.
#
# OpenSfM is built from source. Pin OPENSFM_REF to a tested commit or tag; the
# build dependencies below follow OpenSfM's own Dockerfile and may need
# updating for newer revisions.
FROM ubuntu:22.04

ARG OPENSFM_REF=main
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git ca-certificates ffmpeg \
        libeigen3-dev libopencv-dev libceres-dev libsuitesparse-dev \
        libgoogle-glog-dev libgflags-dev libatlas-base-dev \
        python3-dev python3-pip python3-numpy python3-opencv python3-scipy \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --recursive https://github.com/mapillary/OpenSfM.git /opt/opensfm \
    && cd /opt/opensfm && git checkout "$OPENSFM_REF" && git submodule update --init --recursive \
    && pip3 install --no-cache-dir -r requirements.txt \
    && python3 setup.py build
ENV OPENSFM_BIN=/opt/opensfm/bin/opensfm

WORKDIR /app
COPY pyproject.toml ./
COPY sitecapture ./sitecapture
RUN pip3 install --no-cache-dir .

ENV SITECAPTURE_WORKDIR=/work
CMD ["python3", "-m", "sitecapture.worker.run"]
