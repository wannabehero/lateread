import { afterEach, describe, expect, it, jest, mock, spyOn } from "bun:test";
import dns from "node:dns/promises";
import { isSafeUrl, isSafeUrlWithDNS } from "./ssrf-validator";

describe("isSafeUrl - SSRF Protection", () => {
  describe("Valid public URLs", () => {
    it.each([
      ["https://example.com", "standard HTTPS domain"],
      ["http://example.com", "standard HTTP domain"],
      ["https://www.google.com/search?q=test", "domain with path and query"],
      ["https://api.github.com/repos/user/repo", "API endpoint"],
      ["https://subdomain.example.co.uk", "subdomain with TLD"],
      ["https://8.8.8.8", "public IP (Google DNS)"],
      ["https://1.1.1.1", "public IP (Cloudflare DNS)"],
      ["https://93.184.216.34", "public IPv4 address"],
      ["https://example.com:8080", "public domain with port"],
    ])("should allow %s (%s)", (url) => {
      expect(isSafeUrl(url)).toBe(true);
    });
  });

  describe("Localhost attacks", () => {
    it.each([
      ["http://localhost", "localhost"],
      ["http://localhost:8080", "localhost with port"],
      ["https://localhost/admin", "localhost with path"],
      ["http://127.0.0.1", "IPv4 loopback"],
      ["http://127.0.0.1:6379", "IPv4 loopback with Redis port"],
      [
        "http://127.0.0.2",
        "IPv4 loopback range (127.x.x.x not blocked, but should be tested)",
      ],
      ["http://0.0.0.0", "IPv4 any address"],
      ["http://[::1]", "IPv6 loopback"],
      ["http://[::]", "IPv6 any address"],
    ])("should block %s (%s)", (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });
  });

  describe("Private IPv4 ranges (RFC 1918)", () => {
    it.each([
      // 10.0.0.0/8
      ["http://10.0.0.1", "10.0.0.0/8 - start"],
      ["http://10.1.1.1", "10.0.0.0/8 - mid"],
      ["http://10.255.255.255", "10.0.0.0/8 - end"],
      ["http://10.0.0.1:8080/api", "10.0.0.0/8 with port and path"],

      // 172.16.0.0/12
      ["http://172.16.0.1", "172.16.0.0/12 - start"],
      ["http://172.20.0.1", "172.16.0.0/12 - mid"],
      ["http://172.31.255.255", "172.16.0.0/12 - end"],

      // 192.168.0.0/16
      ["http://192.168.0.1", "192.168.0.0/16 - start"],
      ["http://192.168.1.1", "192.168.0.0/16 - common router"],
      ["http://192.168.255.255", "192.168.0.0/16 - end"],

      // 169.254.0.0/16 (Link-local / AWS metadata)
      ["http://169.254.169.254", "AWS metadata endpoint (critical!)"],
      ["http://169.254.0.1", "169.254.0.0/16 - start"],
      ["http://169.254.255.255", "169.254.0.0/16 - end"],

      // 100.64.0.0/10 (Carrier-grade NAT)
      ["http://100.64.0.1", "100.64.0.0/10 - start"],
      ["http://100.127.255.255", "100.64.0.0/10 - end"],
    ])("should block %s (%s)", (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });
  });

  describe("Private IPv4 edge cases - should allow", () => {
    it.each([
      ["http://172.15.0.1", "172.15.x.x - just before private range"],
      ["http://172.32.0.1", "172.32.x.x - just after private range"],
      ["http://100.63.255.255", "100.63.x.x - just before CGN range"],
      ["http://100.128.0.1", "100.128.x.x - just after CGN range"],
      ["http://11.0.0.1", "11.x.x.x - not in 10.0.0.0/8"],
      ["http://193.168.0.1", "193.168.x.x - not 192.168.x.x"],
    ])("should allow %s (%s)", (url) => {
      expect(isSafeUrl(url)).toBe(true);
    });
  });

  describe("IPv6 private addresses", () => {
    it.each([
      ["http://[::1]", "IPv6 loopback"],
      ["http://[fe80::1]", "IPv6 link-local - start"],
      ["http://[fe80::abcd:1234]", "IPv6 link-local"],
      ["http://[fc00::1]", "IPv6 unique local - fc00::/7"],
      ["http://[fd00::1]", "IPv6 unique local - fd00::/7"],
      ["http://[fd12:3456:789a::1]", "IPv6 unique local - expanded"],
    ])("should block %s (%s)", (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });
  });

  describe("Invalid protocols", () => {
    it.each([
      ["file:///etc/passwd", "file protocol"],
      ["ftp://example.com", "FTP protocol"],
      ["javascript:alert(1)", "javascript protocol"],
      ["data:text/html,<script>alert(1)</script>", "data protocol"],
      ["gopher://example.com", "gopher protocol"],
      ["dict://127.0.0.1:11211", "dict protocol"],
      ["sftp://example.com", "SFTP protocol"],
    ])("should block %s (%s)", (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });
  });

  describe("Malformed URLs", () => {
    it.each([
      ["not-a-url", "plain text"],
      ["htp://example.com", "typo in protocol"],
      ["http://", "missing hostname"],
      ["//example.com", "protocol-relative URL"],
      ["", "empty string"],
      ["http://256.1.1.1", "invalid IPv4 octet (>255)"],
      ["http://999.999.999.999", "completely invalid IPv4"],
    ])("should block %s (%s)", (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });
  });

  describe("Real-world attack vectors", () => {
    it.each([
      ["http://169.254.169.254/latest/meta-data/", "AWS metadata service"],
      [
        "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        "AWS IAM credentials",
      ],
      ["http://192.168.1.1/admin", "router admin panel"],
      ["http://10.0.0.1:6379", "internal Redis"],
      ["http://172.17.0.1:5432", "Docker network PostgreSQL"],
      ["http://127.0.0.1:9200", "local Elasticsearch"],
      ["http://localhost:8080/actuator/env", "Spring Boot actuator"],
    ])("should block %s (%s)", (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });

    it.each([
      ["http://LOCALHOST"],
      ["http://LocalHost"],
    ])("should normalize and block localhost variations", (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });
  });
});

describe("isSafeUrlWithDNS - DNS-based SSRF Protection", () => {
  const spyDnsResolve4 = spyOn(dns, "resolve4");
  const spyDnsResolve6 = spyOn(dns, "resolve6");

  afterEach(() => {
    mock.clearAllMocks();
  });

  describe("URL structure validation (pre-DNS checks)", () => {
    it.each([
      ["http://localhost"],
      ["http://127.0.0.1"],
      ["file:///etc/passwd"],
    ])("should block invalid URLs before DNS lookup", async (url) => {
      expect(await isSafeUrlWithDNS(url)).toBe(false);

      expect(spyDnsResolve4).not.toHaveBeenCalled();
      expect(spyDnsResolve6).not.toHaveBeenCalled();
    });

    it.each([
      ["http://8.8.8.8"],
      ["http://1.1.1.1"],
    ])("should allow direct public IPs without DNS lookup", async (url) => {
      expect(await isSafeUrlWithDNS(url)).toBe(true);

      expect(spyDnsResolve4).not.toHaveBeenCalled();
      expect(spyDnsResolve6).not.toHaveBeenCalled();
    });
  });

  describe("DNS resolution to private IPs", () => {
    it.each([
      [
        "169.254.169.254",
        "http://metadata.google.internal",
        "metadata.google.internal",
      ],
      ["127.0.0.1", "https://evil.com", "evil.com"],
      ["10.8.8.1", "https://internal.attack.com", "internal.attack.com"],
      ["192.168.10.5", "http://internal.example.com", "internal.example.com"],
      ["169.254.169.254", "https://evil.nip.io", "evil.nip.io"],
      [
        "169.254.169.254",
        "http://169.254.169.254.nip.io/latest/meta-data",
        "169.254.169.254.nip.io",
      ],
    ])("should block domain resolving to bad IPv4 (%s, %s, %s)", async (ip, url, expectedHost) => {
      spyDnsResolve4.mockResolvedValueOnce([ip]);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      const result = await isSafeUrlWithDNS(url);
      expect(result).toBe(false);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith(expectedHost);
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith(expectedHost);
    });
  });

  describe("DNS resolution to public IPs", () => {
    it.each([
      [["93.184.216.34"], "http://example.com", "example.com"],
      [
        ["93.184.216.34", "93.184.216.35"],
        "https://example.com",
        "example.com",
      ],
    ])("should allow domain resolving to public IPv4", async (ips, url, expectedHost) => {
      spyDnsResolve4.mockResolvedValueOnce(ips);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      const result = await isSafeUrlWithDNS(url);
      expect(result).toBe(true);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith(expectedHost);
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith(expectedHost);
    });
  });

  describe("Mixed public and private IPs", () => {
    it("should block if ANY resolved IP is private", async () => {
      spyDnsResolve4.mockResolvedValueOnce(["93.184.216.34", "192.168.1.1"]);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      const result = await isSafeUrlWithDNS("http://mixed.example.com");
      expect(result).toBe(false);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("mixed.example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("mixed.example.com");
    });
  });

  describe("IPv6 DNS resolution", () => {
    it("should block domain resolving to private IPv6", async () => {
      spyDnsResolve4.mockRejectedValueOnce(new Error("ENOTFOUND"));
      spyDnsResolve6.mockResolvedValueOnce(["fe80::1"]);

      const result = await isSafeUrlWithDNS("http://ipv6.example.com");
      expect(result).toBe(false);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("ipv6.example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("ipv6.example.com");
    });

    it("should allow domain resolving to public IPv6", async () => {
      spyDnsResolve4.mockRejectedValueOnce(new Error("ENOTFOUND"));
      spyDnsResolve6.mockResolvedValueOnce([
        "2606:2800:220:1:248:1893:25c8:1946",
      ]);

      const result = await isSafeUrlWithDNS("http://example.com");
      expect(result).toBe(true);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("example.com");
    });

    it("should validate both IPv4 and IPv6 addresses", async () => {
      spyDnsResolve4.mockResolvedValueOnce(["93.184.216.34"]);
      spyDnsResolve6.mockResolvedValueOnce([
        "2606:2800:220:1:248:1893:25c8:1946",
      ]);

      const result = await isSafeUrlWithDNS("http://example.com");
      expect(result).toBe(true);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("example.com");
    });
  });

  describe("DNS lookup failures", () => {
    it("should block on NXDOMAIN (non-existent domain)", async () => {
      spyDnsResolve4.mockRejectedValueOnce(new Error("ENOTFOUND"));
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      const result = await isSafeUrlWithDNS("http://nonexistent.example.com");
      expect(result).toBe(false);
    });

    it("should block on DNS timeout", async () => {
      jest.useFakeTimers();

      spyDnsResolve4.mockReturnValueOnce(
        new Promise((resolve) =>
          setTimeout(() => resolve(["93.184.216.34"]), 6000),
        ),
      );
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      const promise = isSafeUrlWithDNS("http://slow.example.com");

      jest.advanceTimersByTime(10_000);

      const result = await promise;

      expect(result).toBe(false); // Block on timeout

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("slow.example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("slow.example.com");
    });

    afterEach(() => {
      jest.useRealTimers();
    });
  });
});
