import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api to the FastAPI backend (default localhost:8000),
// so the frontend can call relative URLs with no CORS friction in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.FIRASA_API || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
