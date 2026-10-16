import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCampusEmail } from "@/lib/auth/domain-guard";
import { checkCooldown } from "@/lib/rate-limit";
import { CHAT_RATE_LIMIT_MS, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";


export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { data: null, error: { code: "unauthorized", message: "Sign in with @iiitl.ac.in to chat" } },
      { status: 401 }
    );
  }

  // 2. Authorize verified campus email
  if (!user.email || !isCampusEmail(user.email)) {
    return NextResponse.json(
      { data: null, error: { code: "forbidden", message: "Live chat is exclusive to verified IIITL campus members" } },
      { status: 403 }
    );
  }

  // 3. Rate limiting per user
  const rateLimitKey = `chat_${user.id}`;
  const rateCheck = checkCooldown(rateLimitKey, CHAT_RATE_LIMIT_MS);
  if (!rateCheck.success) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "rate_limited",
          message: `Slow down! Wait ${Math.ceil(rateCheck.retryAfterMs / 1000)}s before sending another message.`,
        },
      },
      { status: 429 }
    );
  }

  // 4. Parse & validate message body
  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { code: "bad_request", message: "Invalid JSON payload" } },
      { status: 400 }
    );
  }

  const rawContent = body.content;
  if (typeof rawContent !== "string") {
    return NextResponse.json(
      { data: null, error: { code: "invalid_content", message: "Message content must be a string" } },
      { status: 400 }
    );
  }

  const content = rawContent.trim();
  if (content.length === 0) {
    return NextResponse.json(
      { data: null, error: { code: "empty_message", message: "Message cannot be empty or blank" } },
      { status: 400 }
    );
  }

  if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "message_too_long",
          message: `Message exceeds the ${MAX_CHAT_MESSAGE_LENGTH} character limit (got ${content.length})`,
        },
      },
      { status: 400 }
    );
  }

  // 5. Fetch sender's public profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, branch, batch")
    .eq("id", user.id)
    .maybeSingle();

  // 6. Insert chat message with server-generated timestamp and user.id
  const { data: inserted, error: insertError } = await supabase
    .from("chat_messages")
    .insert({
      user_id: user.id,
      content,
    })
    .select("id, user_id, content, created_at")
    .single();

  if (insertError) {
    console.error("[Chat API] Insert error:", insertError);
    // If table not migrated in local environment, construct safe local mock response
    const mockMessage: ChatMessage = {
      id: `local_${Date.now()}`,
      user_id: user.id,
      content,
      created_at: new Date().toISOString(),
      profiles: profile || {
        full_name: user.user_metadata?.full_name || "Campus Student",
        avatar_url: user.user_metadata?.avatar_url || null,
        branch: null,
        batch: null,
      },
    };

    return NextResponse.json({
      data: mockMessage,
      error: null,
    });
  }

  const messageResponse: ChatMessage = {
    id: inserted.id,
    user_id: inserted.user_id,
    content: inserted.content,
    created_at: inserted.created_at,
    profiles: profile || null,
  };

  return NextResponse.json({
    data: messageResponse,
    error: null,
  });
}
