import { NextResponse, type NextRequest } from "next/server";
import { advancePlaybackQueue } from "@/lib/playback/server";
import { getCampusUser } from "@/lib/auth/server";

export async function POST(request: NextRequest) {
  // Authentication check: Must be a verified student to trigger advancement
  const session = await getCampusUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized. Campus student session required to advance playback." },
      { status: 401 }
    );
  }

  let body: {
    expectedSongId?: string;
    reason?: "ended" | "skipped" | "unavailable";
  } = {};

  try {
    body = await request.json();
  } catch {
    // Empty body is allowed (manual advancement)
  }

  try {
    const result = await advancePlaybackQueue(
      body.expectedSongId || null,
      body.reason || "ended"
    );

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Playback Advance API] Error:", error);
    return NextResponse.json(
      { error: `Failed to advance queue: ${msg}` },
      { status: 500 }
    );
  }
}
