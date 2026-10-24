/**
 * IIITL FM — YouTube Search Utility (Server-Only)
 *
 * Uses the YouTube Data API v3 `search.list` endpoint to find video candidates
 * matching a Spotify track (title + artist). Each search costs 100 quota units.
 * The free daily quota is 100 searches/day, which is sufficient for a campus app
 * that allows at most 50 submissions per day.
 *
 * Required env var (server-only):
 *   YOUTUBE_API_KEY
 */

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  /** ISO 8601 published date, e.g. "2022-03-14T00:00:00Z" */
  publishedAt: string;
}

/**
 * Searches YouTube for videos matching a track title and artist.
 * Returns up to `maxResults` (default 5) candidates for the user to choose from.
 * Returns an empty array on API key absence or quota exhaustion — never throws.
 */
export async function searchYouTubeForTrack(
  title: string,
  artist: string,
  maxResults: number = 5
): Promise<YouTubeSearchResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.warn(
      "[YouTube Search] YOUTUBE_API_KEY not configured — cannot perform search."
    );
    return [];
  }

  // Build a tight search query: "Artist - Title official" biases toward official uploads
  const query = `${artist} - ${title} official`;

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    videoCategoryId: "10", // Music category
    maxResults: String(Math.min(maxResults, 10)),
    safeSearch: "moderate",
    key: apiKey,
  });

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
      {
        // Short cache: same search results are unlikely to change within a minute
        next: { revalidate: 60 },
      }
    );

    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      const reason = body?.error?.errors?.[0]?.reason ?? "unknown";
      console.warn(
        `[YouTube Search] API returned 403 (reason: ${reason}). Quota may be exhausted.`
      );
      return [];
    }

    if (!res.ok) {
      console.error(`[YouTube Search] API error (${res.status})`);
      return [];
    }

    const data = await res.json();
    const items: Array<Record<string, unknown>> = data.items ?? [];

    return items
      .filter((item) => {
        const id = item.id as Record<string, string>;
        return id?.kind === "youtube#video" && id?.videoId;
      })
      .map((item) => {
        const id = item.id as Record<string, string>;
        const snippet = item.snippet as Record<string, unknown>;
        const thumbnails = snippet.thumbnails as Record<
          string,
          { url: string }
        >;

        return {
          videoId: id.videoId,
          title: (snippet.title as string) ?? "Untitled",
          channelTitle: (snippet.channelTitle as string) ?? "Unknown Channel",
          thumbnailUrl:
            thumbnails?.high?.url ??
            thumbnails?.medium?.url ??
            thumbnails?.default?.url ??
            `https://img.youtube.com/vi/${id.videoId}/hqdefault.jpg`,
          publishedAt: (snippet.publishedAt as string) ?? "",
        };
      });
  } catch (err) {
    console.error("[YouTube Search] Unexpected error during search:", err);
    return [];
  }
}

/** Returns true if the YouTube Data API key is configured. */
export function isYouTubeSearchConfigured(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}
