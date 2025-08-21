#!/bin/bash
set -e

echo "Setting up YOLOv12 Inference Service..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
print_status "Creating directories..."
mkdir -p models
mkdir -p logs
mkdir -p data

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    print_status "Creating .env file from template..."
    cp .env.example .env 2>/dev/null || cp .env .env.backup
    print_warning "Please edit .env file with your configuration"
fi

# Build Docker image
print_status "Building Docker image..."
docker build -t yolo-inference-service .

# Initialize database if enabled
if grep -q "DB_ENABLED=true" .env 2>/dev/null; then
    print_status "Database enabled. Initializing database..."
    # Run database initialization script
    python3 init_database.py
fi

# Check MQTT broker connectivity
print_status "Checking MQTT broker connectivity..."
MQTT_BROKER=$(grep MQTT_BROKER .env | cut -d '=' -f2)
if [ ! -z "$MQTT_BROKER" ]; then
    if command -v mosquitto_pub &> /dev/null; then
        mosquitto_pub -h $MQTT_BROKER -t test/setup -m "setup_test" -q 1 || print_warning "MQTT broker not reachable"
    else
        print_warning "mosquitto_pub not found. Cannot test MQTT connectivity."
    fi
fi

# Download YOLOv12 model if not exists
print_status "Checking YOLOv12 model..."
if [ ! -f "models/yolov12n.pt" ]; then
    print_warning "YOLOv12n model not found. Service will download fallback model on first run."
fi

print_status "Setup completed successfully!"
print_status "Run './run.sh' to start the service"
