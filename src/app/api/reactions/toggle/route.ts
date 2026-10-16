import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCampusEmail } from "@/lib/auth/domain-guard";
import { checkCooldown } from "@/lib/rate-limit";
import { REACTION_RATE_LIMIT_MS, REACTION_TYPES } from "@/lib/constants";
import type { ReactionCounts, ReactionType } from "@/lib/types";


const VALID_REACTION_TYPES = new Set<string>(
  REACTION_TYPES.map((r) => r.value)
);

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { data: null, error: { code: "unauthorized", message: "Sign in with @iiitl.ac.in to react" } },
      { status: 401 }
    );
  }

  // 2. Campus domain authorization
  if (!user.email || !isCampusEmail(user.email)) {
    return NextResponse.json(
      { data: null, error: { code: "forbidden", message: "Reactions are exclusive to verified IIITL students" } },
      { status: 403 }
    );
  }

  // 3. Rate limiting (cooldown per student)
  const rateLimitKey = `reaction_${user.id}`;
  const rateCheck = checkCooldown(rateLimitKey, REACTION_RATE_LIMIT_MS);
  if (!rateCheck.success) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "rate_limited",
          message: `Too fast! Please wait ${Math.ceil(rateCheck.retryAfterMs / 100) / 10}s before reacting again.`,
        },
      },
      { status: 429 }
    );
  }

  // 4. Parse & validate payload
  let body: { songId?: string; reactionType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { code: "bad_request", message: "Invalid JSON payload" } },
      { status: 400 }
    );
  }

  const { songId, reactionType } = body;
  if (!songId || typeof songId !== "string") {
    return NextResponse.json(
      { data: null, error: { code: "missing_song_id", message: "songId is required" } },
      { status: 400 }
    );
  }

  if (!reactionType || !VALID_REACTION_TYPES.has(reactionType)) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "invalid_reaction",
          message: `Invalid reaction type. Curated choices are: ${Array.from(VALID_REACTION_TYPES).join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  // 5. Execute toggle via atomic RPC function or query fallback
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc("toggle_song_reaction", {
      p_song_id: songId,
      p_reaction_type: reactionType,
    });

    if (!rpcError && rpcResult) {
      return NextResponse.json({
        data: rpcResult,
        error: null,
      });
    }
  } catch (err) {
    console.warn("[Reactions API] RPC toggle_song_reaction fallback:", err);
  }

  // Fallback query logic:
  // Check if reaction exists
  const { data: existing } = await supabase
    .from("reactions")
    .select("id, reaction_type")
    .eq("song_id", songId)
    .eq("user_id", user.id)
    .maybeSingle();

  let action: "removed" | "changed" | "added";
  let activeType: ReactionType | null = null;

  if (existing) {
    if (existing.reaction_type === reactionType) {
      // Toggle off / remove
      await supabase.from("reactions").delete().eq("id", existing.id);
      action = "removed";
      activeType = null;
    } else {
      // Change reaction
      await supabase
        .from("reactions")
        .update({ reaction_type: reactionType as ReactionType })
        .eq("id", existing.id);
      action = "changed";
      activeType = reactionType as ReactionType;
    }
  } else {
    // Add reaction
    await supabase.from("reactions").insert({
      song_id: songId,
      user_id: user.id,
      reaction_type: reactionType as ReactionType,
    });
    action = "added";
    activeType = reactionType as ReactionType;
  }

  // Get updated counts
  const { data: allReactions } = await supabase
    .from("reactions")
    .select("reaction_type")
    .eq("song_id", songId);

  const counts: ReactionCounts = {};
  for (const r of allReactions || []) {
    const t = r.reaction_type as ReactionType;
    counts[t] = (counts[t] || 0) + 1;
  }

  return NextResponse.json({
    data: {
      action,
      reaction_type: activeType,
      counts,
    },
    error: null,
  });
}
