// Security Dashboard - WebRTC + MQTT
const LOG = document.getElementById('log');
const WEBRTC_LOGGER = document.getElementById('webrtc_logger');
const video = document.getElementById('cam01_video');
const connectBtn = document.getElementById('connect_btn');
const disconnectBtn = document.getElementById('disconnect_btn');
const statusSpan = document.getElementById('connection_status');
const infoP = document.getElementById('cam01_info');

let peerConnection = null;
let socket = null;

// Resolve SFU / MQTT endpoints from runtime config if available, else fallback to hardcoded IP
const APP_CFG = (typeof window !== 'undefined' && window.__APP_CONFIG__) ? window.__APP_CONFIG__ : {};
const SFU_URL = APP_CFG.SFU_URL || 'http://34.67.36.52:3004'; // Socket.IO endpoint
const MQTT_WS = APP_CFG.MQTT_WS_URL || 'ws://34.67.36.52:8000/mqtt';
// Allow optional ICE/TURN servers from runtime config. Example APP_CFG.ICE_SERVERS = [{urls:'stun:..'}, {urls:'turn:..', username:'', credential:''}]
const ICE_SERVERS = APP_CFG.ICE_SERVERS || [{ urls: 'stun:stun.l.google.com:19302' }];

// Stats monitor handle
let statsInterval = null;

function pretty(obj) {
  try { return JSON.stringify(obj); } catch (e) { return String(obj); }
}

function log(msg, opts = {}) {
  const t = new Date().toISOString();
  const line = `[${t}] ${msg}\n`;
  LOG.innerText = line + LOG.innerText;
  // Mirror to browser console for easier devtools inspection
  try { console.debug('[security-log]', msg); } catch (e) {}
  // Jika log terkait WebRTC, tampilkan juga di logger khusus
  if (opts.webrtc || msg.match(/webrtc|RTC|peer|ice|signaling|offer|answer|candidate|sfu|socket|connect/i)) {
    WEBRTC_LOGGER.innerText = line + WEBRTC_LOGGER.innerText;
  }
}

function updateStatus(status, text) {
  statusSpan.className = `status ${status}`;
  statusSpan.textContent = text;
}

// WebRTC connection to SFU
async function connectWebRTC() {
  try {
    log(`🚀 Initiating WebRTC connection to SFU`, { webrtc: true });
    log(`📍 SFU WebSocket URL: ${SFU_WS}`, { webrtc: true });
    log(`🔧 ICE Servers configured: ${pretty(ICE_SERVERS)}`, { webrtc: true });
    
    updateStatus('connecting', 'Connecting...');
    infoP.textContent = 'Establishing WebRTC connection to SFU...';
    
    // Connect to SFU signaling server
    log(`🔌 Creating WebSocket connection to ${SFU_WS}`, { webrtc: true });
    socket = new WebSocket(SFU_WS);

    // helper to send signaling messages and log them
    function sendSignal(msg) {
      try {
        const payload = JSON.stringify(msg);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(payload);
          log(`📤 Signaling send: ${payload}`, { webrtc: true });
        } else {
          log(`⚠️ Signaling not open, cannot send: ${payload}`, { webrtc: true });
        }
      } catch (e) {
  log('❌ Signaling send error: ' + e, { webrtc: true });
      }
    }

    socket.on('connect', () => {
      updateStatus('connected', 'Connected');
      log(`✅ Connected to SFU server via Socket.IO (ID: ${socket.id})`, { webrtc: true });
      
      // Generate unique peer ID
      const peerId = `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      log(`📤 Sending join-room request: roomId=security, peerId=${peerId}`, { webrtc: true });
      socket.emit('join-room', { roomId: 'security', peerId: peerId });
    });

    // Handle SFU responses
    socket.on('router-rtp-capabilities', (data) => {
      log(`📥 Received router RTP capabilities from SFU`, { webrtc: true });
      log(`🔧 RTP Capabilities received, codecs count: ${data.rtpCapabilities?.codecs?.length || 0}`, { webrtc: true });
      // Store capabilities for creating device
      window.rtpCapabilities = data.rtpCapabilities;
      
      // Request WebRTC transport for receiving
      log(`📤 Requesting WebRTC transport for receiving`, { webrtc: true });
      socket.emit('create-webrtc-transport', { direction: 'recv' });
    });

    socket.on('existing-producers', (data) => {
      log(`� Existing producers available: ${JSON.stringify(data.producerIds)}`, { webrtc: true });
      // Start consuming from existing producers
      data.producerIds.forEach(producerId => {
        log(`🔄 Requesting to consume producer: ${producerId}`, { webrtc: true });
        // TODO: Implement consumer creation
      });
    });

    socket.on('webrtc-transport-created', (data) => {
      log(`📥 WebRTC transport created: ${data.transportId}`, { webrtc: true });
      log(`🧊 ICE Parameters: ${JSON.stringify(data.iceParameters)}`, { webrtc: true });
      log(`🧊 ICE Candidates: ${JSON.stringify(data.iceCandidates)}`, { webrtc: true });
      log(`🔧 DTLS Parameters: ${JSON.stringify(data.dtlsParameters)}`, { webrtc: true });
    });

    socket.on('error', (data) => {
      log(`❌ SFU Error: ${data.message}`, { webrtc: true });
      updateStatus('error', 'SFU Error');
      infoP.textContent = `SFU Error: ${data.message}`;
    });

    socket.on('disconnect', () => {
      log(`🔌 Disconnected from SFU server`, { webrtc: true });
      updateStatus('error', 'Disconnected');
      infoP.textContent = 'Disconnected from SFU server';
    });  } catch (error) {
  log('❌ WebRTC setup error: ' + error, { webrtc: true });
    updateStatus('error', 'Setup failed');
    infoP.textContent = 'WebRTC setup failed: ' + error.message;
  }
}

async function handleOffer(offer) {
  try {
    log(`📨 Received offer from SFU: ${pretty(offer)}`, { webrtc: true });
    
    // Create peer connection with configurable ICE servers (STUN/TURN)
    log('🔧 Creating RTCPeerConnection with ICE servers: ' + pretty(ICE_SERVERS), { webrtc: true });
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    
    log(`🔧 PeerConnection created, state: ${peerConnection.connectionState}`, { webrtc: true });
    
    // Start periodic stats monitor
    startStatsMonitor();
    
    // Handle incoming stream
    peerConnection.ontrack = (event) => {
      log(`📺 Received video stream from SFU - streams: ${event.streams.length}`, { webrtc: true });
      log(`📺 Stream tracks: ${event.streams[0].getTracks().length}`, { webrtc: true });
      video.srcObject = event.streams[0];
      updateStatus('connected', 'Live');
      infoP.textContent = 'Real-time security feed active';
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        log(`🧩 Local ICE candidate: ${event.candidate.candidate}`, { webrtc: true });
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
          log('📤 Sent local ICE candidate to SFU', { webrtc: true });
        } else {
          log('⚠️ Cannot send ICE candidate, signaling socket not open', { webrtc: true });
        }
      } else {
        log('ℹ️ ICE gathering finished (null candidate)', { webrtc: true });
      }
    };

    // Additional useful connection state hooks for debugging
    peerConnection.oniceconnectionstatechange = () => {
      log(`🔁 ICE connection state: ${peerConnection.iceConnectionState}`, { webrtc: true });
    };

    peerConnection.onconnectionstatechange = () => {
      log(`🔗 Peer connection state: ${peerConnection.connectionState}`, { webrtc: true });
      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        updateStatus('error', 'Disconnected');
        infoP.textContent = 'Connection lost. Try reconnecting.';
      }
    };

    peerConnection.onicegatheringstatechange = () => {
      log(`❄️ ICE gathering state: ${peerConnection.iceGatheringState}`, { webrtc: true });
    };    peerConnection.onsignalingstatechange = () => {
      log(`📝 Signaling state: ${peerConnection.signalingState}`, { webrtc: true });
    };

    peerConnection.onnegotiationneeded = async () => {
      log('⚙️ Negotiation needed', { webrtc: true });
    };
    
    // Set remote description and create answer
    log(`📝 Setting remote description (offer)`, { webrtc: true });
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    log(`📝 Remote description set successfully`, { webrtc: true });
    
    log(`📝 Creating SDP answer`, { webrtc: true });
    const answer = await peerConnection.createAnswer();
    log(`📝 SDP answer created: ${pretty(answer)}`, { webrtc: true });
    
    log(`📝 Setting local description (answer)`, { webrtc: true });
    await peerConnection.setLocalDescription(answer);
    log(`📝 Local description set successfully`, { webrtc: true });
    
    // Send answer back to SFU
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'answer', answer: answer }));
      log('📤 Sent SDP answer to SFU', { webrtc: true });
    } else {
      log('❌ Cannot send SDP answer, signaling socket not open', { webrtc: true });
    }
    
  } catch (error) {
    log(`❌ WebRTC handling error: ${error}`, { webrtc: true });
    updateStatus('error', 'Failed');
    infoP.textContent = `WebRTC error: ${error.message}`;
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
    
    log(`📨 MQTT Raw data from ${camera}: ${JSON.stringify(data)}`);
    
    if (data.detections && Array.isArray(data.detections) && data.detections.length > 0) {
      const validDetections = data.detections.filter(d => d && d.label && typeof d.confidence === 'number');
      
      if (validDetections.length > 0) {
        const objects = validDetections.map(d => `${d.label} (${Math.round(d.confidence * 100)}%)`).join(', ');
        log(`🚨 SECURITY ALERT [${camera}]: ${objects}`);
      } else {
        log(`⚠️ MQTT message has detections but missing label/confidence fields from ${camera}`);
        log(`🔍 Detection sample: ${JSON.stringify(data.detections[0])}`);
      }
    } else if (data.detections) {
      log(`⚠️ MQTT detections field exists but is not valid array from ${camera}: ${typeof data.detections}`);
    } else {
      log(`📨 MQTT message from ${camera} (no detections): ${JSON.stringify(data)}`);
    }
  } catch (e) {
    log(`❌ Failed to parse MQTT message from ${topic}: ${e.message}`);
    log(`📨 Raw payload: ${payload.toString()}`);
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
