import { describe, expect, it } from "bun:test";

/**
 * Test the YouTube URL validation logic that is currently inline in index.ts.
 * Once we extract it to a module, we import from there. For now we
 * test the regex patterns directly to establish expected behavior.
 */

// This is the validation function we WANT to exist (TDD: write test first).
// We'll extract it from index.ts into a module.
import { isValidYouTubeUrl } from "../src/validation";

describe("isValidYouTubeUrl", () => {
  it("accepts standard youtube.com watch URL", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts youtu.be short link", () => {
    expect(isValidYouTubeUrl("https://youtu.be/AeNORH5vsnM")).toBe(true);
  });

  it("accepts youtu.be short link with query params", () => {
    expect(
      isValidYouTubeUrl("https://youtu.be/AeNORH5vsnM?is=Rj7dOMFy7W_UfSiJ"),
    ).toBe(true);
  });

  it("accepts youtube.com embed URL", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts youtube.com shorts URL", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/shorts/AeNORH5vsnM")).toBe(true);
  });

  it("accepts http (not just https)", () => {
    expect(isValidYouTubeUrl("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts music.youtube.com", () => {
    expect(isValidYouTubeUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("rejects non-YouTube URLs", () => {
    expect(isValidYouTubeUrl("https://vimeo.com/123456")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidYouTubeUrl("")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(isValidYouTubeUrl("not a url")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isValidYouTubeUrl(null as any)).toBe(false);
    expect(isValidYouTubeUrl(undefined as any)).toBe(false);
  });
});
