"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import { useAuth } from "@/lib/auth/context";
import { MOOD_TAGS, MAX_MESSAGE_LENGTH } from "@/lib/constants";
import type { MoodTag } from "@/lib/types";
import { QueueList } from "@/components/QueueList";
import type { QueueResponse } from "@/app/api/queue/today/route";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function SubmitPage() {
  const { user, isCampusMember, isLoading: authLoading } = useAuth();

  const [queueData, setQueueData] = useState<QueueResponse | null>(null);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);

  // Form states
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodTag>("chill");
  const [message, setMessage] = useState("");

  // Video preview states
  const [previewMeta, setPreviewMeta] = useState<{
    videoId: string;
    title: string;
    artist: string;
    thumbnailUrl: string;
  } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Submission status
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Load today's queue
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

  // Debounced video preview fetch
  useEffect(() => {
    const trimmed = videoUrl.trim();
    if (!trimmed) {
      setPreviewMeta(null);
      setPreviewError(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsPreviewLoading(true);
        setPreviewError(null);

        const res = await fetch(
          `/api/youtube/preview?url=${encodeURIComponent(trimmed)}`
        );
        const data = await res.json();

        if (res.ok) {
          setPreviewMeta(data);
          setPreviewError(null);
        } else {
          setPreviewMeta(null);
          setPreviewError(data.error || "Invalid YouTube link.");
        }
      } catch {
        setPreviewMeta(null);
        setPreviewError("Network error checking YouTube link.");
      } finally {
        setIsPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [videoUrl]);

  // Handle Song Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl || !previewMeta) return;

    setSubmitError(null);
    setSubmitSuccess(null);

    startSubmitTransition(async () => {
      try {
        const res = await fetch("/api/songs/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoUrl,
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
          // Refresh queue to show the new submission
          await fetchTodayQueue();
        } else {
          setSubmitError(data.error || "Failed to submit song.");
        }
      } catch {
        setSubmitError("Network error occurred while submitting song.");
      }
    });
  };

  // ─── Unauthenticated State ────────────────────────────────────────────────
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

  const hasAlreadySubmitted = !!queueData?.userSubmittedSong;

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
      {/* Header Banner */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60">
            Daily Queue Submissions
          </span>
          <span className="text-xs text-slate-500 font-medium">
            Date: {queueData?.date || "Today"} (IST)
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Queue a Track for the Campus
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-xl">
          Pick a song that sets the vibe. Each student gets 1 submission per day
          to keep the playlist democratic and diverse.
        </p>
      </div>

      {/* Already Submitted Today Notification */}
      {hasAlreadySubmitted && queueData?.userSubmittedSong && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-emerald-50/80 via-white to-indigo-50/40 border border-emerald-200 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-14 rounded-2xl overflow-hidden bg-slate-900 shrink-0 shadow-sm">
                {queueData.userSubmittedSong.thumbnail_url && (
                  <img
                    src={queueData.userSubmittedSong.thumbnail_url}
                    alt={queueData.userSubmittedSong.title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider mb-1">
                  ✓ Your Song for Today is Locked In
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {queueData.userSubmittedSong.title}
                </h3>
                <p className="text-xs text-slate-500">
                  {queueData.userSubmittedSong.artist} • Position #
                  {queueData.userSubmittedSong.position} in queue
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Status: {queueData.userSubmittedSong.status.toUpperCase()}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">
                Next submission opens tomorrow at 12:00 AM IST
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Submission Form (Only if student hasn't submitted yet) */}
      {!hasAlreadySubmitted && (
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

            {/* 1. YouTube Link Input */}
            <div>
              <label
                htmlFor="videoUrl"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
              >
                1. YouTube Link or Video ID
              </label>
              <div className="relative">
                <input
                  id="videoUrl"
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base sm:text-sm placeholder:text-slate-400 transition-all"
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
                    Checking...
                  </div>
                )}
              </div>

              {previewError && (
                <p className="text-xs text-rose-600 mt-2 font-medium">
                  {previewError}
                </p>
              )}
            </div>

            {/* Video Preview Card */}
            <AnimatePresence>
              {previewMeta && (
                <motion.div
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
                        Verified YouTube Video
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

            {/* 3. Message / Dedication (Optional) */}
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
              disabled={isSubmitting || !previewMeta}
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
                  <span>Submit to Today&apos;s Broadcast</span>
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
