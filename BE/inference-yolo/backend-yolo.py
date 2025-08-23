#!/usr/bin/env python3
"""
YOLOv12 Inference Service with RTSP, MQTT, and Database Logging
Supports multiple cameras, WebRTC/SFU integration, and comprehensive fallback handling
"""

import asyncio
import json
import logging
import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import signal

import cv2
import numpy as np
import mysql.connector
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from ultralytics import YOLO
import torch
import psutil

# Load environment variables
load_dotenv()

class Config:
    """Configuration management with environment variables and defaults"""
    
    # RTSP Configuration
    RTSP_URLS = os.getenv('RTSP_URLS', 'rtsp://localhost:8554/cam01').split(',')
    RTSP_RECONNECT_INTERVAL = int(os.getenv('RTSP_RECONNECT_INTERVAL', '5'))
    # Number of cameras to manage (will expand/truncate RTSP_URLS to this length)
    CAMERA_COUNT = int(os.getenv('CAMERA_COUNT', '6'))
    # If a camera fails to connect this many times, it will be marked disabled
    CAMERA_MAX_RETRIES = int(os.getenv('CAMERA_MAX_RETRIES', '6'))
    CAMERA_RETRY_INTERVAL = int(os.getenv('CAMERA_RETRY_INTERVAL', '5'))
    
    # Model Configuration
    MODEL_PATH = os.getenv('MODEL_PATH', './models/yolov12n.pt')
    MODEL_CONFIDENCE = float(os.getenv('MODEL_CONFIDENCE', '0.5'))
    MODEL_IOU_THRESHOLD = float(os.getenv('MODEL_IOU_THRESHOLD', '0.45'))
    # Accepts 'cpu', 'cuda', or 'auto' (auto will pick cuda if available, else cpu)
    MODEL_DEVICE = os.getenv('MODEL_DEVICE', 'auto')
    MODEL_IMGSZ = int(os.getenv('MODEL_IMGSZ', '640'))
    
    # MQTT Configuration
    MQTT_BROKER = os.getenv('MQTT_BROKER', 'localhost')
    MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
    MQTT_USERNAME = os.getenv('MQTT_USERNAME', '')
    MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', '')
    MQTT_CLIENT_ID = os.getenv('MQTT_CLIENT_ID', 'yolo_inference_service')
    MQTT_TOPIC_PREFIX = os.getenv('MQTT_TOPIC_PREFIX', 'cameras')
    MQTT_QOS = int(os.getenv('MQTT_QOS', '1'))
    
    # Database Configuration
    DB_ENABLED = os.getenv('DB_ENABLED', 'false').lower() == 'true'
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = int(os.getenv('DB_PORT', '3307'))
    DB_USER = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_NAME = os.getenv('DB_NAME', 'yolo_detections')
    DB_RECONNECT_INTERVAL = int(os.getenv('DB_RECONNECT_INTERVAL', '10'))
    
    # Performance Configuration
    MAX_WORKERS = int(os.getenv('MAX_WORKERS', '4'))
    FRAME_SKIP = int(os.getenv('FRAME_SKIP', '1'))
    INFERENCE_INTERVAL = float(os.getenv('INFERENCE_INTERVAL', '0.1'))
    
    # SFU Configuration
    SFU_ENABLED = os.getenv('SFU_ENABLED', 'true').lower() == 'true'
    SFU_HOST = os.getenv('SFU_HOST', 'localhost')
    SFU_PORT = int(os.getenv('SFU_PORT', '3000'))
    SFU_SSL = os.getenv('SFU_SSL', 'false').lower() == 'true'
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

class DatabaseManager:
    """MySQL database manager with connection pooling and fallback handling"""
    
    def __init__(self, config: Config):
        self.config = config
        self.connection = None
        self.enabled = config.DB_ENABLED
        self.logger = logging.getLogger(__name__ + '.DatabaseManager')
        
        if self.enabled:
            self._initialize_connection()
    
    def _initialize_connection(self):
        """Initialize database connection with fallback"""
        try:
            self.connection = mysql.connector.connect(
                host=self.config.DB_HOST,
                port=self.config.DB_PORT,
                user=self.config.DB_USER,
                password=self.config.DB_PASSWORD,
                database=self.config.DB_NAME,
                autocommit=True,
                connection_timeout=10
            )
            self.logger.info("Database connection established")
            self._ensure_tables_exist()
        except Exception as e:
            self.logger.error(f"Database connection failed: {e}")
            self.logger.warning("Database logging disabled - service will continue without DB")
            self.enabled = False
    
    def _ensure_tables_exist(self):
        """Create tables if they don't exist"""
        if not self.enabled or not self.connection:
            return
            
        try:
            cursor = self.connection.cursor()
            create_table_query = """
            CREATE TABLE IF NOT EXISTS detections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                camera_id VARCHAR(50) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                frame_seq INT,
                label VARCHAR(100) NOT NULL,
                confidence FLOAT NOT NULL,
                bbox_x_center FLOAT NOT NULL,
                bbox_y_center FLOAT NOT NULL,
                bbox_width FLOAT NOT NULL,
                bbox_height FLOAT NOT NULL,
                INDEX idx_camera_timestamp (camera_id, timestamp),
                INDEX idx_label (label)
            )
            """
            cursor.execute(create_table_query)
            cursor.close()
            self.logger.info("Database tables verified/created")
        except Exception as e:
            self.logger.error(f"Failed to create tables: {e}")
            self.enabled = False
    
    def log_detection(self, camera_id: str, frame_seq: int, label: str, 
                     confidence: float, bbox: List[float]):
        """Log detection to database with fallback"""
        if not self.enabled or not self.connection:
            return
            
        try:
            cursor = self.connection.cursor()
            insert_query = """
            INSERT INTO detections 
            (camera_id, frame_seq, label, confidence, bbox_x_center, bbox_y_center, bbox_width, bbox_height)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(insert_query, (camera_id, frame_seq, label, confidence, *bbox))
            cursor.close()
        except Exception as e:
            self.logger.error(f"Failed to log detection: {e}")
            # Attempt reconnection
            self._initialize_connection()

class MQTTManager:
    """MQTT client manager with automatic reconnection"""
    
    def __init__(self, config: Config):
        self.config = config
        self.client = mqtt.Client(client_id=config.MQTT_CLIENT_ID)
        self.connected = False
        self.logger = logging.getLogger(__name__ + '.MQTTManager')
        
        self._setup_callbacks()
        self._connect()
    
    def _setup_callbacks(self):
        """Setup MQTT callbacks"""
        def on_connect(client, userdata, flags, rc):
            if rc == 0:
                self.connected = True
                self.logger.info("MQTT connected successfully")
            else:
                self.logger.error(f"MQTT connection failed with code {rc}")
        
        def on_disconnect(client, userdata, rc):
            self.connected = False
            self.logger.warning("MQTT disconnected")
        
        self.client.on_connect = on_connect
        self.client.on_disconnect = on_disconnect
    
    def _connect(self):
        """Connect to MQTT broker with fallback"""
        try:
            if self.config.MQTT_USERNAME:
                self.client.username_pw_set(self.config.MQTT_USERNAME, self.config.MQTT_PASSWORD)
            
            self.client.connect(self.config.MQTT_BROKER, self.config.MQTT_PORT, 60)
            self.client.loop_start()
        except Exception as e:
            self.logger.error(f"MQTT connection failed: {e}")
            self.connected = False
    
    def publish_detection(self, camera_id: str, detections: List[Dict]):
        """Publish detection results to MQTT"""
        if not self.connected:
            self.logger.warning("MQTT not connected, attempting reconnection")
            self._connect()
            return
        
        try:
            topic = f"{self.config.MQTT_TOPIC_PREFIX}/{camera_id}/detections"
            payload = {
                "camera_id": camera_id,
                "timestamp": int(time.time() * 1000),
                "detections": detections
            }
            
            result = self.client.publish(topic, json.dumps(payload), qos=self.config.MQTT_QOS)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                self.logger.error(f"Failed to publish to MQTT: {result.rc}")
        except Exception as e:
            self.logger.error(f"MQTT publish error: {e}")

class YOLOInference:
    """YOLOv12 inference engine with model fallback"""
    
    def __init__(self, config: Config):
        self.config = config
        self.model = None
        self.logger = logging.getLogger(__name__ + '.YOLOInference')
        self.device = config.MODEL_DEVICE
        
        self._load_model()
    
    def _load_model(self):
        """Load YOLO model with fallback handling"""
        try:
            # Check if model file exists
            model_path = Path(self.config.MODEL_PATH)
            if not model_path.exists():
                self.logger.warning(f"Model file not found: {model_path}")
                self._download_fallback_model()

            # If a fallback was downloaded, refresh the model_path to point to it
            model_path = Path(self.config.MODEL_PATH)

            # Determine runtime device with safe fallback
            requested = str(self.device).lower()
            if requested == 'auto':
                device = 'cuda' if torch.cuda.is_available() else 'cpu'
            else:
                # If user requested cuda but no GPU is available, fall back to cpu
                if requested.startswith('cuda') and not torch.cuda.is_available():
                    self.logger.warning("Requested CUDA device but no GPU available; falling back to CPU")
                    device = 'cpu'
                else:
                    device = requested

            # If a fallback model object was created during download, use it directly
            if hasattr(self, '_fallback_model_obj') and self._fallback_model_obj is not None:
                self.model = self._fallback_model_obj
            else:
                # Load model from file/path
                self.model = YOLO(str(model_path))
            try:
                self.model.to(device)
                self.logger.info(f"YOLO model loaded successfully on {device}")
            except Exception as e:
                # If moving to the requested device fails, fallback to CPU
                self.logger.warning(f"Failed moving model to {device}: {e}; falling back to CPU")
                try:
                    self.model.to('cpu')
                    device = 'cpu'
                    self.logger.info("YOLO model moved to CPU successfully")
                except Exception as e2:
                    self.logger.error(f"Failed to move model to CPU as fallback: {e2}")
                    raise
            
            # Warm up model
            dummy_img = np.zeros((640, 640, 3), dtype=np.uint8)
            self.model.predict(dummy_img, verbose=False)
            self.logger.info("Model warmed up successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to load YOLO model: {e}")
            self.model = None
    
    def _download_fallback_model(self):
        """Download YOLOv8n as fallback if YOLOv12n not available"""
        try:
            self.logger.info("Downloading fallback model (YOLOv8n)...")
            # Create models directory
            models_dir = Path(self.config.MODEL_PATH).parent
            models_dir.mkdir(exist_ok=True)
            
            # Download YOLOv8n as fallback
            # Downloading the model via YOLO(...) returns a model object; keep it in-memory
            fallback_model = YOLO('yolov8n.pt')

            # Store the model object so _load_model can use it directly and avoid cross-filesystem moves
            self._fallback_model_obj = fallback_model

            # Point MODEL_PATH to the filename as a hint (not required when using the object)
            self.config.MODEL_PATH = 'yolov8n.pt'
            self.logger.info(f"Fallback model available as in-memory object and path set to: {self.config.MODEL_PATH}")
            
        except Exception as e:
            self.logger.error(f"Failed to download fallback model: {e}")
    
    def predict(self, frame: np.ndarray) -> List[Dict]:
        """Run inference on frame"""
        if self.model is None:
            return []
        
        try:
            results = self.model.predict(
                frame,
                conf=self.config.MODEL_CONFIDENCE,
                iou=self.config.MODEL_IOU_THRESHOLD,
                imgsz=self.config.MODEL_IMGSZ,
                verbose=False
            )
            
            detections = []
            if results and len(results) > 0:
                result = results[0]
                if result.boxes is not None:
                    boxes = result.boxes
                    for i in range(len(boxes)):
                        box = boxes.xywhn[i].cpu().numpy()  # normalized xywh
                        conf = float(boxes.conf[i].cpu().numpy())
                        cls = int(boxes.cls[i].cpu().numpy())
                        label = self.model.names[cls]
                        
                        detection = {
                            "label": label,
                            "confidence": conf,
                            "bbox": [float(x) for x in box]  # [x_center, y_center, width, height]
                        }
                        detections.append(detection)
            
            return detections
            
        except Exception as e:
            self.logger.error(f"Inference error: {e}")
            return []

class CameraManager:
    """RTSP camera manager with reconnection handling"""
    
    def __init__(self, rtsp_url: str, camera_id: str, max_retries: int = 6, retry_interval: int = 5):
        self.rtsp_url = rtsp_url
        self.camera_id = camera_id
        self.cap = None
        self.connected = False
        self.frame_count = 0
        self.logger = logging.getLogger(__name__ + f'.Camera.{camera_id}')

        # Auto-disable handling
        self.failure_count = 0
        self.max_retries = max_retries
        self.retry_interval = retry_interval
        self.disabled = False

        self._connect()
    
    def _connect(self):
        """Connect to RTSP stream"""
        try:
            self.cap = cv2.VideoCapture(self.rtsp_url)
            if self.cap.isOpened():
                self.connected = True
                self.failure_count = 0
                self.logger.info(f"Connected to camera: {self.rtsp_url}")
            else:
                self.connected = False
                self.failure_count += 1
                self.logger.error(f"Failed to connect to camera: {self.rtsp_url} (failure {self.failure_count}/{self.max_retries})")
                if self.failure_count >= self.max_retries:
                    self.disabled = True
                    self.logger.warning(f"Camera {self.camera_id} disabled after {self.failure_count} failed attempts")
        except Exception as e:
            self.logger.error(f"Camera connection error: {e}")
            self.connected = False
            self.failure_count += 1
            if self.failure_count >= self.max_retries:
                self.disabled = True
                self.logger.warning(f"Camera {self.camera_id} disabled after repeated connection errors")
    
    def read_frame(self) -> Optional[np.ndarray]:
        """Read frame from camera with reconnection handling"""
        if self.disabled:
            # Camera permanently disabled; do not attempt further reads
            return None

        if not self.connected:
            # Try to reconnect but don't block long here
            self._connect()
            # If still not connected, wait a bit before next attempt
            if not self.connected:
                time.sleep(self.retry_interval)
            return None
        
        try:
            ret, frame = self.cap.read()
            if ret:
                self.frame_count += 1
                return frame
            else:
                self.logger.warning("Failed to read frame, reconnecting...")
                self.connected = False
                return None
        except Exception as e:
            self.logger.error(f"Frame read error: {e}")
            self.connected = False
            return None
    
    def release(self):
        """Release camera resources"""
        if self.cap:
            self.cap.release()
            self.connected = False
        # Mark camera as disabled when resources are released
        self.disabled = True


class ProcessPublisher:
    """Publish processed frames to RTSP server using FFmpeg via stdin.

    Usage: create per-camera publisher; call write_frame(bgr_frame) for each
    processed frame. Publisher is started lazily when first frame arrives.
    """
    def __init__(self, camera_id: str, rtsp_host: str = 'rtsp-server', rtsp_port: int = 8554):
        self.camera_id = camera_id
        self.rtsp_host = rtsp_host
        self.rtsp_port = rtsp_port
        self.process = None
        self.width = None
        self.height = None
        self.framerate = 15

    def start(self, width: int, height: int):
        if self.process:
            return
        self.width = width
        self.height = height
        path = f"rtsp://{self.rtsp_host}:{self.rtsp_port}/{self.camera_id}_proc"

        ffmpeg_cmd = [
            'ffmpeg',
            '-y',
            '-f', 'rawvideo',
            '-pix_fmt', 'bgr24',
            '-s', f'{self.width}x{self.height}',
            '-r', str(self.framerate),
            '-i', '-',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-pix_fmt', 'yuv420p',
            '-g', '30',  # keyframe every 30 frames
            '-b:v', '1M',  # 1Mbps bitrate
            '-maxrate', '1M',
            '-bufsize', '2M',
            '-f', 'rtsp',
            '-rtsp_transport', 'tcp',  # force TCP instead of UDP
            path
        ]

        try:
            import subprocess
            logging.getLogger(__name__).info(f"Starting ProcessPublisher for {self.camera_id}_proc: {' '.join(ffmpeg_cmd)}")
            self.process = subprocess.Popen(
                ffmpeg_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE
            )
            
            # Log stderr for debugging
            def _log_stderr(stderr):
                try:
                    for line in stderr:
                        line_str = line.decode('utf-8', errors='ignore').strip()
                        if line_str:
                            logging.getLogger(__name__).debug(f"FFmpeg {self.camera_id}_proc: {line_str}")
                except Exception:
                    pass

            import threading
            if self.process.stderr:
                t = threading.Thread(target=_log_stderr, args=(self.process.stderr,), daemon=True)
                t.start()
            logging.getLogger(__name__).info(f"ProcessPublisher started for {self.camera_id}_proc")
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to start publisher for {self.camera_id}: {e}")
            self.process = None

    def write_frame(self, frame) -> bool:
        """Write a BGR frame (numpy array) to ffmpeg stdin. Returns False on failure."""
        if frame is None:
            return False
        h, w = frame.shape[:2]
        if not self.process:
            logging.getLogger(__name__).info(f"Starting ProcessPublisher on first frame for {self.camera_id}_proc ({w}x{h})")
            self.start(w, h)
            if not self.process:
                logging.getLogger(__name__).error(f"ProcessPublisher failed to start for {self.camera_id}_proc")
                return False

        try:
            # Ensure frame size matches
            if w != self.width or h != self.height:
                # If size changed, restart process with new size
                self.stop()
                self.start(w, h)
                if not self.process:
                    return False

            # Write raw BGR bytes
            try:
                self.process.stdin.write(frame.tobytes())
                # flush to ensure ffmpeg receives the input promptly and to detect broken pipes
                try:
                    self.process.stdin.flush()
                except Exception:
                    pass
            except BrokenPipeError:
                logging.getLogger(__name__).warning(f"Broken pipe when writing frame for {self.camera_id}_proc - restarting publisher")
                # Attempt to restart publisher once
                self.stop()
                self.start(w, h)
                if not self.process:
                    return False
                try:
                    self.process.stdin.write(frame.tobytes())
                    try:
                        self.process.stdin.flush()
                    except Exception:
                        pass
                except Exception as e:
                    logging.getLogger(__name__).error(f"Retry write failed for {self.camera_id}_proc: {e}")
                    return False
            return True
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to write frame for {self.camera_id}: {e}")
            # If any write error happens, ensure the process is stopped so future writes will recreate it
            try:
                self.stop()
            except Exception:
                pass
            return False

    def stop(self):
        try:
            if self.process:
                try:
                    if self.process.stdin:
                        self.process.stdin.close()
                except Exception:
                    pass
                try:
                    self.process.terminate()
                except Exception:
                    pass
                self.process = None
        except Exception:
            pass

class InferenceService:
    """Main inference service orchestrator"""
    
    def __init__(self):
        self.config = Config()
        self.logger = self._setup_logging()
        self.running = False
        # Start a lightweight HTTP health endpoint used by the Docker healthcheck
        try:
            self._start_health_server()
        except Exception as e:
            # Don't fail service init if health server can't start
            self.logger.warning(f"Failed to start health server: {e}")
        
        # Initialize components
        self.db_manager = DatabaseManager(self.config)
        self.mqtt_manager = MQTTManager(self.config)
        self.yolo = YOLOInference(self.config)
        self.cameras: Dict[str, CameraManager] = {}
        self.executor = ThreadPoolExecutor(max_workers=self.config.MAX_WORKERS)
        
        # Performance monitoring
        self.fps_counters = {}
        self.last_fps_check = time.time()
        
        self._setup_signal_handlers()
    
    def _setup_logging(self):
        """Setup logging configuration"""
        logging.basicConfig(
            level=getattr(logging, self.config.LOG_LEVEL),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        logger = logging.getLogger(__name__)
        logger.info("Inference service initializing...")
        return logger
    
    def _setup_signal_handlers(self):
        """Setup graceful shutdown signal handlers"""
        def signal_handler(signum, frame):
            self.logger.info(f"Received signal {signum}, shutting down...")
            self.stop()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

    def _start_health_server(self):
        """Start a minimal HTTP health server using built-in http.server.

        The Dockerfile healthcheck polls http://localhost:8000/health, so this
        exposes that endpoint on 0.0.0.0:8000 inside the container.
        """
        import http.server
        import socketserver
        from urllib.parse import urlparse

        class HealthHandler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == '/health':
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"status": "ok"}')
                else:
                    self.send_response(404)
                    self.end_headers()
            
            def log_message(self, format, *args):
                # Suppress default logging to avoid spam
                pass

        def _run():
            try:
                with socketserver.TCPServer(("0.0.0.0", 8000), HealthHandler) as httpd:
                    httpd.serve_forever()
            except Exception as e:
                self.logger.error(f"Health server error: {e}")

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        self.logger.info("Health server started on 0.0.0.0:8000")
    
    def _initialize_cameras(self):
        """Initialize camera connections"""
        # Ensure RTSP_URLS length matches CAMERA_COUNT by padding/truncating
        urls = [u.strip() for u in self.config.RTSP_URLS if u.strip()]
        # If provided urls are fewer than CAMERA_COUNT, generate template urls
        for idx in range(len(urls), self.config.CAMERA_COUNT):
            # Default template: replace trailing number if present, else append index
            default_url = f"rtsp://rtsp-server:8554/cam{idx+1:02d}"
            urls.append(default_url)

        # Truncate if too many
        urls = urls[: self.config.CAMERA_COUNT]

        for i, rtsp_url in enumerate(urls):
            camera_id = f"cam{i+1:02d}"
            self.cameras[camera_id] = CameraManager(
                rtsp_url, camera_id,
                max_retries=self.config.CAMERA_MAX_RETRIES,
                retry_interval=self.config.CAMERA_RETRY_INTERVAL,
            )
            self.fps_counters[camera_id] = {"count": 0, "last_time": time.time()}
    
    def _process_camera(self, camera_id: str):
        """Process frames from a single camera"""
        camera = self.cameras[camera_id]
        frame_skip_counter = 0
        # Publisher for processed frames (streams to rtsp-server as <camera_id>_proc)
        publisher = ProcessPublisher(camera_id, rtsp_host='rtsp-server', rtsp_port=8554)

        while self.running:
            try:
                # Exit the loop if camera has been auto-disabled
                if camera.disabled:
                    self.logger.info(f"Camera {camera_id} is disabled; stopping processing thread")
                    return
                frame = camera.read_frame()
                if frame is None:
                    time.sleep(self.config.RTSP_RECONNECT_INTERVAL)
                    continue
                
                # Frame skipping for performance
                frame_skip_counter += 1
                if frame_skip_counter % (self.config.FRAME_SKIP + 1) != 0:
                    continue
                
                # Run inference
                detections = self.yolo.predict(frame)
                
                # Update FPS counter
                self._update_fps_counter(camera_id)
                
                if detections:
                    self.logger.debug(f"Camera {camera_id}: {len(detections)} detections")

                    # Publish to MQTT
                    self.mqtt_manager.publish_detection(camera_id, detections)

                    # Log to database
                    for detection in detections:
                        self.db_manager.log_detection(
                            camera_id,
                            camera.frame_count,
                            detection["label"],
                            detection["confidence"],
                            detection["bbox"]
                        )

                # Draw boxes on frame for publishing to SFU
                try:
                    import cv2
                    for det in detections:
                        x_center, y_center, w_norm, h_norm = det['bbox']
                        h, w = frame.shape[:2]
                        x = int((x_center - w_norm/2) * w)
                        y = int((y_center - h_norm/2) * h)
                        ww = int(w_norm * w)
                        hh = int(h_norm * h)
                        cv2.rectangle(frame, (x, y), (x+ww, y+hh), (0,255,0), 2)
                        cv2.putText(frame, f"{det['label']}:{det['confidence']:.2f}", (x, max(0,y-6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 1)
                except Exception as e:
                    self.logger.debug(f"Failed to draw boxes for {camera_id}: {e}")

                # Always stream processed frame to RTSP server (with or without detections)
                try:
                    success = publisher.write_frame(frame)
                    if not success:
                        self.logger.debug(f"Failed to stream frame for {camera_id}")
                except Exception as e:
                    self.logger.debug(f"Exception streaming frame for {camera_id}: {e}")
                
                # Rate limiting
                time.sleep(self.config.INFERENCE_INTERVAL)
                
            except Exception as e:
                self.logger.error(f"Error processing camera {camera_id}: {e}")
                time.sleep(1)
    
    def _update_fps_counter(self, camera_id: str):
        """Update FPS counter for monitoring"""
        current_time = time.time()
        self.fps_counters[camera_id]["count"] += 1
        
        if current_time - self.last_fps_check > 30:  # Log every 30 seconds
            self._log_performance_stats()
            self.last_fps_check = current_time
    
    def _log_performance_stats(self):
        """Log performance statistics"""
        current_time = time.time()
        
        for camera_id, counter in self.fps_counters.items():
            elapsed = current_time - counter["last_time"]
            if elapsed > 0:
                fps = counter["count"] / elapsed
                self.logger.info(f"Camera {camera_id}: {fps:.2f} FPS")
                counter["count"] = 0
                counter["last_time"] = current_time
        
        # System resource usage
        cpu_percent = psutil.cpu_percent()
        memory_percent = psutil.virtual_memory().percent
        self.logger.info(f"System: CPU {cpu_percent:.1f}%, Memory {memory_percent:.1f}%")
    
    def start(self):
        """Start the inference service"""
        self.logger.info("Starting inference service...")
        self.running = True
        
        # Initialize cameras
        self._initialize_cameras()
        
        # Check if any cameras are connected
        connected_cameras = [cid for cid, cam in self.cameras.items() if cam.connected]
        if not connected_cameras:
            self.logger.warning("No cameras connected - service will retry connections")
        else:
            self.logger.info(f"Connected cameras: {connected_cameras}")
        
        # Start processing threads for each camera
        futures = []
        for camera_id in self.cameras:
            future = self.executor.submit(self._process_camera, camera_id)
            futures.append(future)
        
        self.logger.info("Inference service started successfully")
        
        # Wait for all threads
        try:
            for future in futures:
                future.result()
        except KeyboardInterrupt:
            self.stop()
    
    def stop(self):
        """Stop the inference service"""
        self.logger.info("Stopping inference service...")
        self.running = False
        
        # Release camera resources
        for camera in self.cameras.values():
            camera.release()
        
        # Shutdown executor
        self.executor.shutdown(wait=True)
        
        # Disconnect MQTT
        if self.mqtt_manager.connected:
            self.mqtt_manager.client.loop_stop()
            self.mqtt_manager.client.disconnect()
        
        # Close database connection
        if self.db_manager.connection:
            self.db_manager.connection.close()
        
        self.logger.info("Inference service stopped")

def main():
    """Main entry point"""
    service = InferenceService()
    
    try:
        service.start()
    except KeyboardInterrupt:
        service.logger.info("Service interrupted by user")
    except Exception as e:
        service.logger.error(f"Service error: {e}")
    finally:
        service.stop()

if __name__ == "__main__":
    main()
