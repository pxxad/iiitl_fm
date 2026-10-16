/**
 * IIITL FM — YouTube Utilities
 * Uses official YouTube oEmbed API for safe metadata fetching.
 * Zero scraping, zero third-party scrapers, zero audio download.
 */

export interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
}

/**
 * Extracts and strictly validates an 11-character YouTube video ID.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - Direct 11-character video ID
 */
export function extractYouTubeId(urlOrId: string | null | undefined): string | null {
  if (!urlOrId || typeof urlOrId !== "string") return null;

  const trimmed = urlOrId.trim();

  // If already a bare 11-char ID
  if (/^[a-zA-Z0-9_\-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const urlObj = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const hostname = urlObj.hostname.toLowerCase();

    // youtu.be/ID
    if (hostname === "youtu.be" || hostname.endsWith(".youtu.be")) {
      const pathPart = urlObj.pathname.slice(1).split("/")[0].split("?")[0];
      return /^[a-zA-Z0-9_\-]{11}$/.test(pathPart) ? pathPart : null;
    }

    // youtube.com, m.youtube.com, www.youtube.com
    if (
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtube-nocookie.com" ||
      hostname.endsWith(".youtube-nocookie.com")
    ) {
      // /watch?v=ID
      const v = urlObj.searchParams.get("v");
      if (v) {
        return /^[a-zA-Z0-9_\-]{11}$/.test(v) ? v : null;
      }

      // /embed/ID or /shorts/ID or /v/ID
      const match = urlObj.pathname.match(
        /^\/(?:embed|shorts|v)\/([a-zA-Z0-9_\-]{11})(?:\/|$)/
      );
      if (match) {
        return match[1];
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns a high-res or HQ thumbnail URL directly from YouTube CDN.
 */
export function getYouTubeThumbnailUrl(
  videoId: string,
  quality: "hq" | "maxres" = "hq"
): string {
  return quality === "maxres"
    ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Fetches video title, artist/channel name, and thumbnail using YouTube's official oEmbed endpoint.
 * Requires NO API key, avoids scraping, and validates that the video is public and embeddable.
 */
export async function fetchYouTubeMetadata(
  videoId: string
): Promise<YouTubeVideoMetadata | null> {
  const cleanId = extractYouTubeId(videoId);
  if (!cleanId) return null;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${cleanId}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: {
        "User-Agent": "IIITL-FM-Campus-Radio/1.0",
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      videoId: cleanId,
      title: data.title || "Untitled Song",
      artist: data.author_name || "Unknown Artist",
      thumbnailUrl:
        data.thumbnail_url || getYouTubeThumbnailUrl(cleanId, "hq"),
    };
  } catch (error) {
    console.error("[YouTube] Metadata fetch failed:", error);
    // Fallback: Return ID with CDN thumbnail
    return {
      videoId: cleanId,
      title: "Campus Song Submission",
      artist: "Student Selection",
      thumbnailUrl: getYouTubeThumbnailUrl(cleanId, "hq"),
    };
  }
}
