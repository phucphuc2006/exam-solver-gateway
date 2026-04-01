/**
 * Exam Solver AI Gateway - Auto Updater
 * Checks GitHub Releases for new versions
 */

const GITHUB_OWNER = "phucphuc2006";
const GITHUB_REPO = "exam-solver-gateway";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

let cachedResult = null;
let lastCheck = 0;

/**
 * Compare semver versions: returns 1 if b > a, -1 if a > b, 0 if equal
 */
function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (nb > na) return 1;
    if (na > nb) return -1;
  }
  return 0;
}

/**
 * Check GitHub Releases API for the latest version
 */
async function checkForUpdate(currentVersion) {
  const now = Date.now();

  // Return cached result if still fresh
  if (cachedResult && now - lastCheck < CHECK_INTERVAL_MS) {
    return cachedResult;
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ExamSolverGateway",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      cachedResult = { hasUpdate: false, currentVersion, error: `HTTP ${res.status}` };
      lastCheck = now;
      return cachedResult;
    }

    const data = await res.json();
    const latestVersion = (data.tag_name || "").replace(/^v/, "");
    const hasUpdate = compareVersions(currentVersion, latestVersion) > 0;

    // Find the .zip asset for Windows
    const assets = data.assets || [];
    const winAsset = assets.find(
      (a) => a.name.includes("win") && a.name.endsWith(".zip")
    );

    cachedResult = {
      hasUpdate,
      currentVersion,
      latestVersion,
      downloadUrl: winAsset?.browser_download_url || data.html_url,
      releaseUrl: data.html_url,
      releaseNotes: data.body?.slice(0, 500) || "",
      publishedAt: data.published_at,
    };
    lastCheck = now;
    return cachedResult;
  } catch (err) {
    cachedResult = {
      hasUpdate: false,
      currentVersion,
      error: err.name === "AbortError" ? "Timeout" : err.message,
    };
    lastCheck = now;
    return cachedResult;
  }
}

module.exports = { checkForUpdate, compareVersions };
