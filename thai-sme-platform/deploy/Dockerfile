FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY webapp ./webapp
COPY sites ./sites
ENV DATA_DIR=/data
VOLUME /data
# One worker: booking availability checks rely on a single process (SQLite).
CMD ["uvicorn", "webapp.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers"]
