"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { usePlayback } from "@/lib/playback/usePlayback";
import { useLiveRoom } from "@/lib/realtime/useLiveRoom";
import { LiveRadioPlayer } from "@/components/player/LiveRadioPlayer";
import { SkipVoteControl } from "@/components/player/SkipVoteControl";
import { ReactionPicker } from "@/components/reactions/ReactionPicker";
import { LiveChat } from "@/components/chat/LiveChat";
import { PresenceBadge } from "@/components/presence/PresenceBadge";

export default function HomePage() {
  const { user, profile, isCampusMember, isLoading: authLoading } = useAuth();
  const {
    playbackState,
    activeSong,
    syncStatus,
    isMuted,
    volume,
    toggleMute,
    setVolume,
    advanceTrack,
    reportPlaybackError,
  } = usePlayback();

  const {
    messages,
    reactionCounts,
    userReaction,
    activeListeners,
    approxListenerCount,
    floatingEmojis,
    isSendingMessage,
    chatCooldownRemaining,
    reactionCooldown,
    toggleReaction,
    sendMessage,
  } = useLiveRoom({
    currentSongId: activeSong?.id || null,
    user,
    profile,
  });

  const studentName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0];

  return (
    <main className="flex-1 flex flex-col items-center justify-start px-4 py-8 sm:py-10 relative overflow-hidden bg-gradient-to-b from-indigo-50/50 via-white to-slate-50">
      {/* Background Decorative Blur Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-purple-400/10 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-5xl mx-auto w-full text-center relative z-10">
        {/* Top Room Banner: Live Pill & Presence */}
        <div className="flex items-center justify-center gap-3 mb-3 flex-wrap">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200/80 shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-widest text-rose-600">
              IIITL FM Live Stream
            </span>
          </motion.div>

          <PresenceBadge
            approxCount={approxListenerCount}
            activeListeners={activeListeners}
          />
        </div>

        {/* Wordmark */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-extrabold text-3xl sm:text-5xl md:text-6xl tracking-tight text-slate-900 leading-none"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          IIITL{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500">
            FM
          </span>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-2.5 text-xs sm:text-base text-slate-600 max-w-lg mx-auto leading-relaxed px-2"
        >
          One shared live radio for the campus. Everyone hears the same second together.
        </motion.p>

        {/* ─── Main Live Room Player & Reactions ──────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 text-left"
        >
          <LiveRadioPlayer
            playbackState={playbackState}
            activeSong={activeSong}
            syncStatus={syncStatus}
            isMuted={isMuted}
            volume={volume}
            onToggleMute={toggleMute}
            onVolumeChange={setVolume}
            onTrackEnded={advanceTrack}
            onPlaybackError={reportPlaybackError}
          />

          {/* Interactive Live Reactions Bar & Democratic Skip Voting */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4">
            <ReactionPicker
              currentSongId={activeSong?.id || null}
              reactionCounts={reactionCounts}
              userReaction={userReaction}
              onToggleReaction={toggleReaction}
              disabled={reactionCooldown}
              floatingEmojis={floatingEmojis}
              isCampusUser={isCampusMember}
            />
            <SkipVoteControl
              currentSongId={activeSong?.id || null}
              isCampusUser={isCampusMember}
              userRole={profile?.role}
              onSongAdvanced={advanceTrack}
            />
          </div>
        </motion.div>

        {/* ─── Two-Column Room Experience: Info & Live Chat ───────────────── */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
          {/* Left Column: Greeting, Room Info, Shortcuts (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Greeting / Access Controls */}
            <div className="p-4 rounded-3xl bg-white/70 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-lg shrink-0">
                  🎓
                </div>
                <div>
                  {!authLoading && user && isCampusMember ? (
                    <p className="text-xs text-slate-700 font-medium">
                      Listening as <strong className="text-slate-900">{studentName}</strong> ({user.email})
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600">
                      Guest listener mode. Sign in with <span className="font-semibold text-slate-800">@iiitl.ac.in</span> to queue tracks & react!
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Link
                  href="/submit"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all min-h-[40px] touch-manipulation"
                >
                  <span>🎵</span>
                  <span>Submit Song</span>
                </Link>
                <Link
                  href="/discover"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 transition-all min-h-[40px] touch-manipulation"
                >
                  <span>📻</span>
                  <span>Today&apos;s Queue</span>
                </Link>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-2xl bg-white/60 border border-slate-200/60 shadow-sm">
                <div className="text-xl mb-1">⚡</div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Live Reactions
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Curated emoji vibes float up in real-time across all campus listeners on beat drops.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/60 border border-slate-200/60 shadow-sm">
                <div className="text-xl mb-1">💬</div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Synchronized Chat
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Chat with fellow students in the room. Verified @iiitl.ac.in handles with branch badges.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/60 border border-slate-200/60 shadow-sm">
                <div className="text-xl mb-1">👥</div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Realtime Presence
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  See approximate campus listeners tuned into the shared live radio stream.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/60 border border-slate-200/60 shadow-sm">
                <div className="text-xl mb-1">🛡️</div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  TOS Compliant Player
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Official YouTube IFrame Player API. Zero audio scraping, downloading, or ad bypassing.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Live Chat (5 cols) */}
          <div className="lg:col-span-5">
            <LiveChat
              messages={messages}
              onSendMessage={sendMessage}
              isSending={isSendingMessage}
              cooldownRemaining={chatCooldownRemaining}
              isCampusUser={isCampusMember}
              userRole={profile?.role}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
