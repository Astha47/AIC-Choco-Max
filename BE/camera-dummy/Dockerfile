FROM python:3.10-slim

ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1

# Install runtime deps (FFmpeg + minimal libs for OpenCV)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg \
       libgl1 \
       libglib2.0-0 \
       libsm6 \
       libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps if present
COPY requirements.txt /app/requirements.txt
RUN if [ -f /app/requirements.txt ]; then pip install --no-cache-dir -r /app/requirements.txt; fi

# Copy application files
COPY . /app

# Ensure samples folder exists
RUN mkdir -p /app/samples

# Default envs (can be overridden by docker-compose)
ENV RTSP_SERVER=rtsp-server:8554
ENV NUM_CAMERAS=3
ENV MAX_FPS=20

CMD ["python", "/app/camera.py"]
