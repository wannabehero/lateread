/**
 * PROOF OF CONCEPT: DNS-based SSRF Protection
 *
 * This file demonstrates the proposed implementation for DNS-based SSRF checks.
 * DO NOT use in production yet - this is for review and discussion.
 */

import dns from "node:dns/promises";
import { isSafeUrl, isPrivateIPv4, isPrivateIPv6 } from "./src/lib/ssrf-validator";

// Configuration (would come from config.ts in production)
const SSRF_DNS_TIMEOUT_MS = 5000;
const SSRF_BLOCK_ON_DNS_ERROR = false;
const SSRF_ENABLE_DNS_CHECKS = true;

/**
 * Enhanced SSRF validator with DNS resolution
 *
 * @param url - URL to validate
 * @param options - Validation options
 * @returns Promise<boolean> - true if safe, false if dangerous
 */
export async function isSafeUrlWithDNS(
  url: string,
  options: {
    enableDNS?: boolean;
    dnsTimeout?: number;
    blockOnDNSError?: boolean;
  } = {}
): Promise<boolean> {
  const {
    enableDNS = SSRF_ENABLE_DNS_CHECKS,
    dnsTimeout = SSRF_DNS_TIMEOUT_MS,
    blockOnDNSError = SSRF_BLOCK_ON_DNS_ERROR,
  } = options;

  // Fast path: Use existing URL-based validation
  if (!isSafeUrl(url)) {
    return false;
  }

  // If DNS checks disabled, stop here
  if (!enableDNS) {
    return true;
  }

  // Extract hostname for DNS lookup
  let hostname: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;

    // If hostname is already an IP address, no DNS lookup needed
    // (already validated by isSafeUrl)
    if (isIPAddress(hostname)) {
      return true;
    }
  } catch {
    return false;
  }

  // Perform DNS resolution with timeout
  try {
    const resolvedIPs = await Promise.race([
      resolveDNS(hostname),
      timeout(dnsTimeout),
    ]);

    // Validate ALL resolved IP addresses
    for (const ip of resolvedIPs) {
      if (isPrivateIP(ip)) {
        console.warn(`SSRF: Domain ${hostname} resolves to private IP ${ip}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    // DNS lookup failed (NXDOMAIN, timeout, network error, etc.)
    if (error instanceof DNSTimeoutError) {
      console.warn(`SSRF: DNS timeout for ${hostname}`);
      return blockOnDNSError ? false : true;
    }

    if (error instanceof Error) {
      console.warn(`SSRF: DNS error for ${hostname}: ${error.message}`);
    }

    // Default: allow on DNS errors (let fetch fail naturally)
    // unless configured to block
    return blockOnDNSError ? false : true;
  }
}

/**
 * Resolve hostname to both IPv4 and IPv6 addresses
 */
async function resolveDNS(hostname: string): Promise<string[]> {
  const results: string[] = [];

  // Resolve IPv4 and IPv6 in parallel
  const [ipv4Results, ipv6Results] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);

  // Collect IPv4 addresses
  if (ipv4Results.status === "fulfilled") {
    results.push(...ipv4Results.value);
  }

  // Collect IPv6 addresses
  if (ipv6Results.status === "fulfilled") {
    results.push(...ipv6Results.value);
  }

  // If both failed, throw the first error
  if (results.length === 0) {
    if (ipv4Results.status === "rejected") {
      throw ipv4Results.reason;
    }
    if (ipv6Results.status === "rejected") {
      throw ipv6Results.reason;
    }
  }

  return results;
}

/**
 * Check if string is an IP address (IPv4 or IPv6)
 */
function isIPAddress(hostname: string): boolean {
  // Remove brackets from IPv6 addresses
  const cleaned = hostname.replace(/^\[|\]$/g, "");

  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(cleaned)) {
    return true;
  }

  // IPv6 regex (simplified - contains colons)
  if (cleaned.includes(":")) {
    return true;
  }

  return false;
}

/**
 * Check if IP address (string) is private/reserved
 * Reuses logic from ssrf-validator.ts
 */
function isPrivateIP(ip: string): boolean {
  // Remove brackets if IPv6
  const cleaned = ip.replace(/^\[|\]$/g, "");

  // Check if IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleaned)) {
    return isPrivateIPv4(cleaned);
  }

  // Otherwise assume IPv6
  return isPrivateIPv6(cleaned);
}

/**
 * Timeout helper
 */
class DNSTimeoutError extends Error {
  constructor(ms: number) {
    super(`DNS lookup timeout after ${ms}ms`);
    this.name = "DNSTimeoutError";
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new DNSTimeoutError(ms)), ms);
  });
}

/**
 * Safe fetch wrapper with automatic SSRF protection
 * Validates both initial URL and all redirect targets
 *
 * @param url - URL to fetch
 * @param options - Fetch options + SSRF validation options
 * @returns Promise<Response>
 * @throws Error if URL is unsafe or DNS validation fails
 */
export async function safeFetch(
  url: string,
  options: RequestInit & {
    ssrfValidation?: {
      enableDNS?: boolean;
      dnsTimeout?: number;
      blockOnDNSError?: boolean;
      maxRedirects?: number;
    };
  } = {}
): Promise<Response> {
  const { ssrfValidation, ...fetchOptions } = options;
  const maxRedirects = ssrfValidation?.maxRedirects ?? 5;

  // Validate initial URL
  const isSafe = await isSafeUrlWithDNS(url, ssrfValidation);
  if (!isSafe) {
    throw new Error(
      "SSRF protection: Cannot fetch URLs pointing to private/internal resources"
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
      const isRedirectSafe = await isSafeUrlWithDNS(redirectUrl, ssrfValidation);
      if (!isRedirectSafe) {
        throw new Error(
          `SSRF protection: Redirect to private/internal resource blocked (${redirectUrl})`
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

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/**
 * Example 1: Using the async validator directly
 */
async function example1() {
  const url = "http://metadata.google.internal/";

  if (await isSafeUrlWithDNS(url)) {
    console.log("Safe to fetch");
    const response = await fetch(url);
    // ...
  } else {
    console.log("Blocked by SSRF protection");
  }
}

/**
 * Example 2: Using the safeFetch wrapper
 */
async function example2() {
  try {
    const response = await safeFetch("http://example.com", {
      headers: { "User-Agent": "lateread/1.0" },
      ssrfValidation: {
        enableDNS: true,
        dnsTimeout: 5000,
      },
    });
    const html = await response.text();
    // ...
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

/**
 * Example 3: Migration path for readability.ts
 */
async function example3_readabilityMigration(url: string) {
  // Before:
  // if (!isSafeUrl(url)) { throw new Error(...) }
  // const response = await fetch(url, {...});

  // After:
  const response = await safeFetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; lateread/1.0; +https://github.com/wannabehero)",
    },
    signal: AbortSignal.timeout(30000),
    redirect: "follow",
  });

  // That's it! SSRF protection is now automatic and includes DNS checks
}

/**
 * Example 4: Conditional DNS checks (for performance)
 */
async function example4_conditional(url: string, trusted: boolean) {
  if (trusted) {
    // Skip DNS checks for trusted internal URLs
    return fetch(url);
  } else {
    // Full DNS validation for user-supplied URLs
    return safeFetch(url);
  }
}

/**
 * Example 5: Redirect protection in action
 */
async function example5_redirectProtection() {
  // Attack scenario:
  // 1. evil.com resolves to public IP (passes initial check)
  // 2. evil.com responds with: Location: http://169.254.169.254/latest/meta-data/
  // 3. safeFetch validates redirect target and blocks it

  try {
    const response = await safeFetch("http://evil.com/article");
    // Will throw before following malicious redirect
  } catch (error) {
    // Error: "SSRF protection: Redirect to private/internal resource blocked (http://169.254.169.254/latest/meta-data/)"
    console.error("Blocked malicious redirect:", error);
  }
}

/**
 * Example 6: Redirect chain validation
 */
async function example6_redirectChain() {
  // Each hop in the redirect chain is validated:
  // URL1 (public) -> URL2 (public) -> URL3 (public) -> Final (public) ✓
  // URL1 (public) -> URL2 (public) -> URL3 (PRIVATE) -> Blocked! ✗

  const response = await safeFetch("http://example.com/multi-redirect", {
    ssrfValidation: {
      enableDNS: true,
      maxRedirects: 10, // Custom max redirects
    },
  });

  console.log("All redirects validated successfully");
}
