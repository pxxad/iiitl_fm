import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInIST } from "@/lib/utils";
import { getCampusUser } from "@/lib/auth/server";
import { MAX_SONGS_PER_STUDENT_PER_DAY } from "@/lib/constants";
import type { Song, DailyQueue, Profile } from "@/lib/types";

export interface QueueResponse {
  date: string;
  queue: DailyQueue | null;
  songs: Array<
    Song & {
      profiles: Pick<Profile, "full_name" | "avatar_url" | "branch" | "batch"> | null;
    }
  >;
  userSubmittedSong: Song | null;
  userSubmittedSongs: Array<
    Song & {
      profiles: Pick<Profile, "full_name" | "avatar_url" | "branch" | "batch"> | null;
    }
  >;
  userSubmissionsCount: number;
  maxSubmissionsPerUser: number;
  remainingSubmissions: number;
  totalSongs: number;
}

export async function GET() {
  const supabase = await createClient();
  const session = await getCampusUser();
  const todayIST = todayInIST();

  // 1. Fetch today's queue
  const { data: queue, error: queueError } = await supabase
    .from("daily_queues")
    .select("*")
    .eq("queue_date", todayIST)
    .single();

  if (queueError && queueError.code !== "PGRST116") {
    // Real DB error (not just empty result)
    console.error("[Queue API] Error fetching queue:", queueError);
  }

  if (!queue) {
    return NextResponse.json<QueueResponse>({
      date: todayIST,
      queue: null,
      songs: [],
      userSubmittedSong: null,
      userSubmittedSongs: [],
      userSubmissionsCount: 0,
      maxSubmissionsPerUser: MAX_SONGS_PER_STUDENT_PER_DAY,
      remainingSubmissions: MAX_SONGS_PER_STUDENT_PER_DAY,
      totalSongs: 0,
    });
  }

  // 2. Fetch songs in today's queue ordered by position
  const { data: songsData, error: songsError } = await supabase
    .from("songs")
    .select(`
      *,
      profiles:added_by (
        full_name,
        avatar_url,
        branch,
        batch
      )
    `)
    .eq("queue_id", queue.id)
    .order("position", { ascending: true });

  if (songsError) {
    // If the profiles join fails due to schema cache, fallback to simple songs query
    const { data: fallbackSongs } = await supabase
      .from("songs")
      .select("*")
      .eq("queue_id", queue.id)
      .order("position", { ascending: true });

    const formattedFallback = (fallbackSongs || []).map((s) => ({
      ...s,
      profiles: null,
    }));

    const userSongsFallback = session
      ? formattedFallback.filter((s) => s.added_by === session.user.id)
      : [];
    const countFallback = userSongsFallback.length;

    return NextResponse.json<QueueResponse>({
      date: todayIST,
      queue: queue as DailyQueue,
      songs: formattedFallback,
      userSubmittedSong: userSongsFallback[0] || null,
      userSubmittedSongs: userSongsFallback,
      userSubmissionsCount: countFallback,
      maxSubmissionsPerUser: MAX_SONGS_PER_STUDENT_PER_DAY,
      remainingSubmissions: Math.max(0, MAX_SONGS_PER_STUDENT_PER_DAY - countFallback),
      totalSongs: formattedFallback.length,
    });
  }

  const songs = (songsData || []) as Array<
    Song & {
      profiles: Pick<Profile, "full_name" | "avatar_url" | "branch" | "batch"> | null;
    }
  >;

  const userSongs = session
    ? songs.filter((s) => s.added_by === session.user.id)
    : [];
  const userSubmissionsCount = userSongs.length;
  const remainingSubmissions = Math.max(0, MAX_SONGS_PER_STUDENT_PER_DAY - userSubmissionsCount);

  return NextResponse.json<QueueResponse>({
    date: todayIST,
    queue: queue as DailyQueue,
    songs,
    userSubmittedSong: userSongs[0] || null,
    userSubmittedSongs: userSongs,
    userSubmissionsCount,
    maxSubmissionsPerUser: MAX_SONGS_PER_STUDENT_PER_DAY,
    remainingSubmissions,
    totalSongs: songs.length,
  });
}

