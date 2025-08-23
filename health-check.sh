#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"  
    echo -e "${BLUE}============================================${NC}"
}

# Check if services are running
check_docker_services() {
    print_header "Docker Services Status"
    
    # Check if docker-compose.yml exists
    if [ ! -f "docker-compose.yml" ]; then
        print_error "docker-compose.yml not found. Run ./setup.sh first"
        return 1
    fi
    
    # Check running containers
    local running_services=$(docker-compose ps --services --filter "status=running" 2>/dev/null)
    local all_services=$(docker-compose ps --services 2>/dev/null)
    
    echo "Service Status:"
    for service in $all_services; do
        if echo "$running_services" | grep -q "^$service$"; then
            print_status "✓ $service (running)"
        else
            print_warning "✗ $service (not running)"
        fi
    done
    
    echo ""
    docker-compose ps 2>/dev/null || true
}

# Check service endpoints
check_service_endpoints() {
    print_header "Service Endpoint Health Checks"
    
    # SFU Service
    if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
        print_status "✓ SFU Service (http://localhost:3000)"
    else
        print_warning "✗ SFU Service (http://localhost:3000) - not responding"
    fi
    
    # MQTT Web Console
        if curl -s -f http://localhost:18080 > /dev/null 2>&1; then
            print_status "✓ MQTT Console (http://localhost:18080)"
        else
            print_warning "✗ MQTT Console (http://localhost:18080) - not responding"
        fi
    
    # MySQL Database
    if docker exec yolo-mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
        print_status "✓ MySQL Database (localhost:3307)"
    else
        print_warning "✗ MySQL Database (localhost:3307) - not responding"
    fi
    
    # RTSP Streams
    local rtsp_ok=true
    for i in {1..3}; do
        if timeout 5 ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height rtsp://localhost:8554/cam$i 2>/dev/null; then
            print_status "✓ RTSP Stream cam$i (rtsp://localhost:8554/cam$i)"
        else
            print_warning "✗ RTSP Stream cam$i (rtsp://localhost:8554/cam$i) - not available"
            rtsp_ok=false
        fi
    done
}

# Check MQTT connectivity
check_mqtt() {
    print_header "MQTT Broker Test"
    
    # Test MQTT connection
    if command -v mosquitto_pub &> /dev/null; then
        if mosquitto_pub -h localhost -p 1883 -t "test/health" -m "health_check" -q 1 2>/dev/null; then
            print_status "✓ MQTT Publish test successful"
        else
            print_warning "✗ MQTT Publish test failed"
        fi
        
        if timeout 5 mosquitto_sub -h localhost -p 1883 -t "test/health" -C 1 2>/dev/null; then
            print_status "✓ MQTT Subscribe test successful"
        else
            print_warning "✗ MQTT Subscribe test failed"
        fi
    else
        print_warning "mosquitto-clients not installed, skipping MQTT tests"
        print_status "Install with: sudo apt-get install mosquitto-clients"
    fi
}

# Check database
check_database() {
    print_header "Database Health Check"
    
    if docker exec yolo-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD:-yolo_root_2024} -e "USE yolo_detections; SHOW TABLES;" 2>/dev/null; then
        print_status "✓ Database connection and tables verified"
        
        # Check recent detections
        local detection_count=$(docker exec yolo-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD:-yolo_root_2024} -se "USE yolo_detections; SELECT COUNT(*) FROM detections WHERE timestamp > NOW() - INTERVAL 1 HOUR;" 2>/dev/null || echo "0")
        print_status "Recent detections (last hour): $detection_count"
    else
        print_warning "✗ Database connection failed"
    fi
}

# Check system resources
check_system_resources() {
    print_header "System Resources"
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')
    echo "CPU Usage: ${cpu_usage}%"
    
    # Memory usage
    local memory_info=$(free -h | awk '/^Mem:/ {printf "Used: %s / %s (%.1f%%)", $3, $2, ($3/$2)*100}')
    echo "Memory: $memory_info"
    
    # Disk usage
    local disk_usage=$(df -h . | awk 'NR==2 {printf "Used: %s / %s (%s)", $3, $2, $5}')
    echo "Disk: $disk_usage"
    
    # Docker stats
    echo ""
    print_status "Docker Container Resources:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || true
}

# Check logs for errors
check_logs() {
    print_header "Recent Log Analysis"
    
    local services=("yolo-inference" "sfu-mediasoup" "hivemq" "mysql")
    
    for service in "${services[@]}"; do
        echo "--- $service logs (last 10 lines) ---"
        docker-compose logs --tail=10 $service 2>/dev/null || print_warning "No logs for $service"
        echo ""
    done
}

# Performance test
performance_test() {
    print_header "Performance Test"
    
    # Test MQTT throughput
    if command -v mosquitto_pub &> /dev/null; then
        print_status "Testing MQTT throughput..."
        local start_time=$(date +%s)
        for i in {1..100}; do
            mosquitto_pub -h localhost -p 1883 -t "test/performance" -m "{\"test\": $i, \"timestamp\": $(date +%s%3N)}" -q 0 2>/dev/null || break
        done
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_status "Published 100 messages in ${duration}s"
    fi
    
    # Test database insert performance
    print_status "Testing database performance..."
    local db_start=$(date +%s%3N)
    docker exec yolo-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD:-yolo_root_2024} -e "USE yolo_detections; INSERT INTO detections (camera_id, label, confidence, bbox_x_center, bbox_y_center, bbox_width, bbox_height) VALUES ('test', 'performance_test', 0.99, 0.5, 0.5, 0.1, 0.1);" 2>/dev/null || print_warning "Database insert test failed"
    local db_end=$(date +%s%3N)
    local db_duration=$((db_end - db_start))
    print_status "Database insert took ${db_duration}ms"
}

# Generate health report
generate_report() {
    print_header "Health Check Summary"
    
    local timestamp=$(date)
    local report_file="health_report_$(date +%Y%m%d_%H%M%S).txt"
    
    {
        echo "YOLO Inference System Health Report"
        echo "Generated: $timestamp"
        echo "=================================="
        echo ""
        
        echo "System Information:"
        echo "- OS: $(uname -a)"
        echo "- Docker: $(docker --version)"
        echo "- Docker Compose: $(docker-compose --version)"
        echo ""
        
        echo "Service Status:"
        docker-compose ps 2>/dev/null || echo "Docker Compose not available"
        echo ""
        
        echo "Resource Usage:"
        free -h
        df -h .
        
    } > "$report_file"
    
    print_status "Health report saved to: $report_file"
}

# Main function
main() {
    local check_type="${1:-all}"
    
    case "$check_type" in
        "services")
            check_docker_services
            check_service_endpoints
            ;;
        "mqtt")
            check_mqtt
            ;;
        "database")
            check_database
            ;;
        "resources")
            check_system_resources
            ;;
        "logs")
            check_logs
            ;;
        "performance")
            performance_test
            ;;
        "report")
            generate_report
            ;;
        "all")
            check_docker_services
            check_service_endpoints
            check_mqtt
            check_database
            check_system_resources
            ;;
        *)
            echo "Usage: $0 [services|mqtt|database|resources|logs|performance|report|all]"
            echo ""
            echo "Options:"
            echo "  services     - Check Docker services and endpoints"
            echo "  mqtt         - Test MQTT broker connectivity"
            echo "  database     - Check database connection and data"
            echo "  resources    - Check system resource usage"
            echo "  logs         - Show recent logs from all services"
            echo "  performance  - Run performance tests"
            echo "  report       - Generate comprehensive health report"
            echo "  all          - Run all checks (default)"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
