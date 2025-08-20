#!/bin/bash

# Setup script untuk Camera Dummy RTSP

echo "=== Camera Dummy RTSP Setup ==="

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found. Please install Python3 first."
    exit 1
fi

echo "✅ Python3 found"

# Check if pip is installed
if ! command -v pip &> /dev/null && ! command -v pip3 &> /dev/null; then
    echo "❌ pip not found. Installing pip..."
    sudo apt update
    sudo apt install python3-pip -y
fi

echo "✅ pip found"

# Create virtual environment
echo "🔧 Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip in virtual environment
echo "📦 Upgrading pip..."
pip install --upgrade pip

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg not found. Installing FFmpeg..."
    
    # Detect OS and install FFmpeg accordingly
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt &> /dev/null; then
            sudo apt update
            sudo apt install ffmpeg -y
        elif command -v yum &> /dev/null; then
            sudo yum install ffmpeg -y
        elif command -v dnf &> /dev/null; then
            sudo dnf install ffmpeg -y
        else
            echo "❌ Unable to install FFmpeg automatically. Please install it manually."
            echo "   For Ubuntu/Debian: sudo apt install ffmpeg"
            echo "   For CentOS/RHEL: sudo yum install ffmpeg"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install ffmpeg
        else
            echo "❌ Homebrew not found. Please install Homebrew first or install FFmpeg manually."
        fi
    else
        echo "❌ Unsupported OS. Please install FFmpeg manually."
    fi
else
    echo "✅ FFmpeg found"
fi

# Create samples directory
if [ ! -d "./samples" ]; then
    echo "📁 Creating samples directory..."
    mkdir -p ./samples
fi

# Check if samples directory has videos
if [ -z "$(ls -A ./samples 2>/dev/null)" ]; then
    echo "📹 No video files found in samples directory."
    echo "   Creating sample videos for testing..."
    source venv/bin/activate
    python camera.py --create-samples
    echo "✅ Sample videos created"
else
    echo "✅ Video files found in samples directory"
fi

echo ""
echo "🎉 Setup completed!"
echo ""
echo "To start the camera dummy:"
echo "  source venv/bin/activate"
echo "  python camera.py"
echo ""
echo "To test with custom videos:"
echo "  1. Copy your videos to ./samples/ directory"
echo "  2. source venv/bin/activate"
echo "  3. Run: python camera.py"
echo ""
echo "Available RTSP URLs will be displayed when you start the camera dummy."
