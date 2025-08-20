# Camera Dummy RTSP Streaming

Simulasi multiple kamera menggunakan protokol RTSP yang melakukan streaming video dari folder `samples`.

## Overview

Camera dummy ini mensimulasikan beberapa kamera IP yang melakukan streaming video menggunakan protokol RTSP. Setiap video file di folder `samples` akan menjadi satu kamera yang dapat diakses melalui URL RTSP terpisah.

## Features

- ✅ Multiple camera simulation (satu file video = satu kamera)
- ✅ RTSP streaming protocol
- ✅ Automatic video looping
- ✅ Camera ID overlay pada video
- ✅ Timestamp overlay
- ✅ Support multiple video formats (MP4, AVI, MOV, dll)
- ✅ Auto-discovery video files
- ✅ Sample video generator untuk testing

## Requirements

### Metode FFmpeg (Recommended)
```bash
# Install FFmpeg
sudo apt update
sudo apt install ffmpeg

# Install Python dependencies
pip install -r requirements.txt
```

### Metode OpenCV (Alternative)
```bash
# Install Python dependencies
pip install -r requirements.txt
```

## File Structure

```
camera-dummy/
├── camera.py          # Main camera dummy script
├── requirements.txt   # Python dependencies
├── samples/          # Folder untuk video files
│   ├── 1.mp4        # Video untuk camera 1
│   ├── 2.mp4        # Video untuk camera 2
│   └── ...          # dst
└── readme.md        # Documentation
```

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Siapkan video files:**
   
   **Option A: Gunakan video sendiri**
   ```bash
   # Copy video files ke folder samples
   cp your_videos/*.mp4 ./samples/
   
   # Rename sesuai urutan (optional)
   mv video1.mp4 ./samples/1.mp4
   mv video2.mp4 ./samples/2.mp4
   ```
   
   **Option B: Generate sample videos untuk testing**
   ```bash
   python camera.py --create-samples
   ```

3. **Start RTSP streaming:**
   ```bash
   # Menggunakan FFmpeg (recommended)
   python camera.py
   
   # Atau menggunakan OpenCV
   python camera.py --use-opencv
   ```

## Usage

### Basic Usage

```bash
# Start dengan default settings
python camera.py

# Specify custom samples directory
python camera.py --samples-dir /path/to/videos

# Use custom base port
python camera.py --base-port 9000

# Create sample videos untuk testing
python camera.py --create-samples
```

### Command Line Options

```bash
python camera.py [OPTIONS]

Options:
  --samples-dir DIR     Directory containing video samples (default: ./samples)
  --base-port PORT      Base RTSP port (default: 8554)
  --use-opencv         Use OpenCV instead of FFmpeg for streaming
  --create-samples     Create sample video files for testing
  -h, --help           Show help message
```

### RTSP URLs

Setelah menjalankan script, Anda akan mendapatkan RTSP URLs seperti:

```
Camera 1: rtsp://localhost:8554/camera_1
Camera 2: rtsp://localhost:8555/camera_2
Camera 3: rtsp://localhost:8556/camera_3
...
```

### Testing RTSP Stream

**Menggunakan VLC Media Player:**
```bash
vlc rtsp://localhost:8554/camera_1
```

**Menggunakan FFplay:**
```bash
ffplay rtsp://localhost:8554/camera_1
```

**Menggunakan OpenCV Python:**
```python
import cv2

cap = cv2.VideoCapture('rtsp://localhost:8554/camera_1')
while True:
    ret, frame = cap.read()
    if ret:
        cv2.imshow('Camera 1', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
cap.release()
cv2.destroyAllWindows()
```

## Video File Support

Supported formats:
- MP4 (`.mp4`)
- AVI (`.avi`)
- MOV (`.mov`)
- MKV (`.mkv`)
- WMV (`.wmv`)
- FLV (`.flv`)

## Configuration

### Port Mapping

- Camera 1: Port 8554 (base_port + 0)
- Camera 2: Port 8555 (base_port + 1)
- Camera 3: Port 8556 (base_port + 2)
- dst...

### Video Properties

- Videos akan di-loop secara otomatis
- Frame rate mengikuti video asli
- Resolution mengikuti video asli
- Overlay camera ID dan timestamp ditambahkan

## Troubleshooting

### FFmpeg Not Found
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg

# macOS
brew install ffmpeg
```

### Port Already in Use
```bash
# Check port usage
sudo netstat -tulpn | grep :8554

# Use different base port
python camera.py --base-port 9000
```

### No Video Files Found
```bash
# Create sample videos
python camera.py --create-samples

# Check samples directory
ls -la ./samples/
```

### RTSP Connection Issues
```bash
# Test with simple client
ffplay rtsp://localhost:8554/camera_1

# Check if stream is running
curl -v rtsp://localhost:8554/camera_1
```

## Integration Examples

### Dengan YOLO Detection
```python
import cv2

# Connect to RTSP stream
cap = cv2.VideoCapture('rtsp://localhost:8554/camera_1')

while True:
    ret, frame = cap.read()
    if ret:
        # Run YOLO detection here
        # detections = yolo_model.detect(frame)
        
        cv2.imshow('Detection', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
```

### Dengan MQTT Publishing
```python
import cv2
import paho.mqtt.client as mqtt
import json
import base64

client = mqtt.Client()
client.connect("localhost", 1883, 60)

cap = cv2.VideoCapture('rtsp://localhost:8554/camera_1')

while True:
    ret, frame = cap.read()
    if ret:
        # Encode frame to base64
        _, buffer = cv2.imencode('.jpg', frame)
        frame_base64 = base64.b64encode(buffer).decode()
        
        # Publish to MQTT
        payload = {
            "camera_id": 1,
            "timestamp": time.time(),
            "frame": frame_base64
        }
        client.publish("camera/frames", json.dumps(payload))
```

## Notes

- Script ini cocok untuk development dan testing
- Untuk production, gunakan dedicated RTSP server seperti GStreamer
- Memory usage akan meningkat seiring dengan jumlah camera
- CPU usage tergantung pada resolution dan frame rate video

## Setup & Usage

1. Clone the repository and navigate to this folder.
2. Install dependencies as required (see requirements.txt if available).
3. Run the simulation scripts to generate or process dummy camera data.

## Notes

- Update this README with specific instructions as the project evolves.