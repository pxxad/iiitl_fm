import { extractYouTubeId, fetchYouTubeMetadata } from "@/lib/youtube";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing 'url' query parameter" },
      { status: 400 }
    );
  }

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: "Invalid YouTube URL or video ID. Please check the link." },
      { status: 400 }
    );
  }

  const meta = await fetchYouTubeMetadata(videoId);
  if (!meta) {
    return NextResponse.json(
      {
        error:
          "Unable to load video details. The video might be private, unlisted, or region-restricted.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json(meta);
}
