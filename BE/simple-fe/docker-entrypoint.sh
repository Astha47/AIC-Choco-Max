#!/bin/sh
set -e
# Generate runtime config for frontend JS
cat > /app/config.js <<EOF
// Auto-generated runtime config
window.__APP_CONFIG__ = {
  HLS_URL: "http://${HLS_HOST:-localhost}:${HLS_PORT:-9888}",
  MQTT_WS_URL: "ws://${MQTT_HOST:-localhost}:${MQTT_WS_PORT:-8000}/mqtt"
};
EOF
chmod 644 /app/config.js
exec "$@"
