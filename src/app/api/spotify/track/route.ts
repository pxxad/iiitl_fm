/**
 * GET /api/spotify/track?url=<spotify-track-url>
 *
 * Resolves a Spotify track URL to its metadata AND a list of matching YouTube
 * video candidates for the user to select from.
 *
 * This endpoint is authentication-aware but does NOT require auth — unauthenticated
 * users can resolve track metadata (preview only). The actual submission requires auth.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  extractSpotifyTrackId,
  fetchSpotifyTrackMetadata,
  isSpotifyConfigured,
} from "@/lib/spotify";
import { searchYouTubeForTrack, isYouTubeSearchConfigured } from "@/lib/youtube-search";

export interface SpotifyTrackResolveResponse {
  trackId: string;
  title: string;
  artist: string;
  allArtists: string;
  albumArtUrl: string | null;
  durationSeconds: number | null;
  externalUrl: string;
  /** Ordered list of YouTube video candidates — user picks one */
  youtubeResults: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string;
    publishedAt: string;
  }>;
  /** Whether YouTube search was configured and ran */
  youtubeSearchAvailable: boolean;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing 'url' query parameter." },
      { status: 400 }
    );
  }

  const trackId = extractSpotifyTrackId(url);
  if (!trackId) {
    return NextResponse.json(
      {
        error:
          "Invalid Spotify track URL. Please paste a link like: https://open.spotify.com/track/...",
      },
      { status: 400 }
    );
  }

  // Check Spotify credentials
  if (!isSpotifyConfigured()) {
    return NextResponse.json(
      {
        error:
          "Spotify integration is not configured. Please contact the admin to add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  // Fetch Spotify track metadata
  const spotifyMeta = await fetchSpotifyTrackMetadata(trackId);
  if (!spotifyMeta) {
    return NextResponse.json(
      {
        error:
          "Could not retrieve track information from Spotify. The track may be unavailable in your region or the link is incorrect.",
      },
      { status: 404 }
    );
  }

  // Search YouTube for matching videos
  const youtubeSearchAvailable = isYouTubeSearchConfigured();
  const youtubeResults = youtubeSearchAvailable
    ? await searchYouTubeForTrack(spotifyMeta.title, spotifyMeta.artist, 5)
    : [];

  const response: SpotifyTrackResolveResponse = {
    trackId: spotifyMeta.trackId,
    title: spotifyMeta.title,
    artist: spotifyMeta.artist,
    allArtists: spotifyMeta.allArtists,
    albumArtUrl: spotifyMeta.albumArtUrl,
    durationSeconds: spotifyMeta.durationSeconds,
    externalUrl: spotifyMeta.externalUrl,
    youtubeResults,
    youtubeSearchAvailable,
  };

  return NextResponse.json(response);
}
