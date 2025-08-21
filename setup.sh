#!/bin/bash
set -e

echo "Setting up YOLO Inference System with Docker..."

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

# Check dependencies
check_dependencies() {
    print_header "Checking Dependencies"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        echo "Installation guide: https://docs.docker.com/get-docker/"
        exit 1
    fi
    print_status "Docker: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        echo "Installation guide: https://docs.docker.com/compose/install/"
        exit 1
    fi
    print_status "Docker Compose: $(docker-compose --version)"
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
    print_status "Docker daemon is running"
}

# Create necessary directories
create_directories() {
    print_header "Creating Directory Structure"
    
    # Main directories
    mkdir -p database/init
    mkdir -p logs/{inference,sfu,mysql,hivemq}
    mkdir -p data/{models,uploads,exports}
    mkdir -p certs
    
    # Service-specific directories
    mkdir -p BE/inference-yolo/{models,logs,data}
    mkdir -p BE/sfu-mediasoup/{logs,certs,public}
    mkdir -p BE/camera-dummy/samples
    mkdir -p BE/mqtt-setup/hivemq-config
    
    print_status "Directory structure created"
}

# Setup database initialization
setup_database() {
    print_header "Setting up Database"
    
    cat > database/init/01-init.sql << 'EOF'
-- Initialize YOLO Detection Database
CREATE DATABASE IF NOT EXISTS yolo_detections;
USE yolo_detections;

-- Create detections table
CREATE TABLE IF NOT EXISTS detections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    camera_id VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    frame_seq INT,
    label VARCHAR(100) NOT NULL,
    confidence FLOAT NOT NULL,
    bbox_x_center FLOAT NOT NULL,
    bbox_y_center FLOAT NOT NULL,
    bbox_width FLOAT NOT NULL,
    bbox_height FLOAT NOT NULL,
    INDEX idx_camera_timestamp (camera_id, timestamp),
    INDEX idx_label (label),
    INDEX idx_confidence (confidence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create camera status table
CREATE TABLE IF NOT EXISTS camera_status (
    camera_id VARCHAR(50) PRIMARY KEY,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('online', 'offline', 'error') DEFAULT 'offline',
    fps FLOAT DEFAULT 0,
    total_detections INT DEFAULT 0,
    INDEX idx_status (status),
    INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create detection summary view
CREATE OR REPLACE VIEW detection_summary AS
SELECT 
    camera_id,
    DATE(timestamp) as detection_date,
    label,
    COUNT(*) as detection_count,
    AVG(confidence) as avg_confidence,
    MIN(confidence) as min_confidence,
    MAX(confidence) as max_confidence
FROM detections
GROUP BY camera_id, DATE(timestamp), label
ORDER BY detection_date DESC, camera_id, detection_count DESC;

-- Insert initial camera status
INSERT IGNORE INTO camera_status (camera_id, status) VALUES 
('cam01', 'offline'),
('cam02', 'offline'),
('cam03', 'offline');
EOF

    print_status "Database initialization script created"
}

# Create RTSP server Dockerfile
create_rtsp_dockerfile() {
    print_header "Setting up RTSP Server"
    
    cat > BE/rtsp-server/Dockerfile << 'EOF'
FROM alpine:latest

RUN apk add --no-cache ca-certificates && \
    wget -O /tmp/rtsp-simple-server.tar.gz https://github.com/aler9/rtsp-simple-server/releases/latest/download/rtsp-simple-server_v0.21.7_linux_amd64.tar.gz && \
    tar -xzf /tmp/rtsp-simple-server.tar.gz -C /usr/local/bin/ && \
    rm /tmp/rtsp-simple-server.tar.gz

WORKDIR /app
COPY rtsp-simple-server.yml ./

EXPOSE 8554 1935 8888

CMD ["/usr/local/bin/rtsp-simple-server", "/app/rtsp-simple-server.yml"]
EOF

    print_status "RTSP server Dockerfile created"
}

# Create camera dummy Dockerfile
create_camera_dockerfile() {
    print_header "Setting up Camera Dummy"
    
    cat > BE/camera-dummy/Dockerfile << 'EOF'
FROM python:3.9-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "camera.py", "--num-cameras", "3"]
EOF

    print_status "Camera dummy Dockerfile created"
}

# Setup environment files
setup_environment() {
    print_header "Setting up Environment Configuration"
    
    # Copy environment files to services
    cp .env BE/inference-yolo/.env
    cp .env BE/sfu-mediasoup/.env
    
    print_status "Environment files configured"
}

# Build all services
build_services() {
    print_header "Building Docker Services"
    
    print_status "Building all services with Docker Compose..."
    docker-compose build --parallel
    
    print_status "All services built successfully"
}

# Setup network configuration
setup_network() {
    print_header "Network Configuration"
    
    print_status "Docker network will be created automatically by docker-compose"
    print_status "Services will communicate using container names as hostnames"
    
    # Show network configuration
    cat << EOF

Network Configuration:
- RTSP Server: rtsp://localhost:8554/cam[1-3]
- SFU Service: http://localhost:3000
- MQTT Broker: mqtt://localhost:1883, ws://localhost:8000
- MySQL Database: localhost:3306
- Frontend: http://localhost:8080

Internal Communication:
- Services use container names (hivemq, mysql, rtsp-server, etc.)
- Network: yolo-network (172.20.0.0/16)

EOF
}

# Health check function
verify_setup() {
    print_header "Verifying Setup"
    
    # Check if required files exist
    local required_files=(
        "docker-compose.yml"
        ".env"
        "BE/inference-yolo/Dockerfile"
        "BE/sfu-mediasoup/Dockerfile"
        "database/init/01-init.sql"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            print_status "✓ $file"
        else
            print_error "✗ $file (missing)"
        fi
    done
    
    print_status "Setup verification completed"
}

# Main setup function
main() {
    print_header "YOLO Inference System Setup"
    
    check_dependencies
    create_directories
    setup_database
    create_rtsp_dockerfile
    create_camera_dockerfile
    setup_environment
    setup_network
    build_services
    verify_setup
    
    print_header "Setup Completed Successfully!"
    
    cat << EOF

🚀 YOLO Inference System is ready!

Quick Start:
1. Start all services:
   ${GREEN}docker-compose up -d${NC}

2. Check service status:
   ${GREEN}docker-compose ps${NC}

3. View logs:
   ${GREEN}docker-compose logs -f [service-name]${NC}

4. Stop all services:
   ${GREEN}docker-compose down${NC}

Service URLs:
- 📊 SFU Service: http://localhost:3000
- 📡 MQTT Console: http://localhost:8080
- 🗄️  MySQL: localhost:3306
- 📹 RTSP: rtsp://localhost:8554/cam[1-3]

Troubleshooting:
- Check logs: ${GREEN}docker-compose logs -f${NC}
- Restart service: ${GREEN}docker-compose restart [service-name]${NC}
- Rebuild: ${GREEN}docker-compose build --no-cache [service-name]${NC}

EOF
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [--help]"
        echo "Setup YOLO Inference System with Docker"
        exit 0
        ;;
    *)
        main
        ;;
esac
