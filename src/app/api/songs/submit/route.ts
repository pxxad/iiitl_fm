import { NextResponse, type NextRequest } from "next/server";
import { getCampusUser } from "@/lib/auth/server";
import { parseStudentDetailsFromEmail } from "@/lib/auth/domain-guard";
import { createClient } from "@/lib/supabase/server";
import { extractYouTubeId, fetchYouTubeMetadata } from "@/lib/youtube";
import { todayInIST } from "@/lib/utils";
import {
  MAX_MESSAGE_LENGTH,
  MAX_SONGS_PER_QUEUE,
  MAX_SONGS_PER_STUDENT_PER_DAY,
  MOOD_TAGS,
} from "@/lib/constants";
import type { MoodTag } from "@/lib/types";

export async function POST(request: NextRequest) {
  // ─── 1. Authenticate & Authorize Campus Student ───────────────────────────
  const session = await getCampusUser();
  if (!session) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. You must be signed in with a verified @iiitl.ac.in account.",
      },
      { status: 401 }
    );
  }

  // ─── 2. Parse & Validate Payload ──────────────────────────────────────────
  let body: {
    videoUrl?: string;
    moodTag?: string;
    message?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request payload." },
      { status: 400 }
    );
  }

  const { videoUrl, moodTag, message } = body;

  if (!videoUrl || typeof videoUrl !== "string") {
    return NextResponse.json(
      { error: "Please provide a valid YouTube URL or video ID." },
      { status: 400 }
    );
  }

  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) {
    return NextResponse.json(
      {
        error:
          "Invalid YouTube link. Please paste a standard YouTube video or shorts link.",
      },
      { status: 400 }
    );
  }

  // Validate mood tag if provided
  const validMoodTags = MOOD_TAGS.map((m) => m.value) as string[];
  if (moodTag && !validMoodTags.includes(moodTag)) {
    return NextResponse.json(
      { error: `Invalid mood tag: ${moodTag}` },
      { status: 400 }
    );
  }

  // Validate message length
  const cleanMessage = message ? message.trim() : null;
  if (cleanMessage && cleanMessage.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `Message exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`,
      },
      { status: 400 }
    );
  }

  // ─── 3. Fetch Verified Metadata via oEmbed ────────────────────────────────
  const metadata = await fetchYouTubeMetadata(videoId);
  if (!metadata) {
    return NextResponse.json(
      {
        error:
          "Could not retrieve video information from YouTube. Please ensure the video is public and accessible.",
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // ─── 3.5. Ensure Profile Exists in public.profiles (fk_songs_profiles) ────
  // If the user's profile row is missing (e.g., registered before migrations,
  // or trigger bypassed), upsert the profile using session data before the RPC
  // runs to prevent foreign key constraint violations on fk_songs_profiles.
  if (!session.profile) {
    const meta = session.user.user_metadata ?? {};
    const fullName =
      (meta.full_name as string) || (meta.name as string) || null;
    const avatarUrl =
      (meta.avatar_url as string) || (meta.picture as string) || null;
    const studentDetails = parseStudentDetailsFromEmail(session.email);

    const { error: profileUpsertError } = await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        full_name: fullName,
        avatar_url: avatarUrl,
        branch: studentDetails.branch,
        batch: studentDetails.batch,
      },
      { onConflict: "id" }
    );

    if (profileUpsertError) {
      console.warn(
        "[Submit Song] Profile upsert notice:",
        profileUpsertError.message
      );
    }
  }

  // ─── 4. Attempt Atomic RPC Submission First (Migrations 005 & 006) ────────
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "submit_song_for_today",
      {
        p_video_id: videoId,
        p_title: metadata.title,
        p_artist: metadata.artist,
        p_thumbnail_url: metadata.thumbnailUrl,
        p_mood_tag: (moodTag as MoodTag) || null,
        p_message: cleanMessage || "",
        p_duration_seconds: null,
      }
    );

    if (!rpcError && rpcData) {
      const { count: userSongCount } = await supabase
        .from("songs")
        .select("*", { count: "exact", head: true })
        .eq("queue_id", rpcData.queue_id)
        .eq("added_by", session.user.id);

      const submissionsToday = userSongCount ?? 1;
      const remaining = Math.max(0, MAX_SONGS_PER_STUDENT_PER_DAY - submissionsToday);

      return NextResponse.json({
        success: true,
        song: rpcData,
        submissionsToday,
        remainingSubmissions: remaining,
        maxSubmissions: MAX_SONGS_PER_STUDENT_PER_DAY,
        message:
          remaining > 0
            ? `Your song has been successfully added to today's queue! You have ${remaining} of ${MAX_SONGS_PER_STUDENT_PER_DAY} submissions remaining today.`
            : `Your song has been successfully added to today's queue! You have reached your daily limit of ${MAX_SONGS_PER_STUDENT_PER_DAY} submissions for today.`,
      });
    }

    if (rpcError) {
      const errMsg = rpcError.message || "";

      // Authorization failure
      if (rpcError.code === "42501" || errMsg.includes("Unauthorized")) {
        return NextResponse.json({ error: errMsg }, { status: 403 });
      }

      // Invalid parameter
      if (rpcError.code === "22023") {
        return NextResponse.json({ error: errMsg }, { status: 400 });
      }

      // Queue capacity reached
      if (rpcError.code === "54000" || errMsg.includes("queue is full")) {
        return NextResponse.json({ error: errMsg }, { status: 409 });
      }

      // Student daily submission limit reached (Max 5 per student per day)
      if (
        rpcError.code === "54001" ||
        errMsg.includes("limit of 5") ||
        errMsg.includes("daily limit")
      ) {
        return NextResponse.json(
          {
            error:
              "You have reached your daily limit of 5 song submissions for today. Submissions reopen tomorrow at 12:00 AM IST.",
          },
          { status: 409 }
        );
      }

      // Duplicate submission checks
      if (rpcError.code === "23505" || errMsg.includes("already")) {
        if (errMsg.includes("already been submitted to today's queue")) {
          return NextResponse.json(
            {
              error:
                "This song has already been submitted to today's queue by another student.",
            },
            { status: 409 }
          );
        }
        return NextResponse.json(
          {
            error:
              "You have reached your daily limit of 5 song submissions for today. Submissions reopen tomorrow at 12:00 AM IST.",
          },
          { status: 409 }
        );
      }


      // Only if the function does not exist (undefined_function 42883) do we fall back
      if (rpcError.code !== "42883") {
        console.error("[Submit Song] RPC execution error:", rpcError);
        return NextResponse.json(
          { error: `Database error: ${errMsg}` },
          { status: 500 }
        );
      }
    }
  } catch (err) {
    console.warn("[Submit Song] RPC failed with exception, checking fallback:", err);
  }

  // ─── 5. Fallback Direct Query Path (If RPC not yet installed) ──────────────
  const todayIST = todayInIST();

  // A. Ensure today's queue exists
  let queueId: string | null = null;
  const { data: existingQueue } = await supabase
    .from("daily_queues")
    .select("id")
    .eq("queue_date", todayIST)
    .single();

  if (existingQueue) {
    queueId = existingQueue.id;
  } else {
    const { data: newQueue, error: createQueueError } = await supabase
      .from("daily_queues")
      .insert({ queue_date: todayIST, status: "active" })
      .select("id")
      .single();

    if (createQueueError) {
      // Possible race condition, retry fetch
      const { data: retryQueue } = await supabase
        .from("daily_queues")
        .select("id")
        .eq("queue_date", todayIST)
        .single();
      queueId = retryQueue?.id ?? null;
    } else {
      queueId = newQueue.id;
    }
  }

  if (!queueId) {
    return NextResponse.json(
      { error: "Failed to initialize today's daily queue. Please try again." },
      { status: 500 }
    );
  }

  // B. Check queue capacity (Max 50 songs)
  const { count: songCount } = await supabase
    .from("songs")
    .select("*", { count: "exact", head: true })
    .eq("queue_id", queueId);

  if (songCount !== null && songCount >= MAX_SONGS_PER_QUEUE) {
    return NextResponse.json(
      {
        error: `Today's queue is full (maximum ${MAX_SONGS_PER_QUEUE} songs reached). Submissions reopen tomorrow at 12:00 AM IST.`,
      },
      { status: 409 }
    );
  }

  // C. Check if this student reached their daily limit (Max 5 songs per day)
  const { count: userSubmissionCount } = await supabase
    .from("songs")
    .select("*", { count: "exact", head: true })
    .eq("queue_id", queueId)
    .eq("added_by", session.user.id);

  if (
    userSubmissionCount !== null &&
    userSubmissionCount >= MAX_SONGS_PER_STUDENT_PER_DAY
  ) {
    return NextResponse.json(
      {
        error: `You have reached your daily limit of ${MAX_SONGS_PER_STUDENT_PER_DAY} song submissions for today. Submissions reopen tomorrow at 12:00 AM IST.`,
      },
      { status: 409 }
    );
  }

  // D. Check if video already exists in today's queue
  const { data: videoDuplicate } = await supabase
    .from("songs")
    .select("id")
    .eq("queue_id", queueId)
    .eq("video_id", videoId)
    .single();

  if (videoDuplicate) {
    return NextResponse.json(
      {
        error:
          "This song has already been submitted to today's queue by another student.",
      },
      { status: 409 }
    );
  }

  // E. Calculate next queue position
  const { data: lastSong } = await supabase
    .from("songs")
    .select("position")
    .eq("queue_id", queueId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (lastSong?.position ?? 0) + 1;

  // F. Insert song into daily queue
  const { data: insertedSong, error: insertError } = await supabase
    .from("songs")
    .insert({
      queue_id: queueId,
      video_id: videoId,
      title: metadata.title,
      artist: metadata.artist,
      thumbnail_url: metadata.thumbnailUrl,
      added_by: session.user.id,
      mood_tag: (moodTag as MoodTag) || null,
      message: cleanMessage,
      position: nextPosition,
      status: "queued",
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      if (insertError.message?.includes("video") || insertError.details?.includes("video_id")) {
        return NextResponse.json(
          {
            error:
              "This song has already been submitted to today's queue by another student.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error:
            "You have reached your daily limit of 5 song submissions for today. Submissions reopen tomorrow at 12:00 AM IST.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to submit song to queue: " + insertError.message },
      { status: 500 }
    );
  }

  const { count: finalUserCount } = await supabase
    .from("songs")
    .select("*", { count: "exact", head: true })
    .eq("queue_id", queueId)
    .eq("added_by", session.user.id);

  const fallbackSubmissionsToday = finalUserCount ?? 1;
  const fallbackRemaining = Math.max(
    0,
    MAX_SONGS_PER_STUDENT_PER_DAY - fallbackSubmissionsToday
  );

  return NextResponse.json({
    success: true,
    song: insertedSong,
    submissionsToday: fallbackSubmissionsToday,
    remainingSubmissions: fallbackRemaining,
    maxSubmissions: MAX_SONGS_PER_STUDENT_PER_DAY,
    message:
      fallbackRemaining > 0
        ? `Your song has been successfully added to today's queue! You have ${fallbackRemaining} of ${MAX_SONGS_PER_STUDENT_PER_DAY} submissions remaining today.`
        : `Your song has been successfully added to today's queue! You have reached your daily limit of ${MAX_SONGS_PER_STUDENT_PER_DAY} submissions for today.`,
  });
}

