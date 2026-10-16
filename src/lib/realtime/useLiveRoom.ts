"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  LIVE_ROOM_CHANNEL,
  CHAT_RATE_LIMIT_MS,
  REACTION_RATE_LIMIT_MS,
} from "@/lib/constants";
import type {
  ChatMessage,
  PresenceUser,
  ReactionCounts,
  ReactionType,
  Profile,
} from "@/lib/types";
import { validateBroadcastChatMessage } from "./validation";

export interface EmojiBurst {
  id: string;
  emoji: string;
  x: number; // Random horizontal percentage (10% to 90%)
}

interface UseLiveRoomProps {
  currentSongId: string | null;
  user: { id: string; email?: string } | null;
  profile: Profile | null;
}

export function useLiveRoom({ currentSongId, user, profile }: UseLiveRoomProps) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactionCounts, setReactionCounts] = useState<ReactionCounts>({});
  const [userReaction, setUserReaction] = useState<ReactionType | null>(null);
  const [activeListeners, setActiveListeners] = useState<PresenceUser[]>([]);
  const [approxListenerCount, setApproxListenerCount] = useState<number>(1);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatCooldownRemaining, setChatCooldownRemaining] = useState(0);
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<EmojiBurst[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const songIdRef = useRef<string | null>(currentSongId);
  songIdRef.current = currentSongId;


  // ─── Floating Emoji Burst Trigger ──────────────────────────────────────────
  const triggerEmojiBurst = useCallback((emoji: string) => {
    const burst: EmojiBurst = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      emoji,
      x: 15 + Math.floor(Math.random() * 70),
    };
    setFloatingEmojis((prev) => [...prev.slice(-15), burst]);
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((b) => b.id !== burst.id));
    }, 2500);
  }, []);

  // ─── Fetch Initial Reaction State ──────────────────────────────────────────
  const fetchReactions = useCallback(async (songId: string) => {
    try {
      const res = await fetch(`/api/reactions?song_id=${encodeURIComponent(songId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setReactionCounts(json.data.counts || {});
          setUserReaction(json.data.userReaction || null);
        }
      }
    } catch (err) {
      console.warn("[Live Room] Failed to fetch reactions:", err);
    }
  }, []);

  // ─── Fetch Initial Chat History ────────────────────────────────────────────
  const fetchChatMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/messages?limit=50");
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          setMessages(json.data);
        }
      }
    } catch (err) {
      console.warn("[Live Room] Failed to fetch chat messages:", err);
    }
  }, []);

  // ─── Toggle Reaction ───────────────────────────────────────────────────────
  const toggleReaction = useCallback(
    async (reactionType: ReactionType) => {
      if (!currentSongId || !user || reactionCooldown) return;

      setReactionCooldown(true);
      setTimeout(() => setReactionCooldown(false), REACTION_RATE_LIMIT_MS);

      // Optimistic local update
      const previousCounts = { ...reactionCounts };
      const previousUserReaction = userReaction;

      const isRemoving = userReaction === reactionType;
      const nextType = isRemoving ? null : reactionType;

      const updatedCounts = { ...reactionCounts };
      if (previousUserReaction && updatedCounts[previousUserReaction]) {
        updatedCounts[previousUserReaction] = Math.max(0, (updatedCounts[previousUserReaction] || 1) - 1);
      }
      if (!isRemoving) {
        updatedCounts[reactionType] = (updatedCounts[reactionType] || 0) + 1;
        triggerEmojiBurst(
          reactionType === "fire"
            ? "🔥"
            : reactionType === "heart"
            ? "❤️"
            : reactionType === "cry"
            ? "😭"
            : reactionType === "vibe"
            ? "✨"
            : "⏭️"
        );
      }

      setReactionCounts(updatedCounts);
      setUserReaction(nextType);

      // Broadcast ephemeral burst to peers
      if (channelRef.current && !isRemoving) {
        channelRef.current.send({
          type: "broadcast",
          event: "reaction_burst",
          payload: { reactionType, songId: currentSongId },
        });
      }

      try {
        const res = await fetch("/api/reactions/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songId: currentSongId, reactionType }),
        });

        if (!res.ok) {
          // Revert optimistic update
          setReactionCounts(previousCounts);
          setUserReaction(previousUserReaction);
        } else {
          const json = await res.json();
          if (json.data) {
            setReactionCounts(json.data.counts || {});
            setUserReaction(json.data.reaction_type || null);
          }
        }
      } catch (err) {
        setReactionCounts(previousCounts);
        setUserReaction(previousUserReaction);
        console.error("[Live Room] Reaction toggle failed:", err);
      }
    },
    [currentSongId, user, reactionCooldown, reactionCounts, userReaction, triggerEmojiBurst]
  );

  // ─── Send Chat Message ─────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string): Promise<{ success: boolean; error?: string }> => {
      const trimmed = content.trim();
      if (!trimmed || !user || isSendingMessage || chatCooldownRemaining > 0) {
        return { success: false, error: "Cannot send message right now" };
      }

      setIsSendingMessage(true);

      // Optimistic message placeholder
      const tempId = `temp_${Date.now()}`;
      const optimisticMessage: ChatMessage = {
        id: tempId,
        user_id: user.id,
        content: trimmed,
        created_at: new Date().toISOString(),
        profiles: profile
          ? {
              full_name: profile.full_name,
              avatar_url: profile.avatar_url,
              branch: profile.branch,
              batch: profile.batch,
            }
          : null,
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      // Set cooldown timer
      setChatCooldownRemaining(CHAT_RATE_LIMIT_MS / 1000);
      const interval = setInterval(() => {
        setChatCooldownRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      try {
        const res = await fetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });

        const json = await res.json();

        if (!res.ok || json.error) {
          // Remove optimistic message
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setIsSendingMessage(false);
          return { success: false, error: json.error?.message || "Failed to send message" };
        }

        // Replace optimistic message with confirmed server message
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? json.data : m))
        );

        // Broadcast to channel so listeners receive instantly
        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "chat_message",
            payload: json.data,
          });
        }

        setIsSendingMessage(false);
        return { success: true };
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setIsSendingMessage(false);
        return { success: false, error: "Network error sending message" };
      }
    },
    [user, profile, isSendingMessage, chatCooldownRemaining]
  );

  // ─── Realtime Subscriptions & Presence Setup ───────────────────────────────
  useEffect(() => {
    fetchChatMessages();
  }, [fetchChatMessages]);

  useEffect(() => {
    if (currentSongId) {
      fetchReactions(currentSongId);
    } else {
      setReactionCounts({});
      setUserReaction(null);
    }
  }, [currentSongId, fetchReactions]);

  useEffect(() => {
    const supabase = createClient();
    const guestAnonId = Math.random().toString(36).substring(2, 8);
    const presenceKey = user?.id || `guest_${guestAnonId}`;

    // 1. Subscribe to Live Room channel (Presence + Broadcast)
    const channel = supabase.channel(LIVE_ROOM_CHANNEL, {
      config: {
        presence: { key: presenceKey },
      },
    });

    channelRef.current = channel;

    // Presence Sync
    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const listeners: PresenceUser[] = [];

        Object.values(presenceState).forEach((presences) => {
          if (Array.isArray(presences)) {
            presences.forEach((rawPresence) => {
              const p = rawPresence as Record<string, unknown>;
              listeners.push({
                user_id: typeof p.user_id === "string" ? p.user_id : null,
                display_name: typeof p.display_name === "string" ? p.display_name : "Campus Listener",
                branch: typeof p.branch === "string" ? p.branch : null,
                avatar_url: typeof p.avatar_url === "string" ? p.avatar_url : null,
                is_guest: !!p.is_guest,
                joined_at: typeof p.joined_at === "string" ? p.joined_at : new Date().toISOString(),
              });
            });
          }
        });

        setActiveListeners(listeners);
        setApproxListenerCount(Math.max(1, listeners.length));
      })
      .on("broadcast", { event: "reaction_burst" }, ({ payload }: { payload: { songId?: string; reactionType?: string } }) => {
        if (payload?.songId === songIdRef.current && payload?.reactionType) {
          const type = payload.reactionType as ReactionType;
          triggerEmojiBurst(
            type === "fire"
              ? "🔥"
              : type === "heart"
              ? "❤️"
              : type === "cry"
              ? "😭"
              : type === "vibe"
              ? "✨"
              : "⏭️"
          );
          setReactionCounts((prev) => ({
            ...prev,
            [type]: (prev[type] || 0) + 1,
          }));
        }
      })
      .on("broadcast", { event: "chat_message" }, ({ payload }: { payload: unknown }) => {
        const validated = validateBroadcastChatMessage(payload);
        if (validated) {
          setMessages((prev) => {
            // Deduplicate incoming message
            if (prev.some((m) => m.id === validated.id)) return prev;
            return [...prev, validated];
          });
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Track presence with minimum necessary info (NO email!)
          const displayName = profile?.full_name
            ? profile.full_name.split(" ")[0]
            : user
            ? "Student"
            : "Guest Listener";

          await channel.track({
            user_id: user?.id || null,
            display_name: displayName,
            branch: profile?.branch || null,
            avatar_url: profile?.avatar_url || null,
            is_guest: !user,
            joined_at: new Date().toISOString(),
          });
        }
      });

    // 2. Subscribe to Database postgres_changes for chat_messages table
    const chatTableChannel = supabase
      .channel("public-chat-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        async (payload: { new: ChatMessage }) => {
          if (payload.new && payload.new.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              const newMsg: ChatMessage = {
                id: payload.new.id,
                user_id: payload.new.user_id,
                content: payload.new.content,
                created_at: payload.new.created_at,
              };
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    // 3. Subscribe to Database postgres_changes for reactions table
    const reactionTableChannel = supabase
      .channel("public-reactions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reactions",
        },
        () => {
          if (songIdRef.current) {
            fetchReactions(songIdRef.current);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(chatTableChannel);
      supabase.removeChannel(reactionTableChannel);
      channelRef.current = null;
    };
  }, [user, profile, fetchReactions, triggerEmojiBurst]);

  return {
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
  };
}
