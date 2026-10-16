"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";

interface LiveChatProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => Promise<{ success: boolean; error?: string }>;
  isSending: boolean;
  cooldownRemaining: number;
  isCampusUser: boolean;
}

export function LiveChat({
  messages,
  onSendMessage,
  isSending,
  cooldownRemaining,
  isCampusUser,
}: LiveChatProps) {
  const [input, setInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCampusUser || isSending || cooldownRemaining > 0) return;

    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
      setErrorMessage(`Message must be ${MAX_CHAT_MESSAGE_LENGTH} characters or less.`);
      return;
    }

    setErrorMessage(null);
    const result = await onSendMessage(trimmed);
    if (result.success) {
      setInput("");
    } else {
      setErrorMessage(result.error || "Failed to send message");
    }
  };

  const charsRemaining = MAX_CHAT_MESSAGE_LENGTH - input.length;

  return (
    <div className="flex flex-col h-[480px] rounded-3xl bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden">
      {/* ─── Chat Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            Campus Live Chat
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          {messages.length} {messages.length === 1 ? "message" : "messages"}
        </span>
      </div>

      {/* ─── Message Transcript ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-white/10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="text-3xl mb-2">👋</div>
            <p className="text-xs font-semibold text-slate-200">No messages yet</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
              Drop a message to say hi to everyone tuned in on campus!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const displayName =
              msg.profiles?.full_name?.split(" ")[0] || "Student";
            const branch = msg.profiles?.branch;

            return (
              <div
                key={msg.id}
                className="group flex flex-col items-start gap-1 text-xs"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-indigo-300">
                    {displayName}
                  </span>
                  {branch && (
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/20">
                      {branch}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {/* Safe text rendering: React automatically escapes HTML to prevent XSS */}
                <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-white/5 border border-white/5 text-slate-200 break-words max-w-full leading-relaxed">
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Error Notification ────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="px-4 py-1.5 bg-rose-500/10 border-t border-rose-500/20 text-rose-300 text-[11px] flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Input Form or Sign-In Prompt ──────────────────────────────────── */}
      <div className="p-3 border-t border-white/10 bg-slate-950/40">
        {isCampusUser ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={MAX_CHAT_MESSAGE_LENGTH}
                placeholder={
                  cooldownRemaining > 0
                    ? `Wait ${cooldownRemaining}s...`
                    : "Say something to campus..."
                }
                disabled={isSending || cooldownRemaining > 0}
                className="flex-1 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 transition-all"
              />
              <button
                type="submit"
                disabled={
                  !input.trim() ||
                  isSending ||
                  cooldownRemaining > 0 ||
                  input.length > MAX_CHAT_MESSAGE_LENGTH
                }
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all shadow-sm shrink-0"
              >
                {isSending ? "..." : "Send"}
              </button>
            </div>

            <div className="flex items-center justify-between px-1 text-[10px] text-slate-500">
              <span>Verified @iiitl.ac.in chat</span>
              <span
                className={
                  charsRemaining < 20
                    ? "text-amber-400 font-bold"
                    : "text-slate-500"
                }
              >
                {input.length}/{MAX_CHAT_MESSAGE_LENGTH}
              </span>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white/5 border border-white/5 text-xs text-slate-300">
            <span>🔒 Sign in with @iiitl.ac.in to chat</span>
            <Link
              href="/login"
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shrink-0"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
