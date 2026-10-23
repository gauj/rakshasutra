// Dev server on port 5173; calls to /api are forwarded to the API server on port 8787.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
});
