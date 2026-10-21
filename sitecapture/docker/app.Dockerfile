# SiteCapture web/API server. Build from the sitecapture/ folder:
#   docker build -f docker/app.Dockerfile -t sitecapture-app .
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY sitecapture ./sitecapture
RUN pip install --no-cache-dir ".[bim]"

ENV SITECAPTURE_DATA_DIR=/data
VOLUME /data
EXPOSE 8000

# One worker process: login throttling and the stuck-GPU check live in-process.
CMD ["uvicorn", "sitecapture.api.app:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
