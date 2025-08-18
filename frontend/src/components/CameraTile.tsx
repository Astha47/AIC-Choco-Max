import { useWebRTCViewer } from "@/hooks/useWebRTCViewer";
import {
  Badge,
  SignalHigh,
  Users,
  PauseCircle,
  PlayCircle,
  Camera,
  Clock,
} from "lucide-react";
import { useEffect } from "react";
import { Button, Card } from "./ui";
import { ClockDisplay } from "./ClockDisplay";

export type CameraInfo = {
  id: string;
  name: string;
  section: string;
  viewers?: number;
  online?: boolean;
  thumb?: string;
};

export function CameraTile({
  camera,
  active,
  signalingUrl,
  token,
}: {
  camera: CameraInfo;
  active: boolean;
  signalingUrl: string;
  token?: string;
}) {
  const { videoRef, status, error, connect, disconnect } = useWebRTCViewer({
    signalingUrl,
    cameraId: camera.id,
    token,
  });
  useEffect(() => {
    if (active) connect();
    return () => disconnect();
  }, [active]);
  return (
    <Card className="relative overflow-hidden group">
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="w-full h-full object-cover"
          poster={camera.thumb}
        />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <Badge className="flex items-center gap-1">
            <SignalHigh className="w-3 h-3" />
            {camera.online ? "Online" : "Offline"}
          </Badge>
          <Badge className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {camera.viewers ?? 0}
          </Badge>
        </div>
        <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/20">
          {status === "connected" ? (
            <Button
              onClick={disconnect}
              className="flex items-center gap-2 text-white border-white/60 bg-white/10 backdrop-blur"
            >
              <PauseCircle className="w-5 h-5" />
              Stop
            </Button>
          ) : (
            <Button
              onClick={connect}
              className="flex items-center gap-2 text-white border-white/60 bg-white/10 backdrop-blur"
            >
              <PlayCircle className="w-5 h-5" />
              Play
            </Button>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent text-white">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4" />
            <span className="font-medium">{camera.name}</span>
          </div>
          <div className="flex items-center gap-1 opacity-90">
            <Clock className="w-4 h-4" />
            <span>
              <ClockDisplay />
            </span>
          </div>
        </div>
      </div>
      {status !== "connected" && (
        <div className="absolute bottom-3 left-3 text-xs rounded-md px-2 py-1 bg-white/90 text-neutral-700">
          {status === "connecting"
            ? "Connecting…"
            : error
            ? `Error: ${error}`
            : "Idle"}
        </div>
      )}
    </Card>
  );
}
