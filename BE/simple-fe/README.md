Simple FE for quick testing

Usage:
- Run the stack (rtsp-server, camera-dummy, hivemq) as described in the root README.
- Open `BE/simple-fe/index.html` in a browser (or serve it with a static server).

Notes:
- The page expects HLS segments at http://localhost:9888/<cam>.m3u8 served by the RTSP server.
- MQTT WebSocket is expected at ws://localhost:8000/mqtt (HiveMQ default websocket mapping).
