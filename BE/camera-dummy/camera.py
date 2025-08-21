#!/usr/bin/env python3
"""
Camera Dummy RTSP Streaming
Mensimulasikan beberapa kamera dengan melakukan streaming video dari folder samples
menggunakan protokol RTSP
"""

import cv2
import os
import glob
import threading
import time
import logging
import argparse
import subprocess
import signal
import sys
from pathlib import Path
try:
    import numpy as np
except Exception:
    np = None

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class RTSPCameraDummy:
    def __init__(self, video_path, camera_id, rtsp_port=8554, max_fps=None, rtsp_host='localhost'):
        self.video_path = video_path
        self.camera_id = camera_id
        self.rtsp_port = rtsp_port
        self.rtsp_host = rtsp_host
        # Optional maximum FPS cap for this camera (None = no cap)
        self.max_fps = max_fps
        self.running = False
        self.thread = None
        self.process = None
        
    def start_rtsp_server(self):
        """Start RTSP server using FFmpeg"""
        try:
            # RTSP URL untuk kamera ini (use consistent /camXX path)
            rtsp_url = f"rtsp://{self.rtsp_host}:{self.rtsp_port}/cam{int(self.camera_id):02d}"
            
            # Command FFmpeg untuk streaming RTSP
            cmd = [
                'ffmpeg',
                '-re',  # Read input at native frame rate
                '-stream_loop', '-1',  # Loop infinitely
                '-i', self.video_path,  # Input video file
                '-c:v', 'libx264',  # Video codec
                '-preset', 'ultrafast',  # Encoding preset
                '-tune', 'zerolatency',  # Low latency tuning
            ]

            # If a max_fps limit is provided, request ffmpeg to output at that rate
            if self.max_fps is not None:
                try:
                    mf = int(self.max_fps)
                    if mf > 0:
                        cmd += ['-r', str(mf)]
                        logger.info(f"Capping FFmpeg output to {mf} FPS for camera {self.camera_id}")
                except (TypeError, ValueError):
                    logger.warning(f"Invalid max_fps value: {self.max_fps}")

            cmd += [
                '-f', 'rtsp',  # Output format
                rtsp_url  # Output RTSP URL
            ]
            
            logger.info(f"Starting RTSP server for camera {self.camera_id}")
            logger.info(f"Video: {os.path.basename(self.video_path)}")
            logger.info(f"RTSP URL: {rtsp_url}")
            
            # Start FFmpeg process
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            
            return rtsp_url
            
        except Exception as e:
            logger.error(f"Error starting RTSP server for camera {self.camera_id}: {e}")
            return None
    
    def start_opencv_streaming(self):
        """Alternative method using OpenCV for streaming"""
        try:
            cap = cv2.VideoCapture(self.video_path)
            
            if not cap.isOpened():
                logger.error(f"Cannot open video file: {self.video_path}")
                return
            
            # Get video properties
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            if fps <= 0:
                fps = 30

            # Determine effective FPS considering optional max_fps
            effective_fps = fps
            if self.max_fps is not None:
                try:
                    mf = int(self.max_fps)
                    if mf > 0:
                        effective_fps = min(fps, mf)
                        logger.info(f"Camera {self.camera_id} effective FPS capped to {effective_fps} (source: {fps})")
                except (TypeError, ValueError):
                    logger.warning(f"Invalid max_fps value: {self.max_fps}")

            frame_delay = 1.0 / effective_fps

            logger.info(f"Camera {self.camera_id} streaming started - source FPS: {fps}, effective FPS: {effective_fps}")
            
            while self.running:
                ret, frame = cap.read()
                
                if not ret:
                    # Restart video from beginning
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                
                # Add camera ID overlay
                cv2.putText(frame, f"Camera {self.camera_id}", (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                # Add timestamp
                timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                cv2.putText(frame, timestamp, (10, frame.shape[0] - 10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                
                # Here you would typically send the frame to RTSP server
                # For now, we'll just simulate the streaming
                time.sleep(frame_delay)
            
            cap.release()
            
        except Exception as e:
            logger.error(f"Error in OpenCV streaming for camera {self.camera_id}: {e}")
    
    def start(self, use_ffmpeg=True):
        """Start the camera streaming"""
        self.running = True
        
        if use_ffmpeg:
            return self.start_rtsp_server()
        else:
            self.thread = threading.Thread(target=self.start_opencv_streaming)
            self.thread.daemon = True
            self.thread.start()
            return f"opencv://cam{int(self.camera_id):02d}"
    
    def stop(self):
        """Stop the camera streaming"""
        self.running = False
        
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5)
            
        logger.info(f"Camera {self.camera_id} stopped")

class CameraDummyManager:
    def __init__(self, samples_dir="./samples", base_port=8554, max_fps=None, rtsp_server=None):
        self.samples_dir = samples_dir
        self.base_port = base_port
        # Optional global cap for camera output FPS
        self.max_fps = max_fps
        # RTSP server host:port (if provided as env var RTSP_SERVER)
        # Expected format: host:port or rtsp://host:port
        self.rtsp_server = rtsp_server or os.getenv('RTSP_SERVER', None)
        self.rtsp_host = 'localhost'
        self.rtsp_port = self.base_port
        if self.rtsp_server:
            # normalize
            server = self.rtsp_server
            if server.startswith('rtsp://'):
                server = server[len('rtsp://'):]
            if ':' in server:
                host, port = server.split(':', 1)
                self.rtsp_host = host
                try:
                    self.rtsp_port = int(port)
                except ValueError:
                    self.rtsp_port = self.base_port
            else:
                self.rtsp_host = server
                self.rtsp_port = self.base_port
        self.cameras = []
        self.running = False
        
    def discover_video_files(self):
        """Discover video files in samples directory"""
        video_extensions = ['*.mp4', '*.avi', '*.mov', '*.mkv', '*.wmv', '*.flv']
        video_files = []
        
        if not os.path.exists(self.samples_dir):
            logger.warning(f"Samples directory not found: {self.samples_dir}")
            return video_files
        
        for ext in video_extensions:
            pattern = os.path.join(self.samples_dir, ext)
            video_files.extend(glob.glob(pattern))
        
        # Sort files naturally (1.mp4, 2.mp4, etc.)
        video_files.sort(key=lambda x: os.path.basename(x))
        
        logger.info(f"Found {len(video_files)} video files")
        for i, video in enumerate(video_files):
            logger.info(f"  {i+1}. {os.path.basename(video)}")
        
        return video_files
    
    def create_sample_videos(self):
        """Create sample video files for testing"""
        os.makedirs(self.samples_dir, exist_ok=True)
        
        logger.info("Creating sample video files for testing...")
        
        # Create simple test videos using OpenCV
        for i in range(1, 4):  # Create 3 sample videos
            video_path = os.path.join(self.samples_dir, f"{i}.mp4")
            
            if os.path.exists(video_path):
                logger.info(f"Sample video {i}.mp4 already exists")
                continue
            
            # Create a simple colored video
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(video_path, fourcc, 30.0, (640, 480))
            
            # Generate 300 frames (10 seconds at 30 FPS)
            for frame_num in range(300):
                # Create colored frame
                if i == 1:
                    color = (0, 0, 255)  # Red
                elif i == 2:
                    color = (0, 255, 0)  # Green
                else:
                    color = (255, 0, 0)  # Blue
                
                frame = np.full((480, 640, 3), color, dtype=np.uint8)
                
                # Add frame number
                cv2.putText(frame, f"Video {i} - Frame {frame_num}", 
                           (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                
                writer.write(frame)
            
            writer.release()
            logger.info(f"Created sample video: {video_path}")
    
    def start_all_cameras(self, use_ffmpeg=True):
        """Start all camera streams"""
        video_files = self.discover_video_files()
        if not video_files:
            logger.warning("No video files found. Creating sample videos...")
            self.create_sample_videos()
            video_files = self.discover_video_files()

        if not video_files:
            logger.error("Still no video files found. Cannot start cameras.")
            return
        
        # Auto-detect number of cameras from available video files
        num_cameras = len(video_files)

        if num_cameras <= 0:
            logger.error("No video files available to start cameras.")
            return []

        self.running = True
        rtsp_urls = []

        logger.info(f"Starting {num_cameras} camera streams...")
        
        # If fewer video files than requested cameras, reuse videos cyclically
        for i in range(num_cameras):
            video_file = video_files[i % len(video_files)]
            camera_id = i + 1
            # Use consistent RTSP server host and port for all cameras
            port = self.rtsp_port
            
            camera = RTSPCameraDummy(
                video_file,
                camera_id,
                rtsp_port=port,
                max_fps=self.max_fps,
                rtsp_host=self.rtsp_host
            )
            rtsp_url = camera.start(use_ffmpeg)
            
            if rtsp_url:
                self.cameras.append(camera)
                rtsp_urls.append(rtsp_url)
                logger.info(f"Camera {camera_id} started successfully")
            else:
                logger.error(f"Failed to start camera {camera_id}")
        
        # Display all RTSP URLs
        logger.info("\n" + "="*50)
        logger.info("RTSP STREAMING URLS:")
        logger.info("="*50)
        for i, url in enumerate(rtsp_urls):
            logger.info(f"Camera {i+1}: {url}")
        logger.info("="*50)
        
        return rtsp_urls
    
    def stop_all_cameras(self):
        """Stop all camera streams"""
        logger.info("Stopping all cameras...")
        self.running = False
        
        for camera in self.cameras:
            camera.stop()
        
        self.cameras.clear()
        logger.info("All cameras stopped")
    
    def run(self, use_ffmpeg=True):
        """Run the camera dummy manager"""
        try:
            rtsp_urls = self.start_all_cameras(use_ffmpeg)
            
            if not rtsp_urls:
                logger.error("No cameras started successfully")
                return
            
            logger.info("Camera dummy is running. Press Ctrl+C to stop...")
            
            # Keep running until interrupted
            while self.running:
                time.sleep(1)
                
        except KeyboardInterrupt:
            logger.info("Received interrupt signal...")
        except Exception as e:
            logger.error(f"Error in camera manager: {e}")
        finally:
            self.stop_all_cameras()

def signal_handler(signum, frame):
    """Handle interrupt signals"""
    logger.info("Received signal to stop...")
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description='RTSP Camera Dummy Simulator')
    parser.add_argument('--samples-dir', default='./samples', 
                       help='Directory containing video samples (default: ./samples)')
    parser.add_argument('--base-port', type=int, default=8554,
                       help='Base RTSP port (default: 8554)')
    parser.add_argument('--use-opencv', action='store_true',
                       help='Use OpenCV instead of FFmpeg for streaming')
    parser.add_argument('--create-samples', action='store_true',
                       help='Create sample video files for testing')
    parser.add_argument('--max-fps', type=int, default=None,
                       help='Optional maximum output FPS for streaming (default: no limit)')
    
    args = parser.parse_args()
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Create manager
    rtsp_server_env = os.getenv('RTSP_SERVER', None)
    manager = CameraDummyManager(args.samples_dir, args.base_port, max_fps=args.max_fps, rtsp_server=rtsp_server_env)
    
    if args.create_samples:
        manager.create_sample_videos()
        logger.info("Sample videos created. Run without --create-samples to start streaming.")
        return
    
    # Check if FFmpeg is available
    use_ffmpeg = not args.use_opencv
    if use_ffmpeg:
        try:
            subprocess.run(['ffmpeg', '-version'], 
                         stdout=subprocess.DEVNULL, 
                         stderr=subprocess.DEVNULL, 
                         check=True)
            logger.info("FFmpeg found. Using FFmpeg for RTSP streaming.")
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.warning("FFmpeg not found. Falling back to OpenCV method.")
            use_ffmpeg = False
    
    # Run the camera manager
    manager.run(use_ffmpeg)

if __name__ == "__main__":
    main()