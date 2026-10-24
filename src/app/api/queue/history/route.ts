import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInIST } from "@/lib/utils";
import type { SongWithProfile } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");

  if (!dateParam) {
    return NextResponse.json(
      { data: null, error: { code: "missing_date", message: "date query parameter (YYYY-MM-DD) is required" } },
      { status: 400 }
    );
  }

  // 1. Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateParam)) {
    return NextResponse.json(
      { data: null, error: { code: "invalid_date_format", message: "Date must be in YYYY-MM-DD format" } },
      { status: 400 }
    );
  }

  const parsedDate = new Date(`${dateParam}T00:00:00Z`);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json(
      { data: null, error: { code: "invalid_date", message: "Invalid calendar date provided" } },
      { status: 400 }
    );
  }

  // 2. Reject future dates in Asia/Kolkata
  const currentIST = todayInIST();
  if (dateParam > currentIST) {
    return NextResponse.json(
      { data: null, error: { code: "future_date", message: "Historical queues are not available for future dates" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // 3. Query daily_queues for the requested date (strictly read-only)
  const { data: queue, error: queueError } = await supabase
    .from("daily_queues")
    .select("id, queue_date, status, created_at")
    .eq("queue_date", dateParam)
    .maybeSingle();

  if (queueError || !queue) {
    return NextResponse.json({
      data: {
        date: dateParam,
        queue_id: null,
        status: "archived",
        songs: [] as SongWithProfile[],
        total_songs: 0,
        is_today: dateParam === currentIST,
      },
      error: null,
    });
  }

  // 4. Query songs for this queue, omitting hidden tracks
  const { data: songs, error: songsError } = await supabase
    .from("songs")
    .select(`
      id,
      queue_id,
      video_id,
      title,
      artist,
      thumbnail_url,
      added_by,
      mood_tag,
      message,
      position,
      duration_seconds,
      status,
      created_at,
      started_at,
      profiles:added_by (
        full_name,
        avatar_url,
        branch,
        batch
      )
    `)
    .eq("queue_id", queue.id)
    .eq("is_hidden", false)
    .order("position", { ascending: true });

  if (songsError) {
    console.error("[Queue History API] Songs fetch error:", songsError);
  }

  const formattedSongs = (songs || []) as unknown as SongWithProfile[];

  return NextResponse.json({
    data: {
      date: dateParam,
      queue_id: queue.id,
      status: queue.status,
      songs: formattedSongs,
      total_songs: formattedSongs.length,
      is_today: dateParam === currentIST,
    },
    error: null,
  });
}
