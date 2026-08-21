/// <reference types="vitest/config" />
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

  // ---------------------------------------------------------------- testlar
  // `npm test` -> vitest. Ilgari frontendda birorta test yo'q edi, holbuki
  // eng nozik mantiq aynan shu tomonda: identifikatorsiz navigatsiya,
  // so'rov poygasi va 401 da tokenni yangilash. Ular buzilsa `tsc` hech
  // narsa demaydi - tiplar joyida qolaveradi.
  test: {
    // Brauzer muhiti kerak: `localStorage`, `history`, DOM.
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    // Vaqt mintaqasi qat'iy: sana funksiyalari Toshkent vaqtida ishlaydi
    // (`components/ui.tsx` dagi `TZ`) va test qaysi mashinada yugurishidan
    // qat'i nazar bir xil natija berishi kerak.
    env: { TZ: "Asia/Tashkent" },
  },
});
