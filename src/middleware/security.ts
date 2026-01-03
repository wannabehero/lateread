import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { config } from "../lib/config";

const isProduction = config.NODE_ENV === "production";

/**
 * Security Headers Middleware
 *
 * Configures security headers with environment-aware settings:
 * HSTS, CORS, CSP, X-Frame
 */
export const securityHeaders = secureHeaders({
  strictTransportSecurity: isProduction
    ? "max-age=31536000; includeSubDomains; preload" // 1 year
    : false,

  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",

  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"], // TODO: remove all inlined scripts
    styleSrc: ["'self'", "'unsafe-inline'"], // We use inline styles
    imgSrc: ["'self'", "data:", "https:"], // Allow external article images
    connectSrc: ["'self'"], // HTMX fetch requests
    fontSrc: ["'self'"],
    objectSrc: ["'none'"], // Block plugins (Flash, Java, etc.)
    frameAncestors: ["'none'"], // CSP equivalent of X-Frame-Options: DENY
    baseUri: ["'self'"],
    formAction: ["'self'"],

    ...(isProduction && { upgradeInsecureRequests: [] }),
  },

  // Permissions Policy - disable unnecessary browser APIs
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
  },
});

/**
 * CORS Middleware
 *
 * Restrictive CORS configuration:
 * - Production: Only allows lateread.app origin
 * - Development: Allows all origins for local testing
 */
export const corsMiddleware = cors({
  origin: isProduction ? "https://lateread.app" : "*",
  allowMethods: ["*"],
  allowHeaders: ["*"],
  credentials: true,
  maxAge: 86400, // 24 hours
});
