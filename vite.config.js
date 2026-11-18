import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 6000, sourcemap: false },
  worker: { format: "es" },
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3847",
      "/ws": {
        target: "ws://127.0.0.1:3847",
        ws: true,
      },
    },
  },
});
