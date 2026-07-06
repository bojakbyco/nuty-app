import { describe, expect, it } from "bun:test";
import { classifyExtractError, isAntiBotError } from "../src/errors";

describe("isAntiBotError", () => {
  it("detects 'Sign in to confirm' anti-bot message", () => {
    expect(
      isAntiBotError("ERROR: Sign in to confirm you're not a bot"),
    ).toBe(true);
  });

  it("detects 'not a bot' anti-bot message", () => {
    expect(isAntiBotError("ERROR: confirm you're not a bot")).toBe(true);
  });

  it("does not flag regular errors", () => {
    expect(isAntiBotError("Network error: timeout")).toBe(false);
  });

  it("does not flag empty strings", () => {
    expect(isAntiBotError("")).toBe(false);
  });
});

describe("classifyExtractError", () => {
  it("returns anti-bot classification with user-friendly message", () => {
    const result = classifyExtractError(
      "YouTube anti-bot gate: yt-dlp was blocked. Original error: Sign in to confirm",
    );
    expect(result.type).toBe("anti_bot");
    expect(result.userMessage).toContain("YouTube is blocking");
    expect(result.actionable).toBe(true);
  });

  it("returns generic error for non-anti-bot failures", () => {
    const result = classifyExtractError("Network timeout");
    expect(result.type).toBe("generic");
    expect(result.actionable).toBe(false);
  });

  it("returns not_found for 404 responses", () => {
    const result = classifyExtractError("404 Not Found");
    expect(result.type).toBe("not_found");
  });

  it("returns auth_error for 401 responses", () => {
    const result = classifyExtractError("401 Unauthorized");
    expect(result.type).toBe("auth_error");
  });
});
