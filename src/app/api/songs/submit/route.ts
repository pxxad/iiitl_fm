import { NextResponse, type NextRequest } from "next/server";
import { getCampusUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { extractYouTubeId, fetchYouTubeMetadata } from "@/lib/youtube";
import { todayInIST } from "@/lib/utils";
import { MAX_MESSAGE_LENGTH, MOOD_TAGS } from "@/lib/constants";
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

  // ─── 4. Attempt Atomic RPC Submission First (Migration 005) ────────────────
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
      return NextResponse.json({
        success: true,
        song: rpcData,
        message: "Your song has been successfully added to today's queue!",
      });
    }

    // Check for specific application errors returned by the RPC
    if (rpcError) {
      const errMsg = rpcError.message || "";
      if (
        errMsg.includes("already submitted a song for today") ||
        rpcError.code === "23505"
      ) {
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
              "You have already submitted a song for today. Each student can submit one song per calendar day.",
          },
          { status: 409 }
        );
      }

      // If RPC doesn't exist yet (function not found 42883), fallback to direct query path
      if (rpcError.code !== "42883") {
        console.warn("[Submit Song] RPC returned error, using fallback:", rpcError);
      }
    }
  } catch (err) {
    console.warn("[Submit Song] RPC attempt failed, proceeding to query fallback:", err);
  }

  // ─── 5. Fallback Direct Query Path ─────────────────────────────────────────
  // Derives the current date in Asia/Kolkata strictly server-side
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
      // Could be race condition, retry fetch
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

  // B. Check if this student already submitted a song to today's queue
  const { data: userSubmission } = await supabase
    .from("songs")
    .select("id")
    .eq("queue_id", queueId)
    .eq("added_by", session.user.id)
    .single();

  if (userSubmission) {
    return NextResponse.json(
      {
        error:
          "You have already submitted a song for today. Each student can submit one song per calendar day.",
      },
      { status: 409 }
    );
  }

  // C. Check if video already exists in today's queue
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

  // D. Calculate next queue position
  const { data: lastSong } = await supabase
    .from("songs")
    .select("position")
    .eq("queue_id", queueId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (lastSong?.position ?? 0) + 1;

  // E. Insert song
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
      if (insertError.message?.includes("video")) {
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
            "You have already submitted a song for today. Each student can submit one song per calendar day.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to submit song to queue: " + insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    song: insertedSong,
    message: "Your song has been successfully added to today's queue!",
  });
}
