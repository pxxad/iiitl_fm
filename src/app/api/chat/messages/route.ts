import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CHAT_HISTORY_LIMIT } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";


interface RpcChatMessageRow {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
  branch: string | null;
  batch: string | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = parseInt(searchParams.get("limit") || `${DEFAULT_CHAT_HISTORY_LIMIT}`, 10);
  const limit = Math.min(Math.max(isNaN(limitParam) ? DEFAULT_CHAT_HISTORY_LIMIT : limitParam, 1), 100);

  const supabase = await createClient();

  // Try RPC get_recent_chat_messages first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_recent_chat_messages",
      { p_limit: limit }
    );

    if (!rpcError && Array.isArray(rpcData)) {
      // Return oldest to newest for chronological chat scroll
      const formatted: ChatMessage[] = (rpcData as RpcChatMessageRow[])
        .map((row: RpcChatMessageRow) => ({

          id: row.id,
          user_id: row.user_id,
          content: row.content,
          created_at: row.created_at,
          profiles: {
            full_name: row.full_name,
            avatar_url: row.avatar_url,
            branch: row.branch,
            batch: row.batch,
          },
        }))
        .reverse();

      return NextResponse.json({
        data: formatted,
        error: null,
      });
    }
  } catch (err) {
    console.warn("[Chat API] RPC get_recent_chat_messages fallback:", err);
  }

  // Fallback query
  const { data: messages, error } = await supabase
    .from("chat_messages")
    .select(`
      id,
      user_id,
      content,
      created_at,
      profiles:user_id (
        full_name,
        avatar_url,
        branch,
        batch
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // If table doesn't exist yet in local development, return empty list gracefully
    return NextResponse.json({
      data: [] as ChatMessage[],
      error: null,
    });
  }

  // Format and reverse so oldest is first
  const chatList = ((messages || []) as unknown as ChatMessage[]).reverse();

  return NextResponse.json({
    data: chatList,
    error: null,
  });
}
