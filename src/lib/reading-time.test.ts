import { describe, expect, it } from "bun:test";
import { calculateReadingStats } from "./reading-time";

describe("calculateReadingStats", () => {
  it("should calculate word count and reading time for simple text", () => {
    const html = "<p>This is a simple test with ten words in it.</p>";
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(10);
    // 10 words / 225 WPM * 60 seconds = 2.67 seconds, rounded to 3
    expect(stats.readingTimeSeconds).toBe(3);
  });

  it("should calculate reading time for exactly 225 words", () => {
    // Generate exactly 225 words
    const words = Array.from({ length: 225 }, (_, i) => `word${i}`);
    const html = `<p>${words.join(" ")}</p>`;
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(225);
    // 225 words / 225 WPM * 60 seconds = 60 seconds
    expect(stats.readingTimeSeconds).toBe(60);
  });

  it("should strip HTML tags properly", () => {
    const html = `
      <article>
        <h1>Title Words</h1>
        <p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
        <ul>
          <li>List item one</li>
          <li>List item two</li>
        </ul>
      </article>
    `;
    const stats = calculateReadingStats(html);

    // Count: Title(1) Words(1) Paragraph(1) with(1) bold(1) and(1) italic(1) text(1) List(1) item(1) one(1) List(1) item(1) two(1) = 14
    expect(stats.wordCount).toBe(14);
  });

  it("should handle empty content", () => {
    const html = "";
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(0);
    expect(stats.readingTimeSeconds).toBe(0);
  });

  it("should handle HTML with only tags", () => {
    const html = "<div><span></span><p></p></div>";
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(0);
    expect(stats.readingTimeSeconds).toBe(0);
  });

  it("should handle content with script and style tags", () => {
    const html = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script>console.log("test");</script>
        </head>
        <body>
          <p>Only these five words count.</p>
        </body>
      </html>
    `;
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(5);
  });

  it("should handle content with multiple spaces", () => {
    const html = "<p>Words    with    multiple    spaces.</p>";
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(4);
  });

  it("should handle content with newlines", () => {
    const html = `<p>Line one
    Line two
    Line three</p>`;
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(6);
  });

  it("should handle HTML entities", () => {
    const html =
      "<p>Test &amp; example &lt;tag&gt; with &quot;quotes&quot;.</p>";
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(6);
  });

  it("should calculate reading time for long article", () => {
    // Simulate a 1000-word article (approximately 4 minutes 27 seconds read time)
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const html = `<article><p>${words.join(" ")}</p></article>`;
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(1000);
    // 1000 / 225 * 60 = 266.67 seconds, rounded to 267
    expect(stats.readingTimeSeconds).toBe(267);
  });

  it("should handle single word", () => {
    const html = "<p>word</p>";
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(1);
    // 1 word / 225 WPM * 60 = 0.27 seconds, rounded to 0
    expect(stats.readingTimeSeconds).toBe(0);
  });

  it("should round reading time correctly", () => {
    // Test rounding: 112 words / 225 WPM * 60 = 29.87 seconds
    const words = Array.from({ length: 112 }, (_, i) => `word${i}`);
    const html = `<p>${words.join(" ")}</p>`;
    const stats = calculateReadingStats(html);

    expect(stats.wordCount).toBe(112);
    expect(stats.readingTimeSeconds).toBe(30); // Should round to 30

    // Test rounding down: 113 words / 225 WPM * 60 = 30.13 seconds
    const words2 = Array.from({ length: 113 }, (_, i) => `word${i}`);
    const html2 = `<p>${words2.join(" ")}</p>`;
    const stats2 = calculateReadingStats(html2);

    expect(stats2.wordCount).toBe(113);
    expect(stats2.readingTimeSeconds).toBe(30); // Should round to 30
  });
});
