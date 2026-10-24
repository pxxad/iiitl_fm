"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
import { isCampusEmail } from "@/lib/auth/domain-guard";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isCampusMember: boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setProfile(data as Profile);
      }
    } catch {
      // Profile might not exist yet before trigger/callback completes
    }
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      // If Supabase environment variables are missing or placeholders, avoid failing network requests
      if (!publicEnv.isConfigured) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user && isMounted) {
          setUser(session.user);
          if (isCampusEmail(session.user.email)) {
            await fetchProfile(session.user.id);
          }
        }
      } catch (err) {
        console.error("[AuthProvider] Session error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    if (!publicEnv.isConfigured) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;

      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser && isCampusEmail(currentUser.email)) {
        await fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signInWithGoogle = async (redirectTo = "/") => {
    if (!publicEnv.isConfigured) {
      throw new Error(
        "Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
    }

    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000";

    const callbackUrl = `${origin}/auth/callback`;

    // Persist destination across OAuth redirects
    if (typeof document !== "undefined" && redirectTo && redirectTo !== "/") {
      document.cookie = `sb_auth_next=${encodeURIComponent(
        redirectTo
      )}; path=/; max-age=300; SameSite=Lax`;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
          hd: "iiitl.ac.in", // Domain hint to guide the Google prompt
        },
      },
    });

    if (error) {
      throw error;
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsLoading(false);
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  const isCampusMember = !!user?.email && isCampusEmail(user.email);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isCampusMember,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return context;
}
