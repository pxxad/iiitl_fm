"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { AuthoritativePlaybackState, ActiveSongDetails } from "@/lib/playback/sync";
import { calculateExpectedPosition, evaluateDrift } from "@/lib/playback/sync";
import { MOOD_TAGS } from "@/lib/constants";

// Declare YouTube IFrame API globals on window
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: (event: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  destroy: () => void;
}

interface LiveRadioPlayerProps {
  playbackState: AuthoritativePlaybackState | null;
  activeSong: ActiveSongDetails | null;
  syncStatus: "synced" | "syncing" | "offline";
  isMuted: boolean;
  volume: number;
  onToggleMute: () => void;
  onVolumeChange: (vol: number) => void;
  onTrackEnded: () => void;
  onPlaybackError: (songId: string, code: number) => void;
}

export function LiveRadioPlayer({
  playbackState,
  activeSong,
  syncStatus,
  isMuted,
  volume,
  onToggleMute,
  onVolumeChange,
  onTrackEnded,
  onPlaybackError,
}: LiveRadioPlayerProps) {
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const containerId = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`);

  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [estimatedDrift, setEstimatedDrift] = useState(0);

  const activeSongIdRef = useRef<string | null>(null);
  activeSongIdRef.current = activeSong?.id || null;

  // ─── 1. Load YouTube IFrame API Script ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // ─── 2. Initialize YouTube Player Instance ──────────────────────────────────
  const initPlayer = useCallback(() => {
    if (!window.YT || !window.YT.Player || playerRef.current) return;

    const currentExpected = calculateExpectedPosition(
      playbackState?.started_at,
      playbackState?.position_at_update,
      playbackState?.playback_status,
      activeSong?.duration_seconds
    );

    playerRef.current = new window.YT.Player(containerId.current, {
      videoId: activeSong?.video_id || "",
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        enablejsapi: 1,
        origin: typeof window !== "undefined" ? window.location.origin : "",
      },
      events: {
        onReady: (event) => {
          setIsPlayerReady(true);
          const p = event.target;
          p.setVolume(volume);

          if (isMuted) {
            p.mute();
          } else {
            p.unMute();
          }

          if (activeSong && playbackState?.playback_status === "playing") {
            p.seekTo(currentExpected, true);
            p.playVideo();
          }
        },
        onStateChange: (event) => {
          const stateCode = event.data;
          // 0 = ENDED
          if (stateCode === 0) {
            setIsPlaying(false);
            onTrackEnded();
          } else if (stateCode === 1) {
            // PLAYING
            setIsPlaying(true);
            setIsBuffering(false);
            setAutoplayBlocked(false);
          } else if (stateCode === 2) {
            // PAUSED (could be caused by browser autoplay block)
            setIsPlaying(false);
          } else if (stateCode === 3) {
            // BUFFERING
            setIsBuffering(true);
          } else if (stateCode === -1) {
            // UNSTARTED (potential autoplay block)
            setAutoplayBlocked(true);
          }
        },
        onError: (event) => {
          const errorCode = event.data;
          console.warn(`[LiveRadioPlayer] YouTube Player error ${errorCode} on song ${activeSongIdRef.current}`);
          if (activeSongIdRef.current) {
            onPlaybackError(activeSongIdRef.current, errorCode);
          }
        },
      },
    });
  }, [playbackState, activeSong, isMuted, volume, onTrackEnded, onPlaybackError]);

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        initPlayer();
      };
    }

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Player element might already be unmounted
        }
        playerRef.current = null;
      }
    };
  }, [initPlayer]);

  // ─── 3. Video ID Transition Handling ───────────────────────────────────────
  const currentVideoId = activeSong?.video_id;
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady || !currentVideoId) return;

    const expected = calculateExpectedPosition(
      playbackState?.started_at,
      playbackState?.position_at_update,
      playbackState?.playback_status,
      activeSong?.duration_seconds
    );

    try {
      playerRef.current.loadVideoById({
        videoId: currentVideoId,
        startSeconds: Math.floor(expected),
      });
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
      playerRef.current.playVideo();
    } catch (err) {
      console.warn("[LiveRadioPlayer] Video transition error:", err);
    }
  }, [currentVideoId, isPlayerReady, isMuted, playbackState, activeSong?.duration_seconds]);

  // ─── 4. Drift Synchronization & Position Tracking Loop ─────────────────────
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady || playbackState?.playback_status !== "playing") {
      return;
    }

    const syncInterval = setInterval(() => {
      try {
        if (!playerRef.current) return;

        const actualSeconds = playerRef.current.getCurrentTime();
        setCurrentTime(actualSeconds);

        const expectedSeconds = calculateExpectedPosition(
          playbackState.started_at,
          playbackState.position_at_update,
          playbackState.playback_status,
          activeSong?.duration_seconds
        );

        const evalResult = evaluateDrift(actualSeconds, expectedSeconds);
        setEstimatedDrift(Math.round(evalResult.driftSeconds * 10) / 10);

        // Apply drift correction if needed
        if (evalResult.action === "smooth_seek" || evalResult.action === "hard_seek") {
          playerRef.current.seekTo(evalResult.targetSeconds, true);
        }
      } catch {
        // Player might be re-buffering
      }
    }, 2000);

    return () => clearInterval(syncInterval);
  }, [isPlayerReady, playbackState, activeSong?.duration_seconds]);

  // ─── 5. Audio Controls Sync ────────────────────────────────────────────────
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;
    try {
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
      playerRef.current.setVolume(volume);
    } catch {
      // Player busy
    }
  }, [isMuted, volume, isPlayerReady]);

  // Handle User Click to Unmute Autoplay Block
  const handleUserInteract = () => {
    setAutoplayBlocked(false);
    if (playerRef.current) {
      try {
        playerRef.current.unMute();
        playerRef.current.playVideo();
      } catch {
        // Retry play
      }
    }
  };

  const moodObj = activeSong?.mood_tag
    ? MOOD_TAGS.find((m) => m.value === activeSong.mood_tag)
    : null;

  return (
    <div className="w-full rounded-3xl bg-slate-900 text-white overflow-hidden border border-slate-800 shadow-2xl relative">
      {/* Autoplay Blocked Banner / Click-to-Play Overlay */}
      {autoplayBlocked && (
        <div
          onClick={handleUserInteract}
          className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center cursor-pointer group transition-all"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/50 group-hover:scale-110 transition-transform mb-3">
            <svg
              className="w-8 h-8 text-white ml-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-white">
            Click to Tune In to IIITL FM
          </h3>
          <p className="text-xs text-slate-300 mt-1 max-w-xs">
            Browser policy requires one click to start live synchronized campus audio.
          </p>
        </div>
      )}

      {/* Main Player Display */}
      <div className="p-6 sm:p-8 flex flex-col lg:flex-row items-center justify-between gap-6">
        {/* Left: Album Artwork / Video Thumbnail with YouTube IFrame Container */}
        <div className="relative w-44 h-28 sm:w-56 sm:h-36 rounded-2xl overflow-hidden bg-black shrink-0 border border-slate-800 shadow-inner group">
          {/* YouTube Video Target Element (Kept visible in DOM for YouTube TOS compliance) */}
          <div
            id={containerId.current}
            className="w-full h-full object-cover pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity"
          />

          {/* Buffering Indicator */}
          {isBuffering && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center gap-2 text-xs font-semibold text-white">
              <svg
                className="animate-spin h-5 w-5 text-indigo-400"
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
              Buffering live track...
            </div>
          )}

          {/* Live Badge Overlay */}
          <div className="absolute top-2.5 left-2.5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-600/90 text-white backdrop-blur-sm shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          </div>
        </div>

        {/* Center: Track Metadata */}
        <div className="flex-1 min-w-0 text-center lg:text-left">
          {activeSong ? (
            <>
              <div className="flex items-center justify-center lg:justify-start gap-2 mb-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Track #{activeSong.position}
                </span>
                {moodObj && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    <span>{moodObj.emoji}</span>
                    <span>{moodObj.label}</span>
                  </span>
                )}
                <span className="text-[11px] text-slate-400">
                  Synced: {syncStatus === "synced" ? "🟢 Live" : syncStatus === "syncing" ? "🟡 Syncing" : "🔴 Reconnecting"}
                  {estimatedDrift !== 0 && ` (drift: ${estimatedDrift}s)`}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-white truncate tracking-tight">
                {activeSong.title}
              </h2>
              <p className="text-sm text-slate-400 truncate mt-1">
                {activeSong.artist || "Unknown Artist"}
              </p>

              {/* Submitter Credit */}
              <div className="mt-3 flex items-center justify-center lg:justify-start gap-2">
                <span className="text-xs text-slate-400">Selected by</span>
                <span className="text-xs font-semibold text-indigo-400">
                  {activeSong.submitter_name || activeSong.profiles?.full_name || "Campus Student"}
                </span>
                {activeSong.profiles?.branch && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {activeSong.profiles.branch}
                  </span>
                )}
              </div>

              {/* Dedication Note */}
              {activeSong.message && (
                <p className="mt-2 text-xs italic text-slate-300 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/60 max-w-lg inline-block">
                  &ldquo;{activeSong.message}&rdquo;
                </p>
              )}
            </>
          ) : (
            <div className="py-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 mb-2">
                Station Idle
              </span>
              <h2 className="text-xl font-bold text-white">
                Queue is Waiting for Next Track
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                The live room is on air. Head to Submit to queue up a song!
              </p>
            </div>
          )}
        </div>

        {/* Right: Audio Volume & Controls */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Mute/Unmute Button */}
          <button
            onClick={onToggleMute}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
              isMuted
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                : "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
            }`}
            title={isMuted ? "Unmute Live Stream" : "Mute Live Stream"}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>

          {/* Volume Slider */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-20 sm:w-24 accent-indigo-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />
            <span className="text-xs text-slate-400 w-7 text-right">
              {isMuted ? "0%" : `${volume}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Progress Bar: Synchronized Position Indicator */}
      <div className="w-full h-1 bg-slate-800">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500 transition-all duration-1000 ease-linear"
          style={{
            width: activeSong?.duration_seconds
              ? `${Math.min(100, (currentTime / activeSong.duration_seconds) * 100)}%`
              : isPlaying
              ? "100%"
              : "0%",
          }}
        />
      </div>
    </div>
  );
}
