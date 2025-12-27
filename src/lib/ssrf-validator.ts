/**
 * SSRF (Server-Side Request Forgery) protection validator
 * Prevents fetching internal/private resources via user-supplied URLs
 */

import dns from "node:dns/promises";

// Global Sets for O(1) lookup performance
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1", // IPv6 localhost (without brackets for after normalization)
  "::", // IPv6 any (without brackets for after normalization)
  "[::1]", // IPv6 localhost (with brackets for Bun's URL parser)
  "[::]", // IPv6 any (with brackets for Bun's URL parser)
]);

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Private IPv4 ranges (CIDR notation):
 * - 127.0.0.0/8       (127.0.0.0 - 127.255.255.255) - Loopback
 * - 10.0.0.0/8        (10.0.0.0 - 10.255.255.255)
 * - 172.16.0.0/12     (172.16.0.0 - 172.31.255.255)
 * - 192.168.0.0/16    (192.168.0.0 - 192.168.255.255)
 * - 169.254.0.0/16    (169.254.0.0 - 169.254.255.255) - Link-local/AWS metadata
 * - 100.64.0.0/10     (100.64.0.0 - 100.127.255.255) - Carrier-grade NAT
 */
interface PrivateRange {
  firstOctet: number;
  secondOctetMin?: number;
  secondOctetMax?: number;
}

const PRIVATE_IPV4_RANGES: PrivateRange[] = [
  { firstOctet: 127 }, // 127.0.0.0/8 - Loopback (entire range, not just 127.0.0.1)
  { firstOctet: 10 }, // 10.0.0.0/8
  { firstOctet: 172, secondOctetMin: 16, secondOctetMax: 31 }, // 172.16.0.0/12
  { firstOctet: 192, secondOctetMin: 168, secondOctetMax: 168 }, // 192.168.0.0/16
  { firstOctet: 169, secondOctetMin: 254, secondOctetMax: 254 }, // 169.254.0.0/16 (AWS metadata!)
  { firstOctet: 100, secondOctetMin: 64, secondOctetMax: 127 }, // 100.64.0.0/10 (CGN)
];

/**
 * Validates if a URL is safe to fetch (not SSRF-vulnerable)
 * @param url - URL string to validate
 * @returns true if URL is safe to fetch, false otherwise
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Check protocol is http/https only
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check against blocked hosts (localhost, etc.)
    if (BLOCKED_HOSTS.has(hostname)) {
      return false;
    }

    // Check for private IPv4 addresses
    if (isPrivateIPv4(hostname)) {
      return false;
    }

    // Check for IPv6 private/link-local addresses
    if (isPrivateIPv6(hostname)) {
      return false;
    }

    return true;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Checks if hostname is a private IPv4 address
 * Exported for use in DNS validation
 */
export function isPrivateIPv4(hostname: string): boolean {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (!match) {
    return false;
  }

  const octets = match.slice(1, 5).map(Number);

  // Validate octets are in valid range [0-255]
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  // Check against private ranges
  for (const range of PRIVATE_IPV4_RANGES) {
    if (first !== range.firstOctet) {
      continue;
    }

    // If no second octet constraints, match on first octet only
    if (
      range.secondOctetMin === undefined ||
      range.secondOctetMax === undefined
    ) {
      return true;
    }

    // Check second octet range
    if (
      second &&
      second >= range.secondOctetMin &&
      second <= range.secondOctetMax
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if hostname is a private/link-local IPv6 address
 * Exported for use in DNS validation
 * Blocks:
 * - ::1 (loopback)
 * - :: (any)
 * - fe80::/10 (link-local)
 * - fc00::/7 (unique local)
 */
export function isPrivateIPv6(hostname: string): boolean {
  // Bun's URL parser keeps brackets for IPv6, Node.js removes them
  // Handle both cases by removing brackets if present
  let lower = hostname.toLowerCase();
  if (lower.startsWith("[") && lower.endsWith("]")) {
    lower = lower.slice(1, -1);
  }

  // Check for loopback/any (already covered by BLOCKED_HOSTS, but defense in depth)
  if (lower === "::1" || lower === "::") {
    return true;
  }

  // IPv6 addresses contain colons
  if (!lower.includes(":")) {
    return false;
  }

  // Check for link-local (fe80::/10)
  if (lower.startsWith("fe80:")) {
    return true;
  }

  // Check for unique local addresses (fc00::/7 - covers fc00:: and fd00::)
  // Must check first two hex digits are fc or fd
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }

  return false;
}

// =============================================================================
// DNS-based SSRF Protection
// =============================================================================

/**
 * Timeout error for DNS lookups
 */
class DNSTimeoutError extends Error {
  constructor(ms: number) {
    super(`DNS lookup timeout after ${ms}ms`);
    this.name = "DNSTimeoutError";
  }
}

/**
 * Options for DNS-based SSRF validation
 */
export interface SafeUrlOptions {
  enableDNS?: boolean;
  dnsTimeout?: number;
  blockOnDNSError?: boolean;
}

/**
 * Enhanced SSRF validator with DNS resolution
 * Validates both URL structure and DNS resolution to prevent DNS-based SSRF attacks
 *
 * @param url - URL to validate
 * @param options - Validation options
 * @returns Promise<boolean> - true if safe, false if dangerous
 *
 * @example
 * // Blocks metadata.google.internal → 169.254.169.254
 * const safe = await isSafeUrlWithDNS("http://metadata.google.internal");
 * // safe === false
 */
export async function isSafeUrlWithDNS(
  url: string,
  options: SafeUrlOptions = {},
): Promise<boolean> {
  const {
    enableDNS = true,
    dnsTimeout = 5000,
    blockOnDNSError = false,
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
      createTimeout(dnsTimeout),
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
 * Reuses existing validation logic
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
 * Create a timeout promise
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new DNSTimeoutError(ms)), ms);
  });
}
