const { spawn } = require('child_process');
const EventEmitter = require('events');

class RTSPBridge extends EventEmitter {
    constructor(mediasoupService) {
        super();
        this.mediasoup = mediasoupService;
        this.ffmpegProcesses = new Map();
        this.routers = new Map();
        this.producers = new Map();
        this.rtspUrls = (process.env.RTSP_URLS || '').split(',').filter(url => url.trim());
        this.isRunning = false;
    }
    
    async start() {
        if (this.isRunning) {
            console.log('RTSP Bridge already running');
            return;
        }
        
        try {
            console.log('Starting RTSP Bridge...');
            this.isRunning = true;
            
            // Create a router for RTSP streams
            this.mainRouter = await this.mediasoup.createRouter();
            
            // Start streaming each RTSP URL
            for (let i = 0; i < this.rtspUrls.length; i++) {
                const rtspUrl = this.rtspUrls[i].trim();
                const cameraId = `cam${(i + 1).toString().padStart(2, '0')}`;
                
                await this.startRTSPStream(rtspUrl, cameraId);
            }
            
            console.log(`RTSP Bridge started with ${this.rtspUrls.length} cameras`);
            
        } catch (error) {
            console.error('Failed to start RTSP Bridge:', error);
            this.isRunning = false;
            throw error;
        }
    }
    
    async startRTSPStream(rtspUrl, cameraId) {
        try {
            console.log(`Starting RTSP stream for ${cameraId}: ${rtspUrl}`);
            
            // Create plain transport for receiving RTP from FFmpeg
            const videoTransport = await this.mediasoup.createPlainTransport(
                this.mainRouter,
                '127.0.0.1',
                0 // Let system assign port
            );
            
            const audioTransport = await this.mediasoup.createPlainTransport(
                this.mainRouter,
                '127.0.0.1',
                0 // Let system assign port
            );
            
            // Create producers
            const videoProducer = await videoTransport.produce({
                kind: 'video',
                rtpParameters: {
                    codecs: [
                        {
                            mimeType: 'video/H264',
                            payloadType: 96,
                            clockRate: 90000,
                            parameters: {
                                'packetization-mode': 1,
                                'profile-level-id': '42e01f',
                            },
                        },
                    ],
                    encodings: [
                        {
                            ssrc: 11111111 + parseInt(cameraId.replace('cam', '')),
                        },
                    ],
                },
            });
            
            const audioProducer = await audioTransport.produce({
                kind: 'audio',
                rtpParameters: {
                    codecs: [
                        {
                            mimeType: 'audio/opus',
                            payloadType: 97,
                            clockRate: 48000,
                            channels: 2,
                        },
                    ],
                    encodings: [
                        {
                            ssrc: 22222222 + parseInt(cameraId.replace('cam', '')),
                        },
                    ],
                },
            });
            
            // Store producers
            this.producers.set(`${cameraId}_video`, videoProducer);
            this.producers.set(`${cameraId}_audio`, audioProducer);
            
            // Start FFmpeg process
            await this.startFFmpegProcess(
                rtspUrl,
                cameraId,
                videoTransport.tuple.localPort,
                audioTransport.tuple.localPort
            );
            
            console.log(`RTSP stream started for ${cameraId}`);
            
        } catch (error) {
            console.error(`Failed to start RTSP stream for ${cameraId}:`, error);
        }
    }
    
    async startFFmpegProcess(rtspUrl, cameraId, videoPort, audioPort) {
        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-i', rtspUrl,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-pix_fmt', 'yuv420p',
                '-g', '30',
                '-sc_threshold', '0',
                '-profile:v', 'baseline',
                '-level', '3.1',
                '-s', '640x480',
                '-b:v', '1000k',
                '-maxrate', '1000k',
                '-bufsize', '2000k',
                '-f', 'rtp',
                `rtp://127.0.0.1:${videoPort}`,
                '-c:a', 'libopus',
                '-b:a', '64k',
                '-ac', '2',
                '-ar', '48000',
                '-f', 'rtp',
                `rtp://127.0.0.1:${audioPort}`,
                '-y'
            ];
            
            console.log(`Starting FFmpeg for ${cameraId}:`, ffmpegArgs.join(' '));
            
            const ffmpeg = spawn('ffmpeg', ffmpegArgs);
            
            ffmpeg.stdout.on('data', (data) => {
                console.log(`FFmpeg ${cameraId} stdout:`, data.toString());
            });
            
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Stream mapping:')) {
                    console.log(`FFmpeg ${cameraId} started successfully`);
                    resolve();
                }
                // Log errors but don't reject on warnings
                if (output.includes('error') || output.includes('Error')) {
                    console.error(`FFmpeg ${cameraId} error:`, output);
                }
            });
            
            ffmpeg.on('close', (code) => {
                console.log(`FFmpeg ${cameraId} exited with code ${code}`);
                this.ffmpegProcesses.delete(cameraId);
                
                // Restart FFmpeg if it crashed and we're still running
                if (code !== 0 && this.isRunning) {
                    console.log(`Restarting FFmpeg for ${cameraId} in 5 seconds...`);
                    setTimeout(() => {
                        if (this.isRunning) {
                            this.startFFmpegProcess(rtspUrl, cameraId, videoPort, audioPort);
                        }
                    }, 5000);
                }
            });
            
            ffmpeg.on('error', (error) => {
                console.error(`FFmpeg ${cameraId} spawn error:`, error);
                reject(error);
            });
            
            this.ffmpegProcesses.set(cameraId, ffmpeg);
            
            // Resolve after a short delay if no explicit success message
            setTimeout(resolve, 3000);
        });
    }
    
    getProducers() {
        return Array.from(this.producers.keys());
    }
    
    getProducer(producerId) {
        return this.producers.get(producerId);
    }
    
    async stop() {
        console.log('Stopping RTSP Bridge...');
        this.isRunning = false;
        
        // Kill all FFmpeg processes
        for (const [cameraId, process] of this.ffmpegProcesses) {
            console.log(`Stopping FFmpeg for ${cameraId}`);
            process.kill('SIGTERM');
        }
        
        // Close all producers
        for (const producer of this.producers.values()) {
            producer.close();
        }
        
        // Close router
        if (this.mainRouter) {
            this.mainRouter.close();
        }
        
        this.ffmpegProcesses.clear();
        this.producers.clear();
        
        console.log('RTSP Bridge stopped');
    }
}

module.exports = RTSPBridge;
