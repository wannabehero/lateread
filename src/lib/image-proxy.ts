import { ValidationError } from "./errors";

const IMAGE_PROXY_PATH = "/api/image-proxy";

/**
 * Encode an image URL to a base64url string for use in the proxy endpoint
 */
export function encodeImageUrl(url: string): string {
  return Buffer.from(url).toString("base64url");
}

/**
 * Decode a base64url-encoded image URL back to the original URL
 * Throws ValidationError if decoding fails or produces an invalid URL
 */
export function decodeImageUrl(encoded: string): string {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf-8");

    // Validate it's a proper HTTP(S) URL
    const parsed = new URL(decoded);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new ValidationError("Only HTTP(S) image URLs are supported");
    }

    return decoded;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Invalid encoded image URL");
  }
}

/**
 * Generate a proxy URL for an external image URL
 * Returns null for null/undefined, and passes through relative/data/already-proxied URLs
 */
export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Skip relative URLs, data URIs, and already-proxied URLs
  if (
    url.startsWith("/") ||
    url.startsWith("data:") ||
    url.startsWith(IMAGE_PROXY_PATH)
  ) {
    return url;
  }

  // Only proxy http(s) URLs
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return url;
  }

  return `${IMAGE_PROXY_PATH}?url=${encodeImageUrl(url)}`;
}

/**
 * Rewrite a srcset attribute value, proxying each candidate URL
 */
function rewriteSrcsetValue(srcset: string): string {
  return srcset
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return trimmed;
      // A candidate is "URL [descriptor]" (e.g., "https://x.com/a.jpg 2x")
      const match = trimmed.match(/^(\S+)(\s+.*)?$/);
      if (!match) return trimmed;
      const [, url, descriptor = ""] = match;
      if (!url) return trimmed;
      return `${proxyImageUrl(url) ?? url}${descriptor}`;
    })
    .join(", ");
}

/**
 * Rewrite all external image URLs in HTML content to use the proxy endpoint
 * Handles src and srcset attributes in <img> and <source> tags
 */
export function rewriteContentImageUrls(html: string): string {
  // Rewrite src="http..." in img tags
  let result = html.replace(
    /(<img\b[^>]*?\bsrc=)(["'])(https?:\/\/[^"']*)\2/gi,
    (_match, prefix, quote, url) => {
      const proxied = proxyImageUrl(url);
      return `${prefix}${quote}${proxied}${quote}`;
    },
  );

  // Rewrite srcset="..." in img and source tags
  result = result.replace(
    /(<(?:img|source)\b[^>]*?\bsrcset=)(["'])([^"']*)\2/gi,
    (_match, prefix, quote, srcset) => {
      return `${prefix}${quote}${rewriteSrcsetValue(srcset)}${quote}`;
    },
  );

  return result;
}
