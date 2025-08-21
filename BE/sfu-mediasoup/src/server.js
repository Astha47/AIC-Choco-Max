const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
require('dotenv').config();

const MediaSoupService = require('./mediasoup');
const RTSPBridge = require('./rtsp-bridge');

class SFUServer {
    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.mediasoup = new MediaSoupService();
        this.rtspBridge = new RTSPBridge(this.mediasoup);
        
        this.setupLogger();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        
        this.rooms = new Map();
        this.peers = new Map();
    }
    
    setupLogger() {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                }),
                new winston.transports.File({ 
                    filename: process.env.LOG_FILE || './logs/sfu.log' 
                })
            ]
        });
    }
    
    setupMiddleware() {
        this.app.use(helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false
        }));
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('public'));
    }
    
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                rooms: this.rooms.size,
                peers: this.peers.size
            });
        });
        
        // MediaSoup router RTP capabilities
        this.app.get('/router-capabilities', async (req, res) => {
            try {
                const capabilities = this.mediasoup.getRouterCapabilities();
                res.json(capabilities);
            } catch (error) {
                this.logger.error('Error getting router capabilities:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        
        // Room info
        this.app.get('/rooms/:roomId', (req, res) => {
            const { roomId } = req.params;
            const room = this.rooms.get(roomId);
            
            if (!room) {
                return res.status(404).json({ error: 'Room not found' });
            }
            
            res.json({
                id: roomId,
                participants: room.peers.size,
                producers: Array.from(room.producers.keys())
            });
        });
    }
    
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            this.logger.info(`Client connected: ${socket.id}`);
            
            socket.on('join-room', async (data) => {
                await this.handleJoinRoom(socket, data);
            });
            
            socket.on('create-webrtc-transport', async (data) => {
                await this.handleCreateWebRTCTransport(socket, data);
            });
            
            socket.on('connect-transport', async (data) => {
                await this.handleConnectTransport(socket, data);
            });
            
            socket.on('produce', async (data) => {
                await this.handleProduce(socket, data);
            });
            
            socket.on('consume', async (data) => {
                await this.handleConsume(socket, data);
            });
            
            socket.on('resume-consumer', async (data) => {
                await this.handleResumeConsumer(socket, data);
            });
            
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }
    
    async handleJoinRoom(socket, { roomId, peerId }) {
        try {
            this.logger.info(`Peer ${peerId} joining room ${roomId}`);
            
            // Create room if it doesn't exist
            if (!this.rooms.has(roomId)) {
                this.rooms.set(roomId, {
                    router: await this.mediasoup.createRouter(),
                    peers: new Map(),
                    producers: new Map()
                });
            }
            
            const room = this.rooms.get(roomId);
            const peer = {
                id: peerId,
                socket,
                transports: new Map(),
                producers: new Map(),
                consumers: new Map()
            };
            
            room.peers.set(peerId, peer);
            this.peers.set(socket.id, peer);
            socket.peerId = peerId;
            socket.roomId = roomId;
            
            // Send router RTP capabilities
            socket.emit('router-rtp-capabilities', {
                rtpCapabilities: room.router.rtpCapabilities
            });
            
            // Notify about existing producers
            const producerIds = Array.from(room.producers.keys());
            if (producerIds.length > 0) {
                socket.emit('existing-producers', { producerIds });
            }
            
            this.logger.info(`Peer ${peerId} joined room ${roomId}`);
            
        } catch (error) {
            this.logger.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    }
    
    async handleCreateWebRTCTransport(socket, { direction }) {
        try {
            const peer = this.peers.get(socket.id);
            const room = this.rooms.get(socket.roomId);
            
            if (!peer || !room) {
                throw new Error('Peer or room not found');
            }
            
            const transport = await this.mediasoup.createWebRTCTransport(room.router);
            peer.transports.set(transport.id, transport);
            
            socket.emit('webrtc-transport-created', {
                transportId: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters
            });
            
        } catch (error) {
            this.logger.error('Error creating WebRTC transport:', error);
            socket.emit('error', { message: 'Failed to create transport' });
        }
    }
    
    async handleConnectTransport(socket, { transportId, dtlsParameters }) {
        try {
            const peer = this.peers.get(socket.id);
            if (!peer) {
                throw new Error('Peer not found');
            }
            
            const transport = peer.transports.get(transportId);
            if (!transport) {
                throw new Error('Transport not found');
            }
            
            await transport.connect({ dtlsParameters });
            socket.emit('transport-connected', { transportId });
            
        } catch (error) {
            this.logger.error('Error connecting transport:', error);
            socket.emit('error', { message: 'Failed to connect transport' });
        }
    }
    
    async handleProduce(socket, { transportId, kind, rtpParameters }) {
        try {
            const peer = this.peers.get(socket.id);
            const room = this.rooms.get(socket.roomId);
            
            if (!peer || !room) {
                throw new Error('Peer or room not found');
            }
            
            const transport = peer.transports.get(transportId);
            if (!transport) {
                throw new Error('Transport not found');
            }
            
            const producer = await transport.produce({ kind, rtpParameters });
            peer.producers.set(producer.id, producer);
            room.producers.set(producer.id, producer);
            
            // Notify other peers about new producer
            socket.to(socket.roomId).emit('new-producer', {
                producerId: producer.id,
                peerId: peer.id
            });
            
            socket.emit('producer-created', { producerId: producer.id });
            
            this.logger.info(`Producer created: ${producer.id} by peer ${peer.id}`);
            
        } catch (error) {
            this.logger.error('Error creating producer:', error);
            socket.emit('error', { message: 'Failed to create producer' });
        }
    }
    
    async handleConsume(socket, { transportId, producerId, rtpCapabilities }) {
        try {
            const peer = this.peers.get(socket.id);
            const room = this.rooms.get(socket.roomId);
            
            if (!peer || !room) {
                throw new Error('Peer or room not found');
            }
            
            const transport = peer.transports.get(transportId);
            const producer = room.producers.get(producerId);
            
            if (!transport || !producer) {
                throw new Error('Transport or producer not found');
            }
            
            if (!room.router.canConsume({ producerId, rtpCapabilities })) {
                throw new Error('Cannot consume');
            }
            
            const consumer = await transport.consume({
                producerId,
                rtpCapabilities,
                paused: true
            });
            
            peer.consumers.set(consumer.id, consumer);
            
            socket.emit('consumer-created', {
                consumerId: consumer.id,
                producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters
            });
            
        } catch (error) {
            this.logger.error('Error creating consumer:', error);
            socket.emit('error', { message: 'Failed to create consumer' });
        }
    }
    
    async handleResumeConsumer(socket, { consumerId }) {
        try {
            const peer = this.peers.get(socket.id);
            if (!peer) {
                throw new Error('Peer not found');
            }
            
            const consumer = peer.consumers.get(consumerId);
            if (!consumer) {
                throw new Error('Consumer not found');
            }
            
            await consumer.resume();
            socket.emit('consumer-resumed', { consumerId });
            
        } catch (error) {
            this.logger.error('Error resuming consumer:', error);
            socket.emit('error', { message: 'Failed to resume consumer' });
        }
    }
    
    handleDisconnect(socket) {
        this.logger.info(`Client disconnected: ${socket.id}`);
        
        const peer = this.peers.get(socket.id);
        if (!peer) return;
        
        const room = this.rooms.get(socket.roomId);
        if (room) {
            // Close all transports
            for (const transport of peer.transports.values()) {
                transport.close();
            }
            
            // Remove producers from room
            for (const producer of peer.producers.values()) {
                room.producers.delete(producer.id);
                producer.close();
            }
            
            // Close consumers
            for (const consumer of peer.consumers.values()) {
                consumer.close();
            }
            
            // Remove peer from room
            room.peers.delete(peer.id);
            
            // Remove empty rooms
            if (room.peers.size === 0) {
                room.router.close();
                this.rooms.delete(socket.roomId);
            }
        }
        
        this.peers.delete(socket.id);
    }
    
    async start() {
        try {
            // Initialize MediaSoup
            await this.mediasoup.init();
            
            // Start RTSP bridge if enabled
            if (process.env.RTSP_BRIDGE_ENABLED === 'true') {
                await this.rtspBridge.start();
            }
            
            // Start server
            const port = process.env.PORT || 3000;
            const host = process.env.HOST || '0.0.0.0';
            
            this.server.listen(port, host, () => {
                this.logger.info(`SFU Server started on ${host}:${port}`);
            });
            
        } catch (error) {
            this.logger.error('Failed to start SFU server:', error);
            process.exit(1);
        }
    }
    
    async stop() {
        this.logger.info('Stopping SFU server...');
        
        // Close all rooms
        for (const room of this.rooms.values()) {
            room.router.close();
        }
        
        // Stop RTSP bridge
        if (this.rtspBridge) {
            await this.rtspBridge.stop();
        }
        
        // Close MediaSoup
        if (this.mediasoup) {
            await this.mediasoup.close();
        }
        
        // Close server
        this.server.close();
        
        this.logger.info('SFU server stopped');
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    if (global.sfuServer) {
        await global.sfuServer.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    if (global.sfuServer) {
        await global.sfuServer.stop();
    }
    process.exit(0);
});

// Start server
const sfuServer = new SFUServer();
global.sfuServer = sfuServer;
sfuServer.start();
