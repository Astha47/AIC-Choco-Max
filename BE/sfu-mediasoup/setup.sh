#!/bin/bash
set -e

echo "Setting up SFU MediaSoup Service..."

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

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version 16+ is required. Current version: $(node --version)"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Create necessary directories
print_status "Creating directories..."
mkdir -p logs
mkdir -p public
mkdir -p certs

# Install dependencies
print_status "Installing npm dependencies..."
npm install

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    print_status "Creating .env file from template..."
    cp .env.example .env 2>/dev/null || cp .env .env.backup
    print_warning "Please edit .env file with your configuration"
fi

# Check FFmpeg installation
if ! command -v ffmpeg &> /dev/null; then
    print_warning "FFmpeg is not installed. RTSP bridge will not work without FFmpeg."
    print_warning "Install FFmpeg: sudo apt-get install ffmpeg (Ubuntu/Debian)"
fi

# Build Docker image
print_status "Building Docker image..."
docker build -t sfu-mediasoup-service .

# Generate self-signed certificates for development
if [ ! -f "certs/cert.pem" ]; then
    print_status "Generating self-signed certificates for development..."
    openssl req -new -x509 -days 365 -nodes \
        -out certs/cert.pem \
        -keyout certs/key.pem \
        -subj "/C=US/ST=CA/L=SF/O=Dev/CN=localhost" \
        2>/dev/null || print_warning "OpenSSL not found. SSL certificates not generated."
fi

print_status "Setup completed successfully!"
print_status "Run './run.sh' to start the SFU service"
