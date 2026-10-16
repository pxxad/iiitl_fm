"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";

export default function HomePage() {
  const { user, profile, isCampusMember, isLoading } = useAuth();

  const studentName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0];

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden bg-gradient-to-b from-indigo-50/50 via-white to-slate-50">
      {/* Background Decorative Blur Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-purple-400/10 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-3xl mx-auto text-center relative z-10">
        {/* Live On-Air Pill */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200/80 shadow-sm mb-6"
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          <span className="text-xs font-bold uppercase tracking-widest text-rose-600">
            Live Stream Active
          </span>
        </motion.div>

        {/* Massive IIITL FM Wordmark */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-extrabold text-6xl sm:text-7xl md:text-8xl tracking-tight text-slate-900 leading-none"
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
          className="mt-6 text-base sm:text-lg md:text-xl text-slate-600 max-w-xl mx-auto leading-relaxed"
        >
          The campus radio station, built by students, for students.
          <br className="hidden sm:inline" /> One song. One campus. Real-time shared vibes.
        </motion.p>

        {/* User Greeting or Campus Access Pill */}
        {!isLoading && user && isCampusMember ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-indigo-50/80 border border-indigo-200/60 text-indigo-900 text-sm font-medium"
          >
            <span className="text-base">👋</span>
            <span>
              Welcome back, <strong className="font-semibold">{studentName}</strong>!
            </span>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200/80 text-slate-600 text-xs font-medium"
          >
            <span>🔒</span>
            <span>Exclusive to verified @iiitl.ac.in accounts</span>
          </motion.div>
        )}

        {/* Interactive Action CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5"
        >
          <Link
            href="/submit"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/25 active:scale-95 transition-all"
          >
            <span>🎵</span>
            <span>Submit Today&apos;s Song</span>
          </Link>

          {!isLoading && (!user || !isCampusMember) ? (
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm active:scale-95 transition-all"
            >
              <span>🔑</span>
              <span>Sign In with @iiitl.ac.in</span>
            </Link>
          ) : (
            <Link
              href="/discover"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm active:scale-95 transition-all"
            >
              <span>📻</span>
              <span>View Today&apos;s Queue</span>
            </Link>
          )}
        </motion.div>

        {/* Feature Cards Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-2xl mx-auto"
        >
          <div className="p-5 rounded-2xl bg-white/70 border border-slate-200/70 shadow-sm">
            <div className="text-2xl mb-2">📻</div>
            <h2 className="text-sm font-semibold text-slate-900">Synchronized Room</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Everyone on campus listens to the exact same second of the song simultaneously.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/70 border border-slate-200/70 shadow-sm">
            <div className="text-2xl mb-2">⚡</div>
            <h2 className="text-sm font-semibold text-slate-900">Live Reactions</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Drop 🔥, ❤️, and vibes in real-time as drops hit and beats roll.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/70 border border-slate-200/70 shadow-sm">
            <div className="text-2xl mb-2">🎓</div>
            <h2 className="text-sm font-semibold text-slate-900">Campus Exclusive</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Strictly authenticated with @iiitl.ac.in. Your peers, your radio.
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
