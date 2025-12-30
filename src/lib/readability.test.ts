import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import dns from "node:dns/promises";
import { extractCleanContent } from "./readability";

describe("readability", () => {
  beforeEach(() => {
    spyOn(dns, "resolve4").mockResolvedValueOnce(["93.184.216.34"]);
    spyOn(dns, "resolve6").mockRejectedValueOnce(new Error("ENOTFOUND"));
  });

  afterEach(() => {
    mock.clearAllMocks();
  });

  describe("extractCleanContent", () => {
    it("should extract content from valid HTML", async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Article</title>
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Description">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta property="og:site_name" content="Example Site">
        </head>
        <body>
          <article>
            <h1>Test Article Title</h1>
            <p>This is the article content with meaningful text.</p>
            <p>Multiple paragraphs to ensure Readability can parse it.</p>
          </article>
        </body>
        </html>
      `;

      // @ts-expect-error Fetch override
      spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await extractCleanContent("https://example.com/article");

      expect(result).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.siteName).toBe("Example Site");
      expect(result.description).toBe("OG Description");
      expect(result.imageUrl).toBe("https://example.com/image.jpg");
    });

    it("should extract OpenGraph metadata", async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="My Article">
          <meta property="og:description" content="Article description">
          <meta property="og:image" content="https://example.com/og-image.png">
          <meta property="og:site_name" content="My Site">
        </head>
        <body><article><p>Content</p></article></body>
        </html>
      `;

      // @ts-expect-error Fetch override
      spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await extractCleanContent("https://example.com/article");

      expect(result.siteName).toBe("My Site");
      expect(result.description).toBe("Article description");
      expect(result.imageUrl).toBe("https://example.com/og-image.png");
    });

    it("should fallback to regular meta tags when OG tags missing", async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page Title</title>
          <meta name="description" content="Regular description">
        </head>
        <body><article><p>Content here</p></article></body>
        </html>
      `;

      // @ts-expect-error Fetch override
      spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await extractCleanContent("https://example.com/article");

      expect(result.description).toBe("Regular description");
    });

    it("should handle HTTP errors", async () => {
      // @ts-expect-error Fetch override
      spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      let error: unknown;
      try {
        await extractCleanContent("https://example.com/404");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error instanceof Error ? error.message : "fail").toContain("404");
    });

    it("should handle 500 errors", async () => {
      // @ts-expect-error Fetch override
      spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      let error: unknown;
      try {
        await extractCleanContent("https://example.com/500");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error instanceof Error ? error.message : "fail").toContain("500");
    });

    it("should handle network errors", async () => {
      spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network error: Connection refused"),
      );

      let error: unknown;
      try {
        await extractCleanContent("https://example.com/network-error");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error instanceof Error ? error.message : "fail").toContain(
        "Network error",
      );
    });

    it("should handle timeout", async () => {
      // Mock a fetch that throws AbortError
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);

      let error: unknown;
      try {
        await extractCleanContent("https://example.com/slow");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error instanceof Error ? error.message : "fail").toContain(
        "Request timeout",
      );
    });

    it("should set custom user agent", async () => {
      let capturedHeaders: HeadersInit | undefined;

      // @ts-expect-error Mock fetch
      spyOn(globalThis, "fetch").mockImplementation((_url, options) => {
        capturedHeaders = options?.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              "<html><body><article><p>Content</p></article></body></html>",
            ),
        });
      });

      await extractCleanContent("https://example.com/article");

      expect(capturedHeaders).toBeDefined();
      const headers = capturedHeaders as Record<string, string>;
      expect(headers["user-agent"]).toBeDefined();
      expect(headers["user-agent"]).toContain("lateread");
    });

    it("should extract text content", async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Article</title></head>
        <body>
          <article>
            <h1>Main Title</h1>
            <p>First paragraph with text.</p>
            <p>Second paragraph with more text.</p>
          </article>
        </body>
        </html>
      `;

      // @ts-expect-error Mock fetch
      spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await extractCleanContent("https://example.com/article");

      expect(result.textContent).toBeDefined();
      expect(typeof result.textContent).toBe("string");
      if (result.textContent) {
        expect(result.textContent.length).toBeGreaterThan(0);
      }
    });

    it("should handle malformed HTML gracefully", async () => {
      // Provide minimal but valid HTML that Readability can parse
      const mockHtml = `
        <html>
        <head><title>Broken Page</title></head>
        <body>
        <article>
          <p>Some content here that Readability can extract.</p>
          <p>Even with unclosed tags, JSDOM fixes them and Readability works.</p>
        </article>
        </body>
      `;

      // @ts-expect-error Fetch override
      spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
      });

      // JSDOM can handle malformed HTML and Readability should extract content
      const result = await extractCleanContent("https://example.com/broken");
      expect(result).toBeDefined();
      expect(result.title).toBeDefined();
    });

    describe("SSRF protection", () => {
      it.each([
        ["http://localhost/admin", "localhost"],
        ["http://127.0.0.1:6379", "loopback"],
        ["http://10.0.0.1", "private IP 10.x.x.x"],
        ["http://192.168.1.1", "private IP 192.168.x.x"],
        ["http://172.16.0.1", "private IP 172.16-31.x.x"],
        ["http://169.254.169.254/latest/meta-data", "AWS metadata"],
        ["http://[::1]", "IPv6 localhost"],
        ["http://[fe80::1]", "IPv6 link-local"],
        ["file:///etc/passwd", "file protocol"],
        ["ftp://example.com", "FTP protocol"],
      ])("should block SSRF attempt: %s (%s)", async (url) => {
        expect(extractCleanContent(url)).rejects.toThrow(
          "URL is unsafe to fetch",
        );
      });

      it("should allow valid public URLs", async () => {
        // @ts-expect-error Fetch override
        spyOn(globalThis, "fetch").mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              "<html><body><article><p>Content</p></article></body></html>",
            ),
        });
        expect(
          extractCleanContent("https://example.com/article"),
        ).resolves.toBeDefined();
      });
    });
  });
});
