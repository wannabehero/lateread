import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "./validator";

describe("lib/validator", () => {
  describe("validator", () => {
    it("should validate query parameters and pass to handler", async () => {
      const app = new Hono();
      const schema = z.object({
        name: z.string(),
        age: z.coerce.number(),
      });

      app.get("/test", validator("query", schema), (c) => {
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

      app.get("/test/:id", validator("param", schema), (c) => {
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

      app.post("/test", validator("form", schema), (c) => {
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

      app.get("/test", validator("query", schema), (c) => {
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

      app.get("/test/:id", validator("param", schema), (c) => {
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

      app.post("/test", validator("form", schema), (c) => {
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

    it("should support async refinements with safeParseAsync", async () => {
      const app = new Hono();
      const schema = z.object({
        username: z.string().refine(async (val) => val !== "taken", {
          message: "Username is already taken",
        }),
      });

      app.post("/test", validator("form", schema), (c) => {
        const { username } = c.req.valid("form");
        return c.json({ username });
      });

      app.onError((err, c) => {
        if (err.message === "Validation failed") {
          return c.json({ error: err.message }, 400);
        }
        throw err;
      });

      // Test valid username
      const formData = new FormData();
      formData.append("username", "available");

      const res = await app.request("/test", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.username).toBe("available");

      // Test taken username
      const formData2 = new FormData();
      formData2.append("username", "taken");

      const res2 = await app.request("/test", {
        method: "POST",
        body: formData2,
      });

      expect(res2.status).toBe(400);
    });

    it("should apply transforms", async () => {
      const app = new Hono();
      const schema = z.object({
        name: z.string().transform((val) => val.toLowerCase().trim()),
      });

      app.get("/test", validator("query", schema), (c) => {
        const { name } = c.req.valid("query");
        return c.json({ name });
      });

      const res = await app.request("/test?name=%20JOHN%20");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.name).toBe("john");
    });
  });
});
