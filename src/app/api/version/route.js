import pkg from "../../../../package.json" with { type: "json" };

const GITHUB_OWNER = "phucphuc2006";
const GITHUB_REPO = "exam-solver-gateway";

let cachedResult = null;
let lastCheck = 0;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function checkGitHubRelease() {
  const now = Date.now();
  if (cachedResult && now - lastCheck < CACHE_TTL) return cachedResult;

  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ExamSolverGateway",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const latestVersion = (data.tag_name || "").replace(/^v/, "");
    const assets = data.assets || [];
    const winAsset = assets.find(
      (a) => a.name.includes("win") && a.name.endsWith(".zip")
    );

    cachedResult = {
      latestVersion,
      downloadUrl: winAsset?.browser_download_url || data.html_url,
      releaseUrl: data.html_url,
      releaseNotes: (data.body || "").slice(0, 300),
      publishedAt: data.published_at,
    };
    lastCheck = now;
    return cachedResult;
  } catch {
    return null;
  }
}

export async function GET() {
  const currentVersion = pkg.version;
  const release = await checkGitHubRelease();

  if (!release) {
    return Response.json({ currentVersion, latestVersion: null, hasUpdate: false });
  }

  const hasUpdate = compareVersions(release.latestVersion, currentVersion) > 0;

  return Response.json({
    currentVersion,
    latestVersion: release.latestVersion,
    hasUpdate,
    downloadUrl: release.downloadUrl,
    releaseUrl: release.releaseUrl,
    releaseNotes: release.releaseNotes,
    publishedAt: release.publishedAt,
  });
}
