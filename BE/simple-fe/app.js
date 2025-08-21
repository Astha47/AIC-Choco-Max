// Simple FE app to play HLS streams and log MQTT detections
const LOG = document.getElementById('log');
const VIDEOS = document.getElementById('videos');

function log(msg){
  const t = new Date().toISOString();
  LOG.innerText = `[${t}] ${msg}\n` + LOG.innerText;
}

// Create 3 video cards for cam01..cam03 via HLS (rtsp-server provides HLS on :9888)
const cams = ['cam01','cam02','cam03'];
for(const c of cams){
  const card = document.createElement('div');
  card.className = 'card';
  const title = document.createElement('h4');
  title.innerText = c;
  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = false;
  video.muted = true;
  video.playsInline = true;

  const hlsUrl = `http://localhost:9888/${c}.m3u8`;
  const p = document.createElement('p');
  p.innerHTML = `HLS: <a href="${hlsUrl}" target="_blank">${hlsUrl}</a>`;

  card.appendChild(title);
  card.appendChild(video);
  card.appendChild(p);
  VIDEOS.appendChild(card);

  if(Hls.isSupported()){
    const hls = new Hls();
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      log(`HLS manifest parsed for ${c}`);
    });
    hls.on(Hls.Events.ERROR, (ev, data) => {
      log(`HLS error for ${c}: ${data.type} ${data.details}`);
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')){
    video.src = hlsUrl;
  } else {
    log('HLS not supported in this browser');
  }
}

// MQTT over WebSocket connection to HiveMQ (ws://localhost:8000)
const mqttUrl = 'ws://localhost:8000/mqtt'; // HiveMQ WebSocket endpoint mapping
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
