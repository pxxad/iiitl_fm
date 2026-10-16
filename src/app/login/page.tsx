"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { motion } from "framer-motion";
import Link from "next/link";

function LoginContent() {
  const searchParams = useSearchParams();
  const { signInWithGoogle, isLoading: authLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const error = searchParams.get("error");
  const redirectTo = searchParams.get("redirectTo") || "/";

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle(redirectTo);
    } catch (err) {
      console.error("[Login] Google OAuth launch failed:", err);
      setIsSigningIn(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Error Alert Banners */}
      {error === "campus_access_only" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200/80 shadow-sm text-rose-900"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 mt-0.5 text-rose-600 font-bold">
              !
            </div>
            <div>
              <h3 className="text-sm font-semibold text-rose-900">
                Campus Access Only
              </h3>
              <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                You attempted to sign in with a non-campus account. IIITL FM is
                strictly restricted to verified{" "}
                <span className="font-semibold underline">@iiitl.ac.in</span>{" "}
                institutional Google accounts.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {error === "auth_failed" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm text-amber-900"
        >
          <div className="flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <h3 className="text-sm font-semibold">Sign-in Incomplete</h3>
              <p className="text-xs text-amber-700 mt-1">
                The sign-in process could not be completed. Please try again.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {error === "missing_code" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm text-slate-800"
        >
          <p className="text-xs text-slate-600">
            Authorization code was missing or expired. Please sign in again.
          </p>
        </motion.div>
      )}

      {/* Main Login Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 sm:p-10 border border-slate-200/80 shadow-xl shadow-indigo-500/5 text-center relative overflow-hidden"
      >
        {/* Glow Accent */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Welcome to{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            IIITL FM
          </span>
        </h1>

        <p className="mt-2 text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
          The shared live radio for the Indian Institute of Information
          Technology, Lucknow.
        </p>

        {/* Institution Badge */}
        <div className="inline-flex items-center gap-2 mt-4 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100/80 text-indigo-700 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-indigo-600" />
          Restricted to @iiitl.ac.in accounts
        </div>

        {/* OAuth Action Button */}
        <div className="mt-8 space-y-4">
          <button
            onClick={handleSignIn}
            disabled={isSigningIn || authLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl font-semibold text-sm bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/10 active:scale-[0.99] transition-all disabled:opacity-70 disabled:cursor-not-allowed group"
          >
            {isSigningIn ? (
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
                Connecting with Google...
              </>
            ) : (
              <>
                {/* Official Google 'G' icon */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continue with IIITL Google Account
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-400 leading-normal px-2">
            By signing in, you agree to campus listening guidelines. Your
            display name and profile picture will appear on song submissions.
          </p>
        </div>

        {/* Back Link */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <Link
            href="/"
            className="hover:text-slate-800 transition-colors inline-flex items-center gap-1 font-medium"
          >
            ← Return to Home
          </Link>
          <span className="text-slate-400">IIIT Lucknow Campus Only</span>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <Suspense
        fallback={
          <div className="w-full max-w-md mx-auto p-12 bg-white/70 rounded-3xl animate-pulse text-center text-slate-400">
            Loading authentication portal...
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </div>
  );
}
