import { ValidationError } from "./errors";
import { isSafeUrlWithDNS } from "./ssrf-validator";

const MAX_REDIRECTS = 5;

/**
 * Safe fetch wrapper with automatic SSRF protection
 * Validates both initial URL and all redirect targets
 *
 * Features:
 * - URL structure validation (protocol, hostname)
 * - DNS resolution validation (prevents DNS-based SSRF)
 * - Redirect validation (prevents redirect-based SSRF)
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Promise<Response>
 * @throws Error if URL is unsafe or DNS validation fails
 *
 * @example
 * // Basic usage
 * const response = await safeFetch("https://example.com");
 *
 * @example
 * // With options
 * const response = await safeFetch("https://example.com", {
 *   headers: { "User-Agent": "lateread/1.0" },
 * });
 */
export async function safeFetch(
  url: string,
  options: Omit<RequestInit, "redirect"> = {},
): Promise<Response> {
  // Validate initial URL
  const isSafe = await isSafeUrlWithDNS(url);
  if (!isSafe) {
    throw new ValidationError("URL is unsafe to fetch", {
      url,
    });
  }

  // Handle redirects manually to validate each hop
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    // Fetch with manual redirect handling
    const response = await fetch(currentUrl, {
      ...options,
      redirect: "manual",
    });

    // Check if this is a redirect response
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location) {
        // Redirect without Location header - treat as final response
        return response;
      }

      // Resolve relative URLs against current URL
      const redirectUrl = new URL(location, currentUrl).href;

      // Validate redirect target
      const isRedirectSafe = await isSafeUrlWithDNS(redirectUrl);
      if (!isRedirectSafe) {
        throw new ValidationError("Redirect URL is unsafe to fetch", {
          redirectUrl,
        });
      }

      currentUrl = redirectUrl;
      redirectCount++;
      continue;
    }

    // Not a redirect - return the response
    return response;
  }

  throw new ValidationError("Too many redirects to fetch the article");
}
