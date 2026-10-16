"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { REACTION_TYPES } from "@/lib/constants";
import type { ReactionCounts, ReactionType } from "@/lib/types";
import type { EmojiBurst } from "@/lib/realtime/useLiveRoom";

interface ReactionPickerProps {
  currentSongId: string | null;
  reactionCounts: ReactionCounts;
  userReaction: ReactionType | null;
  onToggleReaction: (type: ReactionType) => void;
  disabled?: boolean;
  floatingEmojis?: EmojiBurst[];
  isCampusUser?: boolean;
}

export function ReactionPicker({
  currentSongId,
  reactionCounts,
  userReaction,
  onToggleReaction,
  disabled = false,
  floatingEmojis = [],
  isCampusUser = false,
}: ReactionPickerProps) {
  if (!currentSongId) {
    return null;
  }

  return (
    <div className="relative mt-4">
      {/* ─── Floating Emoji Burst Overlay ─────────────────────────────────── */}
      <div className="pointer-events-none absolute bottom-12 inset-x-0 h-48 overflow-hidden z-20">
        <AnimatePresence>
          {floatingEmojis.map((burst) => (
            <motion.div
              key={burst.id}
              initial={{ opacity: 1, y: 40, scale: 0.6, x: `${burst.x}%` }}
              animate={{
                opacity: [1, 1, 0],
                y: -140,
                scale: [0.8, 1.4, 1],
                rotate: [-8, 8, -4],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2, ease: "easeOut" }}
              className="absolute bottom-0 text-3xl select-none filter drop-shadow-md"
            >
              {burst.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ─── Reaction Pills Bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2 p-2 rounded-2xl bg-slate-900/40 backdrop-blur-md border border-white/10 shadow-inner">
        <div className="flex items-center gap-1.5 flex-wrap">
          {REACTION_TYPES.map((r) => {
            const count = reactionCounts[r.value as ReactionType] || 0;
            const isSelected = userReaction === r.value;

            return (
              <motion.button
                key={r.value}
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => onToggleReaction(r.value as ReactionType)}
                disabled={disabled || !isCampusUser}
                title={
                  !isCampusUser
                    ? "Sign in with @iiitl.ac.in to react"
                    : isSelected
                    ? `Remove your ${r.label} reaction`
                    : `React with ${r.label}`
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-2 ring-indigo-400"
                    : count > 0
                    ? "bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10"
                    : "bg-transparent hover:bg-white/10 text-slate-400 border border-transparent"
                } ${
                  disabled || !isCampusUser
                    ? "opacity-60 cursor-not-allowed hover:bg-transparent"
                    : "cursor-pointer"
                }`}
              >
                <span className="text-base select-none">{r.emoji}</span>
                {count > 0 && (
                  <span
                    className={`text-[11px] font-bold ${
                      isSelected ? "text-indigo-100" : "text-slate-300"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Guest prompt indicator */}
        {!isCampusUser && (
          <div className="px-2.5 py-1 text-[11px] text-slate-400 font-medium">
            🔒 <span className="hidden sm:inline">Sign in to react</span>
          </div>
        )}
      </div>
    </div>
  );
}
