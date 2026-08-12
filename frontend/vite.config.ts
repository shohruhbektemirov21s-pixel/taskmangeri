import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: { usePolling: true },
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://backend:8000",
        changeOrigin: true,
      },
      // WebSocket: bildirishnoma va chat
      "/ws": {
        target: (process.env.VITE_PROXY_TARGET || "http://backend:8000").replace(/^http/, "ws"),
        ws: true,
        changeOrigin: true,
      },
      "/media": {
        target: process.env.VITE_PROXY_TARGET || "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
  preview: { host: "0.0.0.0", port: 5173 },
});
