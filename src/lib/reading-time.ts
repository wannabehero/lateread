import { htmlToPlainText } from "./tts";

const WORDS_PER_MINUTE = 225;

export interface ReadingStats {
  wordCount: number;
  readingTimeSeconds: number;
}

/**
 * Calculate reading statistics from HTML content
 * Uses 225 WPM as the average reading speed
 */
export function calculateReadingStats(htmlContent: string): ReadingStats {
  const plainText = htmlToPlainText(htmlContent);
  const words = plainText.split(/\s+/).filter((word) => word.length > 0);
  const wordCount = words.length;
  const readingTimeSeconds = Math.round((wordCount / WORDS_PER_MINUTE) * 60);

  return { wordCount, readingTimeSeconds };
}
