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
python camera.py --max-fps 20
