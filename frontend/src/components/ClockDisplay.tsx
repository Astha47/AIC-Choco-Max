"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function ClockDisplay() {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleString());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-1 opacity-90">
      <Clock className="w-4 h-4" />
      <span suppressHydrationWarning>{time}</span>
    </div>
  );
}
