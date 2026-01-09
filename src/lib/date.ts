/**
 * Format a timestamp as a relative time string (e.g., "2 hours ago", "Yesterday")
 * Falls back to absolute date for older timestamps
 */
export function formatRelativeTime(timestamp: Date | null): string {
  if (!timestamp) {
    return "";
  }

  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Less than a minute
  if (diffSecs < 60) {
    return "Just now";
  }

  // Less than an hour
  if (diffMins < 60) {
    return diffMins === 1 ? "1 minute ago" : `${diffMins} minutes ago`;
  }

  // Less than a day
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  // Yesterday
  if (diffDays === 1) {
    return "Yesterday";
  }

  // Less than a week
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  // Less than a month (30 days)
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }

  // Less than a year
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }

  // More than a year - show absolute date
  const year = date.getFullYear();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  return `${month} ${day}, ${year}`;
}

/**
 * Format reading time in seconds as a human-readable string
 * Examples: "< 1 min read", "5 min read", "1 hr 30 min read"
 */
export function formatReadingTime(seconds: number | null): string | null {
  if (!seconds) return null;

  // Show "< 1 min read" for anything less than 60 seconds
  if (seconds < 60) return "< 1 min read";

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${minutes} min read`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) return `${hours} hr read`;
  return `${hours} hr ${remainingMinutes} min read`;
}
