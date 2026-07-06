/**
 * Shared validation utilities for YouTube URLs.
 * Extracted from inline route logic so it can be tested independently.
 */

/**
 * Check if a URL is a valid YouTube link.
 * Accepts:
 *   - youtube.com/watch?v=...
 *   - youtu.be/...
 *   - youtube.com/embed/...
 *   - youtube.com/shorts/...
 *   - music.youtube.com/...
 *   - m.youtube.com/...
 * With or without query parameters.
 */
export function isValidYouTubeUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  return /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(url);
}

/**
 * Extract the 11-character video ID from any YouTube URL format.
 */
export function extractVideoId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  // fallback: assume the input is already a video ID
  return url.substring(0, 11);
}
