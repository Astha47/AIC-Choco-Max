#!/usr/bin/env bash
set -euo pipefail

# HiveMQ MQTT Broker Test Script
# Simple test for HiveMQ functionality

MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-1883}"
HTTP_PORT="${HTTP_PORT:-8080}"
CONTAINER_NAME="hivemq-ce"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_header() {
    echo -e "${BLUE}🧪 HiveMQ MQTT Broker Test${NC}"
    echo "=========================="
}

# Check if command exists
has_command() {
    command -v "$1" >/dev/null 2>&1
}

# Check if port is accessible
check_port() {
    local port="$1"
    local host="${2:-localhost}"
    
    if has_command nc; then
        if nc -z "$host" "$port" 2>/dev/null; then
            return 0
        else
            return 1
        fi
    else
        print_warning "netcat not available for port checking"
        return 1
    fi
}

# Test 1: Check HiveMQ container status
test_container() {
    print_info "Checking HiveMQ container status..."
    
    if ! has_command docker; then
        print_error "Docker not available"
        return 1
    fi
    
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$CONTAINER_NAME"; then
        local status=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep "$CONTAINER_NAME" | awk '{for(i=2;i<=NF;i++) printf "%s ", $i; print ""}')
        print_success "HiveMQ container is running ($status)"
        
        # Show recent logs
        print_info "Recent logs:"
        docker logs --tail 5 "$CONTAINER_NAME" 2>/dev/null | sed 's/^/  /' || true
        return 0
    else
        if docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -q "$CONTAINER_NAME"; then
            local status=$(docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep "$CONTAINER_NAME" | awk '{for(i=2;i<=NF;i++) printf "%s ", $i; print ""}')
            print_error "HiveMQ container exists but not running ($status)"
            print_info "Start with: ./run_hivemq.sh"
            return 1
        else
            print_error "HiveMQ container not found"
            print_info "Setup with: ./setup.sh"
            return 1
        fi
    fi
}

# Test 2: Check MQTT port connectivity
test_mqtt_port() {
    print_info "Testing MQTT port connectivity..."
    
    if check_port "$MQTT_PORT" "$MQTT_HOST"; then
        print_success "MQTT port $MQTT_PORT is accessible"
        return 0
    else
        print_error "MQTT port $MQTT_PORT is not accessible"
        return 1
    fi
}

# Test 3: Check HTTP management interface
test_http_interface() {
    print_info "Testing HTTP management interface..."
    
    if check_port "$HTTP_PORT" "$MQTT_HOST"; then
        print_success "HTTP interface port $HTTP_PORT is accessible"
        
        if has_command curl; then
            if curl -s --connect-timeout 5 "http://$MQTT_HOST:$HTTP_PORT" >/dev/null 2>&1; then
                print_success "HTTP management interface is responding"
                print_info "Access at: http://$MQTT_HOST:$HTTP_PORT"
            else
                print_warning "HTTP port open but interface not responding"
            fi
        else
            print_info "Install curl for HTTP response testing"
        fi
        return 0
    else
        print_error "HTTP interface port $HTTP_PORT is not accessible"
        return 1
    fi
}

# Test 4: MQTT publish/subscribe functionality
test_mqtt_functionality() {
    if ! has_command mosquitto_pub || ! has_command mosquitto_sub; then
        print_warning "mosquitto-clients not available - skipping MQTT functionality test"
        print_info "Install with: sudo apt-get install mosquitto-clients"
        return 0
    fi
    
    print_info "Testing MQTT publish/subscribe functionality..."
    
    local test_topic="test/hivemq/$(date +%s)"
    local test_message="HiveMQ test at $(date)"
    local received_file="/tmp/hivemq_test_received.txt"
    
    # Start subscriber in background
    timeout 10 mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "$test_topic" > "$received_file" &
    local sub_pid=$!
    
    # Wait for subscriber to connect
    sleep 2
    
    # Publish test message
    if mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "$test_topic" -m "$test_message" 2>/dev/null; then
        print_info "Test message published successfully"
    else
        print_error "Failed to publish test message"
        kill $sub_pid 2>/dev/null || true
        rm -f "$received_file"
        return 1
    fi
    
    # Wait for message to be received
    sleep 2
    
    # Stop subscriber
    kill $sub_pid 2>/dev/null || true
    wait $sub_pid 2>/dev/null || true
    
    # Check if message was received
    if [[ -f "$received_file" ]] && grep -q "$test_message" "$received_file"; then
        print_success "MQTT publish/subscribe test passed!"
        rm -f "$received_file"
        return 0
    else
        print_error "MQTT message not received"
        rm -f "$received_file"
        return 1
    fi
}

# Run all tests
run_tests() {
    local failed_tests=0
    
    print_header
    
    print_info "Testing HiveMQ MQTT Broker..."
    print_info "Host: $MQTT_HOST"
    print_info "MQTT Port: $MQTT_PORT"
    print_info "HTTP Port: $HTTP_PORT"
    echo ""
    
    # Test 1: Container Status
    if ! test_container; then
        ((failed_tests++))
    fi
    echo ""
    
    # Test 2: MQTT Port
    if ! test_mqtt_port; then
        ((failed_tests++))
    fi
    echo ""
    
    # Test 3: HTTP Interface
    if ! test_http_interface; then
        ((failed_tests++))
    fi
    echo ""
    
    # Test 4: MQTT Functionality
    if ! test_mqtt_functionality; then
        ((failed_tests++))
    fi
    echo ""
    
    # Summary
    echo "=========================="
    if [[ $failed_tests -eq 0 ]]; then
        print_success "All tests passed! HiveMQ is working correctly."
        echo ""
        print_info "HiveMQ is ready for use:"
        print_info "• MQTT clients: $MQTT_HOST:$MQTT_PORT"
        print_info "• Web interface: http://$MQTT_HOST:$HTTP_PORT"
        return 0
    else
        print_error "$failed_tests test(s) failed."
        echo ""
        print_info "Troubleshooting:"
        print_info "• Check setup: ./setup.sh"
        print_info "• Start HiveMQ: ./run_hivemq.sh"
        print_info "• Check logs: docker logs hivemq-ce"
        return 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            MQTT_HOST="$2"
            shift 2
            ;;
        --mqtt-port)
            MQTT_PORT="$2"
            shift 2
            ;;
        --http-port)
            HTTP_PORT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "OPTIONS:"
            echo "  --host HOST       MQTT broker host (default: localhost)"
            echo "  --mqtt-port PORT  MQTT port (default: 1883)"
            echo "  --http-port PORT  HTTP port (default: 8080)"
            echo "  -h, --help        Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run the tests
if run_tests; then
    exit 0
else
    exit 1
fi
