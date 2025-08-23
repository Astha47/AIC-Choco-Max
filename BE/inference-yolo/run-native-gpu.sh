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
SETUP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--detached)
            DETACHED=true
            shift
            ;;
        --setup)
            SETUP=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:" 
            echo "  -d, --detached    Run in detached mode"
            echo "  --setup           Install dependencies in current environment"
            echo "  -h, --help        Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if we're in the right directory
if [ ! -f "backend-yolo.py" ]; then
    print_error "backend-yolo.py not found. Please run this script from the inference-yolo directory"
    exit 1
fi

# Setup dependencies if requested
if [ "$SETUP" = true ]; then
    print_status "Installing dependencies in current Python environment..."
    
    # Install requirements but skip torch/torchvision as they should already be installed in GCP DL VM
    if [ -f "requirements.txt" ]; then
        # Filter out torch packages that are already installed in the VM
        grep -v "^torch" requirements.txt > /tmp/reqs_no_torch.txt || true
        pip install -r /tmp/reqs_no_torch.txt
        rm -f /tmp/reqs_no_torch.txt
    fi
    
    print_status "Dependencies installed successfully"
    exit 0
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please run ./setup.sh first"
    exit 1
fi

# Load environment variables
set -a
source .env
set +a

# Create logs directory if it doesn't exist
mkdir -p logs

print_status "Starting YOLOv12 Inference Service (Native GPU)..."

# Kill any existing process on the same port
if [ ! -z "$INFERENCE_PORT" ]; then
    EXISTING_PID=$(lsof -ti:$INFERENCE_PORT || true)
    if [ ! -z "$EXISTING_PID" ]; then
        print_warning "Killing existing process on port $INFERENCE_PORT (PID: $EXISTING_PID)"
        kill -9 $EXISTING_PID || true
        sleep 2
    fi
fi

# Run the service
if [ "$DETACHED" = true ]; then
    print_status "Starting service in background..."
    nohup python3 backend-yolo.py > logs/yolo-native.log 2>&1 &
    PID=$!
    echo $PID > logs/yolo-native.pid
    print_status "Service started in background with PID: $PID"
    print_status "Check logs with: tail -f logs/yolo-native.log"
    print_status "Stop service with: kill \$(cat logs/yolo-native.pid)"
else
    print_status "Starting service in foreground..."
    python3 backend-yolo.py
fi
