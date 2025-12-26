# DNS-Based SSRF Protection Proposal

## Problem

The current SSRF protection in `src/lib/ssrf-validator.ts` only validates URLs based on their hostname string. It cannot detect DNS-based attacks where a seemingly safe domain resolves to a private IP address.

**Examples of bypasses:**

1. **DNS-based attacks:**
   - `metadata.google.internal` → resolves to `169.254.169.254` (GCP metadata)
   - `169.254.169.254.nip.io` → resolves to `169.254.169.254` (AWS metadata)
   - Custom domains that resolve to internal IPs (`internal.attacker.com` → `10.0.0.1`)

2. **Redirect-based attacks:**
   - `evil.com` (public IP) → redirects to `http://169.254.169.254/latest/meta-data/`
   - `example.com` (public IP) → redirects to `http://localhost:6379/` (Redis)
   - Multi-hop: `safe.com` → `cdn.com` → `192.168.1.1/admin`

## Research Summary

### Modern Approaches (2025)

1. **Node.js/Undici** (v6.21.1 - January 2025):
   - Added DNS interceptor with custom lookup function
   - Can intercept and validate DNS responses before making HTTP requests
   - Supports custom dispatcher with DNS validation logic

2. **Bun Runtime**:
   - Provides `Bun.dns` and Node.js-compatible `node:dns` modules
   - Supports `dns.promises.resolve4()` and `dns.promises.resolve6()` for resolution
   - DNS caching: 255 entries max, 30-second TTL by default
   - No built-in SSRF protection like specialized Node.js libraries

### Recommended Approach for Bun

Since Bun doesn't support undici's dispatcher API, the recommended approach is:

1. **Pre-fetch DNS resolution**: Resolve the hostname to IP addresses before making the HTTP request
2. **Validate resolved IPs**: Check all returned IP addresses against private/reserved ranges
3. **Only then fetch**: Proceed with fetch only if all resolved IPs are safe

## Proposed Implementation

### Option A: Enhanced Validator with DNS Resolution (Recommended)

Create a new async function `isSafeUrlWithDNS()` that:
1. Performs existing hostname-based validation (fast path)
2. Resolves the hostname using `dns.promises.resolve4/6()`
3. Validates all resolved IP addresses
4. Returns safe/unsafe status

**Advantages:**
- Comprehensive protection against DNS-based attacks
- Reuses existing IP validation logic
- Handles both IPv4 and IPv6
- Works with Bun's native DNS API

**Disadvantages:**
- Adds DNS lookup latency (~10-100ms per unique domain)
- Breaking change: function becomes async
- DNS cache poisoning still possible (but mitigated by Bun's cache)

### Option B: Custom Fetch Wrapper with Redirect Protection

Create a `safeFetch()` wrapper that:
1. Validates URL with `isSafeUrl()`
2. Resolves DNS and validates IPs
3. Performs fetch with `redirect: "manual"`
4. Validates each redirect target before following
5. Returns final response after all validations

**Advantages:**
- Drop-in replacement for fetch
- Validates redirect targets (critical for SSRF prevention!)
- Centralized SSRF protection
- Prevents redirect-based SSRF attacks

**Disadvantages:**
- Manual redirect handling required
- Slightly more complex than native fetch
- May not preserve all redirect metadata

### Option C: DNS Rebinding Protection Only

Add periodic DNS re-validation during long-lived connections or redirects.

**Advantages:**
- Protects against DNS rebinding attacks
- Less impact on initial request

**Disadvantages:**
- Doesn't protect against initial malicious resolution
- Complex to implement correctly
- Partial protection only

## Recommended Solution: Option A + Wrapper

Implement both:
1. **`isSafeUrlWithDNS(url)`** - Async validator with DNS resolution
2. **`safeFetch(url, options?)`** - Wrapper that validates then fetches

This provides:
- Flexibility: Use validator alone or use the wrapper
- Defense in depth: Multiple validation points
- Easy migration: Keep existing sync validator for quick checks

## Implementation Details

### DNS Resolution Strategy

```typescript
// Resolve both IPv4 and IPv6 addresses
const ipv4Addresses = await dns.promises.resolve4(hostname);
const ipv6Addresses = await dns.promises.resolve6(hostname);

// Validate ALL resolved addresses
for (const addr of [...ipv4Addresses, ...ipv6Addresses]) {
  if (isPrivateIP(addr)) {
    return false; // Block if ANY address is private
  }
}
```

### Error Handling

- **DNS lookup failure** (NXDOMAIN): Treat as safe to proceed (let fetch fail naturally)
- **Timeout**: Configurable DNS timeout (default: 5 seconds)
- **DNS errors**: Log and optionally block (configurable via env var)

### Redirect Protection Strategy

**Manual redirect handling:**
```typescript
// Use redirect: "manual" to intercept each redirect
const response = await fetch(url, { redirect: "manual" });

if (response.status >= 300 && response.status < 400) {
  const location = response.headers.get("location");
  const redirectUrl = new URL(location, currentUrl).href;

  // Validate redirect target before following
  if (!await isSafeUrlWithDNS(redirectUrl)) {
    throw new Error("SSRF: Malicious redirect blocked");
  }

  // Follow redirect...
}
```

**Why this is critical:**
- Redirects can bypass initial URL validation
- Attacker controls the redirect target
- Common in URL shorteners, CDNs, authentication flows
- Protects against redirect chains (validate each hop)

**Redirect handling details:**
- Maximum redirects: 5 (configurable, matches browser default)
- Relative URLs: Resolved against current URL
- Missing Location header: Treat as final response
- Each redirect adds ~10-100ms (DNS lookup + validation)

### Performance Considerations

- **Bun DNS cache**: 30-second TTL reduces repeated lookups
- **Parallel resolution**: Resolve IPv4 and IPv6 concurrently
- **Fast path**: Keep existing sync validator for obvious cases (localhost, direct IPs)
- **Redirect overhead**: ~10-100ms per redirect hop (usually 0-2 redirects)

### Testing Requirements

**DNS validation tests:**
1. Mock DNS responses for deterministic tests
2. Test DNS resolution failures (NXDOMAIN, timeout)
3. Test mixed safe/unsafe IP responses (some IPs private, some public)
4. Test IPv4 + IPv6 resolution (parallel and individual)
5. Test DNS rebinding scenarios

**Redirect protection tests:**
6. Test single redirect to private IP (should block)
7. Test redirect chain (public → public → private, should block at third hop)
8. Test relative redirects (relative to current URL)
9. Test missing Location header (should treat as final response)
10. Test max redirects exceeded (should throw error)
11. Test redirect with DNS resolution to private IP

**Integration tests:**
12. Test full flow: DNS check → fetch → redirect → DNS check → final response
13. Mock real-world scenarios (URL shorteners, CDN redirects)

**Performance benchmarks:**
14. Ensure <100ms overhead for initial DNS lookup (with cache)
15. Ensure <100ms overhead per redirect hop
16. Test DNS cache effectiveness (repeated requests to same domain)

## Migration Path

### Phase 1: Add DNS validation (non-breaking)
- Add `isSafeUrlWithDNS()` alongside existing `isSafeUrl()`
- Add comprehensive tests
- Document the new function

### Phase 2: Introduce `safeFetch()` wrapper
- Create wrapper using the DNS validator
- Add integration tests
- Document usage

### Phase 3: Migrate existing code
- Update `src/lib/readability.ts` to use `safeFetch()`
- Update worker code
- Add error handling for DNS failures

### Phase 4: Deprecation (optional)
- Mark `isSafeUrl()` as deprecated for external URLs
- Keep for trusted/internal URLs where DNS lookup is unnecessary

## Security Considerations

### Still Vulnerable To:
- **DNS cache poisoning**: Mitigated by DNSSEC (if enabled) and short TTLs
- **Time-of-check-time-of-use (TOCTOU)**: DNS could change between validation and fetch
  - Mitigation: Keep validation-to-fetch time minimal
  - Mitigation: Consider DNS pinning for critical operations
- **IPv6 complexity**: Expanded notation could bypass string-based checks
  - Mitigation: Normalize IPv6 before validation

### Defense in Depth:
1. Pre-fetch URL validation (existing)
2. DNS resolution validation (new)
3. Network-level controls (firewall rules - operator responsibility)
4. Short timeouts on fetch requests (existing)
5. Content-type validation (future consideration)

## Configuration

Add to `src/lib/config.ts`:

```typescript
// SSRF Protection
SSRF_DNS_TIMEOUT_MS: z.coerce.number().default(5000),
SSRF_BLOCK_ON_DNS_ERROR: z.boolean().default(false),
SSRF_ENABLE_DNS_CHECKS: z.boolean().default(true), // Feature flag
```

## References

- [SSRF protection in undici - GitHub Issue #2019](https://github.com/nodejs/undici/issues/2019)
- [Node.js undici v6.21.1 - DNS Interceptor](https://github.com/nodejs/node/commit/520da342e0)
- [How to Prevent SSRF Attacks in 2025](https://ghostsecurity.com/blog/how-to-prevent-ssrf-attacks-in-2025)
- [Bypass SSRF with DNS Rebinding](https://h3des.medium.com/bypass-ssrf-with-dns-rebinding-6811093fceb0)
- [Bun DNS API Reference](https://bun.com/reference/bun/dns)
- [request-filtering-agent - GitHub](https://github.com/azu/request-filtering-agent)

## Next Steps

1. Review and approve this proposal
2. Implement `isSafeUrlWithDNS()` with tests
3. Implement `safeFetch()` wrapper
4. Update `readability.ts` to use new protection
5. Add documentation and usage examples
6. Consider backporting to other fetch locations in codebase
