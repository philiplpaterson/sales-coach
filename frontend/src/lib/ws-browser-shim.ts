// Browser shim for the "ws" package.
// The hume SDK imports "ws" for Node.js WebSocket fallback but never uses it
// in the browser. This shim provides a no-op export so Vite can bundle cleanly.
export const WebSocket = globalThis.WebSocket
export default globalThis.WebSocket
