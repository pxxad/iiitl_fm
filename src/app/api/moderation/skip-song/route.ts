import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCampusEmail } from "@/lib/auth/domain-guard";
import { advancePlaybackQueue } from "@/lib/playback/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { data: null, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }

  // 2. Campus domain authorization
  if (!user.email || !isCampusEmail(user.email)) {
    return NextResponse.json(
      { data: null, error: { code: "forbidden", message: "Campus authorization required" } },
      { status: 403 }
    );
  }

  // 3. Independent Role Authorization Check (never trust client claims)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "moderator" && profile.role !== "admin")) {
    return NextResponse.json(
      { data: null, error: { code: "forbidden", message: "Moderator or administrator role required" } },
      { status: 403 }
    );
  }

  // 4. Parse & validate request payload
  let body: { songId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { code: "bad_request", message: "Invalid JSON payload" } },
      { status: 400 }
    );
  }

  const { songId, reason } = body;
  if (!songId || typeof songId !== "string" || songId.trim().length === 0) {
    return NextResponse.json(
      { data: null, error: { code: "missing_song_id", message: "songId is required" } },
      { status: 400 }
    );
  }

  const actionReason =
    typeof reason === "string" && reason.trim().length > 0
      ? reason.trim().slice(0, 300)
      : "Moderator forced skip";

  // 5. Execute moderation skip via RPC or fallback
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "moderate_skip_song",
      {
        p_song_id: songId,
        p_reason: actionReason,
      }
    );

    if (!rpcError && rpcResult) {
      return NextResponse.json({
        data: rpcResult,
        error: null,
      });
    }
  } catch (err) {
    console.warn("[Moderation API] RPC moderate_skip_song fallback:", err);
  }

  // Fallback: advance playback queue
  const advResult = await advancePlaybackQueue(songId, "skipped");

  // Log in moderation_actions
  await supabase.from("moderation_actions").insert({
    moderator_id: user.id,
    action_type: "skip_song",
    target_type: "song",
    target_id: songId,
    reason: actionReason,
  });

  return NextResponse.json({
    data: advResult,
    error: null,
  });
}
