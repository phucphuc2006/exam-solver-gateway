#!/usr/bin/env node
/**
 * Exam Solver AI Gateway - Standalone Server Entry
 * This is the entry point for the packaged .exe
 */

const path = require("path");
const { execSync } = require("child_process");

// ─── Configuration ───────────────────────────────────────────
const PORT = process.env.PORT || 21088;
const HOST = process.env.HOST || "0.0.0.0";

// Determine base directory (works both in dev and pkg)
const isPkg = typeof process.pkg !== "undefined";
const BASE_DIR = isPkg ? path.dirname(process.execPath) : __dirname;

// Set environment variables
process.env.NODE_ENV = "production";
process.env.PORT = String(PORT);
process.env.HOSTNAME = HOST;
process.env.DATA_DIR = path.join(BASE_DIR, "data");

// ─── ASCII Banner ────────────────────────────────────────────
function showBanner() {
  const version = require("./package.json").version;
  console.log("");
  console.log("  ╔══════════════════════════════════════════════╗");
  console.log("  ║                                              ║");
  console.log("  ║    ⚡ EXAM SOLVER AI GATEWAY ⚡               ║");
  console.log(`  ║    Version: ${version.padEnd(34)}║`);
  console.log("  ║                                              ║");
  console.log("  ╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`  🌐 Dashboard:  http://localhost:${PORT}`);
  console.log(`  🔑 Password:   (set in .env or INITIAL_PASSWORD)`);
  console.log(`  📁 Data Dir:   ${process.env.DATA_DIR}`);
  console.log("");
  console.log("  ─────────────────────────────────────────────────");
  console.log("  Press Ctrl+C to stop the server");
  console.log("  ─────────────────────────────────────────────────");
  console.log("");
}

// ─── Open Browser ────────────────────────────────────────────
function openBrowser(url) {
  setTimeout(() => {
    try {
      const cmd =
        process.platform === "win32"
          ? `start "" "${url}"`
          : process.platform === "darwin"
          ? `open "${url}"`
          : `xdg-open "${url}"`;
      execSync(cmd, { stdio: "ignore" });
    } catch {
      // Silently fail if browser can't be opened
    }
  }, 2000);
}

// ─── Load .env if exists ─────────────────────────────────────
function loadEnvFile() {
  const envPath = path.join(BASE_DIR, ".env");
  try {
    const fs = require("fs");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
          if (!process.env[key] || key === "INITIAL_PASSWORD" || key === "JWT_SECRET") {
            process.env[key] = value;
          }
        }
      }
      console.log("  ✅ Loaded .env from:", envPath);
    }
  } catch {
    // .env not required
  }
}

// ─── Ensure data directory ───────────────────────────────────
function ensureDataDir() {
  const fs = require("fs");
  const dataDir = process.env.DATA_DIR;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log("  📂 Created data directory:", dataDir);
  }
}

// ─── Start Server ────────────────────────────────────────────
async function start() {
  loadEnvFile();
  showBanner();
  ensureDataDir();

  // Point to the Next.js standalone server
  const serverPath = isPkg
    ? path.join(BASE_DIR, ".next", "standalone", "server.js")
    : path.join(__dirname, ".next", "standalone", "server.js");

  try {
    require(serverPath);
    openBrowser(`http://localhost:${PORT}`);
  } catch (err) {
    console.error("  ❌ Failed to start server:", err.message);
    console.error("");
    console.error("  Make sure you have built the project first:");
    console.error("    npm run build");
    console.error("");
    process.exit(1);
  }
}

start();
