import { describe, expect, it } from "bun:test";
import {
  decodeImageUrl,
  encodeImageUrl,
  proxyImageUrl,
  rewriteContentImageUrls,
} from "./image-proxy";

describe("image-proxy", () => {
  describe("encodeImageUrl / decodeImageUrl", () => {
    it("should round-trip encode and decode a URL", () => {
      const url = "https://example.com/image.jpg?width=100&height=200";
      const encoded = encodeImageUrl(url);
      expect(decodeImageUrl(encoded)).toBe(url);
    });

    it("should handle URLs with unicode characters", () => {
      const url = "https://example.com/café-image.jpg";
      const encoded = encodeImageUrl(url);
      expect(decodeImageUrl(encoded)).toBe(url);
    });

    it("should throw on invalid base64url input", () => {
      expect(() => decodeImageUrl("!!!invalid!!!")).toThrow("Invalid");
    });

    it("should throw on non-HTTP URL after decoding", () => {
      const encoded = Buffer.from("ftp://example.com/file").toString(
        "base64url",
      );
      expect(() => decodeImageUrl(encoded)).toThrow("Only HTTP");
    });

    it("should throw on javascript: URL after decoding", () => {
      const encoded = Buffer.from("javascript:alert(1)").toString("base64url");
      expect(() => decodeImageUrl(encoded)).toThrow();
    });
  });

  describe("proxyImageUrl", () => {
    it("should return null for null input", () => {
      expect(proxyImageUrl(null)).toBeNull();
    });

    it("should return null for undefined input", () => {
      expect(proxyImageUrl(undefined)).toBeNull();
    });

    it("should proxy https URLs", () => {
      const result = proxyImageUrl("https://example.com/img.jpg");
      expect(result).toStartWith("/api/image-proxy?url=");
    });

    it("should proxy http URLs", () => {
      const result = proxyImageUrl("http://example.com/img.jpg");
      expect(result).toStartWith("/api/image-proxy?url=");
    });

    it("should pass through relative URLs", () => {
      expect(proxyImageUrl("/public/assets/logo.svg")).toBe(
        "/public/assets/logo.svg",
      );
    });

    it("should pass through data URIs", () => {
      const dataUri = "data:image/png;base64,iVBOR...";
      expect(proxyImageUrl(dataUri)).toBe(dataUri);
    });

    it("should pass through already-proxied URLs", () => {
      const proxied = "/api/image-proxy?url=abc123";
      expect(proxyImageUrl(proxied)).toBe(proxied);
    });

    it("should pass through non-HTTP URLs", () => {
      expect(proxyImageUrl("blob:http://example.com/abc")).toBe(
        "blob:http://example.com/abc",
      );
    });

    it("should produce a URL that round-trips through decode", () => {
      const original = "https://example.com/photo.jpg";
      const proxied = proxyImageUrl(original) as string;
      const encoded = proxied.replace("/api/image-proxy?url=", "");
      expect(decodeImageUrl(encoded)).toBe(original);
    });
  });

  describe("rewriteContentImageUrls", () => {
    it("should rewrite https image src attributes", () => {
      const html = '<img src="https://example.com/photo.jpg" alt="test">';
      const result = rewriteContentImageUrls(html);
      expect(result).toContain("/api/image-proxy?url=");
      expect(result).not.toContain("https://example.com/photo.jpg");
    });

    it("should rewrite http image src attributes", () => {
      const html = "<img src='http://example.com/photo.jpg'>";
      const result = rewriteContentImageUrls(html);
      expect(result).toContain("/api/image-proxy?url=");
    });

    it("should not rewrite relative image URLs", () => {
      const html = '<img src="/public/assets/logo.svg">';
      const result = rewriteContentImageUrls(html);
      expect(result).toBe(html);
    });

    it("should not rewrite data URI images", () => {
      const html = '<img src="data:image/png;base64,abc123">';
      const result = rewriteContentImageUrls(html);
      expect(result).toBe(html);
    });

    it("should handle multiple images in content", () => {
      const html = `
        <p>Some text</p>
        <img src="https://example.com/a.jpg" alt="A">
        <p>More text</p>
        <img src="https://other.com/b.png" alt="B">
        <img src="/local/c.svg" alt="C">
      `;
      const result = rewriteContentImageUrls(html);

      // External images should be proxied
      expect(result).not.toContain("https://example.com/a.jpg");
      expect(result).not.toContain("https://other.com/b.png");
      // Local image should be unchanged
      expect(result).toContain('/local/c.svg"');
      // Should have two proxy URLs
      const proxyCount = (result.match(/\/api\/image-proxy\?url=/g) || [])
        .length;
      expect(proxyCount).toBe(2);
    });

    it("should handle img tags with other attributes before src", () => {
      const html =
        '<img loading="lazy" class="hero" src="https://example.com/img.jpg" alt="test">';
      const result = rewriteContentImageUrls(html);
      expect(result).toContain("/api/image-proxy?url=");
      expect(result).toContain('loading="lazy"');
      expect(result).toContain('class="hero"');
    });

    it("should not modify non-img elements with src", () => {
      const html = '<script src="https://example.com/script.js"></script>';
      const result = rewriteContentImageUrls(html);
      expect(result).toBe(html);
    });

    it("should return empty string for empty input", () => {
      expect(rewriteContentImageUrls("")).toBe("");
    });
  });
});
