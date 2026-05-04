import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    copyPublicDir: true,
    rollupOptions: {
      input: resolve(rootDir, "src/content-script.ts"),
      output: {
        entryFileNames: "content-script.js",
        format: "iife",
        name: "MemoryNoteMiniQuiz"
      }
    }
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"]
  }
});
