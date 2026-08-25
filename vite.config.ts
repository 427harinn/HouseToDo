import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const apiProxyTarget = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_API_PROXY_TARGET;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: ["app", "web", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: apiProxyTarget ?? "http://worker:8787",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    globals: true,
    setupFiles: "./src/test/setup.ts"
  }
});
