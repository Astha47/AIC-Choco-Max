FROM debian:bookworm-slim

# Install minimal tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the rtsp-simple-server binary and config if present in the repo
# If the binary is not present, the Dockerfile will still build but the container
# will fail at runtime; user can place the binary in BE/rtsp-server/rtsp-simple-server
# Copy the config if present
COPY rtsp-simple-server.yml /app/rtsp-simple-server.yml

# Download rtsp-simple-server during build so the image is runnable from a clean clone.
# We'll use a known release; change RTSP_SIMPLE_SERVER_VERSION if you want a different one.
ARG RTSP_SIMPLE_SERVER_VERSION=v0.21.0
RUN set -eux; \
    ARCH="linux_amd64"; \
    URL="https://github.com/aler9/rtsp-simple-server/releases/download/${RTSP_SIMPLE_SERVER_VERSION}/rtsp-simple-server_${RTSP_SIMPLE_SERVER_VERSION}_${ARCH}.tar.gz"; \
    echo "Downloading ${URL}"; \
    mkdir -p /tmp/rtsp && cd /tmp/rtsp; \
    curl -L -sS -o rtsp-simple-server.tar.gz "${URL}"; \
    tar xzf rtsp-simple-server.tar.gz; \
    mv rtsp-simple-server /app/rtsp-simple-server; \
    rm -rf /tmp/rtsp; \
    chmod +x /app/rtsp-simple-server

EXPOSE 8554 1935 8888 8889

VOLUME ["/app/logs"]

CMD ["/app/rtsp-simple-server", "/app/rtsp-simple-server.yml"]
