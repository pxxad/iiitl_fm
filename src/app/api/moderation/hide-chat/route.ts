import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCampusEmail } from "@/lib/auth/domain-guard";

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
  let body: { messageId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { code: "bad_request", message: "Invalid JSON payload" } },
      { status: 400 }
    );
  }

  const { messageId, reason } = body;
  if (!messageId || typeof messageId !== "string" || messageId.trim().length === 0) {
    return NextResponse.json(
      { data: null, error: { code: "missing_message_id", message: "messageId is required" } },
      { status: 400 }
    );
  }

  const actionReason =
    typeof reason === "string" && reason.trim().length > 0
      ? reason.trim().slice(0, 300)
      : "Inappropriate or offensive message";

  // 5. Execute moderation action via RPC or fallback
  try {
    const { error: rpcError } = await supabase.rpc("moderate_hide_chat", {
      p_message_id: messageId,
      p_reason: actionReason,
    });

    if (!rpcError) {
      return NextResponse.json({
        data: { success: true, messageId },
        error: null,
      });
    }
  } catch (err) {
    console.warn("[Moderation API] RPC moderate_hide_chat fallback:", err);
  }

  // Fallback update
  await supabase
    .from("chat_messages")
    .update({ is_hidden: true })
    .eq("id", messageId);

  await supabase.from("moderation_actions").insert({
    moderator_id: user.id,
    action_type: "hide_chat",
    target_type: "chat_message",
    target_id: messageId,
    reason: actionReason,
  });

  return NextResponse.json({
    data: { success: true, messageId },
    error: null,
  });
}
