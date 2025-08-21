#!/bin/bash

# Script untuk menjalankan camera dummy dengan virtual environment

echo "=== Starting Camera Dummy RTSP ==="

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Please run setup.sh first."
    exit 1
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Check if camera.py exists
if [ ! -f "camera.py" ]; then
    echo "❌ camera.py not found."
    exit 1
fi

# Run camera dummy
echo "🎥 Starting camera dummy..."

# Respect environment variables if provided (RTSP_SERVER, NUM_CAMERAS, MAX_FPS)
ARGS=()
if [ ! -z "$RTSP_SERVER" ]; then
    ARGS+=("--base-port" "${RTSP_SERVER#*:}")
    export RTSP_SERVER="$RTSP_SERVER"
fi
if [ ! -z "$NUM_CAMERAS" ]; then
    ARGS+=("--num-cameras" "$NUM_CAMERAS")
fi
if [ ! -z "$MAX_FPS" ]; then
    ARGS+=("--max-fps" "$MAX_FPS")
else
    ARGS+=("--max-fps" "20")
fi

python camera.py "${ARGS[@]}"
