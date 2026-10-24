/**
 * IIITL FM — Spotify Utilities (Server-Only)
 *
 * Uses the Client Credentials OAuth flow to fetch public track metadata.
 * No user login required. Never downloads or rebroadcasts audio.
 *
 * Required env vars (server-only, never exposed to browser):
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 */

export interface SpotifyTrackMetadata {
  trackId: string;
  title: string;
  /** Primary artist display name */
  artist: string;
  /** All artist names joined with ", " */
  allArtists: string;
  /** Album art URL (640px) */
  albumArtUrl: string | null;
  /** Duration in seconds */
  durationSeconds: number | null;
  /** Spotify external URL (for attribution only) */
  externalUrl: string;
}

// ─── Token Cache ──────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Fetches a server-side Spotify access token using the Client Credentials flow.
 * Result is cached in module memory for the token's 1-hour lifetime.
 */
async function getSpotifyToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "[Spotify] Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET environment variables."
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    // Don't cache this — always want a fresh token when needed
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `[Spotify] Token request failed (${res.status}): ${errBody}`
    );
  }

  const data = await res.json();
  cachedToken = data.access_token as string;
  tokenExpiresAt = Date.now() + (data.expires_in as number) * 1000;

  return cachedToken;
}

// ─── URL / ID Utilities ───────────────────────────────────────────────────────

/**
 * Extracts a Spotify track ID from a URL or bare ID.
 *
 * Supports:
 *   https://open.spotify.com/track/TRACK_ID
 *   https://open.spotify.com/track/TRACK_ID?si=...
 *   spotify:track:TRACK_ID
 *   Bare 22-character ID
 */
export function extractSpotifyTrackId(
  urlOrId: string | null | undefined
): string | null {
  if (!urlOrId || typeof urlOrId !== "string") return null;

  const trimmed = urlOrId.trim();

  // Bare Spotify ID — 22 base62 characters
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;

  // URI format: spotify:track:ID
  const uriMatch = trimmed.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uriMatch) return uriMatch[1];

  // URL format
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (
      url.hostname === "open.spotify.com" ||
      url.hostname.endsWith(".spotify.com")
    ) {
      const pathMatch = url.pathname.match(/\/track\/([A-Za-z0-9]{22})/);
      if (pathMatch) return pathMatch[1];
    }
  } catch {
    // Not a URL — ignore
  }

  return null;
}

/**
 * Returns true if the given string looks like a Spotify track URL or ID.
 */
export function isSpotifyTrackUrl(input: string): boolean {
  return extractSpotifyTrackId(input) !== null;
}

// ─── Metadata Fetch ───────────────────────────────────────────────────────────

/**
 * Fetches public track metadata from Spotify using the Client Credentials flow.
 * Returns null if credentials are missing, the track is not found, or the API fails.
 */
export async function fetchSpotifyTrackMetadata(
  trackIdOrUrl: string
): Promise<SpotifyTrackMetadata | null> {
  const trackId = extractSpotifyTrackId(trackIdOrUrl);
  if (!trackId) return null;

  let token: string;
  try {
    token = await getSpotifyToken();
  } catch (err) {
    console.error("[Spotify] Could not obtain access token:", err);
    return null;
  }

  try {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 },
    });

    if (res.status === 404) {
      return null; // Track not found
    }

    if (!res.ok) {
      console.error(`[Spotify] Track fetch failed (${res.status})`);
      return null;
    }

    const data = await res.json();

    const artists: Array<{ name: string }> = data.artists ?? [];
    const primaryArtist = artists[0]?.name ?? "Unknown Artist";
    const allArtists =
      artists.length > 0 ? artists.map((a) => a.name).join(", ") : primaryArtist;

    // Pick the largest album image available
    const images: Array<{ url: string; width: number; height: number }> =
      data.album?.images ?? [];
    const albumArtUrl =
      images.sort((a, b) => b.width - a.width)[0]?.url ?? null;

    return {
      trackId,
      title: data.name ?? "Unknown Title",
      artist: primaryArtist,
      allArtists,
      albumArtUrl,
      durationSeconds: data.duration_ms
        ? Math.round(data.duration_ms / 1000)
        : null,
      externalUrl: data.external_urls?.spotify ?? `https://open.spotify.com/track/${trackId}`,
    };
  } catch (err) {
    console.error("[Spotify] Unexpected error fetching track metadata:", err);
    return null;
  }
}

/** Returns true if Spotify credentials are configured in env. */
export function isSpotifyConfigured(): boolean {
  return !!(
    process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
  );
}
