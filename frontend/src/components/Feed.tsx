import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { Button } from "./ui";

export function Feed() {
  const items = Array.from({ length: 14 }).map((_, i) => ({
    id: i + 1,
    title: i % 2 === 0 ? "Front Door 2" : "Front Door 1",
    time: `${9 + (i % 6)}:${(10 + i).toString().padStart(2, "0")} AM`,
    thumb: "https://picsum.photos/seed/door" + i + "/120/80",
  }));
  return (
    <div className="w-80 shrink-0 p-3 space-y-2 border-l bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Feed</div>
        <div className="flex items-center gap-1">
          <Button aria-label="Prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button aria-label="Next">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button aria-label="Filter" className="ml-1">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {items.map((it) => (
        <div
          key={it.id}
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-neutral-50 cursor-pointer"
        >
          <img
            src={it.thumb}
            alt="thumb"
            className="w-20 h-14 object-cover rounded-lg border"
          />
          <div className="flex-1">
            <div className="text-sm font-medium">{it.title}</div>
            <div className="text-xs text-neutral-500">{it.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
