import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCampusEmail } from "@/lib/auth/domain-guard";
import { SKIP_VOTE_THRESHOLD } from "@/lib/constants";
import type { SkipVoteResult } from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { data: null, error: { code: "unauthorized", message: "Sign in with @iiitl.ac.in to vote to skip" } },
      { status: 401 }
    );
  }

  // 2. Strict campus authorization
  if (!user.email || !isCampusEmail(user.email)) {
    return NextResponse.json(
      { data: null, error: { code: "forbidden", message: "Skip voting is exclusive to verified IIITL students" } },
      { status: 403 }
    );
  }

  // 3. Parse and validate expected song ID
  let body: { expectedSongId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { code: "bad_request", message: "Invalid JSON payload" } },
      { status: 400 }
    );
  }

  const { expectedSongId } = body;
  if (!expectedSongId || typeof expectedSongId !== "string") {
    return NextResponse.json(
      { data: null, error: { code: "missing_song_id", message: "expectedSongId is required" } },
      { status: 400 }
    );
  }

  // 4. Execute atomic database RPC: cast_skip_vote_and_evaluate
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "cast_skip_vote_and_evaluate",
      { p_expected_song_id: expectedSongId }
    );

    if (!rpcError && rpcResult) {
      const res = rpcResult as unknown as SkipVoteResult;
      if (res.error === "stale_song") {
        return NextResponse.json(
          { data: res, error: { code: "stale_song", message: res.message || "This song is no longer playing" } },
          { status: 400 }
        );
      }

      return NextResponse.json({
        data: res,
        error: null,
      });
    }
  } catch (err) {
    console.warn("[Skip Vote API] RPC fallback:", err);
  }

  // 5. Local development fallback: Query playback_state and evaluate safely
  const { data: playbackState } = await supabase
    .from("playback_state")
    .select("current_song_id, playback_status")
    .eq("id", "singleton")
    .maybeSingle();

  if (!playbackState || playbackState.current_song_id !== expectedSongId || playbackState.playback_status !== "playing") {
    return NextResponse.json(
      { data: null, error: { code: "stale_song", message: "This track is no longer actively playing" } },
      { status: 400 }
    );
  }

  // Check if existing vote
  const { data: existingVote } = await supabase
    .from("skip_votes")
    .select("song_id")
    .eq("song_id", expectedSongId)
    .eq("user_id", user.id)
    .maybeSingle();

  let voted = false;
  if (existingVote) {
    await supabase
      .from("skip_votes")
      .delete()
      .eq("song_id", expectedSongId)
      .eq("user_id", user.id);
    voted = false;
  } else {
    await supabase.from("skip_votes").insert({
      song_id: expectedSongId,
      user_id: user.id,
    });
    voted = true;
  }

  // Count votes
  const { count } = await supabase
    .from("skip_votes")
    .select("user_id", { count: "exact", head: true })
    .eq("song_id", expectedSongId);

  const totalVotes = count || (voted ? 1 : 0);
  let advanced = false;

  if (totalVotes >= SKIP_VOTE_THRESHOLD) {
    try {
      const { data: advData } = await supabase.rpc("advance_playback_queue", {
        p_expected_song_id: expectedSongId,
        p_reason: "skipped",
      });
      advanced = !!(advData as Record<string, unknown>)?.advanced;
      // Clean up votes for skipped song
      await supabase.from("skip_votes").delete().eq("song_id", expectedSongId);
    } catch (err) {
      console.warn("[Skip Vote Fallback] advance_playback_queue error:", err);
    }
  }

  const result: SkipVoteResult = {
    song_id: expectedSongId,
    voted,
    total_votes: totalVotes,
    threshold: SKIP_VOTE_THRESHOLD,
    advanced,
  };

  return NextResponse.json({
    data: result,
    error: null,
  });
}
