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
DEV=false

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
        --dev)
            DEV=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -d, --detached    Run in detached mode"
            echo "  -b, --build       Force rebuild Docker image"
            echo "  --dev             Run in development mode (with nodemon)"
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
    docker build -t sfu-mediasoup-service .
fi

# Check if image exists
if ! docker image inspect sfu-mediasoup-service >/dev/null 2>&1; then
    print_status "Docker image not found. Building..."
    docker build -t sfu-mediasoup-service .
fi

# Stop existing container if running
print_status "Stopping existing containers..."
docker stop sfu-mediasoup-service 2>/dev/null || true
docker rm sfu-mediasoup-service 2>/dev/null || true

# Run container
print_status "Starting SFU MediaSoup Service..."

if [ "$DEV" = true ]; then
    # Development mode with live reload
    print_status "Starting in development mode..."
    docker run -it --rm \
        --name sfu-mediasoup-service \
        --env-file .env \
        -v $(pwd)/src:/app/src \
        -v $(pwd)/logs:/app/logs \
        -v $(pwd)/certs:/app/certs \
        --network host \
        sfu-mediasoup-service npm run dev
elif [ "$DETACHED" = true ]; then
    # Production detached mode
    docker run -d \
        --name sfu-mediasoup-service \
        --env-file .env \
        -v $(pwd)/logs:/app/logs \
        -v $(pwd)/certs:/app/certs \
        --network host \
        --restart unless-stopped \
        sfu-mediasoup-service
    
    print_status "Service started in detached mode"
    print_status "Check logs with: docker logs -f sfu-mediasoup-service"
    print_status "Service available at: http://localhost:3004"
else
    # Interactive mode
    docker run -it --rm \
        --name sfu-mediasoup-service \
        --env-file .env \
        -v $(pwd)/logs:/app/logs \
        -v $(pwd)/certs:/app/certs \
        --network host \
        sfu-mediasoup-service
fi

print_status "SFU MediaSoup Service stopped"
