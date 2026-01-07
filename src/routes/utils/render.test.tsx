import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import type { AppContext } from "../../types/context";
import { renderWithLayout } from "./render";

// Helper to parse HTML string into DOM using happy-dom
// Using Window directly (not GlobalRegistrator) to avoid parallel test conflicts
function parseHtml(html: string): Document {
  const window = new Window();
  window.document.write(html);
  return window.document as unknown as Document;
}

// Helper to create a test app with renderWithLayout
function createTestApp() {
  return new Hono<AppContext>();
}

// Simple test component
const TestContent: FC<{ text: string }> = ({ text }) => (
  <div class="test-content">{text}</div>
);

describe("renderWithLayout", () => {
  describe("HTML structure", () => {
    it("should return valid HTML document structure", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();

      // Note: Hono's c.html() doesn't add doctype, but browsers handle this gracefully
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("<head>");
      expect(html).toContain("<body");
    });

    it("should include Head component with title and assets", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      // Check head elements
      expect(doc.querySelector("title")?.textContent).toBe("lateread");
      expect(doc.querySelector('meta[charset="UTF-8"]')).toBeTruthy();
      expect(doc.querySelector('meta[name="viewport"]')).toBeTruthy();

      // Check asset links
      const styleLink = doc.querySelector('link[rel="stylesheet"]');
      expect(styleLink?.getAttribute("href")).toMatch(
        /\/public\/styles\/app.*\.css/,
      );

      const script = doc.querySelector('script[type="module"]');
      expect(script?.getAttribute("src")).toMatch(
        /\/public\/scripts\/app.*\.js/,
      );
    });

    it("should include NavHeader component", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      // Check header with nav content
      expect(doc.querySelector("header.fixed-nav")).toBeTruthy();
      expect(doc.querySelector(".nav-brand")).toBeTruthy();
    });

    it("should include main content wrapper", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Test message" />,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      const main = doc.querySelector("main.container.main-content");
      expect(main).toBeTruthy();
      expect(main?.querySelector(".test-content")?.textContent).toBe(
        "Test message",
      );
    });

    it("should enable hx-boost on body", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      expect(doc.body.getAttribute("hx-boost")).toBe("true");
    });
  });

  describe("status codes", () => {
    it("should return 200 by default", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      expect(res.status).toBe(200);
    });

    it("should return custom status code when provided", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Not found" />,
          statusCode: 404,
        });
      });

      const res = await app.request("/test");
      expect(res.status).toBe(404);
    });

    it("should return 500 status code for errors", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Server error" />,
          statusCode: 500,
        });
      });

      const res = await app.request("/test");
      expect(res.status).toBe(500);
    });
  });

  describe("authentication state", () => {
    it("should show nav actions for authenticated users", async () => {
      const app = createTestApp();
      app.use("*", async (c, next) => {
        c.set("userId", "user-123");
        return next();
      });
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      // Authenticated users should see nav actions (search, archive, menu)
      expect(doc.querySelector(".nav-actions")).toBeTruthy();
      expect(doc.querySelector('a[href="/search"]')).toBeTruthy();
      expect(
        doc.querySelector('a[href="/articles?status=archived"]'),
      ).toBeTruthy();
    });

    it("should not show nav actions for unauthenticated users", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      // Unauthenticated users should not see nav actions
      expect(doc.querySelector(".nav-actions")).toBeFalsy();
    });
  });

  describe("collapsible header", () => {
    it("should not add data-collapsible by default", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      const header = doc.querySelector("header.fixed-nav");
      expect(header?.getAttribute("data-collapsible")).toBeFalsy();
    });

    it("should add data-collapsible when collapsibleHeader is true", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
          collapsibleHeader: true,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      const header = doc.querySelector("header.fixed-nav");
      expect(header?.getAttribute("data-collapsible")).toBe("true");
    });
  });

  describe("override controls", () => {
    it("should render custom controls instead of default nav actions", async () => {
      const app = createTestApp();
      app.use("*", async (c, next) => {
        c.set("userId", "user-123");
        return next();
      });
      app.get("/test", (c) => {
        const customControls = (
          <div class="custom-controls">
            <button type="button">Custom Button</button>
          </div>
        );
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
          overrideControls: customControls,
        });
      });

      const res = await app.request("/test");
      const html = await res.text();
      const doc = parseHtml(html);

      // Should show custom controls
      expect(doc.querySelector(".custom-controls")).toBeTruthy();
      // Should not show default nav actions like search/archive
      expect(doc.querySelector('a[href="/search"]')).toBeFalsy();
    });
  });

  describe("response headers", () => {
    it("should return HTML content type", async () => {
      const app = createTestApp();
      app.get("/test", (c) => {
        return renderWithLayout({
          c,
          content: <TestContent text="Hello" />,
        });
      });

      const res = await app.request("/test");
      expect(res.headers.get("content-type")).toContain("text/html");
    });
  });
});
