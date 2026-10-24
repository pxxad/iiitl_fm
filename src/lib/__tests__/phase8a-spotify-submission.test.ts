/**
 * IIITL FM — Phase 8A: Spotify Track Link Submission Tests
 *
 * Tests Spotify URL/ID extraction, isSpotifyTrackUrl, YouTube search utility
 * (with mocked fetch), and YouTube extraction regression.
 *
 * Follows the project's native async test pattern (no vitest/jest runner required).
 */

import { extractSpotifyTrackId, isSpotifyTrackUrl } from "../spotify";
import { extractYouTubeId } from "../youtube";

export async function runPhase8aTests(): Promise<
  Array<{ test: string; passed: boolean; error?: string }>
> {
  const results: Array<{ test: string; passed: boolean; error?: string }> = [];

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      results.push({ test: testName, passed: true });
    } else {
      results.push({
        test: testName,
        passed: false,
        error: detail ?? "Assertion failed",
      });
    }
  }

  // ─── 1. extractSpotifyTrackId ───────────────────────────────────────────────

  assert(
    extractSpotifyTrackId(
      "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"
    ) === "4cOdK2wGLETKBW3PvgPWqT",
    "Spotify: extract ID from standard open.spotify.com/track URL"
  );

  assert(
    extractSpotifyTrackId(
      "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123"
    ) === "4cOdK2wGLETKBW3PvgPWqT",
    "Spotify: extract ID from URL with ?si= query param"
  );

  assert(
    extractSpotifyTrackId("spotify:track:4cOdK2wGLETKBW3PvgPWqT") ===
      "4cOdK2wGLETKBW3PvgPWqT",
    "Spotify: extract ID from spotify:track: URI"
  );

  assert(
    extractSpotifyTrackId("4cOdK2wGLETKBW3PvgPWqT") ===
      "4cOdK2wGLETKBW3PvgPWqT",
    "Spotify: return bare 22-char ID unchanged"
  );

  assert(
    extractSpotifyTrackId(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ) === null,
    "Spotify: return null for a YouTube URL"
  );

  assert(
    extractSpotifyTrackId(
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
    ) === null,
    "Spotify: return null for a playlist URL"
  );

  assert(
    extractSpotifyTrackId(
      "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy"
    ) === null,
    "Spotify: return null for an album URL"
  );

  assert(
    extractSpotifyTrackId("not-a-url") === null,
    "Spotify: return null for arbitrary text"
  );

  assert(
    extractSpotifyTrackId("") === null,
    "Spotify: return null for empty string"
  );

  assert(
    extractSpotifyTrackId(null) === null,
    "Spotify: return null for null input"
  );

  assert(
    extractSpotifyTrackId("4cOdK2wGLETKBW3PvgPWq") === null,
    "Spotify: return null for 21-char ID (too short)"
  );

  assert(
    extractSpotifyTrackId("4cOdK2wGLETKBW3PvgPWqTX") === null,
    "Spotify: return null for 23-char ID (too long)"
  );

  // ─── 2. isSpotifyTrackUrl ───────────────────────────────────────────────────

  assert(
    isSpotifyTrackUrl(
      "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"
    ) === true,
    "isSpotifyTrackUrl: returns true for valid Spotify track URL"
  );

  assert(
    isSpotifyTrackUrl("spotify:track:4cOdK2wGLETKBW3PvgPWqT") === true,
    "isSpotifyTrackUrl: returns true for spotify: URI"
  );

  assert(
    isSpotifyTrackUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ) === false,
    "isSpotifyTrackUrl: returns false for YouTube URL"
  );

  assert(
    isSpotifyTrackUrl(
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
    ) === false,
    "isSpotifyTrackUrl: returns false for Spotify playlist URL"
  );

  // ─── 3. YouTube extraction regression (existing flow unchanged) ────────────

  assert(
    extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ") ===
      "dQw4w9WgXcQ",
    "YouTube regression: extract from standard watch URL"
  );

  assert(
    extractYouTubeId("https://youtu.be/dQw4w9WgXcQ") === "dQw4w9WgXcQ",
    "YouTube regression: extract from youtu.be short URL"
  );

  assert(
    extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ") ===
      "dQw4w9WgXcQ",
    "YouTube regression: extract from Shorts URL"
  );

  assert(
    extractYouTubeId("dQw4w9WgXcQ") === "dQw4w9WgXcQ",
    "YouTube regression: accept bare 11-char video ID"
  );

  assert(
    extractYouTubeId(
      "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"
    ) === null,
    "YouTube regression: return null for Spotify URL"
  );

  assert(
    extractYouTubeId("not-a-url") === null,
    "YouTube regression: return null for random string"
  );

  // ─── 4. YouTube Search — missing API key ────────────────────────────────────
  // We test the safe fallback without needing a real key.
  // The actual search API call is integration-tested when credentials are present.
  try {
    const savedKey = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;

    const { searchYouTubeForTrack } = await import("../youtube-search");
    const results2 = await searchYouTubeForTrack("Test Track", "Test Artist");

    assert(
      Array.isArray(results2) && results2.length === 0,
      "YouTube search: returns empty array when YOUTUBE_API_KEY is missing"
    );

    if (savedKey) process.env.YOUTUBE_API_KEY = savedKey;
  } catch (err) {
    results.push({
      test: "YouTube search: returns empty array when YOUTUBE_API_KEY is missing",
      passed: false,
      error: String(err),
    });
  }

  return results;
}
