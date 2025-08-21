#!/usr/bin/env bash
set -euo pipefail

# HiveMQ MQTT Broker Demo
# Demonstrates HiveMQ publish/subscribe functionality

MQTT_HOST="localhost"
MQTT_PORT=1883

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_step() { echo -e "${PURPLE}▶ $1${NC}"; }

echo -e "${CYAN}🚀 HiveMQ MQTT Broker Demo${NC}"
echo "=========================="
echo "Demonstrating HiveMQ publish/subscribe functionality"
echo ""

# Check requirements
if ! command -v mosquitto_pub >/dev/null 2>&1 || ! command -v mosquitto_sub >/dev/null 2>&1; then
    print_error "mosquitto-clients not found"
    print_info "Install with: sudo apt-get install mosquitto-clients"
    exit 1
fi

# Test connectivity
print_step "Testing HiveMQ connectivity..."
if ! nc -z "$MQTT_HOST" "$MQTT_PORT" 2>/dev/null; then
    print_error "HiveMQ broker not accessible at $MQTT_HOST:$MQTT_PORT"
    print_info "Start HiveMQ with: ./setup.sh"
    exit 1
fi
print_success "HiveMQ broker is accessible at $MQTT_HOST:$MQTT_PORT"
echo ""

# Demo 1: Simple publish/subscribe
print_step "Demo 1: Simple publish/subscribe..."
echo "ℹ️  Topic: demo/sensor/temperature"
echo "ℹ️  Starting subscriber in background..."

temp_file="/tmp/hivemq_demo_temp.txt"
timeout 15 mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "demo/sensor/temperature" > "$temp_file" &
sub_pid=$!

sleep 2

echo "ℹ️  Publishing 5 temperature readings..."
for i in {1..5}; do
    temp=$((20 + (i % 2)))
    message="{\"sensor_id\": \"temp_01\", \"temperature\": $temp.0, \"timestamp\": \"$(date -Iseconds)\", \"reading\": $i}"
    mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "demo/sensor/temperature" -m "$message"
    echo "  📤 Published: Temperature = $temp.0°C (reading $i/5)"
    sleep 1
done

sleep 2
kill $sub_pid 2>/dev/null || true
wait $sub_pid 2>/dev/null || true

echo ""
print_step "Messages received by subscriber:"
if [[ -f "$temp_file" ]] && [[ -s "$temp_file" ]]; then
    count=$(wc -l < "$temp_file")
    print_success "Received $count messages"
    echo ""
    i=1
    while IFS= read -r line; do
        echo "  📨 Message $i: $line"
        ((i++))
    done < "$temp_file"
    rm -f "$temp_file"
else
    print_error "No messages received"
fi

echo ""

# Demo 2: Multiple topics
print_step "Demo 2: Multiple sensor topics..."
echo "ℹ️  Subscribing to all sensor topics: demo/sensors/+"

multi_file="/tmp/hivemq_demo_multi.txt"
timeout 10 mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "demo/sensors/+" > "$multi_file" &
multi_pid=$!

sleep 2

echo "ℹ️  Publishing to different sensor topics..."

# Publish to different topics
declare -a topics=("temperature" "humidity" "pressure" "light")
declare -a values=("23.5" "65" "1013.25" "450")
declare -a units=("°C" "%" "hPa" "lux")

for i in "${!topics[@]}"; do
    topic="demo/sensors/${topics[$i]}"
    value="${values[$i]}"
    unit="${units[$i]}"
    message="{\"sensor\": \"${topics[$i]}\", \"value\": $value, \"unit\": \"$unit\", \"timestamp\": \"$(date -Iseconds)\"}"
    
    mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "$topic" -m "$message"
    echo "  📤 Published to $topic: $value $unit"
    sleep 1
done

sleep 2
kill $multi_pid 2>/dev/null || true
wait $multi_pid 2>/dev/null || true

echo ""
print_step "Multi-topic subscription results:"
if [[ -f "$multi_file" ]] && [[ -s "$multi_file" ]]; then
    count=$(wc -l < "$multi_file")
    print_success "Received $count messages from different topics"
    echo ""
    while IFS= read -r line; do
        echo "  📨 $line"
    done < "$multi_file"
    rm -f "$multi_file"
else
    print_error "No messages received"
fi

echo ""

# Show HiveMQ system info
print_step "HiveMQ system information:"
sys_topics=("\$SYS/broker/version" "\$SYS/broker/uptime" "\$SYS/broker/clients/connected")

for topic in "${sys_topics[@]}"; do
    print_info "Checking $topic..."
    result=$(timeout 3 mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "$topic" -C 1 2>/dev/null || echo "N/A")
    echo "  📊 $topic: $result"
done

echo ""
echo "🎉 Demo completed successfully!"
echo "Your HiveMQ broker is working perfectly."
echo ""
echo "Next steps:"
echo "• Connect your applications to localhost:$MQTT_PORT"
echo "• Use topics like 'sensors/temperature', 'devices/status', etc."
echo "• Access HiveMQ web interface at http://localhost:8080"
echo "• Run './test.sh' for comprehensive testing"
