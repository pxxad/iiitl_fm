"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

export function BottomNav() {
  const pathname = usePathname();
  const { user, profile, isCampusMember } = useAuth();

  const navItems = [
    {
      label: "Live Room",
      href: "/",
      icon: (active: boolean) => (
        <span className={`text-xl transition-transform ${active ? "scale-110" : "opacity-70"}`}>
          📻
        </span>
      ),
      active: pathname === "/",
    },
    {
      label: "Submit Song",
      href: "/submit",
      icon: (active: boolean) => (
        <span className={`text-xl transition-transform ${active ? "scale-110" : "opacity-70"}`}>
          🎵
        </span>
      ),
      active: pathname === "/submit",
    },
    {
      label: "Daily Queue",
      href: "/discover",
      icon: (active: boolean) => (
        <span className={`text-xl transition-transform ${active ? "scale-110" : "opacity-70"}`}>
          📜
        </span>
      ),
      active: pathname === "/discover",
    },
    {
      label: user && isCampusMember ? (profile?.branch || "Profile") : "Sign In",
      href: user && isCampusMember ? "/" : "/login",
      icon: (active: boolean) =>
        user && isCampusMember && profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt="Avatar"
            className="w-5 h-5 rounded-full object-cover border border-slate-300"
          />
        ) : (
          <span className={`text-xl transition-transform ${active ? "scale-110" : "opacity-70"}`}>
            {user && isCampusMember ? "🎓" : "🔑"}
          </span>
        ),
      active: pathname === "/login",
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-lg px-2 py-1 pb-safe md:hidden"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl min-w-[64px] min-h-[48px] transition-all touch-manipulation ${
              item.active
                ? "text-indigo-600 font-bold"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <div className="relative">
              {item.icon(item.active)}
              {item.active && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight leading-tight truncate max-w-[70px]">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
