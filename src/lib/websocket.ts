import { createBunWebSocket } from "hono/bun";

// Create WebSocket handler for Hono
const { upgradeWebSocket, websocket } = createBunWebSocket();

export { upgradeWebSocket, websocket };
