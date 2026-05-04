import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: {
      input: resolve(rootDir, "src/background.ts"),
      output: {
        entryFileNames: "background.js",
        format: "iife",
        name: "MemoryNoteBackground"
      }
    }
  }
});
