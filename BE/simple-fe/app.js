// Simple FE app to play WebRTC streams from SFU and log MQTT detections
const LOG = document.getElementById('log');
const VIDEOS = document.getElementById('videos');

function log(msg){
  const t = new Date().toISOString();
  LOG.innerText = `[${t}] ${msg}\n` + LOG.innerText;
}

// Create 1 video card for cam01 (processed video with bounding boxes) via WebRTC from SFU
const cams = ['cam01']; // Camera stream with YOLO detections via SFU
for(const c of cams){
  const card = document.createElement('div');
  card.className = 'card';
  const title = document.createElement('h4');
  title.innerText = c + ' (WebRTC from SFU)';
  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  const p = document.createElement('p');
  p.innerHTML = `WebRTC Stream from SFU: ${c}`;

  card.appendChild(title);
  card.appendChild(video);
  card.appendChild(p);
  VIDEOS.appendChild(card);

  // TODO: Implement WebRTC connection to SFU MediaSoup
  // For now, show placeholder
  log(`Setting up WebRTC for ${c} - SFU connection needed`);
}

// MQTT over WebSocket connection to HiveMQ
const mqttUrl = (window.__APP_CONFIG__ && window.__APP_CONFIG__.MQTT_WS_URL) || 'ws://localhost:8000/mqtt'; // HiveMQ WebSocket endpoint mapping
log(`Connecting to MQTT ${mqttUrl}`);
const client = mqtt.connect(mqttUrl);
client.on('connect', () => {
  log('MQTT connected');
  client.subscribe('cameras/+/detections', (err) => {
    if(err) log('MQTT subscribe error: ' + err);
    else log('Subscribed to cameras/+/detections');
  });
});
client.on('message', (topic, payload) => {
  try{
    const txt = payload.toString();
    const obj = JSON.parse(txt);
    log(`MSG ${topic} => ${JSON.stringify(obj)}`);
  }catch(e){
    log(`MSG ${topic} => ${payload.toString()}`);
  }
});
client.on('error', (e) => log('MQTT error: ' + e));
client.on('close', () => log('MQTT connection closed'));
