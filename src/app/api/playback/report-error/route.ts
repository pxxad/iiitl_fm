import { NextResponse, type NextRequest } from "next/server";
import { advancePlaybackQueue } from "@/lib/playback/server";
import { getCampusUser } from "@/lib/auth/server";

export async function POST(request: NextRequest) {
  const session = await getCampusUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { songId?: string; errorCode?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { songId, errorCode } = body;
  if (!songId) {
    return NextResponse.json({ error: "Missing songId" }, { status: 400 });
  }

  console.warn(
    `[Playback Error Reported] Song ${songId} encountered YouTube error code ${errorCode}. Auto-advancing.`
  );

  try {
    // Advances current song as 'unavailable' idempotently
    const result = await advancePlaybackQueue(songId, "unavailable");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Playback Error Report] Failed to advance:", err);
    return NextResponse.json(
      { error: "Failed to process playback error" },
      { status: 500 }
    );
  }
}
