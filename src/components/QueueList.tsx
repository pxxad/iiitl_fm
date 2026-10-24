"use client";

import React from "react";
import type { Song, Profile } from "@/lib/types";
import { MOOD_TAGS } from "@/lib/constants";

type SongItem = Song & {
  profiles?: Pick<Profile, "full_name" | "avatar_url" | "branch" | "batch"> | null;
};

interface QueueListProps {
  songs: SongItem[];
  currentUserId?: string;
  emptyMessage?: string;
}

export function QueueList({
  songs,
  currentUserId,
  emptyMessage = "No songs submitted yet for today. Be the first on campus!",
}: QueueListProps) {
  if (songs.length === 0) {
    return (
      <div className="text-center py-12 px-4 rounded-3xl bg-white/60 border border-slate-200/80 shadow-sm">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-2xl">
          📻
        </div>
        <h3 className="text-sm font-semibold text-slate-800">Queue is Waiting</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {songs.map((song, index) => {
        const moodObj = MOOD_TAGS.find((m) => m.value === song.mood_tag);
        const isUserSong = currentUserId && song.added_by === currentUserId;

        // Status badge colors
        const statusConfig: Record<
          string,
          { label: string; bg: string; text: string; dot?: string }
        > = {
          playing: {
            label: "Playing Now",
            bg: "bg-emerald-50 border-emerald-200",
            text: "text-emerald-700",
            dot: "bg-emerald-500 animate-pulse",
          },
          queued: {
            label: `Queued #${index + 1}`,
            bg: "bg-indigo-50 border-indigo-200/60",
            text: "text-indigo-700",
          },
          played: {
            label: "Played",
            bg: "bg-slate-100 border-slate-200",
            text: "text-slate-600",
          },
          skipped: {
            label: "Skipped",
            bg: "bg-amber-50 border-amber-200",
            text: "text-amber-700",
          },
          unavailable: {
            label: "Unavailable",
            bg: "bg-rose-50 border-rose-200",
            text: "text-rose-700",
          },
        };

        const currentStatus = statusConfig[song.status] || statusConfig.queued;

        return (
          <div
            key={song.id}
            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 rounded-2xl border transition-all ${
              song.status === "playing"
                ? "bg-gradient-to-r from-emerald-50/60 via-white to-white border-emerald-300 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-400/30"
                : isUserSong
                ? "bg-indigo-50/40 border-indigo-200 shadow-sm"
                : "bg-white/80 border-slate-200/80 hover:border-slate-300 shadow-sm"
            }`}
          >
            {/* Left: Thumbnail & Info */}
            <div className="flex items-center gap-2.5 sm:gap-3.5 w-full sm:w-auto">
              {/* Position Number */}
              <span className="font-extrabold text-xs sm:text-sm text-slate-400 w-5 sm:w-6 text-center shrink-0">
                {song.position || index + 1}
              </span>

              {/* Thumbnail */}
              <div className="relative w-14 h-10 sm:w-20 sm:h-14 rounded-xl overflow-hidden bg-slate-900 shrink-0 shadow-sm">
                {song.thumbnail_url ? (
                  <img
                    src={song.thumbnail_url}
                    alt={song.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/50 text-xs">
                    🎵
                  </div>
                )}
                {song.status === "playing" && (
                  <div className="absolute inset-0 bg-emerald-900/40 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                )}
              </div>

              {/* Song Title & Submitter */}
              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                  {song.title}
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                  {song.artist || "Unknown Artist"}
                </p>

                <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5 flex-wrap">
                  {/* Submitter Name */}
                  <span className="text-[10px] sm:text-[11px] text-slate-600 font-medium flex items-center gap-1">
                    <span>by</span>
                    <strong className="text-slate-800">
                      {isUserSong
                        ? "You"
                        : song.profiles?.full_name || "Campus Student"}
                    </strong>
                    {song.profiles?.branch && (
                      <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                        {song.profiles.branch}
                      </span>
                    )}
                  </span>

                  {/* Mood Tag Badge */}
                  {moodObj && (
                    <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      <span>{moodObj.emoji}</span>
                      <span>{moodObj.label}</span>
                    </span>
                  )}
                </div>

                {/* Message Quote */}
                {song.message && (
                  <p className="text-[10px] sm:text-[11px] italic text-slate-500 mt-1 sm:mt-1.5 bg-slate-50/80 px-2 py-1 rounded-md border border-slate-100 max-w-md break-words">
                    &ldquo;{song.message}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Right: Status Pill */}
            <div className="mt-2 sm:mt-0 flex items-center gap-2 self-end sm:self-center ml-7 sm:ml-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold border ${currentStatus.bg} ${currentStatus.text}`}
              >
                {currentStatus.dot && (
                  <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot}`} />
                )}
                {currentStatus.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
