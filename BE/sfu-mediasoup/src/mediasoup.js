const mediasoup = require('mediasoup');

class MediaSoupService {
    constructor() {
        this.worker = null;
        this.router = null;
        // Normalize and validate worker settings coming from env
        const allowedWorkerLogLevels = ['debug', 'warn', 'error', 'none'];
        let envLogLevel = (process.env.LOG_LEVEL || 'warn').toLowerCase();
        if (!allowedWorkerLogLevels.includes(envLogLevel)) {
            // Keep this as console output since logger isn't initialized yet
            console.warn(
                `Invalid LOG_LEVEL '${process.env.LOG_LEVEL}' - falling back to 'warn'. Valid values: ${allowedWorkerLogLevels.join(', ')}`
            );
            envLogLevel = 'warn';
        }

        this.config = {
            // Worker settings
            worker: {
                rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT) || 10000,
                rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT) || 10100,
                logLevel: envLogLevel,
                logTags: [
                    'info',
                    'ice',
                    'dtls',
                    'rtp',
                    'srtp',
                    'rtcp',
                ],
            },
            
            // Router settings
            router: {
                mediaCodecs: [
                    {
                        kind: 'audio',
                        mimeType: 'audio/opus',
                        clockRate: 48000,
                        channels: 2,
                    },
                    {
                        kind: 'video',
                        mimeType: 'video/VP8',
                        clockRate: 90000,
                        parameters: {
                            'x-google-start-bitrate': 1000,
                        },
                    },
                    {
                        kind: 'video',
                        mimeType: 'video/H264',
                        clockRate: 90000,
                        parameters: {
                            // Use baseline profile-level-id to match FFmpeg's "-profile:v baseline -level 3.1"
                            // which corresponds to profile-level-id '42e01f'. This prevents mediasoup from
                            // rejecting incoming H264 RTP producers encoded as baseline.
                            'packetization-mode': 1,
                            'profile-level-id': '42e01f',
                            'level-asymmetry-allowed': 1,
                            'x-google-start-bitrate': 1000,
                        },
                    },
                ],
            },
            
            // WebRTC transport settings
            webRtcTransport: {
                listenIps: [
                    {
                        ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
                        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null,
                    },
                ],
                maxIncomingBitrate: 1500000,
                initialAvailableOutgoingBitrate: 1000000,
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
            },
        };
    }
    
    async init() {
        try {
            // Create worker
            this.worker = await mediasoup.createWorker(this.config.worker);
            
            this.worker.on('died', () => {
                console.error('MediaSoup worker died, exiting in 2 seconds...');
                setTimeout(() => process.exit(1), 2000);
            });
            
            console.log('MediaSoup worker created');
            
        } catch (error) {
            console.error('Failed to create MediaSoup worker:', error);
            throw error;
        }
    }
    
    async createRouter() {
        try {
            const router = await this.worker.createRouter({
                mediaCodecs: this.config.router.mediaCodecs,
            });
            
            console.log('MediaSoup router created');
            return router;
            
        } catch (error) {
            console.error('Failed to create router:', error);
            throw error;
        }
    }
    
    async createWebRTCTransport(router) {
        try {
            const transport = await router.createWebRtcTransport(this.config.webRtcTransport);
            
            console.log('WebRTC transport created:', transport.id);
            return transport;
            
        } catch (error) {
            console.error('Failed to create WebRTC transport:', error);
            throw error;
        }
    }
    
    async createPlainTransport(router, listenIp = '127.0.0.1', listenPort) {
        try {
            const transport = await router.createPlainTransport({
                listenIp: { ip: listenIp, announcedIp: null },
                listenPort: listenPort,
                rtcpMux: false,
                comedia: true,
            });
            
            console.log('Plain transport created:', transport.id);
            return transport;
            
        } catch (error) {
            console.error('Failed to create plain transport:', error);
            throw error;
        }
    }
    
    getRouterCapabilities() {
        if (!this.router) {
            throw new Error('Router not initialized');
        }
        return this.router.rtpCapabilities;
    }
    
    async close() {
        if (this.worker) {
            this.worker.close();
            console.log('MediaSoup worker closed');
        }
    }
}

module.exports = MediaSoupService;
