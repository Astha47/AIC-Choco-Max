#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
DETACHED=false
BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--detached)
            DETACHED=true
            shift
            ;;
        -b|--build)
            BUILD=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -d, --detached    Run in detached mode"
            echo "  -b, --build       Force rebuild Docker image"
            echo "  -h, --help        Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if setup was run
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please run ./setup.sh first"
    exit 1
fi

# Build image if requested
if [ "$BUILD" = true ]; then
    print_status "Rebuilding Docker image..."
    docker build -t yolo-inference-service .
fi

# Check if image exists
if ! docker image inspect yolo-inference-service >/dev/null 2>&1; then
    print_status "Docker image not found. Building..."
    docker build -t yolo-inference-service .
fi

# Stop existing container if running
print_status "Stopping existing containers..."
docker stop yolo-inference-service 2>/dev/null || true
docker rm yolo-inference-service 2>/dev/null || true

# Run container
print_status "Starting YOLOv12 Inference Service..."

if [ "$DETACHED" = true ]; then
    docker run -d \
        --name yolo-inference-service \
        --env-file .env \
        -v $(pwd)/models:/app/models \
        -v $(pwd)/logs:/app/logs \
        -v $(pwd)/data:/app/data \
        --network host \
        --restart unless-stopped \
        yolo-inference-service
    
    print_status "Service started in detached mode"
    print_status "Check logs with: docker logs -f yolo-inference-service"
else
    docker run -it --rm \
        --name yolo-inference-service \
        --env-file .env \
        -v $(pwd)/models:/app/models \
        -v $(pwd)/logs:/app/logs \
        -v $(pwd)/data:/app/data \
        --network host \
        yolo-inference-service
fi

print_status "YOLOv12 Inference Service stopped"
