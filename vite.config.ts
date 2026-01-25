import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "dashboard",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "dashboard/src"),
    },
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:7777",
        changeOrigin: true,
      },
    },
  },
});
