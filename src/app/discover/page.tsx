"use client";

import React, { useState, useEffect, useCallback } from "react";
import { QueueList } from "@/components/QueueList";
import type { QueueResponse } from "@/app/api/queue/today/route";
import { useAuth } from "@/lib/auth/context";
import Link from "next/link";

export default function DiscoverPage() {
  const { user } = useAuth();
  const [queueData, setQueueData] = useState<QueueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isHistoricalView, setIsHistoricalView] = useState(false);

  const fetchQueue = useCallback(async (date?: string) => {
    try {
      setIsLoading(true);
      const url = date ? `/api/queue/history?date=${encodeURIComponent(date)}` : "/api/queue/today";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setQueueData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Failed to load queue for the requested date.");
      }
    } catch (err) {
      console.error("[Discover] Failed to fetch queue:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    setSelectedDate(d);
    if (d) {
      setIsHistoricalView(true);
      fetchQueue(d);
    }
  };

  const resetToToday = () => {
    setIsHistoricalView(false);
    setSelectedDate("");
    fetchQueue();
  };

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              {isHistoricalView ? "Archived Lineup" : "Campus Lineup"}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Queue Date: {queueData?.date || "Today"} (Asia/Kolkata)
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            {isHistoricalView ? `Broadcast Archive (${queueData?.date})` : "Today's Broadcast Queue"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl">
            {isHistoricalView
              ? "Read-only archive of songs submitted and broadcast on this date."
              : "Live queue of tracks submitted by students for today's shared campus listening session."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <div className="flex items-center justify-between sm:justify-start gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-slate-200 shadow-sm text-xs min-h-[44px]">
            <label htmlFor="history-date-picker" className="font-semibold text-slate-600 flex items-center gap-1 shrink-0">
              <span>📅</span> Past:
            </label>
            <input
              id="history-date-picker"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              max={new Date().toISOString().split("T")[0]}
              className="text-xs text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer flex-1 sm:flex-initial min-w-[130px]"
            />
            {isHistoricalView && (
              <button
                onClick={resetToToday}
                className="text-indigo-600 hover:text-indigo-800 font-bold ml-1 text-xs px-2 py-1 rounded-lg bg-indigo-50 touch-manipulation"
                title="Return to today's queue"
              >
                Today
              </button>
            )}
          </div>

          <Link
            href="/submit"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 active:scale-95 transition-all min-h-[44px] touch-manipulation"
          >
            <span>🎵</span>
            <span>Submit a Song</span>
          </Link>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-10">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-xl mb-1">🗳️</div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            Up to 5 Songs Per Student
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Every IIITL student gets up to 5 contributions daily to ensure an active
            and diverse musical rotation.
          </p>

        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-xl mb-1">⚡</div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            Democratic Skip Voting
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            If 50% of active listeners vote to skip a song, the live player
            transitions to the next track.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-xl mb-1">🕛</div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            Midnight IST Reset
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            A new daily queue opens automatically at 00:00 IST every night for
            the next day&apos;s submissions.
          </p>
        </div>
      </div>

      {/* Songs List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            Queue Lineup ({queueData?.totalSongs || 0})
          </h2>
          <button
            onClick={() => fetchQueue()}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <span>🔄</span> Refresh Queue
          </button>
        </div>

        {isLoading ? (
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
            emptyMessage="No tracks have been queued yet today. Head over to Submit Song and be the first!"
          />
        )}
      </div>
    </div>
  );
}
