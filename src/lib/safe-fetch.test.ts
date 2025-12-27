import { beforeEach, describe, expect, it, mock } from "bun:test";
import { safeFetch } from "./safe-fetch";
import { isSafeUrlWithDNS } from "./ssrf-validator";
import dns from "node:dns/promises";

describe("safeFetch - SSRF Protection with Redirects", () => {
  // Store original functions
  const originalFetch = globalThis.fetch;
  const originalResolve4 = dns.resolve4;
  const originalResolve6 = dns.resolve6;

  beforeEach(() => {
    // Restore originals before each test
    globalThis.fetch = originalFetch;
    dns.resolve4 = originalResolve4;
    dns.resolve6 = originalResolve6;
  });

  describe("Basic URL validation", () => {
    it("should block private IPs before making request", async () => {
      await expect(
        safeFetch("http://localhost:8080"),
      ).rejects.toThrow("SSRF protection");

      await expect(
        safeFetch("http://127.0.0.1"),
      ).rejects.toThrow("SSRF protection");

      await expect(
        safeFetch("http://192.168.1.1"),
      ).rejects.toThrow("SSRF protection");
    });

    it("should block DNS resolving to private IPs", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["169.254.169.254"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      await expect(
        safeFetch("http://metadata.google.internal"),
      ).rejects.toThrow("SSRF protection");
    });

    it("should allow safe public URLs", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("OK", { status: 200 }),
        ),
      );

      const response = await safeFetch("http://example.com");
      expect(response.status).toBe(200);
    });
  });

  describe("Redirect validation", () => {
    it("should block redirect to private IP", async () => {
      dns.resolve4 = mock((hostname: string) => {
        if (hostname === "evil.com") {
          return Promise.resolve(["93.184.216.34"]);
        }
        // No DNS call should happen for redirect validation on IP
        return Promise.reject(new Error("Unexpected DNS call"));
      });
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      // First call to evil.com returns redirect to private IP
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: "http://169.254.169.254/latest/meta-data/" },
          }),
        ),
      );

      await expect(
        safeFetch("http://evil.com/article"),
      ).rejects.toThrow("Redirect to private/internal resource blocked");
    });

    it("should block redirect to localhost", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: "http://localhost:6379/" },
          }),
        ),
      );

      await expect(
        safeFetch("http://example.com"),
      ).rejects.toThrow("Redirect to private/internal resource blocked");
    });

    it("should block redirect chain ending in private IP", async () => {
      dns.resolve4 = mock((hostname: string) => {
        if (hostname === "safe1.com" || hostname === "safe2.com") {
          return Promise.resolve(["93.184.216.34"]);
        }
        return Promise.reject(new Error("ENOTFOUND"));
      });
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          // First redirect: safe1.com -> safe2.com
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { Location: "http://safe2.com/path" },
            }),
          );
        }
        if (callCount === 2) {
          // Second redirect: safe2.com -> private IP
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { Location: "http://192.168.1.1/admin" },
            }),
          );
        }
        return Promise.resolve(new Response("OK", { status: 200 }));
      });

      await expect(
        safeFetch("http://safe1.com"),
      ).rejects.toThrow("Redirect to private/internal resource blocked");
    });

    it("should allow safe redirect chain", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { Location: "http://cdn.example.com/article" },
            }),
          );
        }
        if (callCount === 2) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { Location: "http://final.example.com/article" },
            }),
          );
        }
        return Promise.resolve(new Response("Final content", { status: 200 }));
      });

      const response = await safeFetch("http://example.com");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Final content");
    });
  });

  describe("Relative redirect URLs", () => {
    it("should resolve relative redirect URLs correctly", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      let callCount = 0;
      globalThis.fetch = mock((url: RequestInfo | URL) => {
        callCount++;
        if (callCount === 1) {
          // Relative redirect
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { Location: "/path/to/article" },
            }),
          );
        }
        // Should be called with resolved absolute URL
        expect(url.toString()).toBe("http://example.com/path/to/article");
        return Promise.resolve(new Response("OK", { status: 200 }));
      });

      const response = await safeFetch("http://example.com/start");
      expect(response.status).toBe(200);
    });
  });

  describe("Redirect limits", () => {
    it("should enforce default max redirects (5)", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        // Always redirect
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: `http://example.com/redirect${callCount}` },
          }),
        );
      });

      await expect(
        safeFetch("http://example.com"),
      ).rejects.toThrow("Too many redirects");
    });

    it("should respect custom maxRedirects option", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { Location: `http://example.com/redirect${callCount}` },
            }),
          );
        }
        return Promise.resolve(new Response("OK", { status: 200 }));
      });

      const response = await safeFetch("http://example.com", {
        ssrfValidation: { maxRedirects: 2 },
      });
      expect(response.status).toBe(200);
    });
  });

  describe("Redirect without Location header", () => {
    it("should treat redirect without Location as final response", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Moved", {
            status: 302,
            // No Location header
          }),
        ),
      );

      const response = await safeFetch("http://example.com");
      expect(response.status).toBe(302);
    });
  });

  describe("DNS resolution in redirects", () => {
    it("should validate DNS for redirect targets", async () => {
      dns.resolve4 = mock((hostname: string) => {
        if (hostname === "safe.com") {
          return Promise.resolve(["93.184.216.34"]);
        }
        if (hostname === "evil.com") {
          // Redirect target resolves to private IP
          return Promise.resolve(["169.254.169.254"]);
        }
        return Promise.reject(new Error("ENOTFOUND"));
      });
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: "http://evil.com/metadata" },
          }),
        ),
      );

      await expect(
        safeFetch("http://safe.com"),
      ).rejects.toThrow("Redirect to private/internal resource blocked");
    });
  });

  describe("Options passing", () => {
    it("should pass fetch options to underlying fetch", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      let capturedOptions: RequestInit | undefined;
      globalThis.fetch = mock(
        (_url: RequestInfo | URL, options?: RequestInit) => {
          capturedOptions = options;
          return Promise.resolve(new Response("OK", { status: 200 }));
        },
      );

      await safeFetch("http://example.com", {
        headers: { "User-Agent": "test/1.0" },
        method: "POST",
      });

      expect(capturedOptions).toBeDefined();
      expect(capturedOptions?.headers).toEqual({ "User-Agent": "test/1.0" });
      expect(capturedOptions?.method).toBe("POST");
      expect(capturedOptions?.redirect).toBe("manual"); // Should be overridden
    });

    it("should pass SSRF validation options to validator", async () => {
      dns.resolve4 = mock(() => Promise.resolve(["93.184.216.34"]));
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response("OK", { status: 200 })),
      );

      // Should not throw with DNS checks disabled
      await safeFetch("http://example.com", {
        ssrfValidation: {
          enableDNS: false,
        },
      });
    });
  });

  describe("Real-world scenarios", () => {
    it("should block URL shortener redirect to AWS metadata", async () => {
      dns.resolve4 = mock((hostname: string) => {
        if (hostname === "bit.ly") {
          return Promise.resolve(["67.199.248.10"]);
        }
        return Promise.reject(new Error("ENOTFOUND"));
      });
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: {
              Location: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            },
          }),
        ),
      );

      await expect(
        safeFetch("http://bit.ly/abc123"),
      ).rejects.toThrow("Redirect to private/internal resource blocked");
    });

    it("should block CDN redirect to internal network", async () => {
      dns.resolve4 = mock((hostname: string) => {
        if (hostname === "cdn.example.com") {
          return Promise.resolve(["93.184.216.34"]);
        }
        return Promise.reject(new Error("ENOTFOUND"));
      });
      dns.resolve6 = mock(() => Promise.reject(new Error("ENOTFOUND")));

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: "http://10.0.0.1:8080/internal" },
          }),
        ),
      );

      await expect(
        safeFetch("http://cdn.example.com/asset"),
      ).rejects.toThrow("Redirect to private/internal resource blocked");
    });
  });
});
