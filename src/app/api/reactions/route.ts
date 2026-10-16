import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReactionCounts, ReactionType } from "@/lib/types";


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("song_id");

  if (!songId) {
    return NextResponse.json(
      { data: null, error: { code: "missing_song_id", message: "song_id query parameter is required" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // 1. Fetch current user if logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Fetch all reactions for this song
  const { data: reactions, error } = await supabase
    .from("reactions")
    .select("reaction_type, user_id")
    .eq("song_id", songId);

  if (error) {
    return NextResponse.json({
      data: {
        counts: {} as ReactionCounts,
        userReaction: null,
      },
      error: null,
    });
  }

  const counts: ReactionCounts = {};
  let userReaction: ReactionType | null = null;

  for (const r of reactions || []) {
    const t = r.reaction_type as ReactionType;
    counts[t] = (counts[t] || 0) + 1;
    if (user && r.user_id === user.id) {
      userReaction = t;
    }
  }

  return NextResponse.json({
    data: {
      counts,
      userReaction,
    },
    error: null,
  });
}
