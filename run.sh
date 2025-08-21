#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

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
SERVICES=""
LOGS=false

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
        --logs)
            LOGS=true
            shift
            ;;
        -s|--services)
            SERVICES="$2"
            shift 2
            ;;
        -h|--help)
            cat << EOF
Usage: $0 [OPTIONS]

Options:
  -d, --detached     Run in detached mode (background)
  -b, --build        Force rebuild all services
  --logs             Show logs after starting
  -s, --services     Run specific services (comma-separated)
  -h, --help         Show this help message

Examples:
  $0                           # Start all services interactively
  $0 -d                        # Start all services in background
  $0 -b -d                     # Rebuild and start in background
  $0 -s "yolo-inference,sfu"   # Start specific services only
  $0 --logs                    # Start and follow logs

Available services:
  - mysql
  - hivemq
  - rtsp-server
  - camera-dummy
  - yolo-inference
  - sfu-mediasoup
  - frontend

EOF
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run ./setup.sh first"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please run ./setup.sh first"
    exit 1
fi

# Build services if requested
if [ "$BUILD" = true ]; then
    print_header "Building Services"
    if [ -n "$SERVICES" ]; then
        print_status "Building specific services: $SERVICES"
        docker-compose build --no-cache ${SERVICES//,/ }
    else
        print_status "Building all services..."
        docker-compose build --no-cache
    fi
fi

# Start services
print_header "Starting YOLO Inference System"

if [ -n "$SERVICES" ]; then
    COMPOSE_SERVICES=${SERVICES//,/ }
    print_status "Starting specific services: $SERVICES"
else
    COMPOSE_SERVICES=""
    print_status "Starting all services..."
fi

# Show system status before starting
print_status "System status before starting:"
echo "  Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"
echo "  Compose: $(docker-compose --version | cut -d' ' -f3 | tr -d ',')"
echo "  Available memory: $(free -h | awk '/^Mem:/ {print $7}')"
echo "  Available disk: $(df -h . | awk 'NR==2 {print $4}')"

# Stop any existing containers
print_status "Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Start services
if [ "$DETACHED" = true ]; then
    print_status "Starting services in detached mode..."
    docker-compose up -d $COMPOSE_SERVICES
    
    # Wait for services to be ready
    print_status "Waiting for services to start..."
    sleep 10
    
    # Show service status
    print_header "Service Status"
    docker-compose ps
    
    # Show service URLs
    print_header "Service URLs"
    cat << EOF
📊 SFU Service:          http://localhost:3000
📡 MQTT Console:         http://localhost:8080  
🗄️  Database (MySQL):    localhost:3307
📹 RTSP Streams:         rtsp://localhost:8554/cam[1-3]
🎥 Camera Dummy:         Running (generating streams)
🤖 YOLO Inference:       Running (processing detections)

Useful Commands:
  View logs:      docker-compose logs -f [service-name]
  Stop services:  docker-compose down
  Restart:        docker-compose restart [service-name]
  Scale:          docker-compose up -d --scale yolo-inference=2

EOF
    
    if [ "$LOGS" = true ]; then
        print_status "Following logs (Ctrl+C to exit)..."
        docker-compose logs -f $COMPOSE_SERVICES
    fi
    
else
    print_status "Starting services in interactive mode..."
    print_warning "Press Ctrl+C to stop all services"
    docker-compose up $COMPOSE_SERVICES
fi
