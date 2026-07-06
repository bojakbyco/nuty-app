/**
 * Error classification for extract failures.
 * Maps raw error strings from yt-extract into user-friendly categories
 * so the UI can show actionable messages instead of raw stack traces.
 */

export type ErrorType = "anti_bot" | "not_found" | "auth_error" | "generic";

export interface ClassifiedError {
  type: ErrorType;
  userMessage: string;
  actionable: boolean;
}

/**
 * Detect whether an error message indicates YouTube's anti-bot gate.
 */
export function isAntiBotError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("sign in to confirm") ||
    lower.includes("not a bot") ||
    lower.includes("anti-bot") ||
    lower.includes("anti bot")
  );
}

/**
 * Classify an extract error into a user-friendly category.
 */
export function classifyExtractError(rawError: string): ClassifiedError {
  // Anti-bot gate
  if (isAntiBotError(rawError)) {
    return {
      type: "anti_bot",
      userMessage:
        "YouTube is blocking automated downloads from this server. " +
        "This is a known limitation when running on cloud/datacenter IPs. " +
        "The service administrator needs to add YouTube cookies to bypass this.",
      actionable: true,
    };
  }

  // HTTP status codes
  if (rawError.includes("404") || rawError.toLowerCase().includes("not found")) {
    return {
      type: "not_found",
      userMessage: "The extraction service endpoint was not found. This may be a configuration issue.",
      actionable: false,
    };
  }

  if (rawError.includes("401") || rawError.toLowerCase().includes("unauthorized")) {
    return {
      type: "auth_error",
      userMessage: "Authentication failed. The API key may be incorrect.",
      actionable: false,
    };
  }

  // Generic fallback
  return {
    type: "generic",
    userMessage: rawError,
    actionable: false,
  };
}
