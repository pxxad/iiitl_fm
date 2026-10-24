"use client";

import React, { useState } from "react";
import { REPORT_REASONS } from "@/lib/constants";
import type { ReportReason } from "@/lib/types";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: "song" | "chat_message";
  targetId: string;
  targetTitle?: string;
}

export function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetTitle,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>("offensive_content");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          details: details.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        setErrorMsg(json.error?.message || "Failed to submit report");
      } else {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setDetails("");
          onClose();
        }, 1500);
      }
    } catch {
      setErrorMsg("Network error submitting report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/10 p-5 sm:p-6 shadow-2xl text-left max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚩</span>
            <h3 className="text-base font-bold text-white">
              Report {targetType === "song" ? "Song" : "Chat Message"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="text-slate-400 hover:text-white text-lg w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-white/5 touch-manipulation"
          >
            ✕
          </button>
        </div>

        {targetTitle && (
          <p className="text-xs text-slate-400 mb-4 truncate">
            Target: <strong className="text-slate-200">{targetTitle}</strong>
          </p>
        )}

        {success ? (
          <div className="py-8 text-center text-emerald-400">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-semibold">Report submitted</p>
            <p className="text-xs text-slate-400 mt-1">
              Thank you for keeping IIITL FM safe.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Reason for reporting
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-base sm:text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[44px]"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value} className="bg-slate-900 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Additional Details (Optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={300}
                placeholder="Explain the issue for campus moderators..."
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
              <span className="text-[10px] text-slate-500 float-right mt-1">
                {details.length}/300
              </span>
            </div>

            {errorMsg && (
              <p className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                ⚠️ {errorMsg}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-all min-h-[44px] touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all shadow-md shadow-rose-600/30 min-h-[44px] touch-manipulation"
              >
                {isSubmitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
