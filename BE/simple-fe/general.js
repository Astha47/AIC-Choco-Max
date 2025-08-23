// General viewing - HLS + MQTT
const LOG = document.getElementById('log');
const video = document.getElementById('cam01_video');
const status = document.getElementById('cam01_status');

function log(msg) {
  const t = new Date().toISOString();
  LOG.innerText = `[${t}] ${msg}\n` + LOG.innerText;
}

// Debug: Check if config is loaded
console.log('Config loaded:', window.__APP_CONFIG__);

// Setup HLS for processed camera stream
const HLS_BASE = (window.__APP_CONFIG__ && window.__APP_CONFIG__.HLS_URL) || 'http://localhost:9888';
const hlsUrl = `${HLS_BASE}/cam01_proc/index.m3u8`;
console.log('Using HLS URL:', hlsUrl);

if (Hls.isSupported()) {
  const hls = new Hls({
    enableWorker: false,
    lowLatencyMode: false,
    backBufferLength: 90
  });
  
  hls.loadSource(hlsUrl);
  hls.attachMedia(video);
  
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    log('HLS stream connected - processed video with YOLO detections');
    status.innerHTML = `✅ Connected: <a href="${hlsUrl}" target="_blank">${hlsUrl}</a>`;
    status.style.color = 'green';
  });
  
  hls.on(Hls.Events.ERROR, (event, data) => {
    log(`HLS error: ${data.type} - ${data.details}`);
    if (data.fatal) {
      status.innerHTML = `❌ Connection failed: ${data.details}`;
      status.style.color = 'red';
      
      // Retry after 5 seconds
      setTimeout(() => {
        log('Retrying HLS connection...');
        hls.loadSource(hlsUrl);
      }, 5000);
    }
  });
  
} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
  // Safari native HLS support
  video.src = hlsUrl;
  log('Using native HLS support');
  status.innerHTML = `✅ Connected (native): ${hlsUrl}`;
} else {
  log('HLS not supported in this browser');
  status.innerHTML = '❌ HLS not supported in this browser';
  status.style.color = 'red';
}

// MQTT connection for real-time alerts
const MQTT_WS = (window.__APP_CONFIG__ && window.__APP_CONFIG__.MQTT_WS_URL) || 'ws://localhost:8000/mqtt';
console.log('Using MQTT URL:', MQTT_WS);
log(`Connecting to MQTT: ${MQTT_WS}`);

const client = mqtt.connect(MQTT_WS);

client.on('connect', () => {
  log('✅ MQTT connected - ready for detection alerts');
  client.subscribe('cameras/+/detections', (err) => {
    if (err) {
      log('❌ MQTT subscribe error: ' + err);
    } else {
      log('📡 Subscribed to detection alerts');
    }
  });
});

client.on('message', (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const camera = topic.split('/')[1];
    
    // Show alert with detection info
    if (data.detections && data.detections.length > 0) {
      const objects = data.detections.map(d => `${d.label} (${Math.round(d.confidence * 100)}%)`).join(', ');
      log(`🚨 DETECTION [${camera}]: ${objects}`);
    }
  } catch (e) {
    log(`📨 ${topic}: ${payload.toString()}`);
  }
});

client.on('error', (err) => {
  log('❌ MQTT error: ' + err);
});

client.on('close', () => {
  log('🔌 MQTT connection closed');
});

// Show initial info
log('🎥 General Viewing Dashboard loaded');
log('📺 Video: HLS stream with 3-8 second latency');
log('📡 Alerts: Real-time via MQTT');
