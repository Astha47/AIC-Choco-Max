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
GPU=false
GPU_BUILD=false

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
        --gpu)
            GPU=true
            shift
            ;;
        --gpu-build)
            GPU_BUILD=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:" 
            echo "  -d, --detached    Run in detached mode"
            echo "  -b, --build       Force rebuild Docker image (CPU image)"
            echo "  --gpu             Run using CUDA-enabled image and pass GPU to container"
            echo "  --gpu-build       Force rebuild CUDA-enabled image (uses Dockerfile.cuda)"
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
if [ "$GPU_BUILD" = true ]; then
    print_status "Rebuilding CUDA-enabled Docker image (yolo-inference-service:gpu)..."
    docker build -t yolo-inference-service:gpu -f Dockerfile.cuda .
fi

if [ "$BUILD" = true ]; then
    print_status "Rebuilding Docker image (CPU image)..."
    docker build -t yolo-inference-service .
fi

# Check if image exists; prefer GPU image if --gpu requested
if [ "$GPU" = true ]; then
    if ! docker image inspect yolo-inference-service:gpu >/dev/null 2>&1; then
        print_status "CUDA image not found. Building..."
        docker build -t yolo-inference-service:gpu -f Dockerfile.cuda .
    fi
else
    if ! docker image inspect yolo-inference-service >/dev/null 2>&1; then
        print_status "Docker image not found. Building..."
        docker build -t yolo-inference-service .
    fi
fi

# Stop existing container if running
print_status "Stopping existing containers..."
docker stop yolo-inference-service 2>/dev/null || true
docker rm yolo-inference-service 2>/dev/null || true

# Run container
print_status "Starting YOLOv12 Inference Service..."

IMAGE_NAME=yolo-inference-service
DOCKER_RUN_OPTS=(--name yolo-inference-service --env-file .env -v $(pwd)/models:/app/models -v $(pwd)/logs:/app/logs -v $(pwd)/data:/app/data --network host)

if [ "$GPU" = true ]; then
    IMAGE_NAME=yolo-inference-service:gpu
    # Use Docker's --gpus if supported; fallback to --runtime=nvidia for older setups
    GPU_OPTS=(--gpus all)
else
    GPU_OPTS=()
fi

if [ "$DETACHED" = true ]; then
    docker run -d "${DOCKER_RUN_OPTS[@]}" "${GPU_OPTS[@]}" --restart unless-stopped $IMAGE_NAME
    print_status "Service started in detached mode"
    print_status "Check logs with: docker logs -f yolo-inference-service"
else
    docker run -it --rm "${DOCKER_RUN_OPTS[@]}" "${GPU_OPTS[@]}" $IMAGE_NAME
fi

print_status "YOLOv12 Inference Service stopped"
