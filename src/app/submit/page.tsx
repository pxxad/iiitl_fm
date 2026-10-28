"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import { useAuth } from "@/lib/auth/context";
import { MOOD_TAGS, MAX_MESSAGE_LENGTH } from "@/lib/constants";
import type { MoodTag } from "@/lib/types";
import { QueueList } from "@/components/QueueList";
import type { QueueResponse } from "@/app/api/queue/today/route";
import type { SpotifyTrackResolveResponse } from "@/app/api/spotify/track/route";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ─── URL Type Detection (client-safe, no secrets) ─────────────────────────────

function detectUrlType(input: string): "youtube" | "spotify" | "unknown" {
  const trimmed = input.trim();
  if (!trimmed) return "unknown";

  // Spotify URL patterns
  if (
    trimmed.startsWith("spotify:track:") ||
    trimmed.includes("open.spotify.com/track/") ||
    trimmed.includes("spotify.com/track/")
  ) {
    return "spotify";
  }

  // YouTube URL patterns
  if (
    trimmed.includes("youtube.com/") ||
    trimmed.includes("youtu.be/") ||
    /^[a-zA-Z0-9_-]{11}$/.test(trimmed)
  ) {
    return "youtube";
  }

  return "unknown";
}

// ─── Preview State Types ───────────────────────────────────────────────────────

interface YouTubePreviewMeta {
  type: "youtube";
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
}

interface SpotifyPreviewMeta {
  type: "spotify";
  trackId: string;
  title: string;
  artist: string;
  allArtists: string;
  albumArtUrl: string | null;
  durationSeconds: number | null;
  externalUrl: string;
  youtubeResults: SpotifyTrackResolveResponse["youtubeResults"];
  youtubeSearchAvailable: boolean;
  /** The YouTube video the user has selected from youtubeResults */
  selectedVideoId: string | null;
}

type PreviewMeta = YouTubePreviewMeta | SpotifyPreviewMeta | null;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Page Component ────────────────────────────────────────────────────────────

export default function SubmitPage() {
  const { user, isCampusMember, isLoading: authLoading } = useAuth();

  const [queueData, setQueueData] = useState<QueueResponse | null>(null);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);

  // Form states
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodTag>("chill");
  const [message, setMessage] = useState("");

  // Preview states
  const [previewMeta, setPreviewMeta] = useState<PreviewMeta>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Submission status
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // ─── Queue Fetch ────────────────────────────────────────────────────────────
  const fetchTodayQueue = useCallback(async () => {
    try {
      setIsLoadingQueue(true);
      const res = await fetch("/api/queue/today");
      if (res.ok) {
        const data: QueueResponse = await res.json();
        setQueueData(data);
      }
    } catch (err) {
      console.error("[Submit] Failed to fetch queue:", err);
    } finally {
      setIsLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayQueue();
  }, [fetchTodayQueue]);

  // ─── Debounced Preview Fetch ────────────────────────────────────────────────
  useEffect(() => {
    const trimmed = videoUrl.trim();

    if (!trimmed) {
      setPreviewMeta(null);
      setPreviewError(null);
      return;
    }

    const urlType = detectUrlType(trimmed);

    // Unknown type — only show error once user has typed something meaningful
    if (urlType === "unknown") {
      if (trimmed.length > 10) {
        setPreviewMeta(null);
        setPreviewError(
          "Please paste a YouTube or Spotify track link."
        );
      }
      return;
    }

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      setPreviewError(null);

      try {
        if (urlType === "youtube") {
          // Existing YouTube preview flow — unchanged
          const res = await fetch(
            `/api/youtube/preview?url=${encodeURIComponent(trimmed)}`
          );
          const data = await res.json();

          if (res.ok) {
            setPreviewMeta({
              type: "youtube",
              videoId: data.videoId,
              title: data.title,
              artist: data.artist,
              thumbnailUrl: data.thumbnailUrl,
            });
            setPreviewError(null);
          } else {
            setPreviewMeta(null);
            setPreviewError(data.error || "Invalid YouTube link.");
          }
        } else {
          // Spotify track resolution flow
          const res = await fetch(
            `/api/spotify/track?url=${encodeURIComponent(trimmed)}`
          );
          const data = await res.json();

          if (res.ok) {
            const resolved: SpotifyTrackResolveResponse = data;
            setPreviewMeta({
              type: "spotify",
              trackId: resolved.trackId,
              title: resolved.title,
              artist: resolved.artist,
              allArtists: resolved.allArtists,
              albumArtUrl: resolved.albumArtUrl,
              durationSeconds: resolved.durationSeconds,
              externalUrl: resolved.externalUrl,
              youtubeResults: resolved.youtubeResults,
              youtubeSearchAvailable: resolved.youtubeSearchAvailable,
              // Auto-select first result if unambiguous (exactly 1 result)
              selectedVideoId:
                resolved.youtubeResults.length === 1
                  ? resolved.youtubeResults[0].videoId
                  : null,
            });
            setPreviewError(null);
          } else {
            setPreviewMeta(null);
            setPreviewError(data.error || "Could not resolve Spotify track.");
          }
        }
      } catch {
        setPreviewMeta(null);
        setPreviewError("Network error while fetching track info.");
      } finally {
        setIsPreviewLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [videoUrl]);

  // ─── Determine if submission is ready ──────────────────────────────────────
  const isReadyToSubmit = (() => {
    if (!previewMeta) return false;
    if (previewMeta.type === "youtube") return true;
    if (previewMeta.type === "spotify") return !!previewMeta.selectedVideoId;
    return false;
  })();

  // ─── The effective YouTube video ID for submission ──────────────────────────
  const effectiveVideoId = (() => {
    if (!previewMeta) return null;
    if (previewMeta.type === "youtube") return previewMeta.videoId;
    if (previewMeta.type === "spotify") return previewMeta.selectedVideoId;
    return null;
  })();

  // ─── Handle Submission ──────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReadyToSubmit || !effectiveVideoId) return;

    setSubmitError(null);
    setSubmitSuccess(null);

    startSubmitTransition(async () => {
      try {
        // Always submit via the YouTube video ID — existing route unchanged
        const youtubeVideoUrl = `https://www.youtube.com/watch?v=${effectiveVideoId}`;

        const res = await fetch("/api/songs/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoUrl: youtubeVideoUrl,
            moodTag: selectedMood,
            message,
          }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setSubmitSuccess(data.message);
          setVideoUrl("");
          setMessage("");
          setPreviewMeta(null);
          await fetchTodayQueue();
        } else {
          setSubmitError(data.error || "Failed to submit song.");
        }
      } catch {
        setSubmitError("Network error occurred while submitting song.");
      }
    });
  };

  // ─── Unauthenticated State ──────────────────────────────────────────────────
  if (!authLoading && (!user || !isCampusMember)) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md p-8 sm:p-10 rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xl text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-2xl">
            🔒
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Sign In Required to Submit
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            Only authenticated IIIT Lucknow students can submit tracks to the
            daily campus queue.
          </p>
          <div className="mt-6">
            <Link
              href="/login?redirectTo=/submit"
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 active:scale-95 transition-all"
            >
              Sign In with @iiitl.ac.in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const userSubmissionsCount =
    queueData?.userSubmissionsCount ??
    (queueData?.userSubmittedSongs?.length ?? (queueData?.userSubmittedSong ? 1 : 0));
  const maxSubmissions = queueData?.maxSubmissionsPerUser ?? 5;
  const remainingSubmissions =
    queueData?.remainingSubmissions ??
    Math.max(0, maxSubmissions - userSubmissionsCount);
  const hasReachedLimit = remainingSubmissions <= 0;
  const userSubmittedSongs =
    queueData?.userSubmittedSongs ??
    (queueData?.userSubmittedSong ? [queueData.userSubmittedSong] : []);

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
      {/* Header Banner */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60">
            Daily Queue Submissions
          </span>
          <span className="text-xs text-slate-500 font-medium">
            Date: {queueData?.date || "Today"} (IST)
          </span>
          <span
            id="remaining-submissions-badge"
            className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
              remainingSubmissions > 0
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
          >
            {remainingSubmissions} of {maxSubmissions} submissions remaining today
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Queue a Track for the Campus
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-xl">
          Pick songs that set the vibe. Each student gets up to 5 submissions
          per day to keep the playlist democratic and diverse.
        </p>
      </div>

      {/* Your Submissions Today Section */}
      {userSubmittedSongs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-emerald-50/80 via-white to-indigo-50/40 border border-emerald-200 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-emerald-100">
            <div>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider mb-0.5">
                {hasReachedLimit
                  ? "✓ All 5 Submissions Locked In"
                  : `✓ Your Submissions for Today (${userSubmissionsCount} of ${maxSubmissions})`}
              </span>
              <p className="text-xs text-slate-600">
                {hasReachedLimit
                  ? "You have reached your daily limit of 5 song submissions for today. Submissions reopen tomorrow at 12:00 AM IST."
                  : `You can submit ${remainingSubmissions} more track${remainingSubmissions === 1 ? "" : "s"} today.`}
              </p>
            </div>
            <span className="shrink-0 text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              {remainingSubmissions} left today
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {userSubmittedSongs.map((s, idx) => (
              <div
                key={s.id || idx}
                className="flex items-center gap-3 p-3 rounded-2xl bg-white/90 border border-emerald-100 shadow-xs"
              >
                <div className="relative w-14 h-10 rounded-xl overflow-hidden bg-slate-900 shrink-0">
                  {s.thumbnail_url && (
                    <img
                      src={s.thumbnail_url}
                      alt={s.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 truncate">
                    {s.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 truncate">
                    {s.artist} • Pos #{s.position}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {s.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Submission Form (Shown when user has remaining submissions) */}
      {!hasReachedLimit && (
        <div className="mb-12 p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xl shadow-slate-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error banner */}
            {submitError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium flex items-center gap-3">
                <span className="text-lg">⚠️</span>
                <span>{submitError}</span>
              </div>
            )}

            {/* Success banner */}
            {submitSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium flex items-center gap-3">
                <span className="text-lg">🎉</span>
                <span>{submitSuccess}</span>
              </div>
            )}


            {/* 1. URL Input — accepts YouTube or Spotify */}
            <div>
              <label
                htmlFor="videoUrl"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                1. YouTube or Spotify Track Link
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Paste a YouTube video link{" "}
                <span className="text-slate-400">or</span> a Spotify track link
                — we&apos;ll find the matching video for you.
              </p>
              <div className="relative">
                {/* URL type badge */}
                {videoUrl.trim() && (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                    {detectUrlType(videoUrl) === "youtube" && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-bold uppercase">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                        </svg>
                        YouTube
                      </span>
                    )}
                    {detectUrlType(videoUrl) === "spotify" && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-100 text-green-700 text-[10px] font-bold uppercase">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                        Spotify
                      </span>
                    )}
                  </div>
                )}

                <input
                  id="videoUrl"
                  type="text"
                  value={videoUrl}
                  onChange={(e) => {
                    setVideoUrl(e.target.value);
                    setPreviewMeta(null);
                    setPreviewError(null);
                  }}
                  placeholder="https://www.youtube.com/watch?v=... or https://open.spotify.com/track/..."
                  className={`w-full py-3.5 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base sm:text-sm placeholder:text-slate-400 transition-all ${
                    videoUrl.trim() && detectUrlType(videoUrl) !== "unknown"
                      ? "pl-24 pr-4"
                      : "px-4"
                  } border-slate-200`}
                  required
                />
                {isPreviewLoading && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs text-indigo-600 font-medium">
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    {previewMeta === null && detectUrlType(videoUrl) === "spotify"
                      ? "Resolving..."
                      : "Checking..."}
                  </div>
                )}
              </div>

              {previewError && (
                <p className="text-xs text-rose-600 mt-2 font-medium">
                  {previewError}
                </p>
              )}
            </div>

            {/* ── YouTube Preview Card ─────────────────────────────────────── */}
            <AnimatePresence>
              {previewMeta?.type === "youtube" && (
                <motion.div
                  key="yt-preview"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 sm:p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center gap-3 sm:gap-4">
                    <img
                      src={previewMeta.thumbnailUrl}
                      alt={previewMeta.title}
                      className="w-20 h-14 sm:w-24 sm:h-16 rounded-xl object-cover shadow-sm bg-slate-900 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">
                        ✓ Verified YouTube Video
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {previewMeta.title}
                      </h4>
                      <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                        {previewMeta.artist}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Spotify: Track Info + YouTube Candidate Picker ─────────── */}
              {previewMeta?.type === "spotify" && (
                <motion.div
                  key="spotify-preview"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4">
                    {/* Resolved Spotify Track Info */}
                    <div className="p-3 sm:p-4 rounded-2xl bg-green-50/60 border border-green-100 flex items-center gap-3 sm:gap-4">
                      {previewMeta.albumArtUrl ? (
                        <img
                          src={previewMeta.albumArtUrl}
                          alt={previewMeta.title}
                          className="w-14 h-14 rounded-xl object-cover shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                          <svg className="w-7 h-7 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold text-green-700 uppercase tracking-wide">
                            Spotify Track Found
                          </span>
                          {previewMeta.durationSeconds && (
                            <span className="text-[10px] text-slate-400">
                              {formatDuration(previewMeta.durationSeconds)}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {previewMeta.title}
                        </h4>
                        <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                          {previewMeta.allArtists}
                        </p>
                      </div>
                    </div>

                    {/* YouTube Candidate Picker */}
                    {previewMeta.youtubeSearchAvailable ? (
                      <>
                        {previewMeta.youtubeResults.length === 0 ? (
                          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                            <p className="font-bold mb-1">No YouTube matches found.</p>
                            <p className="text-amber-700">
                              We couldn&apos;t find a matching YouTube video for this track.
                              You can paste a YouTube link for it directly instead.
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                              Select the matching YouTube video
                            </p>
                            <div className="space-y-2">
                              {previewMeta.youtubeResults.map((result) => {
                                const isSelected =
                                  previewMeta.selectedVideoId === result.videoId;
                                return (
                                  <button
                                    key={result.videoId}
                                    type="button"
                                    onClick={() =>
                                      setPreviewMeta((prev) =>
                                        prev?.type === "spotify"
                                          ? { ...prev, selectedVideoId: result.videoId }
                                          : prev
                                      )
                                    }
                                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all touch-manipulation ${
                                      isSelected
                                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                                    id={`yt-result-${result.videoId}`}
                                  >
                                    <div className="relative shrink-0">
                                      <img
                                        src={result.thumbnailUrl}
                                        alt={result.title}
                                        className="w-20 h-[54px] rounded-xl object-cover bg-slate-900"
                                      />
                                      {isSelected && (
                                        <div className="absolute inset-0 rounded-xl bg-indigo-600/20 flex items-center justify-center">
                                          <span className="text-white text-lg">✓</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold text-slate-900 line-clamp-2 leading-snug">
                                        {result.title}
                                      </p>
                                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                        {result.channelTitle}
                                      </p>
                                    </div>
                                    {isSelected && (
                                      <span className="shrink-0 text-xs font-bold text-indigo-600 pr-1">
                                        Selected
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {!previewMeta.selectedVideoId && (
                              <p className="text-xs text-amber-600 font-medium mt-2">
                                Please select a video above before submitting.
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      // YouTube search not configured
                      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                        <p className="font-bold mb-1">YouTube search unavailable.</p>
                        <p className="text-amber-700">
                          The YouTube search API is not configured. Please paste a direct
                          YouTube link instead.
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 2. Mood Tag Selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                2. Select Mood Tag
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-2.5">
                {MOOD_TAGS.map((tag) => {
                  const isSelected = selectedMood === tag.value;
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => setSelectedMood(tag.value as MoodTag)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all min-h-[44px] touch-manipulation ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20 scale-[1.02]"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-base">{tag.emoji}</span>
                      <span>{tag.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Message / Dedication */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="message"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  3. Note or Dedication{" "}
                  <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <span
                  className={`text-xs ${
                    message.length > MAX_MESSAGE_LENGTH
                      ? "text-rose-600 font-bold"
                      : "text-slate-400"
                  }`}
                >
                  {message.length} / {MAX_MESSAGE_LENGTH}
                </span>
              </div>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MAX_MESSAGE_LENGTH}
                rows={2}
                placeholder="e.g. Vibes for late night coding in CC3..."
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base sm:text-sm placeholder:text-slate-400 transition-all resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !isReadyToSubmit}
              className="w-full py-3.5 sm:py-4 px-6 rounded-2xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/25 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px] touch-manipulation"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Adding Track to Campus Queue...
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>
                    Submit to Today&apos;s Broadcast ({remainingSubmissions} of {maxSubmissions} left)
                  </span>
                </>
              )}

            </button>
          </form>
        </div>
      )}

      {/* Queue View Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Today&apos;s Lineup
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks queued by fellow IIITL students for broadcast
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {queueData?.totalSongs || 0} tracks queued
          </span>
        </div>

        {isLoadingQueue ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-20 bg-slate-100 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : (
          <QueueList
            songs={queueData?.songs || []}
            currentUserId={user?.id}
            emptyMessage="No songs queued yet for today. Be the trendsetter and submit the first track!"
          />
        )}
      </div>
    </div>
  );
}
