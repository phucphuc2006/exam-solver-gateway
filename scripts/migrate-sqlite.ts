import fs from "node:fs";
import path from "node:path";
import * as storageMigration from "../src/lib/storage/sqlite/migrateLegacy.js";

const force = process.argv.includes("--force");

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadDotEnv();
  const result = await storageMigration.runLegacyMigration({ force });
  const status = await storageMigration.getStorageMigrationStatus();

  process.stdout.write(`${JSON.stringify({ result, status }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
