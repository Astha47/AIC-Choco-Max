// Security Dashboard - WebRTC + MQTT dengan Socket.IO
const LOG = document.getElementById('log');
const WEBRTC_LOGGER = document.getElementById('webrtc_logger');
const video = document.getElementById('cam01_video');
const connectBtn = document.getElementById('connect_btn');
const disconnectBtn = document.getElementById('disconnect_btn');
const statusSpan = document.getElementById('connection_status');
const infoP = document.getElementById('cam01_info');

let peerConnection = null;
let socket = null;
let currentTransport = null;

// Resolve SFU / MQTT endpoints from runtime config if available, else fallback to hardcoded IP
const APP_CFG = (typeof window !== 'undefined' && window.__APP_CONFIG__) ? window.__APP_CONFIG__ : {};
const SFU_URL = APP_CFG.SFU_URL || 'http://34.67.36.52:3004'; // Socket.IO endpoint
const MQTT_WS = APP_CFG.MQTT_WS_URL || 'ws://34.67.36.52:8000/mqtt';
// Allow optional ICE/TURN servers from runtime config. Example APP_CFG.ICE_SERVERS = [{urls:'stun:..'}, {urls:'turn:..', username:'', credential:''}]
const ICE_SERVERS = APP_CFG.ICE_SERVERS || [{ urls: 'stun:stun.l.google.com:19302' }];

// Stats monitor handle
let statsInterval = null;

function pretty(obj) {
  try { return JSON.stringify(obj, null, 2); } catch (e) { return String(obj); }
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

// WebRTC connection to SFU menggunakan Socket.IO
async function connectWebRTC() {
  try {
    log(`🚀 Initiating WebRTC connection to SFU`, { webrtc: true });
    log(`📍 SFU Socket.IO URL: ${SFU_URL}`, { webrtc: true });
    log(`🔧 ICE Servers configured: ${pretty(ICE_SERVERS)}`, { webrtc: true });
    
    updateStatus('connecting', 'Connecting...');
    infoP.textContent = 'Establishing WebRTC connection to SFU...';
    
    // Connect to SFU using Socket.IO
    log(`🔌 Creating Socket.IO connection to ${SFU_URL}`, { webrtc: true });
    socket = io(SFU_URL);

    // Setup Socket.IO event handlers
    socket.on('connect', () => {
      log(`✅ Connected to SFU server via Socket.IO (ID: ${socket.id})`, { webrtc: true });
      log(`📤 Sending join-room request: roomId=security`, { webrtc: true });
      
      // Join room first
      socket.emit('join-room', { 
        roomId: 'security', 
        peerId: socket.id 
      });
      
      updateStatus('connecting', 'Requesting transport...');
    });

    socket.on('room-joined', (data) => {
      log(`✅ Successfully joined room: ${pretty(data)}`, { webrtc: true });
      
      // Request WebRTC transport for receiving
      log(`📤 Requesting WebRTC transport for receiving`, { webrtc: true });
      socket.emit('create-webrtc-transport', { direction: 'recv' });
    });

    socket.on('webrtc-transport-created', async (data) => {
      log(`📨 Received transport data: ${pretty(data)}`, { webrtc: true });
      await handleTransportCreated(data);
    });

    socket.on('new-producer', async (data) => {
      log(`📺 New producer available: ${pretty(data)}`, { webrtc: true });
      // Request to consume this producer
      socket.emit('consume', {
        producerId: data.producerId,
        rtpCapabilities: peerConnection ? await getDeviceRtpCapabilities() : null
      });
    });

    socket.on('consumer-created', async (data) => {
      log(`📺 Consumer created: ${pretty(data)}`, { webrtc: true });
      await handleConsumerCreated(data);
    });

    socket.on('connect_error', (error) => {
      log(`❌ Socket.IO connection error: ${pretty(error)}`, { webrtc: true });
      updateStatus('error', 'Connection failed');
      infoP.textContent = 'Failed to connect to SFU server. Check if SFU is running on port 3004.';
    });

    socket.on('disconnect', (reason) => {
      log(`🔌 Socket.IO disconnected: ${reason}`, { webrtc: true });
      updateStatus('error', 'Disconnected');
      infoP.textContent = `Connection lost: ${reason}. Try reconnecting.`;
    });

    socket.on('error', (error) => {
      log(`❌ Socket.IO error: ${pretty(error)}`, { webrtc: true });
      updateStatus('error', 'Error');
    });
    
  } catch (error) {
    log('❌ WebRTC setup error: ' + error, { webrtc: true });
    updateStatus('error', 'Setup failed');
    infoP.textContent = 'WebRTC setup failed: ' + error.message;
  }
}

async function handleTransportCreated(transportData) {
  try {
    log(`🔧 Creating RTCPeerConnection with ICE servers: ${pretty(ICE_SERVERS)}`, { webrtc: true });
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    
    log(`🔧 PeerConnection created, state: ${peerConnection.connectionState}`, { webrtc: true });
    
    // Setup event handlers
    setupPeerConnectionHandlers();
    
    // Store transport data for later use
    currentTransport = transportData;
    
    // Connect the transport
    log(`📤 Connecting transport with dtlsParameters`, { webrtc: true });
    socket.emit('connect-transport', {
      transportId: transportData.id,
      dtlsParameters: peerConnection.localDescription ? peerConnection.localDescription.sdp : null
    });
    
    updateStatus('connecting', 'Transport connected, waiting for media...');
    
  } catch (error) {
    log(`❌ Transport creation error: ${error}`, { webrtc: true });
    updateStatus('error', 'Transport failed');
  }
}

function setupPeerConnectionHandlers() {
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
      if (socket && socket.connected) {
        socket.emit('ice-candidate', { 
          candidate: event.candidate,
          transportId: currentTransport?.id 
        });
        log('📤 Sent local ICE candidate to SFU', { webrtc: true });
      } else {
        log('⚠️ Cannot send ICE candidate, socket not connected', { webrtc: true });
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
  };

  peerConnection.onsignalingstatechange = () => {
    log(`📝 Signaling state: ${peerConnection.signalingState}`, { webrtc: true });
  };

  peerConnection.onnegotiationneeded = async () => {
    log('⚙️ Negotiation needed', { webrtc: true });
  };
}

async function handleConsumerCreated(consumerData) {
  try {
    log(`📺 Setting up consumer: ${pretty(consumerData)}`, { webrtc: true });
    
    // Resume consumer
    socket.emit('resume-consumer', { consumerId: consumerData.id });
    log(`📺 Resumed consumer: ${consumerData.id}`, { webrtc: true });
    
  } catch (error) {
    log(`❌ Consumer setup error: ${error}`, { webrtc: true });
  }
}

async function getDeviceRtpCapabilities() {
  // Simple RTP capabilities for video receiving
  return {
    codecs: [
      {
        mimeType: 'video/VP8',
        clockRate: 90000
      },
      {
        mimeType: 'video/H264',
        clockRate: 90000
      }
    ],
    headerExtensions: [],
    fecMechanisms: []
  };
}

function disconnectWebRTC() {
  log(`🔌 Disconnecting WebRTC`, { webrtc: true });
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
    log(`🔌 PeerConnection closed`, { webrtc: true });
  }
  
  if (socket) {
    socket.disconnect();
    socket = null;
    log(`🔌 Socket.IO disconnected`, { webrtc: true });
  }
  
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  
  currentTransport = null;
  
  updateStatus('error', 'Disconnected');
  infoP.textContent = 'Disconnected. Click Connect to restart.';
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  
  stopStatsMonitor();
}

function startStatsMonitor() {
  if (statsInterval) clearInterval(statsInterval);
  
  statsInterval = setInterval(async () => {
    if (peerConnection && peerConnection.connectionState === 'connected') {
      try {
        const stats = await peerConnection.getStats();
        // Log basic connection stats
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            log(`📊 Video stats: bytes=${report.bytesReceived}, packets=${report.packetsReceived}`, { webrtc: true });
          }
        });
      } catch (e) {
        // Ignore stats errors
      }
    }
  }, 5000); // Every 5 seconds
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

// MQTT Connection (existing code)
log(`📺 WebRTC: Ultra-low latency (<1s) for real-time monitoring`);
log(`Connecting to security alert system: ${MQTT_WS}`);

const client = mqtt.connect(MQTT_WS);

client.on('connect', () => {
  log('🛡️ Security alert system connected');
  client.subscribe('cameras/+/detections', (err) => {
    if (err) {
      log('❌ Failed to subscribe to detections: ' + err);
    } else {
      log('✅ Subscribed to camera detections');
    }
  });
});

client.on('message', (topic, message) => {
  try {
    const detection = JSON.parse(message.toString());
    const cameraId = topic.split('/')[1];
    log(`🚨 ALERT [${cameraId}]: ${detection.class} (confidence: ${(detection.confidence * 100).toFixed(1)}%)`);
  } catch (e) {
    log(`📡 Raw message [${topic}]: ${message.toString()}`);
  }
});

client.on('error', (error) => {
  log('❌ MQTT connection error: ' + error);
});

// Initial status
updateStatus('connecting', 'Ready');
infoP.textContent = 'Click Connect to start real-time WebRTC stream';
