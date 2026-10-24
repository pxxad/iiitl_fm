"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SKIP_VOTE_THRESHOLD } from "@/lib/constants";
import type { UserRole, SkipVoteResult } from "@/lib/types";

interface SkipVoteControlProps {
  currentSongId: string | null;
  isCampusUser: boolean;
  userRole?: UserRole;
  onSongAdvanced?: () => void;
}

export function SkipVoteControl({
  currentSongId,
  isCampusUser,
  userRole,
  onSongAdvanced,
}: SkipVoteControlProps) {
  const [hasVoted, setHasVoted] = useState(false);
  const [voteCount, setVoteCount] = useState(0);
  const [isVoting, setIsVoting] = useState(false);
  const [isModSkipping, setIsModSkipping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset votes when song changes
  useEffect(() => {
    setHasVoted(false);
    setVoteCount(0);
    setErrorMsg(null);
  }, [currentSongId]);

  const handleToggleVote = useCallback(async () => {
    if (!currentSongId || !isCampusUser || isVoting) return;

    setIsVoting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/playback/skip-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedSongId: currentSongId }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        setErrorMsg(json.error?.message || "Failed to submit vote");
        return;
      }

      const data = json.data as SkipVoteResult;
      setHasVoted(data.voted);
      setVoteCount(data.total_votes);

      if (data.advanced && onSongAdvanced) {
        onSongAdvanced();
      }
    } catch {
      setErrorMsg("Network error casting vote");
    } finally {
      setIsVoting(false);
    }
  }, [currentSongId, isCampusUser, isVoting, onSongAdvanced]);

  const handleModeratorSkip = useCallback(async () => {
    if (!currentSongId || !userRole || (userRole !== "moderator" && userRole !== "admin") || isModSkipping) {
      return;
    }

    if (!confirm("Are you sure you want to force-skip this track as a campus moderator?")) {
      return;
    }

    setIsModSkipping(true);
    try {
      const res = await fetch("/api/moderation/skip-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songId: currentSongId,
          reason: "Moderator forced skip",
        }),
      });

      if (res.ok && onSongAdvanced) {
        onSongAdvanced();
      }
    } catch (err) {
      console.error("[SkipVoteControl] Moderator skip error:", err);
    } finally {
      setIsModSkipping(false);
    }
  }, [currentSongId, userRole, isModSkipping, onSongAdvanced]);

  if (!currentSongId) return null;

  const isModerator = userRole === "moderator" || userRole === "admin";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Democratic Skip Vote Button */}
      <button
        type="button"
        onClick={handleToggleVote}
        disabled={!isCampusUser || isVoting}
        title={
          !isCampusUser
            ? "Sign in with @iiitl.ac.in to vote to skip"
            : hasVoted
            ? "Cancel your skip vote"
            : "Vote to skip this track (requires 3 votes)"
        }
        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm min-h-[40px] touch-manipulation ${
          hasVoted
            ? "bg-rose-600 text-white shadow-rose-600/30 ring-2 ring-rose-400"
            : voteCount > 0
            ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
            : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
        } ${!isCampusUser || isVoting ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span>⏭️</span>
        <span>
          {hasVoted ? "Voted to Skip" : "Vote Skip"} ({voteCount}/{SKIP_VOTE_THRESHOLD})
        </span>
      </button>

      {/* Moderator Force Skip Button */}
      {isModerator && (
        <button
          type="button"
          onClick={handleModeratorSkip}
          disabled={isModSkipping}
          title="Force-skip track immediately (Moderator privilege)"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all cursor-pointer min-h-[40px] touch-manipulation"
        >
          <span>🛡️</span>
          <span>{isModSkipping ? "Skipping..." : "Mod Skip"}</span>
        </button>
      )}

      {errorMsg && (
        <span className="text-[11px] text-rose-400 animate-pulse">
          ⚠️ {errorMsg}
        </span>
      )}
    </div>
  );
}
