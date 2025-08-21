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
COPY rtsp-simple-server /app/rtsp-simple-server
COPY rtsp-simple-server.yml /app/rtsp-simple-server.yml

# Make executable
RUN chmod +x /app/rtsp-simple-server || true

EXPOSE 8554 1935 8888 8889

VOLUME ["/app/logs"]

CMD ["/app/rtsp-simple-server", "/app/rtsp-simple-server.yml"]
