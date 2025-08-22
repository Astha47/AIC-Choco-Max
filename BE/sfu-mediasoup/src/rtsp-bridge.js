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

            // Limit maximum cameras to 6
            const maxCams = 6;
            const urlsToStart = this.rtspUrls.slice(0, maxCams);

            // Start streaming each RTSP URL (or set up retry polling if currently unavailable)
            for (let i = 0; i < urlsToStart.length; i++) {
                const rtspUrl = urlsToStart[i].trim();
                const cameraId = `cam${(i + 1).toString().padStart(2, '0')}`;

                // Start but don't block other cameras; startRTSPStream will manage retries
                this.startRTSPStream(rtspUrl, cameraId);
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

            // Maintain per-camera state
            if (!this.routers.has(cameraId)) {
                this.routers.set(cameraId, {});
            }
            const state = this.routers.get(cameraId);

            // Check stream availability first (fast probe). If not available, poll and retry.
            const available = await this.checkStreamAvailable(rtspUrl);
            if (!available) {
                console.log(`No signal for ${cameraId} (${rtspUrl}) - will poll and retry`);

                // Clear previous retry if any
                if (state.retryTimer) clearInterval(state.retryTimer);

                state.retryTimer = setInterval(async () => {
                    if (!this.isRunning) return;
                    const ok = await this.checkStreamAvailable(rtspUrl);
                    if (ok) {
                        clearInterval(state.retryTimer);
                        state.retryTimer = null;
                        console.log(`Signal detected for ${cameraId}, starting stream...`);
                        this.startRTSPStream(rtspUrl, cameraId);
                    }
                }, 10000);

                this.routers.set(cameraId, state);
                return;
            }

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

            state.videoTransport = videoTransport;
            state.audioTransport = audioTransport;

            // Start FFmpeg process and wait until it is actually pushing streams
            const ffmpeg = await this.startFFmpegProcess(
                rtspUrl,
                cameraId,
                videoTransport.tuple.localPort,
                audioTransport.tuple.localPort
            );

            state.ffmpeg = ffmpeg;

            // Once FFmpeg is running, create producers
            try {
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
                state.videoProducer = videoProducer;
                state.audioProducer = audioProducer;

                console.log(`RTSP stream started for ${cameraId}`);
            } catch (err) {
                console.error(`Failed to create producers for ${cameraId}:`, err);
                // Clean up transports and ffmpeg
                try { videoTransport.close(); } catch (e) {}
                try { audioTransport.close(); } catch (e) {}
                if (state.ffmpeg) {
                    try { state.ffmpeg.kill('SIGTERM'); } catch (e) {}
                    state.ffmpeg = null;
                }
                // Start a retry loop
                if (this.isRunning) {
                    if (state.retryTimer) clearInterval(state.retryTimer);
                    state.retryTimer = setInterval(async () => {
                        if (!this.isRunning) return;
                        const ok = await this.checkStreamAvailable(rtspUrl);
                        if (ok) {
                            clearInterval(state.retryTimer);
                            state.retryTimer = null;
                            this.startRTSPStream(rtspUrl, cameraId);
                        }
                    }, 10000);
                }
                this.routers.set(cameraId, state);
            }
            
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
            
            let started = false;
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                // Detect FFmpeg started streaming
                if (!started && (output.includes('Stream mapping:') || output.includes('Press [q] to stop'))) {
                    started = true;
                    console.log(`FFmpeg ${cameraId} started successfully`);
                    resolve(ffmpeg);
                }
                // Log errors but don't reject on warnings
                if (output.toLowerCase().includes('error')) {
                    console.error(`FFmpeg ${cameraId} error:`, output);
                }
            });
            
            ffmpeg.on('close', (code) => {
                console.log(`FFmpeg ${cameraId} exited with code ${code}`);
                this.ffmpegProcesses.delete(cameraId);

                // Clean up producers/transports for this camera
                const state = this.routers.get(cameraId) || {};
                try {
                    if (state.videoProducer) {
                        state.videoProducer.close();
                        this.producers.delete(`${cameraId}_video`);
                        state.videoProducer = null;
                    }
                } catch (e) {}
                try {
                    if (state.audioProducer) {
                        state.audioProducer.close();
                        this.producers.delete(`${cameraId}_audio`);
                        state.audioProducer = null;
                    }
                } catch (e) {}
                try { if (state.videoTransport) state.videoTransport.close(); } catch (e) {}
                try { if (state.audioTransport) state.audioTransport.close(); } catch (e) {}
                state.videoTransport = null;
                state.audioTransport = null;

                // Restart/poll if it crashed and we're still running
                if (this.isRunning) {
                    console.log(`Will poll for ${cameraId} to come back in 10s...`);
                    if (state.retryTimer) clearInterval(state.retryTimer);
                    state.retryTimer = setInterval(async () => {
                        if (!this.isRunning) return;
                        const ok = await this.checkStreamAvailable(rtspUrl);
                        if (ok) {
                            clearInterval(state.retryTimer);
                            state.retryTimer = null;
                            this.startRTSPStream(rtspUrl, cameraId);
                        }
                    }, 10000);
                    this.routers.set(cameraId, state);
                }
            });
            
            ffmpeg.on('error', (error) => {
                console.error(`FFmpeg ${cameraId} spawn error:`, error);
                reject(error);
            });
            
            this.ffmpegProcesses.set(cameraId, ffmpeg);
            
            // If ffmpeg didn't emit a start message within 5s, resolve to allow upper layer to attempt producers
            setTimeout(() => {
                if (!started) {
                    started = true;
                    console.log(`FFmpeg ${cameraId} probe timeout - assuming started`);
                    resolve(ffmpeg);
                }
            }, 5000);
        });
    }

    // Probe RTSP URL quickly to see if a stream is available. Falls back to false on any error.
    async checkStreamAvailable(rtspUrl) {
        return new Promise((resolve) => {
            try {
                const { spawn } = require('child_process');
                const ffprobe = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', rtspUrl]);
                let output = '';
                let errored = false;
                ffprobe.stdout.on('data', (d) => { output += d.toString(); });
                ffprobe.stderr.on('data', (d) => { /* ignore */ });
                ffprobe.on('error', () => { errored = true; });
                ffprobe.on('close', (code) => {
                    if (errored || code !== 0) return resolve(false);
                    if (output && output.trim().length > 0) return resolve(true);
                    return resolve(false);
                });
                // Safety timeout
                setTimeout(() => {
                    try { ffprobe.kill('SIGTERM'); } catch (e) {}
                    resolve(false);
                }, 4000);
            } catch (e) {
                return resolve(false);
            }
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
