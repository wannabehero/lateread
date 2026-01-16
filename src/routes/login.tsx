import { Hono } from "hono";
import { Login } from "../components/auth/Login";
import type { AppContext } from "../types/context";
import { renderWithLayout } from "./utils/render";

const login = new Hono<AppContext>();

login.get("/login", async (c) => {
  const back = c.req.query("back");
  // Basic open redirect protection: ensure it starts with /
  const isValidBack = back?.startsWith("/");

  return renderWithLayout({
    c,
    content: <Login back={isValidBack ? back : undefined} />,
    title: "Login",
  });
});

export default login;
