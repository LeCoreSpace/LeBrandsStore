import { defineConfig } from "vite";

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("A valid PORT is required for the web preview.");
}

// This is only a development web entry, not a second frontend.
// The existing Wrangler workflow serves every page, asset and API response.
// Keep the Worker port in sync with its artifact service allocation.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  // No client bundle is served: every request goes to Wrangler.
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
});
