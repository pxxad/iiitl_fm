"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AuthoritativePlaybackState, ActiveSongDetails } from "./sync";

export function usePlayback() {
  const [playbackState, setPlaybackState] = useState<AuthoritativePlaybackState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "offline">("syncing");
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(80);

  const supabase = createClient();
  const currentRevisionRef = useRef<number>(0);

  const fetchState = useCallback(async () => {
    try {
      setSyncStatus("syncing");
      const res = await fetch("/api/playback/state");
      if (res.ok) {
        const data: AuthoritativePlaybackState = await res.json();
        // Ignore stale updates if local state is already newer
        if (data.revision >= currentRevisionRef.current) {
          currentRevisionRef.current = data.revision;
          setPlaybackState(data);
          setSyncStatus("synced");
        }
      }
    } catch (err) {
      console.warn("[usePlayback] Failed to fetch state:", err);
      setSyncStatus("offline");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();

    // ─── 1. Supabase Realtime Subscription ──────────────────────────────────
    const channel = supabase
      .channel("playback-state-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "playback_state",
          filter: "id=eq.singleton",
        },
        () => {
          // Playback state updated on server — fetch latest full state with song details
          fetchState();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSyncStatus("synced");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setSyncStatus("offline");
        }
      });

    // ─── 2. Heartbeat & Reconnect Listeners ─────────────────────────────────
    // Polling heartbeat every 15s in case realtime WebSocket drops or misses an event
    const interval = setInterval(fetchState, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchState();
      }
    };

    const handleOnline = () => {
      fetchState();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [supabase, fetchState]);

  const advanceTrack = async () => {
    try {
      const res = await fetch("/api/playback/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedSongId: playbackState?.current_song_id,
          reason: "ended",
        }),
      });
      if (res.ok) {
        await fetchState();
      }
    } catch (err) {
      console.error("[usePlayback] Advance track failed:", err);
    }
  };

  const reportPlaybackError = async (songId: string, errorCode: number) => {
    try {
      await fetch("/api/playback/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, errorCode }),
      });
      await fetchState();
    } catch (err) {
      console.error("[usePlayback] Report error failed:", err);
    }
  };

  const toggleMute = () => setIsMuted((prev) => !prev);

  const activeSong: ActiveSongDetails | null = playbackState?.song || null;

  return {
    playbackState,
    activeSong,
    isLoading,
    syncStatus,
    isMuted,
    volume,
    setIsMuted,
    setVolume,
    toggleMute,
    advanceTrack,
    reportPlaybackError,
    refetchState: fetchState,
  };
}
