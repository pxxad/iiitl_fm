"use client";

import React, { useState } from "react";
import type { PresenceUser } from "@/lib/types";

interface PresenceBadgeProps {
  approxCount: number;
  activeListeners: PresenceUser[];
}

export function PresenceBadge({
  approxCount,
  activeListeners,
}: PresenceBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Filter out any duplicate listeners by user_id or display_name
  const uniqueListeners = activeListeners.slice(0, 15);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 hover:bg-slate-900/80 backdrop-blur-md border border-white/10 text-xs font-medium text-slate-200 transition-colors shadow-sm"
        title="Approximate active listeners in the campus room (click to view)"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-semibold text-emerald-400">~{approxCount}</span>
        <span className="text-slate-400 hidden sm:inline">
          {approxCount === 1 ? "listener" : "listeners"} on air
        </span>
      </button>

      {/* Popover showing listeners */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-64 p-3 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl z-40 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
              <span className="text-xs font-semibold text-white">
                Active Listeners (~{approxCount})
              </span>
              <span className="text-[10px] text-slate-400">Live Presence</span>
            </div>

            <p className="text-[11px] text-slate-400 mb-2 leading-tight">
              Estimated active listeners connected to the live stream.
            </p>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {uniqueListeners.map((listener, idx) => (
                <div
                  key={`${listener.user_id || 'guest'}_${idx}`}
                  className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg bg-white/5"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-sm">
                      {listener.is_guest ? "🎧" : "🎓"}
                    </span>
                    <span className="truncate text-slate-200 font-medium">
                      {listener.display_name}
                    </span>
                  </div>
                  {listener.branch && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">
                      {listener.branch}
                    </span>
                  )}
                </div>
              ))}
              {approxCount > uniqueListeners.length && (
                <p className="text-[11px] text-slate-500 text-center pt-1">
                  +{approxCount - uniqueListeners.length} more in the room
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
