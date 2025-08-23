#!/usr/bin/env bash
set -euo pipefail

# HiveMQ CE Setup Script
# Sets up HiveMQ Community Edition MQTT Broker using Docker

HIVE_DOCKER_IMAGE="hivemq/hivemq4:latest"
CONTAINER_NAME="hivemq-ce"
MQTT_PORT=1883
HTTP_PORT=18080

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_usage() {
    cat <<EOF
HiveMQ CE Setup Script

Usage: $0 [OPTIONS]

OPTIONS:
    --clean     Remove existing container and start fresh
    -h, --help  Show this help

This script sets up HiveMQ Community Edition using Docker.
HiveMQ includes a web-based management interface unlike Mosquitto.

Features:
    • MQTT Broker on port $MQTT_PORT
        • Web Management Interface on port $HTTP_PORT
    • Enterprise-grade features ready for production scaling
    • High performance and scalability
EOF
}

# Parse arguments
CLEAN_INSTALL=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --clean) CLEAN_INSTALL=true; shift ;;
        -h|--help) print_usage; exit 0 ;;
        *) echo "Unknown option: $1"; print_usage; exit 1 ;;
    esac
done

echo "🚀 HiveMQ CE Setup"
echo "=================="

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    print_error "Docker is required for HiveMQ CE setup"
    print_info "Please install Docker and try again"
    exit 1
fi

# Stop Mosquitto if running
if systemctl is-active --quiet mosquitto 2>/dev/null; then
    print_info "Stopping Mosquitto service..."
    sudo systemctl stop mosquitto
    sudo systemctl disable mosquitto
    print_success "Mosquitto stopped and disabled"
fi

# Clean installation if requested
if [[ "$CLEAN_INSTALL" == "true" ]]; then
    print_info "Performing clean installation..."
    if docker ps -aq --filter "name=$CONTAINER_NAME" | grep -q .; then
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        print_success "Removed existing container"
    fi
fi

# Check if container already exists and is running
if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    print_success "HiveMQ CE is already running"
    print_info "Container: $CONTAINER_NAME"
    print_info "MQTT Port: $MQTT_PORT"
    print_info "Web Interface: http://localhost:$HTTP_PORT"
    exit 0
fi

# Pull HiveMQ image
print_info "Pulling HiveMQ CE Docker image..."
if docker pull "$HIVE_DOCKER_IMAGE"; then
    print_success "HiveMQ image pulled successfully"
else
    print_error "Failed to pull HiveMQ image"
    exit 1
fi

# Create data directory with correct permissions
mkdir -p hivemq-data
# Set permissions to allow HiveMQ container to write
chmod 777 hivemq-data

# Start HiveMQ container
print_info "Starting HiveMQ CE container..."
if docker run -d \
    --name "$CONTAINER_NAME" \
    -p "$MQTT_PORT:1883" \
    -p "$HTTP_PORT:8080" \
    -v "$PWD/hivemq-data:/opt/hivemq/data" \
    "$HIVE_DOCKER_IMAGE"; then
    
    print_success "HiveMQ CE started successfully!"
    echo ""
    print_info "Configuration:"
    print_info "• Container: $CONTAINER_NAME"
    print_info "• MQTT Port: $MQTT_PORT"
    print_info "• Web Interface: http://localhost:$HTTP_PORT"
    print_info "• Data Directory: $PWD/hivemq-data"
    echo ""
    print_info "Waiting for HiveMQ to start..."
    sleep 5
    
    # Verify HiveMQ is running
    if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
        print_success "HiveMQ CE is running and ready!"
        echo ""
        print_info "Next steps:"
        print_info "• Test with: ./test.sh"
        print_info "• Demo with: ./demo.sh"
        print_info "• Connect MQTT clients to localhost:$MQTT_PORT"
        print_info "• Access web interface at http://localhost:$HTTP_PORT"
    else
        print_error "HiveMQ failed to start properly"
        print_info "Check logs with: docker logs $CONTAINER_NAME"
        exit 1
    fi
else
    print_error "Failed to start HiveMQ container"
    exit 1
fi
