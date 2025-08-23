# HiveMQ MQTT Setup & Testing

Setup and testing scripts for **HiveMQ Community Edition** MQTT Broker using Docker.

## Why HiveMQ?

HiveMQ is chosen over Mosquitto because:
- 🌐 **Web Management Interface** - Built-in HTTP management console
- 🚀 **Enterprise Ready** - Upgrade path to HiveMQ Enterprise features
- 📊 **Better Monitoring** - Advanced metrics and monitoring capabilities
- ⚡ **High Performance** - Optimized for scalability and reliability

## Quick Start

### 1. Setup HiveMQ
```bash
./setup.sh          # Setup and start HiveMQ CE
./setup.sh --clean   # Clean install (remove existing container)
```

### 2. Test HiveMQ
```bash
./test.sh           # Run comprehensive tests
```

### 3. Demo HiveMQ
```bash
./demo.sh           # See real-time publish/subscribe demo
```

### 4. Manage HiveMQ
```bash
./run_hivemq.sh     # Start/restart HiveMQ
./run_hivemq.sh --stop-existing  # Stop existing and start fresh
```

## Scripts Overview

| Script | Purpose | Usage |
|--------|---------|-------|
| **`setup.sh`** | 🔧 Setup HiveMQ CE with Docker | `./setup.sh [--clean]` |
| **`run_hivemq.sh`** | ▶️ Start/manage HiveMQ container | `./run_hivemq.sh [options]` |
| **`test.sh`** | 🧪 Test HiveMQ functionality | `./test.sh` |
| **`demo.sh`** | 🚀 Interactive demo | `./demo.sh` |

## Configuration

- **MQTT Port**: 1883
- **Web Interface**: http://localhost:18080
- **Container Name**: hivemq-ce
- **Data Directory**: ./hivemq-data

## Usage Examples

### Command Line (mosquitto-clients)
```bash
# Subscribe to sensor topics
mosquitto_sub -h localhost -p 1883 -t 'sensors/+'

# Publish temperature data
mosquitto_pub -h localhost -p 1883 -t 'sensors/temperature' -m '{"value": 25.5, "unit": "°C"}'
```

### Python (paho-mqtt)
```bash
# Install client library
pip install paho-mqtt

# Use in Python
import paho.mqtt.client as mqtt
client = mqtt.Client()
client.connect('localhost', 1883)
client.publish('sensors/temperature', '25.5')
```

### JavaScript (MQTT.js)
```bash
# Install client library
npm install mqtt

# Use in Node.js
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');
client.publish('sensors/temperature', '25.5');
```

## Management

### Web Interface
Access HiveMQ management console at: **http://localhost:18080**

Features available:
- Real-time client connections
- Message throughput monitoring
- Topic statistics
- System health metrics

### Docker Commands
```bash
# Check container status
docker ps | grep hivemq-ce

# View logs
docker logs hivemq-ce -f

# Stop container
docker stop hivemq-ce

# Remove container
docker rm hivemq-ce
```

## Troubleshooting

### Common Issues

**HiveMQ not starting:**
```bash
# Check Docker
docker ps -a | grep hivemq-ce

# Check logs
docker logs hivemq-ce

# Clean restart
./setup.sh --clean
```

**Port conflicts:**
```bash
# Check what's using port 1883
sudo lsof -i :1883

# Stop conflicting service (e.g., Mosquitto)
sudo systemctl stop mosquitto
```

**Test failures:**
```bash
# Install mosquitto clients for testing
sudo apt-get install mosquitto-clients

# Run diagnostic test
./test.sh
```

## Dependencies

### Required
- ✅ **Docker** - For running HiveMQ CE container
- ✅ **netcat** - For port testing (usually pre-installed)

### Optional (for testing)
- 📦 **mosquitto-clients** - For command-line testing
  ```bash
  sudo apt-get install mosquitto-clients
  ```

## File Structure

```
mqtt-setup/
├── setup.sh           # 🔧 HiveMQ setup script
├── run_hivemq.sh      # ▶️ HiveMQ runner
├── test.sh            # 🧪 Test suite
├── demo.sh            # 🚀 Interactive demo
├── requirements.txt   # 📦 Dependencies (minimal)
├── hivemq-data/       # 💾 HiveMQ persistent data
└── README.md          # 📖 This file
```

## Enterprise Features

HiveMQ CE provides a **clear upgrade path** to Enterprise features:

- 🔐 **Advanced Security** - RBAC, OAuth, certificate management
- 🌍 **Clustering** - Multi-node high availability
- 🔗 **Bridge & Extensions** - Database integration, custom protocols
- 📈 **Enterprise Monitoring** - Prometheus, Grafana integration
- 🎯 **Quality of Service** - Message persistence, delivery guarantees

## Next Steps

1. **Development**: Start building with HiveMQ using the examples above
2. **Monitoring**: Explore the web interface at http://localhost:18080
3. **Security**: Configure authentication for production use
4. **Scale**: Consider HiveMQ Enterprise for production deployments

## Support

- 📚 **HiveMQ Documentation**: https://docs.hivemq.com/
- 🐛 **Issues**: Use GitHub issues for problems with these scripts
- 💬 **Community**: HiveMQ Community Forum
