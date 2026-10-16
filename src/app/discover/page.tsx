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

  const fetchQueue = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/queue/today");
      if (res.ok) {
        const data: QueueResponse = await res.json();
        setQueueData(data);
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

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              Campus Lineup
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Queue Date: {queueData?.date || "Today"} (Asia/Kolkata)
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Today&apos;s Broadcast Queue
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-xl">
            Live queue of tracks submitted by students for today&apos;s shared
            campus listening session.
          </p>
        </div>

        <Link
          href="/submit"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 active:scale-95 transition-all self-start sm:self-center"
        >
          <span>🎵</span>
          <span>Submit a Song</span>
        </Link>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-10">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-xl mb-1">🗳️</div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            One Song Per Student
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Every IIITL student gets 1 contribution daily to ensure fair and
            diverse musical rotation.
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
            onClick={fetchQueue}
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
