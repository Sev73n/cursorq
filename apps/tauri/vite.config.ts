import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@cursorq/core": path.resolve(dir, "../../packages/core/src/browser.ts"),
    },
  },
  server: { port: 1420, strictPort: true },
  build: {
    target: ["es2021", "chrome100"],
    minify: !process.env.TAURI_DEBUG,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
