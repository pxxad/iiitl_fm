import { NextResponse } from "next/server";
import { getAuthoritativePlaybackState } from "@/lib/playback/server";

export async function GET() {
  try {
    const state = await getAuthoritativePlaybackState();
    return NextResponse.json(state);
  } catch (error) {
    console.error("[Playback API] Error fetching playback state:", error);
    return NextResponse.json(
      { error: "Failed to retrieve playback state" },
      { status: 500 }
    );
  }
}
