# YOLO Inference System

YOLOv12 real-time object detection system with WebRTC streaming, MQTT messaging, and database logging.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  RTSP Cameras   │───▶│  YOLO Inference  │───▶│  MQTT Broker    │
│  (Camera Dummy) │    │    Service       │    │   (HiveMQ)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                       │                       │
        │                       ▼                       │
        │              ┌──────────────────┐             │
        │              │  MySQL Database  │             │
        │              │   (Logging)      │             │
        │              └──────────────────┘             │
        │                                               │
        ▼                                               ▼
┌─────────────────┐                            ┌─────────────────┐
│  SFU MediaSoup  │                            │   Frontend      │
│   (WebRTC)      │◀──────────────────────────▶│   (Browser)     │
└─────────────────┘                            └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- 4GB+ RAM recommended
- 10GB+ available disk space

### 1. Setup System
```bash
./setup.sh
```

### 2. Start Services
```bash
# Start all services in background
./run.sh -d

# Or start interactively (see logs)
./run.sh
```

### 3. Access Services
- **SFU WebRTC**: http://localhost:3000
- **MQTT Console**: http://localhost:8080
- **Database**: localhost:3307
- **RTSP Streams**: rtsp://localhost:8554/cam[1-3]

## 📋 Services Overview

### 🤖 YOLO Inference Service
- **Purpose**: Real-time object detection using YOLOv12
- **Input**: RTSP streams from multiple cameras
- **Output**: Detection metadata via MQTT + optional database logging
- **Features**:
  - Multi-camera parallel processing
  - Automatic model fallback (YOLOv8n if YOLOv12n unavailable)
  - RTSP reconnection handling
  - Performance monitoring

### 📡 SFU MediaSoup Service
- **Purpose**: WebRTC Selective Forwarding Unit for video streaming
- **Features**:
  - Low-latency video streaming to browsers
  - RTSP-to-WebRTC bridge
  - Multiple viewer support
  - Simulcast support

### 📊 MQTT Broker (HiveMQ)
- **Purpose**: Message broker for detection metadata
- **Topics**: `cameras/{camera_id}/detections`
- **Format**: JSON with bbox coordinates, confidence, labels
- **Consumers**: Frontend, analytics services, external systems

### 🗄️ Database (MySQL)
- **Purpose**: Optional detection logging
- **Tables**: `detections`, `camera_status`
- **Views**: `detection_summary` for aggregated statistics

## ⚙️ Configuration

### Environment Variables

```bash
# Database (optional)
DB_ENABLED=false
MYSQL_ROOT_PASSWORD=yolo_root_2024

# Model Configuration  
MODEL_DEVICE=cpu          # or 'cuda' for GPU
MODEL_PATH=./models/yolov12n.pt

# Performance
MAX_WORKERS=4
INFERENCE_INTERVAL=0.1
FRAME_SKIP=1

# Network
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
```

### Service-Specific Configuration

#### YOLO Inference (`BE/inference-yolo/.env`)
```bash
RTSP_URLS=rtsp://localhost:8554/cam01,rtsp://localhost:8554/cam02
MODEL_CONFIDENCE=0.5
MQTT_BROKER=localhost
```

#### SFU MediaSoup (`BE/sfu-mediasoup/.env`)
```bash
PORT=3000
MEDIASOUP_MIN_PORT=10000
MEDIASOUP_MAX_PORT=10100
RTSP_BRIDGE_ENABLED=true
```

## 🔧 Management Commands

### Start/Stop Services
```bash
# Start all services in background
./run.sh -d

# Start specific services
./run.sh -s "yolo-inference,sfu-mediasoup" -d

# Rebuild and start
./run.sh -b -d

# View logs
docker-compose logs -f [service-name]

# Stop all services
docker-compose down
```

### Individual Service Management
```bash
# YOLO Inference Service
cd BE/inference-yolo
./run.sh -d

# SFU Service
cd BE/sfu-mediasoup  
./run.sh -d
```

### Database Management
```bash
# Initialize database
python BE/inference-yolo/init_database.py

# Test connection
python BE/inference-yolo/init_database.py test

# Access MySQL
docker exec -it yolo-mysql mysql -u root -p
```

## 🔍 Monitoring & Debugging

### Service Health Checks
```bash
# Check all services
docker-compose ps

# Health check endpoints
curl http://localhost:3000/health    # SFU
curl http://localhost:8080/health    # MQTT Console
```

### Performance Monitoring
```bash
# System resources
docker stats

# Service logs
docker-compose logs -f yolo-inference
docker-compose logs -f sfu-mediasoup

# MQTT message monitoring
docker exec -it yolo-hivemq mqtt-client sub -t "cameras/+/detections"
```

### Troubleshooting

#### Camera Connection Issues
```bash
# Check RTSP streams
ffplay rtsp://localhost:8554/cam01

# Restart camera dummy
docker-compose restart camera-dummy
```

#### Model Loading Issues
```bash
# Check model file
ls -la BE/inference-yolo/models/

# Download fallback model manually
docker exec -it yolo-inference python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

#### Database Connection Issues
```bash
# Check MySQL status
docker-compose logs mysql

# Test connection
docker exec -it yolo-mysql mysql -u root -p -e "SHOW DATABASES;"
```

## 🔒 Security Considerations

### Production Deployment
1. **Change default passwords** in `.env`
2. **Enable SSL/TLS** for all services
3. **Configure firewall** rules
4. **Use environment-specific configs**
5. **Enable authentication** for MQTT and database

### Network Security
```bash
# Generate SSL certificates
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Configure SSL in services
SSL_ENABLED=true
SSL_CERT_PATH=./certs/cert.pem
SSL_KEY_PATH=./certs/key.pem
```

## 📈 Scaling & Performance

### Horizontal Scaling
```bash
# Scale inference workers
docker-compose up -d --scale yolo-inference=3

# Load balancer (nginx)
docker-compose -f docker-compose.yml -f docker-compose.scale.yml up -d
```

### Performance Tuning
```bash
# GPU acceleration (if available)
MODEL_DEVICE=cuda

# Optimize frame processing
FRAME_SKIP=2          # Process every 3rd frame
INFERENCE_INTERVAL=0.2  # Reduce inference frequency

# Database optimization
DB_ENABLED=false      # Disable logging for max performance
```

## 🐛 Common Issues

### Issue: "Model not found"
**Solution**: Service will auto-download fallback model or manually place `yolov12n.pt` in `BE/inference-yolo/models/`

### Issue: "RTSP connection failed"  
**Solution**: Check camera-dummy service is running and streams are available

### Issue: "MQTT not connecting"
**Solution**: Verify HiveMQ container is healthy and ports are accessible

### Issue: "WebRTC connection failed"
**Solution**: Check MEDIASOUP_ANNOUNCED_IP matches your server's IP

## 📚 API Reference

### MQTT Topics
```bash
# Detection results
cameras/{camera_id}/detections
{
  "camera_id": "cam01",
  "timestamp": 1691234567890,
  "detections": [
    {
      "label": "person",
      "confidence": 0.85,
      "bbox": [0.5, 0.3, 0.2, 0.4]  # [x_center, y_center, width, height] normalized
    }
  ]
}
```

### REST API Endpoints
```bash
# SFU Service
GET  /health                    # Health check
GET  /router-capabilities       # WebRTC capabilities
GET  /rooms/{roomId}           # Room information

# Database API (custom endpoints can be added)
GET  /api/detections           # Recent detections
GET  /api/cameras              # Camera status
GET  /api/stats                # Detection statistics
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push branch: `git push origin feature/new-feature`
5. Submit pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

For more detailed information, check the individual service READMEs:
- [Inference Service](BE/inference-yolo/README.md)
- [SFU Service](BE/sfu-mediasoup/README.md)
- [Camera Dummy](BE/camera-dummy/README.md)
- [MQTT Setup](BE/mqtt-setup/README.md)
