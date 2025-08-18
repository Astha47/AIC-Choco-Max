"use client";

import { CameraInfo, CameraTile } from "@/components/CameraTile";
import { Feed } from "@/components/Feed";
import { Button } from "@/components/ui";
import { PanelLeft, Search, Bell, Settings, Camera, Users } from "lucide-react";
import { useState, useMemo } from "react";

const CAMERAS: CameraInfo[] = [
  {
    id: "cam-1",
    name: "Camera 1",
    section: "Basement",
    viewers: 66,
    online: true,
  },
  {
    id: "cam-2",
    name: "Camera 2",
    section: "Basement",
    viewers: 56,
    online: true,
  },
  {
    id: "cam-3",
    name: "Camera 1",
    section: "Backyard",
    viewers: 32,
    online: true,
  },
  {
    id: "cam-4",
    name: "Camera 2",
    section: "Backyard",
    viewers: 18,
    online: true,
  },
  {
    id: "cam-5",
    name: "Camera 3",
    section: "Backyard",
    viewers: 24,
    online: true,
  },
  {
    id: "cam-6",
    name: "Camera 4",
    section: "Backyard",
    viewers: 11,
    online: true,
  },
];
const SECTIONS = [
  "All",
  "Basement",
  "Backyard",
  "Front Door",
  "Kid's Room",
  "Kitchen",
] as const;

export default function Page() {
  const [activeTab, setActiveTab] = useState<(typeof SECTIONS)[number]>("All");
  const signalingUrl =
    process.env.NEXT_PUBLIC_SIGNALING_URL || "wss://your-ws-endpoint";
  const token = undefined;
  const cams = useMemo(
    () =>
      activeTab === "All"
        ? CAMERAS
        : CAMERAS.filter((c) => c.section === activeTab),
    [activeTab]
  );
  const sectionsWithCams = useMemo(() => {
    const grouped = new Map<string, CameraInfo[]>();
    cams.forEach((c) => {
      grouped.set(c.section, [...(grouped.get(c.section) || []), c]);
    });
    return Array.from(grouped.entries());
  }, [cams]);
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-800">
      <div className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b">
        <div className="max-w-[1400px] mx-auto flex items-center gap-3 px-4 py-3">
          <div className="font-bold text-lg flex items-center gap-2">
            <PanelLeft className="w-5 h-5" />
            evizz
          </div>
          <div className="flex items-center gap-1">
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setActiveTab(s)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  activeTab === s
                    ? "bg-black text-white border-black"
                    : "bg-white hover:bg-neutral-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <input
                className="pl-9 pr-3 py-2 rounded-xl border w-64"
                placeholder="Search cameras"
              />
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
            <Button aria-label="Alerts">
              <Bell className="w-4 h-4" />
            </Button>
            <Button aria-label="Settings">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="max-w-[1400px] mx-auto flex gap-4 px-4 py-4">
        <div className="w-12 shrink-0 flex flex-col items-center gap-3 pt-2">
          {[
            <Camera key="1" className="w-5 h-5" />,
            <Bell key="2" className="w-5 h-5" />,
            <Users key="3" className="w-5 h-5" />,
          ].map((Icon, i) => (
            <Button
              key={i}
              className="w-10 h-10 flex items-center justify-center"
              aria-label={`Rail ${i + 1}`}
            >
              {Icon}
            </Button>
          ))}
        </div>
        <div className="flex-1 space-y-6">
          {sectionsWithCams.map(([section, list]) => (
            <section key={section}>
              <div className="font-semibold mb-2 px-1">{section}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {list.map((cam) => (
                  <CameraTile
                    key={cam.id}
                    camera={cam}
                    active={true}
                    signalingUrl={signalingUrl}
                    token={token}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <Feed />
      </div>
    </div>
  );
}
