#!/usr/bin/env bash
set -euo pipefail

# Lightweight runner for HiveMQ CE
# Usage: ./run_hivemq.sh [docker|local] [--stop-existing] [--mqtt-port N] [--http-port N]
# By default it will attempt Docker mode if docker is available.

MODE=""
STOP_EXISTING=0
MQTT_PORT=1883
HTTP_PORT=18080
CONTAINER_NAME="hivemq-ce"
DOCKER_IMAGE="hivemq/hivemq4:latest"

print_usage() {
  cat <<EOF
Usage: $0 [docker|local] [--stop-existing] [--mqtt-port N] [--http-port N]

Default: auto-detect Docker and run container named '$CONTAINER_NAME'.
--stop-existing : stop and remove existing container named '$CONTAINER_NAME' if present.
--mqtt-port N   : host MQTT port (default: $MQTT_PORT)
--http-port N   : host HTTP/console port (default: $HTTP_PORT)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    docker|local) MODE="$1"; shift ;;
    --stop-existing) STOP_EXISTING=1; shift ;;
    --mqtt-port) MQTT_PORT="$2"; shift 2 ;;
    --http-port) HTTP_PORT="$2"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown arg: $1"; print_usage; exit 2 ;;
  esac
done

has_command(){ command -v "$1" >/dev/null 2>&1; }

port_in_use(){
  local port="$1"
  if has_command ss; then
    ss -ltn "sport = :$port" | grep -q LISTEN
    return $?
  elif has_command lsof; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  else
    # conservative: assume in use == false
    return 1
  fi
}

stop_existing_container(){
  if ! has_command docker; then
    echo "Docker CLI not available to stop container." >&2
    return 1
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "Stopping and removing existing container '$CONTAINER_NAME'..."
    docker rm -f "$CONTAINER_NAME"
  else
    echo "No existing container named '$CONTAINER_NAME' found.";
  fi
}

run_docker(){
  if ! has_command docker; then
    echo "Docker not installed or not in PATH." >&2
    return 2
  fi

  if port_in_use "$MQTT_PORT"; then
    echo "Port $MQTT_PORT appears in use on host. If it's a running HiveMQ container named '$CONTAINER_NAME', run with --stop-existing to remove it." >&2
    return 3
  fi

  echo "Pulling image $DOCKER_IMAGE..."
  docker pull "$DOCKER_IMAGE"

  echo "Starting container '$CONTAINER_NAME' mapping MQTT:$MQTT_PORT and HTTP:$HTTP_PORT"
  docker run -d --name "$CONTAINER_NAME" \
    -p "$MQTT_PORT":1883 \
    -p "$MQTT_PORT":1883/udp \
    -p "$HTTP_PORT":8080 \
    -v "$PWD/hivemq-data":/opt/hivemq/data "$DOCKER_IMAGE"
  echo "Started container. Use: docker logs -f $CONTAINER_NAME"
}

run_local(){
  INSTALL_DIR="${INSTALL_DIR:-$PWD/hivemq-ce}"
  if [ ! -d "$INSTALL_DIR" ]; then
    echo "Local install dir '$INSTALL_DIR' not found; set HIVE_DOWNLOAD_URL and run previously 'setup.sh --local' to download HiveMQ." >&2
    return 4
  fi
  # locate run script
  runsh=""
  if [ -f "$INSTALL_DIR/bin/run.sh" ]; then
    runsh="$INSTALL_DIR/bin/run.sh"
  else
    # try find
    runsh=$(find "$INSTALL_DIR" -maxdepth 3 -type f -name run.sh | head -n1 || true)
  fi
  if [ -z "$runsh" ]; then
    echo "Could not find run.sh under $INSTALL_DIR" >&2
    return 5
  fi
  if port_in_use "$MQTT_PORT"; then
    echo "Port $MQTT_PORT is in use; stop the process first or choose another MQTT port." >&2
    return 6
  fi
  chmod +x "$runsh" || true
  nohup bash "$runsh" > "$INSTALL_DIR/hivemq.log" 2>&1 &
  echo "HiveMQ started locally; logs: $INSTALL_DIR/hivemq.log"
}

# Decide mode
if [ -z "$MODE" ]; then
  if has_command docker; then MODE="docker"; else MODE="local"; fi
fi

echo "Run mode: $MODE"

if [ "$STOP_EXISTING" -eq 1 ]; then
  stop_existing_container || true
fi

if [ "$MODE" = "docker" ]; then
  if ! has_command docker; then
    echo "Docker required for docker mode but not found." >&2
    exit 10
  fi
  if port_in_use "$MQTT_PORT"; then
    echo "Port $MQTT_PORT already in use. If it's an old container named '$CONTAINER_NAME' use --stop-existing to remove it." >&2
    exit 11
  fi
  run_docker
elif [ "$MODE" = "local" ]; then
  run_local
else
  echo "Unknown mode: $MODE" >&2
  exit 12
fi
