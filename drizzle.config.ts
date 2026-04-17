import path from "node:path";
import { defineConfig } from "drizzle-kit";

const dataDir = process.env.DATA_DIR || "./data";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/storage/sqlite/schema.js",
  out: "./drizzle",
  dbCredentials: {
    url: path.join(dataDir, "nexusai-gateway.sqlite"),
  },
});
