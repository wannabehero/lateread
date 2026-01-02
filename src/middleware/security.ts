import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { config } from "../lib/config";

const isProduction = config.NODE_ENV === "production";

/**
 * Security Headers Middleware
 *
 * Configures security headers with environment-aware settings:
 * - HSTS: Only enabled in production (breaks localhost over HTTP)
 * - CSP: Configured for HTMX + Pico CSS stack
 * - X-Frame-Options: DENY (no legitimate iframe use)
 */
export const securityHeaders = secureHeaders({
	// HSTS: Only in production (breaks localhost over HTTP)
	// 1 year with preload for HSTS preload list eligibility
	strictTransportSecurity: isProduction
		? "max-age=31536000; includeSubDomains; preload"
		: false,

	// Prevent clickjacking - DENY is strictest (no iframe embedding allowed)
	xFrameOptions: "DENY",

	// Prevent MIME-type sniffing attacks
	xContentTypeOptions: "nosniff",

	// Balance security and functionality for referrer
	referrerPolicy: "strict-origin-when-cross-origin",

	// Cross-origin isolation policies
	crossOriginOpenerPolicy: "same-origin",
	crossOriginResourcePolicy: "same-origin",

	// Content Security Policy - critical for XSS prevention
	contentSecurityPolicy: {
		defaultSrc: ["'self'"],
		scriptSrc: ["'self'"], // HTMX loaded from /public/
		styleSrc: ["'self'", "'unsafe-inline'"], // Pico CSS uses inline styles
		imgSrc: ["'self'", "data:", "https:"], // Allow external article images
		connectSrc: ["'self'"], // HTMX fetch requests
		fontSrc: ["'self'"],
		objectSrc: ["'none'"], // Block plugins (Flash, Java, etc.)
		frameAncestors: ["'none'"], // CSP equivalent of X-Frame-Options: DENY
		baseUri: ["'self'"],
		formAction: ["'self'"],
		// Upgrade HTTP to HTTPS automatically in production
		upgradeInsecureRequests: isProduction ? [] : false,
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
	allowMethods: ["GET", "POST", "PUT", "DELETE"],
	// Include HTMX headers for proper preflight handling
	allowHeaders: ["Content-Type", "hx-request", "hx-target", "hx-trigger"],
	credentials: true,
	maxAge: 86400, // 24 hours preflight cache
});
