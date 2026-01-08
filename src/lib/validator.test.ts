import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { schemas, zValidator } from "./validator";

describe("lib/validator", () => {
  describe("zValidator", () => {
    it("should validate query parameters and pass to handler", async () => {
      const app = new Hono();
      const schema = z.object({
        name: z.string(),
        age: z.coerce.number(),
      });

      app.get("/test", zValidator("query", schema), (c) => {
        const { name, age } = c.req.valid("query");
        return c.json({ name, age });
      });

      const res = await app.request("/test?name=John&age=30");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ name: "John", age: 30 });
    });

    it("should validate param parameters and pass to handler", async () => {
      const app = new Hono();
      const schema = z.object({
        id: z.string().uuid(),
      });

      app.get("/test/:id", zValidator("param", schema), (c) => {
        const { id } = c.req.valid("param");
        return c.json({ id });
      });

      const testId = "550e8400-e29b-41d4-a716-446655440000";
      const res = await app.request(`/test/${testId}`);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ id: testId });
    });

    it("should validate form data and pass to handler", async () => {
      const app = new Hono();
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
      });

      app.post("/test", zValidator("form", schema), (c) => {
        const { email, password } = c.req.valid("form");
        return c.json({ email, passwordLength: password.length });
      });

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "securepassword123");

      const res = await app.request("/test", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        email: "test@example.com",
        passwordLength: 17,
      });
    });

    it("should throw ValidationError for invalid query parameters", async () => {
      const app = new Hono();
      const schema = z.object({
        page: z.coerce.number().min(1),
      });

      app.get("/test", zValidator("query", schema), (c) => {
        return c.json({ success: true });
      });

      app.onError((err, c) => {
        if (err.message === "Validation failed") {
          return c.json({ error: err.message }, 400);
        }
        throw err;
      });

      const res = await app.request("/test?page=0");

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });

    it("should throw ValidationError for invalid param format", async () => {
      const app = new Hono();
      const schema = z.object({
        id: z.string().uuid("Invalid UUID format"),
      });

      app.get("/test/:id", zValidator("param", schema), (c) => {
        return c.json({ success: true });
      });

      app.onError((err, c) => {
        if (err.message === "Validation failed") {
          return c.json({ error: err.message }, 400);
        }
        throw err;
      });

      const res = await app.request("/test/not-a-uuid");

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });

    it("should throw ValidationError for missing required fields", async () => {
      const app = new Hono();
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
      });

      app.post("/test", zValidator("form", schema), (c) => {
        return c.json({ success: true });
      });

      app.onError((err, c) => {
        if (err.message === "Validation failed") {
          return c.json({ error: err.message }, 400);
        }
        throw err;
      });

      const formData = new FormData();
      formData.append("name", "John");
      // Missing email field

      const res = await app.request("/test", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });
  });

  describe("schemas", () => {
    describe("articleId", () => {
      it("should accept valid UUID", () => {
        const result = schemas.articleId.safeParse({
          id: "550e8400-e29b-41d4-a716-446655440000",
        });
        expect(result.success).toBe(true);
      });

      it("should reject invalid UUID", () => {
        const result = schemas.articleId.safeParse({ id: "invalid-id" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            "Invalid article ID format",
          );
        }
      });
    });

    describe("authToken", () => {
      it("should accept non-empty token", () => {
        const result = schemas.authToken.safeParse({ token: "abc123" });
        expect(result.success).toBe(true);
      });

      it("should reject empty token", () => {
        const result = schemas.authToken.safeParse({ token: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe("Token is required");
        }
      });
    });

    describe("articlesQuery", () => {
      it("should default status to 'all' when not provided", () => {
        const result = schemas.articlesQuery.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe("all");
        }
      });

      it("should accept valid status values", () => {
        const allResult = schemas.articlesQuery.safeParse({ status: "all" });
        const archivedResult = schemas.articlesQuery.safeParse({
          status: "archived",
        });

        expect(allResult.success).toBe(true);
        expect(archivedResult.success).toBe(true);
      });

      it("should reject invalid status values", () => {
        const result = schemas.articlesQuery.safeParse({ status: "invalid" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            "Status must be 'all' or 'archived'",
          );
        }
      });

      it("should accept optional tag", () => {
        const result = schemas.articlesQuery.safeParse({ tag: "technology" });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.tag).toBe("technology");
        }
      });

      it("should reject empty tag", () => {
        const result = schemas.articlesQuery.safeParse({ tag: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe("Tag cannot be empty");
        }
      });
    });

    describe("archiveQuery", () => {
      it("should transform redirect 'true' to boolean true", () => {
        const result = schemas.archiveQuery.safeParse({ redirect: "true" });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.redirect).toBe(true);
        }
      });

      it("should transform redirect 'false' to boolean false", () => {
        const result = schemas.archiveQuery.safeParse({ redirect: "false" });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.redirect).toBe(false);
        }
      });

      it("should default redirect to false when not provided", () => {
        const result = schemas.archiveQuery.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          // When not provided, the transform converts undefined to false
          expect(result.data.redirect).toBe(false);
        }
      });

      it("should reject invalid redirect values", () => {
        const result = schemas.archiveQuery.safeParse({ redirect: "yes" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            "Redirect must be 'true' or 'false'",
          );
        }
      });
    });

    describe("searchQuery", () => {
      it("should accept empty search query", () => {
        const result = schemas.searchQuery.safeParse({});
        expect(result.success).toBe(true);
      });

      it("should accept valid search query", () => {
        const result = schemas.searchQuery.safeParse({ q: "test search" });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.q).toBe("test search");
        }
      });

      it("should reject query exceeding max length", () => {
        const longQuery = "a".repeat(501);
        const result = schemas.searchQuery.safeParse({ q: longQuery });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe("Search query too long");
        }
      });
    });

    describe("readerPreferences", () => {
      it("should accept valid font family and size", () => {
        const result = schemas.readerPreferences.safeParse({
          fontFamily: "serif",
          fontSize: "18",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.fontFamily).toBe("serif");
          expect(result.data.fontSize).toBe(18);
        }
      });

      it("should accept all valid font families", () => {
        const families = ["sans", "serif", "new-york"] as const;
        for (const fontFamily of families) {
          const result = schemas.readerPreferences.safeParse({
            fontFamily,
            fontSize: "16",
          });
          expect(result.success).toBe(true);
        }
      });

      it("should reject invalid font family", () => {
        const result = schemas.readerPreferences.safeParse({
          fontFamily: "comic-sans",
          fontSize: "16",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            "Font family must be 'sans', 'serif', or 'new-york'",
          );
        }
      });

      it("should reject font size below minimum", () => {
        const result = schemas.readerPreferences.safeParse({
          fontFamily: "sans",
          fontSize: "13",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            "Font size must be at least 14",
          );
        }
      });

      it("should reject font size above maximum", () => {
        const result = schemas.readerPreferences.safeParse({
          fontFamily: "sans",
          fontSize: "25",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            "Font size must be at most 24",
          );
        }
      });

      it("should accept boundary font sizes", () => {
        const min = schemas.readerPreferences.safeParse({
          fontFamily: "sans",
          fontSize: "14",
        });
        const max = schemas.readerPreferences.safeParse({
          fontFamily: "sans",
          fontSize: "24",
        });

        expect(min.success).toBe(true);
        expect(max.success).toBe(true);
      });

      it("should coerce string fontSize to number", () => {
        const result = schemas.readerPreferences.safeParse({
          fontFamily: "sans",
          fontSize: "20",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(typeof result.data.fontSize).toBe("number");
          expect(result.data.fontSize).toBe(20);
        }
      });

      it("should reject non-integer font sizes", () => {
        const result = schemas.readerPreferences.safeParse({
          fontFamily: "sans",
          fontSize: "16.5",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            "Font size must be a whole number",
          );
        }
      });
    });
  });
});
