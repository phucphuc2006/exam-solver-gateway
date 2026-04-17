const path = require("path");
const os = require("os");
const APP_STORAGE_NAME = "NexusAI Gateway";

// Single source of truth for data directory — matches localDb.js logic
function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_STORAGE_NAME);
  }
  return path.join(os.homedir(), `.${APP_STORAGE_NAME}`);
}

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");

module.exports = { DATA_DIR, MITM_DIR };
