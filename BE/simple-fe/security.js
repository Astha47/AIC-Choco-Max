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
// Allow optional ICE/TURN servers from runtime config. Example APP_CFG.ICE_SERVERS = [{urls:'stun:..'}, {urls:'turn:..', username:'', credential:''}]
const ICE_SERVERS = APP_CFG.ICE_SERVERS || [{ urls: 'stun:stun.l.google.com:19302' }];

// Stats monitor handle
let statsInterval = null;

function pretty(obj) {
  try { return JSON.stringify(obj); } catch (e) { return String(obj); }
}

function log(msg) {
  const t = new Date().toISOString();
  LOG.innerText = `[${t}] ${msg}\n` + LOG.innerText;
  // Mirror to browser console for easier devtools inspection
  try { console.debug('[security-log]', msg); } catch (e) {}
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

    // helper to send signaling messages and log them
    function sendSignal(msg) {
      try {
        const payload = JSON.stringify(msg);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(payload);
          log(`📤 Signaling send: ${payload}`);
        } else {
          log(`⚠️ Signaling not open, cannot send: ${payload}`);
        }
      } catch (e) {
        log('❌ Signaling send error: ' + e);
      }
    }

    socket.onopen = () => {
      log(`✅ Connected to SFU signaling server ${SFU_WS}`);
      sendSignal({ type: 'join', roomId: 'security', mediaType: 'recv-only' });
    };

    socket.onmessage = async (event) => {
      log('📥 Signaling message raw: ' + event.data);
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        log('❌ Failed to parse signaling message: ' + e);
        return;
      }

      log('📩 Signaling parsed: ' + pretty(message));

      if (message.type === 'offer') {
        await handleOffer(message.offer);
      } else if (message.type === 'ice-candidate') {
        if (peerConnection) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            log('✅ Added remote ICE candidate');
          } catch (e) {
            log('❌ Failed to add remote ICE candidate: ' + e);
          }
        } else {
          log('⚠️ Received ICE candidate but peerConnection not initialized yet');
        }
      } else {
        log('ℹ️ Signaling message type unhandled: ' + message.type);
      }
    };

    socket.onerror = (error) => {
      log('❌ SFU connection error: ' + pretty(error));
      updateStatus('error', 'Connection failed');
      infoP.textContent = 'Failed to connect to SFU server';
    };

    socket.onclose = (ev) => {
      log(`🔌 SFU connection closed (code=${ev.code} reason=${ev.reason || ''})`);
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
    // Create peer connection with configurable ICE servers (STUN/TURN)
    log('🔧 Creating RTCPeerConnection with ICE servers: ' + pretty(ICE_SERVERS));
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    // Start periodic stats monitor
    startStatsMonitor();
    
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
      log('🧩 onicecandidate event: ' + pretty(event.candidate));
      if (event.candidate) {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
          log('📤 Sent local ICE candidate to SFU');
        } else {
          log('⚠️ Cannot send ICE candidate, signaling socket not open');
        }
      } else {
        log('ℹ️ ICE gathering finished (null candidate)');
      }
    };

    // Additional useful connection state hooks for debugging
    peerConnection.oniceconnectionstatechange = () => {
      log('🔁 ICE connection state: ' + peerConnection.iceConnectionState);
    };

    peerConnection.onconnectionstatechange = () => {
      log('🔗 Peer connection state: ' + peerConnection.connectionState);
      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        updateStatus('error', 'Disconnected');
      }
    };

    peerConnection.onsignalingstatechange = () => {
      log('📝 Signaling state: ' + peerConnection.signalingState);
    };

    peerConnection.onicegatheringstatechange = () => {
      log('🎯 ICE gathering state: ' + peerConnection.iceGatheringState);
    };

    peerConnection.onnegotiationneeded = async () => {
      log('⚙️ Negotiation needed');
    };
    
    // Set remote description and create answer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    // Send answer back to SFU
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'answer', answer: answer }));
      log('📤 Sent SDP answer to SFU');
    } else {
      log('❌ Cannot send SDP answer, signaling socket not open');
    }
    
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
  
  // stop stats monitor
  stopStatsMonitor();

  video.srcObject = null;
  updateStatus('connecting', 'Disconnected');
  infoP.textContent = 'Click Connect to start real-time WebRTC stream';
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  log('🔌 WebRTC disconnected');
}

// Stats monitor: periodically collect and log basic stats for debugging
function startStatsMonitor() {
  stopStatsMonitor();
  try {
    statsInterval = setInterval(async () => {
      if (!peerConnection) return;
      try {
        const stats = await peerConnection.getStats();
        stats.forEach(report => {
          // log a few interesting fields depending on report type
          if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') {
            log(`📊 stats ${report.type} id=${report.id} packets=${report.packetsReceived||report.packetsSent||0} bytes=${report.bytesReceived||report.bytesSent||0}`);
          }
        });
      } catch (e) {
        log('❌ getStats error: ' + e);
      }
    }, 5000);
  } catch (e) {
    log('❌ startStatsMonitor error: ' + e);
  }
}

function stopStatsMonitor() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
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
