import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInIST } from "@/lib/utils";

export async function GET() {
  const currentTimestamp = new Date().toISOString();
  const istDate = todayInIST();
  let dbStatus: "connected" | "disconnected" = "connected";
  let hasActiveSong = false;
  let playbackStatus = "idle";

  try {
    const supabase = await createClient();
    const { data: playback, error } = await supabase
      .from("playback_state")
      .select("current_song_id, playback_status")
      .eq("id", "singleton")
      .maybeSingle();

    if (error) {
      dbStatus = "disconnected";
    } else if (playback) {
      hasActiveSong = !!playback.current_song_id;
      playbackStatus = playback.playback_status;
    }
  } catch {
    dbStatus = "disconnected";
  }

  const overallStatus = dbStatus === "connected" ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: currentTimestamp,
      istDate,
      database: dbStatus,
      playback: {
        hasActiveSong,
        status: playbackStatus,
      },
      version: "0.1.0",
    },
    {
      status: overallStatus === "healthy" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
