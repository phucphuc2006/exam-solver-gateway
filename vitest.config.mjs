import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "open-sse": resolve(__dirname, "open-sse"),
    },
  },
});
