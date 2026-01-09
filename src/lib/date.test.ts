import { beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { formatReadingTime, formatRelativeTime } from "./date";

describe("formatRelativeTime", () => {
  // Fix the current time to a known value for consistent testing
  const NOW = new Date("2024-06-15T12:00:00Z");

  beforeEach(() => {
    setSystemTime(NOW);
  });

  it("should return empty string for null timestamp", () => {
    expect(formatRelativeTime(null)).toBe("");
  });

  describe("relative time formatting", () => {
    it.each([
      // Just now (less than 1 minute)
      {
        timestamp: new Date("2024-06-15T11:59:30Z"),
        expected: "Just now",
        description: "30 seconds ago",
      },
      {
        timestamp: new Date("2024-06-15T11:59:59Z"),
        expected: "Just now",
        description: "1 second ago",
      },

      // Minutes
      {
        timestamp: new Date("2024-06-15T11:59:00Z"),
        expected: "1 minute ago",
        description: "1 minute ago",
      },
      {
        timestamp: new Date("2024-06-15T11:55:00Z"),
        expected: "5 minutes ago",
        description: "5 minutes ago",
      },
      {
        timestamp: new Date("2024-06-15T11:30:00Z"),
        expected: "30 minutes ago",
        description: "30 minutes ago",
      },
      {
        timestamp: new Date("2024-06-15T11:01:00Z"),
        expected: "59 minutes ago",
        description: "59 minutes ago",
      },

      // Hours
      {
        timestamp: new Date("2024-06-15T11:00:00Z"),
        expected: "1 hour ago",
        description: "1 hour ago",
      },
      {
        timestamp: new Date("2024-06-15T10:00:00Z"),
        expected: "2 hours ago",
        description: "2 hours ago",
      },
      {
        timestamp: new Date("2024-06-15T06:00:00Z"),
        expected: "6 hours ago",
        description: "6 hours ago",
      },
      {
        timestamp: new Date("2024-06-15T00:00:00Z"),
        expected: "12 hours ago",
        description: "12 hours ago",
      },
      {
        timestamp: new Date("2024-06-14T23:00:00Z"),
        expected: "13 hours ago",
        description: "13 hours ago",
      },

      // Yesterday
      {
        timestamp: new Date("2024-06-14T12:00:00Z"),
        expected: "Yesterday",
        description: "exactly 1 day ago",
      },
      {
        timestamp: new Date("2024-06-14T00:00:00Z"),
        expected: "Yesterday",
        description: "1 day and 12 hours ago",
      },

      // Days
      {
        timestamp: new Date("2024-06-13T12:00:00Z"),
        expected: "2 days ago",
        description: "2 days ago",
      },
      {
        timestamp: new Date("2024-06-12T12:00:00Z"),
        expected: "3 days ago",
        description: "3 days ago",
      },
      {
        timestamp: new Date("2024-06-09T12:00:00Z"),
        expected: "6 days ago",
        description: "6 days ago",
      },

      // Weeks
      {
        timestamp: new Date("2024-06-08T12:00:00Z"),
        expected: "1 week ago",
        description: "1 week ago",
      },
      {
        timestamp: new Date("2024-06-01T12:00:00Z"),
        expected: "2 weeks ago",
        description: "2 weeks ago",
      },
      {
        timestamp: new Date("2024-05-25T12:00:00Z"),
        expected: "3 weeks ago",
        description: "3 weeks ago",
      },
      {
        timestamp: new Date("2024-05-18T12:00:00Z"),
        expected: "4 weeks ago",
        description: "4 weeks ago",
      },

      // Months
      {
        timestamp: new Date("2024-05-15T12:00:00Z"),
        expected: "1 month ago",
        description: "1 month ago",
      },
      {
        timestamp: new Date("2024-04-15T12:00:00Z"),
        expected: "2 months ago",
        description: "2 months ago",
      },
      {
        timestamp: new Date("2024-01-15T12:00:00Z"),
        expected: "5 months ago",
        description: "5 months ago",
      },
      {
        timestamp: new Date("2023-12-15T12:00:00Z"),
        expected: "6 months ago",
        description: "6 months ago",
      },
      {
        timestamp: new Date("2023-07-15T12:00:00Z"),
        expected: "11 months ago",
        description: "11 months ago",
      },

      // Years (absolute dates)
      {
        timestamp: new Date("2023-06-15T12:00:00Z"),
        expected: "Jun 15, 2023",
        description: "1 year ago",
      },
      {
        timestamp: new Date("2022-01-15T12:00:00Z"),
        expected: "Jan 15, 2022",
        description: "2+ years ago",
      },
      {
        timestamp: new Date("2020-12-25T12:00:00Z"),
        expected: "Dec 25, 2020",
        description: "3+ years ago",
      },
    ])("should format $description as '$expected'", ({
      timestamp,
      expected,
    }) => {
      expect(formatRelativeTime(timestamp)).toBe(expected);
    });
  });

  describe("edge cases", () => {
    it("should handle future dates gracefully", () => {
      const futureDate = new Date("2024-06-15T13:00:00Z"); // 1 hour in the future
      // Should show as "Just now" since diff would be negative
      expect(formatRelativeTime(futureDate)).toBe("Just now");
    });

    it("should handle very old dates", () => {
      const veryOldDate = new Date("1990-01-01T00:00:00Z");
      expect(formatRelativeTime(veryOldDate)).toBe("Jan 1, 1990");
    });

    it("should handle dates at exact boundaries", () => {
      // Exactly 60 seconds (should be 1 minute)
      const exactMinute = new Date(NOW.getTime() - 60 * 1000);
      expect(formatRelativeTime(exactMinute)).toBe("1 minute ago");

      // Exactly 60 minutes (should be 1 hour)
      const exactHour = new Date(NOW.getTime() - 60 * 60 * 1000);
      expect(formatRelativeTime(exactHour)).toBe("1 hour ago");

      // Exactly 24 hours (should be Yesterday)
      const exactDay = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(exactDay)).toBe("Yesterday");

      // Exactly 7 days (should be 1 week)
      const exactWeek = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(exactWeek)).toBe("1 week ago");
    });
  });

  describe("date object compatibility", () => {
    it("should accept Date objects", () => {
      const date = new Date("2024-06-15T11:00:00Z");
      expect(formatRelativeTime(date)).toBe("1 hour ago");
    });

    it("should handle dates created from timestamps", () => {
      const timestamp = new Date("2024-06-15T10:00:00Z").getTime();
      const date = new Date(timestamp);
      expect(formatRelativeTime(date)).toBe("2 hours ago");
    });
  });
});

describe("formatReadingTime", () => {
  it("should return null for null input", () => {
    expect(formatReadingTime(null)).toBeNull();
  });

  it("should return null for 0 seconds", () => {
    expect(formatReadingTime(0)).toBeNull();
  });

  it("should format less than 1 minute", () => {
    expect(formatReadingTime(30)).toBe("< 1 min read");
    expect(formatReadingTime(45)).toBe("< 1 min read");
    expect(formatReadingTime(59)).toBe("< 1 min read");
  });

  it("should format exactly 1 minute", () => {
    expect(formatReadingTime(60)).toBe("1 min read");
  });

  it("should format minutes (less than 1 hour)", () => {
    expect(formatReadingTime(120)).toBe("2 min read"); // 2 minutes
    expect(formatReadingTime(300)).toBe("5 min read"); // 5 minutes
    expect(formatReadingTime(600)).toBe("10 min read"); // 10 minutes
    expect(formatReadingTime(1800)).toBe("30 min read"); // 30 minutes
    expect(formatReadingTime(3540)).toBe("59 min read"); // 59 minutes
  });

  it("should format exactly 1 hour", () => {
    expect(formatReadingTime(3600)).toBe("1 hr read");
  });

  it("should format hours without remaining minutes", () => {
    expect(formatReadingTime(7200)).toBe("2 hr read"); // 2 hours
    expect(formatReadingTime(10800)).toBe("3 hr read"); // 3 hours
  });

  it("should format hours with remaining minutes", () => {
    expect(formatReadingTime(5400)).toBe("1 hr 30 min read"); // 1.5 hours
    expect(formatReadingTime(7380)).toBe("2 hr 3 min read"); // 2 hours 3 minutes
    expect(formatReadingTime(9000)).toBe("2 hr 30 min read"); // 2.5 hours
    expect(formatReadingTime(12600)).toBe("3 hr 30 min read"); // 3.5 hours
  });

  it("should round seconds to nearest minute", () => {
    // 119 seconds = 1.98 minutes, should round to 2 min
    expect(formatReadingTime(119)).toBe("2 min read");

    // 121 seconds = 2.02 minutes, should round to 2 min
    expect(formatReadingTime(121)).toBe("2 min read");

    // 150 seconds = 2.5 minutes, should round to 3 min (uses Math.round)
    expect(formatReadingTime(150)).toBe("3 min read");
  });

  it("should handle typical article reading times", () => {
    // 225 words at 225 WPM = 60 seconds = 1 min
    expect(formatReadingTime(60)).toBe("1 min read");

    // 1000 words at 225 WPM = 267 seconds = 4 min
    expect(formatReadingTime(267)).toBe("4 min read");

    // 2250 words at 225 WPM = 600 seconds = 10 min
    expect(formatReadingTime(600)).toBe("10 min read");
  });

  it("should handle very long articles", () => {
    // 10 hours
    expect(formatReadingTime(36000)).toBe("10 hr read");

    // 12 hours 45 minutes
    expect(formatReadingTime(45900)).toBe("12 hr 45 min read");
  });
});
