import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The hume SDK imports "ws" at module level for Node.js fallback.
      // Alias it to an empty module so Vite doesn't bundle the Node.js shim.
      ws: path.resolve(__dirname, "./src/lib/ws-browser-shim.ts"),
    },
    // Force all packages to use the same React instance.
    // Without this, @humeai/voice-react hooks fail with
    // "Cannot read properties of null (reading 'useRef')".
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
})
