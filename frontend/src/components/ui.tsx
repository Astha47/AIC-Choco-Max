"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  PanelLeft,
  Bell,
  Settings,
  Search,
  Clock,
  SignalHigh,
  Users,
  PlayCircle,
  PauseCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

/** ------------------------------------------------------------------------
 * Shared UI primitives (Card, Button, Badge)
 */
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = "", ...props }) => (
  <div className={`rounded-2xl shadow-sm border border-neutral-200 bg-white ${className}`} {...props} />
);
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = "", ...props }) => (
  <button className={`px-3 py-2 rounded-xl border border-neutral-200 shadow-sm hover:bg-neutral-50 active:scale-[.99] transition ${className}`} {...props} />
);
export const Badge: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ className = "", ...props }) => (
  <span className={`text-xs px-2 py-1 rounded-full border bg-white/80 backdrop-blur ${className}`} {...props} />
);