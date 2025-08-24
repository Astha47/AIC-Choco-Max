#!/bin/sh
set -e
# Generate runtime config for frontend JS
cat > /app/config.js <<EOF
// Auto-generated runtime config
window.__APP_CONFIG__ = {
  HLS_URL: "http://34.67.36.52:9888",
  MQTT_WS_URL: "ws://34.67.36.52:8000/mqtt",
  SFU_WS_URL: "ws://34.67.36.52:3000"
};
EOF
chmod 644 /app/config.js
exec "$@"
