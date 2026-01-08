import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import dns from "node:dns/promises";
import { safeFetch } from "./safe-fetch";

describe("safeFetch - SSRF Protection with Redirects", () => {
  let spyDnsResolve4: ReturnType<typeof spyOn<typeof dns, "resolve4">>;
  let spyDnsResolve6: ReturnType<typeof spyOn<typeof dns, "resolve6">>;
  let spyFetch: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

  beforeEach(() => {
    spyDnsResolve4 = spyOn(dns, "resolve4");
    spyDnsResolve6 = spyOn(dns, "resolve6");
    spyFetch = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    spyDnsResolve4.mockRestore();
    spyDnsResolve6.mockRestore();
    spyFetch.mockRestore();
  });

  describe("Basic URL validation", () => {
    it.each([
      ["http://localhost:8080", "localhost"],
      ["http://127.0.0.1", "127.0.0.1"],
      ["http://192.168.1.1", "192.168.1.1"],
    ])("should block private IPs before making request", async (url, host) => {
      await expect(safeFetch(url)).rejects.toThrow("URL is unsafe to fetch");

      // Verify no DNS or fetch calls were made for this specific host
      expect(spyDnsResolve4).not.toHaveBeenCalledWith(host);
      expect(spyDnsResolve6).not.toHaveBeenCalledWith(host);
      expect(spyFetch).not.toHaveBeenCalledWith(url, expect.anything());
    });

    it("should block DNS resolving to private IPs", () => {
      spyDnsResolve4.mockResolvedValueOnce(["169.254.169.254"]);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      expect(safeFetch("http://metadata.google.internal")).rejects.toThrow(
        "URL is unsafe to fetch",
      );

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("metadata.google.internal");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("metadata.google.internal");
      expect(spyFetch).not.toHaveBeenCalled();
    });

    it("should allow safe public URLs", async () => {
      spyDnsResolve4.mockResolvedValueOnce(["93.184.216.34"]);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      spyFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve("Hello World"),
      } as unknown as Response);

      const response = await safeFetch("http://example.com");
      expect(response.status).toBe(200);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("example.com");
      expect(spyFetch).toHaveBeenCalledTimes(1);
      expect(spyFetch).toHaveBeenCalledWith("http://example.com", {
        redirect: "manual",
      });
    });
  });

  describe("Redirect validation", () => {
    it("should block redirect to private IP", () => {
      spyDnsResolve4
        .mockResolvedValueOnce(["93.184.216.34"])
        .mockRejectedValueOnce(new Error("Unexpected DNS call"));
      spyDnsResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      // First call to evil.com returns redirect to private IP
      spyFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "http://169.254.169.254/latest/meta-data/" },
        }),
      );

      expect(safeFetch("http://evil.com/article")).rejects.toThrow(
        "URL is unsafe to fetch",
      );

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("evil.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("evil.com");
      expect(spyFetch).toHaveBeenCalledTimes(1);
      expect(spyFetch).toHaveBeenCalledWith("http://evil.com/article", {
        redirect: "manual",
      });
    });

    it("should block redirect to localhost", () => {
      spyDnsResolve4.mockResolvedValueOnce(["93.184.216.34"]);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      spyFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "http://localhost:6379/" },
        }),
      );

      expect(safeFetch("http://example.com")).rejects.toThrow(
        "Redirect URL is unsafe to fetch",
      );

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("example.com");
      expect(spyFetch).toHaveBeenCalledTimes(1);
      expect(spyFetch).toHaveBeenCalledWith("http://example.com", {
        redirect: "manual",
      });
    });

    it("should block redirect chain ending in private IP", () => {
      spyDnsResolve4
        .mockResolvedValueOnce(["93.184.216.34"]) // safe1.com
        .mockResolvedValueOnce(["93.184.216.34"]); // safe2.com
      spyDnsResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      spyFetch
        .mockResolvedValueOnce(
          // First redirect: safe1.com -> safe2.com
          new Response(null, {
            status: 302,
            headers: { Location: "http://safe2.com/path" },
          }),
        )
        .mockResolvedValueOnce(
          // Second redirect: safe2.com -> private IP
          new Response(null, {
            status: 302,
            headers: { Location: "http://192.168.1.1/admin" },
          }),
        );

      expect(safeFetch("http://safe1.com")).rejects.toThrow(
        "Redirect URL is unsafe to fetch",
      );

      expect(spyDnsResolve4).toHaveBeenCalledTimes(2);
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(1, "safe1.com");
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(2, "safe2.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(2);
      expect(spyFetch).toHaveBeenCalledTimes(2);
      expect(spyFetch).toHaveBeenNthCalledWith(1, "http://safe1.com", {
        redirect: "manual",
      });
      expect(spyFetch).toHaveBeenNthCalledWith(2, "http://safe2.com/path", {
        redirect: "manual",
      });
    });

    it("should allow safe redirect chain", async () => {
      spyDnsResolve4.mockResolvedValue(["93.184.216.34"]); // All domains
      spyDnsResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      spyFetch
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { Location: "http://cdn.example.com/article" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { Location: "http://final.example.com/article" },
          }),
        )
        .mockResolvedValueOnce(new Response("Final content", { status: 200 }));

      const response = await safeFetch("http://example.com");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Final content");

      expect(spyDnsResolve4).toHaveBeenCalledTimes(3);
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(1, "example.com");
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(2, "cdn.example.com");
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(3, "final.example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(3);
      expect(spyFetch).toHaveBeenCalledTimes(3);
      expect(spyFetch).toHaveBeenNthCalledWith(1, "http://example.com", {
        redirect: "manual",
      });
      expect(spyFetch).toHaveBeenNthCalledWith(
        2,
        "http://cdn.example.com/article",
        { redirect: "manual" },
      );
      expect(spyFetch).toHaveBeenNthCalledWith(
        3,
        "http://final.example.com/article",
        { redirect: "manual" },
      );
    });
  });

  describe("Relative redirect URLs", () => {
    it("should resolve relative redirect URLs correctly", async () => {
      spyDnsResolve4
        .mockResolvedValueOnce(["93.184.216.34"]) // Initial URL
        .mockResolvedValueOnce(["93.184.216.34"]); // After redirect (same domain)
      spyDnsResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      spyFetch
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { Location: "/path/to/article" },
          }),
        )
        // @ts-expect-error we simplify the interface here
        .mockImplementationOnce((url: RequestInfo | URL) => {
          // Should be called with resolved absolute URL
          expect(url.toString()).toBe("http://example.com/path/to/article");
          return Promise.resolve(new Response("OK", { status: 200 }));
        });

      const response = await safeFetch("http://example.com/start");
      expect(response.status).toBe(200);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(2);
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(1, "example.com");
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(2, "example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(2);
      expect(spyFetch).toHaveBeenCalledTimes(2);
      expect(spyFetch).toHaveBeenNthCalledWith(1, "http://example.com/start", {
        redirect: "manual",
      });
      expect(spyFetch).toHaveBeenNthCalledWith(
        2,
        "http://example.com/path/to/article",
        { redirect: "manual" },
      );
    });
  });

  describe("Redirect limits", () => {
    it("should enforce default max redirects (5)", () => {
      // Set up DNS mocks for initial URL + 6 redirects (will fail at 6th)
      for (let i = 0; i < 7; i++) {
        spyDnsResolve4.mockResolvedValueOnce(["93.184.216.34"]);
        spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));
      }

      // @ts-expect-error we simplify the interface here
      spyFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: "http://example.com/redirect" },
          }),
        ),
      );

      expect(safeFetch("http://example.com")).rejects.toThrow(
        "Too many redirects",
      );

      // 1 initial DNS + 5 redirects DNS + 1 final redirect DNS (that triggers error) = 7
      expect(spyDnsResolve4).toHaveBeenCalledTimes(7);
      expect(spyDnsResolve6).toHaveBeenCalledTimes(7);
      // Only 6 fetches: initial + 5 redirects (6th redirect DNS check triggers the error)
      expect(spyFetch).toHaveBeenCalledTimes(6);
    });
  });

  describe("Redirect without Location header", () => {
    it("should treat redirect without Location as final response", async () => {
      spyDnsResolve4.mockResolvedValueOnce(["93.184.216.34"]);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      spyFetch.mockResolvedValueOnce(
        new Response("Moved", {
          status: 302,
          // No Location header
        }),
      );

      const response = await safeFetch("http://example.com");
      expect(response.status).toBe(302);

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("example.com");
      expect(spyFetch).toHaveBeenCalledTimes(1);
      expect(spyFetch).toHaveBeenCalledWith("http://example.com", {
        redirect: "manual",
      });
    });
  });

  describe("DNS resolution in redirects", () => {
    it("should validate DNS for redirect targets", () => {
      spyDnsResolve4
        .mockResolvedValueOnce(["93.184.216.34"]) // safe.com
        .mockResolvedValueOnce(["169.254.169.254"]); // evil.com
      spyDnsResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      spyFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "http://evil.com/metadata" },
        }),
      );

      expect(safeFetch("http://safe.com")).rejects.toThrow(
        "Redirect URL is unsafe to fetch",
      );

      expect(spyDnsResolve4).toHaveBeenCalledTimes(2);
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(1, "safe.com");
      expect(spyDnsResolve4).toHaveBeenNthCalledWith(2, "evil.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(2);
      expect(spyFetch).toHaveBeenCalledTimes(1);
      expect(spyFetch).toHaveBeenCalledWith("http://safe.com", {
        redirect: "manual",
      });
    });
  });

  describe("Options passing", () => {
    it("should pass fetch options to underlying fetch", async () => {
      spyDnsResolve4.mockResolvedValueOnce(["93.184.216.34"]);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      let capturedOptions: RequestInit | undefined;
      spyFetch.mockImplementationOnce(
        // @ts-expect-error we simplify the interface here
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

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("example.com");
      expect(spyFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Real-world scenarios", () => {
    it("should block URL shortener redirect to AWS metadata", () => {
      spyDnsResolve4.mockResolvedValueOnce(["67.199.248.10"]); // bit.ly
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      spyFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            Location:
              "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
          },
        }),
      );

      expect(safeFetch("http://bit.ly/abc123")).rejects.toThrow(
        "Redirect URL is unsafe to fetch",
      );

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("bit.ly");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("bit.ly");
      expect(spyFetch).toHaveBeenCalledTimes(1);
      expect(spyFetch).toHaveBeenCalledWith("http://bit.ly/abc123", {
        redirect: "manual",
      });
    });

    it("should block CDN redirect to internal network", () => {
      spyDnsResolve4.mockResolvedValueOnce(["93.184.216.34"]);
      spyDnsResolve6.mockRejectedValueOnce(new Error("ENOTFOUND"));

      spyFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "http://10.0.0.1:8080/internal" },
        }),
      );

      expect(safeFetch("http://cdn.example.com/asset")).rejects.toThrow(
        "Redirect URL is unsafe to fetch",
      );

      expect(spyDnsResolve4).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve4).toHaveBeenCalledWith("cdn.example.com");
      expect(spyDnsResolve6).toHaveBeenCalledTimes(1);
      expect(spyDnsResolve6).toHaveBeenCalledWith("cdn.example.com");
      expect(spyFetch).toHaveBeenCalledTimes(1);
      expect(spyFetch).toHaveBeenCalledWith("http://cdn.example.com/asset", {
        redirect: "manual",
      });
    });
  });
});
