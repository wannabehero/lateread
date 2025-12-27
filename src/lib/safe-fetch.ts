/**
 * Safe fetch wrapper with SSRF protection
 * Validates URLs and all redirect targets to prevent SSRF attacks
 */

import type { SafeUrlOptions } from "./ssrf-validator";
import { isSafeUrlWithDNS } from "./ssrf-validator";

/**
 * Options for safeFetch
 */
export interface SafeFetchOptions extends RequestInit {
  ssrfValidation?: SafeUrlOptions & {
    maxRedirects?: number;
  };
}

/**
 * Safe fetch wrapper with automatic SSRF protection
 * Validates both initial URL and all redirect targets
 *
 * Features:
 * - URL structure validation (protocol, hostname)
 * - DNS resolution validation (prevents DNS-based SSRF)
 * - Redirect validation (prevents redirect-based SSRF)
 * - Configurable redirect limits
 *
 * @param url - URL to fetch
 * @param options - Fetch options + SSRF validation options
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
 *   ssrfValidation: {
 *     enableDNS: true,
 *     maxRedirects: 5,
 *   },
 * });
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { ssrfValidation, ...fetchOptions } = options;
  const maxRedirects = ssrfValidation?.maxRedirects ?? 5;

  // Validate initial URL
  const isSafe = await isSafeUrlWithDNS(url, ssrfValidation);
  if (!isSafe) {
    throw new Error(
      "SSRF protection: Cannot fetch URLs pointing to private/internal resources",
    );
  }

  // Handle redirects manually to validate each hop
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    // Fetch with manual redirect handling
    const response = await fetch(currentUrl, {
      ...fetchOptions,
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
      const isRedirectSafe = await isSafeUrlWithDNS(
        redirectUrl,
        ssrfValidation,
      );
      if (!isRedirectSafe) {
        throw new Error(
          `SSRF protection: Redirect to private/internal resource blocked (${redirectUrl})`,
        );
      }

      // Follow the redirect
      currentUrl = redirectUrl;
      redirectCount++;
      continue;
    }

    // Not a redirect - return the response
    return response;
  }

  throw new Error(`Too many redirects (max: ${maxRedirects})`);
}
