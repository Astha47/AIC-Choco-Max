// Security Dashboard - WebRTC + MQTT
const LOG = document.getElementById('log');
const video = document.getElementById('cam01_video');
const connectBtn = document.getElementById('connect_btn');
const disconnectBtn = document.getElementById('disconnect_btn');
const statusSpan = document.getElementById('connection_status');
const infoP = document.getElementById('cam01_info');

let peerConnection = null;
let socket = null;

// Resolve SFU / MQTT endpoints from runtime config if available, else fallback to hardcoded IP
const APP_CFG = (typeof window !== 'undefined' && window.__APP_CONFIG__) ? window.__APP_CONFIG__ : {};
const SFU_WS = APP_CFG.SFU_WS_URL || 'ws://34.67.36.52:3004';
const MQTT_WS = APP_CFG.MQTT_WS_URL || 'ws://34.67.36.52:8000/mqtt';

function log(msg) {
  const t = new Date().toISOString();
  LOG.innerText = `[${t}] ${msg}\n` + LOG.innerText;
}

function updateStatus(status, text) {
  statusSpan.className = `status ${status}`;
  statusSpan.textContent = text;
}

// WebRTC connection to SFU
async function connectWebRTC() {
  try {
    updateStatus('connecting', 'Connecting...');
    infoP.textContent = 'Establishing WebRTC connection to SFU...';
    
  // Connect to SFU signaling server
  socket = new WebSocket(SFU_WS);
    
    socket.onopen = () => {
      log('✅ Connected to SFU signaling server');
      socket.send(JSON.stringify({
        type: 'join',
        roomId: 'security',
        mediaType: 'recv-only'
      }));
    };
    
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'offer') {
        await handleOffer(message.offer);
      } else if (message.type === 'ice-candidate') {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
      }
    };
    
    socket.onerror = (error) => {
      log('❌ SFU connection error: ' + error);
      updateStatus('error', 'Connection failed');
      infoP.textContent = 'Failed to connect to SFU server';
    };
    
    socket.onclose = () => {
      log('🔌 SFU connection closed');
      updateStatus('error', 'Disconnected');
    };
    
  } catch (error) {
    log('❌ WebRTC setup error: ' + error);
    updateStatus('error', 'Setup failed');
    infoP.textContent = 'WebRTC setup failed: ' + error.message;
  }
}

async function handleOffer(offer) {
  try {
    // Create peer connection
    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    // Handle incoming stream
    peerConnection.ontrack = (event) => {
      log('📺 Received video stream from SFU');
      video.srcObject = event.streams[0];
      updateStatus('connected', 'Live');
      infoP.textContent = 'Real-time security feed active';
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate
        }));
      }
    };
    
    // Set remote description and create answer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    // Send answer back to SFU
    socket.send(JSON.stringify({
      type: 'answer',
      answer: answer
    }));
    
  } catch (error) {
    log('❌ WebRTC handling error: ' + error);
    updateStatus('error', 'Failed');
  }
}

function disconnectWebRTC() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  if (socket) {
    socket.close();
    socket = null;
  }
  
  video.srcObject = null;
  updateStatus('connecting', 'Disconnected');
  infoP.textContent = 'Click Connect to start real-time WebRTC stream';
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  log('🔌 WebRTC disconnected');
}

// Event listeners
connectBtn.addEventListener('click', connectWebRTC);
disconnectBtn.addEventListener('click', disconnectWebRTC);

// MQTT for security alerts (use resolved MQTT_WS)
const mqttUrl = MQTT_WS;
log(`Connecting to security alert system: ${mqttUrl}`);

const client = mqtt.connect(mqttUrl);

client.on('connect', () => {
  log('🛡️ Security alert system connected');
  client.subscribe('cameras/+/detections', (err) => {
    if (err) {
      log('❌ Alert subscription error: ' + err);
    } else {
      log('🚨 Security alerts active');
    }
  });
});

client.on('message', (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const camera = topic.split('/')[1];
    
    if (data.detections && data.detections.length > 0) {
      const objects = data.detections.map(d => `${d.label} (${Math.round(d.confidence * 100)}%)`).join(', ');
      log(`🚨 SECURITY ALERT [${camera}]: ${objects}`);
      
      // Could add visual/audio alerts here for security personnel
      // e.g., flash the screen, play alert sound, etc.
    }
  } catch (e) {
    log(`📨 ${topic}: ${payload.toString()}`);
  }
});

client.on('error', (err) => {
  log('❌ Alert system error: ' + err);
});

// Initial setup
log('🛡️ Security Dashboard initialized');
log('📺 WebRTC: Ultra-low latency (<1s) for real-time monitoring');
log('🚨 MQTT: Instant security alerts');
log('⚡ Ready for immediate threat response');

// Note: This is a basic WebRTC implementation
// In production, you'd need proper SFU integration with MediaSoup
