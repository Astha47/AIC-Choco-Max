import { useRef, useState, useMemo, useEffect } from "react";

export type ViewerStatus = "idle" | "connecting" | "connected" | "error";

export interface UseWebRTCViewerProps {
  signalingUrl: string;
  cameraId: string;
  token?: string;
  iceServers?: RTCIceServer[];
}

export function useWebRTCViewer({
  signalingUrl,
  cameraId,
  token,
  iceServers,
}: UseWebRTCViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const config = useMemo<RTCConfiguration>(
    () => ({
      iceServers: iceServers ?? [{ urls: ["stun:stun.l.google.com:19302"] }],
    }),
    [iceServers]
  );

  const cleanup = () => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.getReceivers().forEach((r) => r.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)
      wsRef.current.close();
    wsRef.current = null;
  };

  const connect = async () => {
    setError(null);
    setStatus("connecting");
    try {
      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;
      pc.ontrack = (ev) => {
        if (videoRef.current) {
          const [stream] = ev.streams;
          videoRef.current.srcObject = stream || new MediaStream([ev.track]);
        }
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current?.send(
            JSON.stringify({ type: "candidate", candidate: ev.candidate })
          );
        }
      };
      const ws = new WebSocket(signalingUrl);
      wsRef.current = ws;
      ws.onopen = () =>
        ws.send(JSON.stringify({ type: "subscribe", cameraId, token }));
      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "offer") {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: "offer", sdp: msg.sdp })
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
        } else if (msg.type === "candidate" && msg.candidate) {
          await pc
            .addIceCandidate(new RTCIceCandidate(msg.candidate))
            .catch(() => {});
        } else if (msg.type === "bye") {
          cleanup();
          setStatus("idle");
        }
      };
      ws.onerror = () => {
        setError("WebSocket error");
        setStatus("error");
      };
      ws.onclose = () => {
        if (status !== "connected") setStatus("idle");
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") setStatus("connected");
        else if (["failed", "disconnected", "closed"].includes(st))
          setStatus(st === "failed" ? "error" : "idle");
      };
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect");
      setStatus("error");
    }
  };

  const disconnect = () => {
    cleanup();
    setStatus("idle");
  };
  useEffect(() => () => cleanup(), []);
  return { videoRef, status, error, connect, disconnect } as const;
}
