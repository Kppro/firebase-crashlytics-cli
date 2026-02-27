// ─── Relative Date Parsing ──────────────────────────────────────────────────

/**
 * Parses a relative date string like "7d", "24h", "30d", "1h" and returns
 * an ISO 8601 date string representing that duration in the past from now.
 *
 * Also accepts standard ISO 8601 date strings (e.g. "2024-01-15T10:30:00Z"),
 * which are returned as-is after validation.
 *
 * Supported units:
 * - `h` — hours (e.g. "24h" = 24 hours ago)
 * - `d` — days  (e.g. "7d"  = 7 days ago)
 *
 * @param input - A relative duration string ("7d", "24h") or an ISO 8601 date.
 * @returns An ISO 8601 date string.
 * @throws If the input format is not recognized.
 */
export function parseRelativeDate(input: string): string {
  // Try relative format first: "7d", "24h", "30d", etc.
  const relativeMatch = input.match(/^(\d+)([hd])$/);

  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];

    const now = new Date();

    switch (unit) {
      case "h":
        now.setHours(now.getHours() - amount);
        break;
      case "d":
        now.setDate(now.getDate() - amount);
        break;
    }

    return now.toISOString();
  }

  // Try standard ISO 8601 date
  const parsed = new Date(input);

  if (isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid date format: "${input}". Use a relative duration (e.g. "7d", "24h") or an ISO 8601 date.`,
    );
  }

  return parsed.toISOString();
}

// ─── Time Ago ───────────────────────────────────────────────────────────────

/**
 * Returns a human-readable "time ago" string for a given date.
 *
 * Examples:
 * - "just now"     (< 60 seconds)
 * - "2m ago"       (minutes)
 * - "3h ago"       (hours)
 * - "5 days ago"   (days)
 * - "2 weeks ago"  (weeks)
 * - "3 months ago" (months)
 * - "1 year ago"   (years)
 *
 * @param date - An ISO 8601 date string or a Date object.
 * @returns A human-readable relative time string.
 */
export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  // Handle future dates or very recent
  if (diffMs < 0) {
    return "just now";
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  if (days < 7) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  if (weeks < 5) {
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }

  if (months < 12) {
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }

  return `${years} year${years > 1 ? "s" : ""} ago`;
}

// ─── Date Formatting ────────────────────────────────────────────────────────

/**
 * Formats a date into a human-readable string: "YYYY-MM-DD HH:mm".
 *
 * Uses local time (not UTC) for display.
 *
 * @param date - An ISO 8601 date string or a Date object.
 * @returns A formatted date string like "2024-01-15 10:30".
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
