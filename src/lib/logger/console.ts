import type { ErrorObject, LogLevel } from "./types";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  red: "\x1b[91m",
  yellow: "\x1b[93m",
  blue: "\x1b[94m",
  magenta: "\x1b[95m",
  cyan: "\x1b[96m",
  white: "\x1b[97m",
  bold: "\x1b[1m",
} as const;

const levelColors: Record<LogLevel, string> = {
  debug: colors.cyan,
  info: colors.blue,
  warn: colors.yellow,
  error: colors.red,
} as const; /**
 * Formats a log object into a colorful terminal string for development.
 * Format: (gray)timestamp (level-based)LEVEL (magenta)module (normal)message
 *         (gray)key=value, key=value
 *         (gray)<context>
 */
export function formatConsoleLog(logObject: Record<string, unknown>): string {
  const lines: string[] = [];
  const { level, message, timestamp, module, error, ...metadata } = logObject;

  const levelColor = levelColors[level as LogLevel] ?? colors.white;

  const lvl = String(level).toUpperCase().padEnd(5);
  lines.push(
    [
      `${colors.gray}${timestamp}${colors.reset}`,
      `${levelColor}${colors.bold}${lvl}${colors.reset}`,
      `${colors.magenta}[${module}]${colors.reset}`,
      message,
    ].join(" "),
  );

  // Second line: metadata (key=value pairs)
  const metaEntries = Object.entries(metadata);
  if (metaEntries.length > 0) {
    const metaPairs = metaEntries
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        const formattedValue =
          typeof value === "object" ? JSON.stringify(value) : String(value);
        return `${key}=${formattedValue}`;
      });
    if (metaPairs.length > 0) {
      lines.push(`${colors.gray}${metaPairs.join(", ")}${colors.reset}`);
    }
  }

  // Error details (if present)
  if (error && typeof error === "object") {
    const err = error as ErrorObject;
    lines.push(
      `${colors.red}${colors.bold}${err.type}: ${err.message}${colors.reset}`,
    );
    if (err.stack) {
      const stackLines = err.stack.split("\n").slice(1, 4); // First 3 stack frames
      stackLines.forEach((line) => {
        lines.push(`${colors.gray}  ${line.trim()}${colors.reset}`);
      });
    }
  }

  return lines.join("\n");
}
