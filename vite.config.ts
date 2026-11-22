import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg"] },
  worker: { format: "es" },
  test: { include: ["tests/**/*.test.ts"] },
});
