import pkg from "../../package.json" with { type: "json" };

const GITHUB_OWNER = "phucphuc2006";
const GITHUB_REPO = "nexusai-gateway";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;

const VERSION_STATE = globalThis.__nexusVersionState || {
  status: null,
  checkedAt: 0,
  inflight: null,
};

if (!globalThis.__nexusVersionState) {
  globalThis.__nexusVersionState = VERSION_STATE;
}

function compareVersions(left, right) {
  const leftParts = String(left || "")
    .replace(/^v/, "")
    .split(".")
    .map(Number);
  const rightParts = String(right || "")
    .replace(/^v/, "")
    .split(".")
    .map(Number);

  for (let index = 0; index < 3; index += 1) {
    if ((leftParts[index] || 0) > (rightParts[index] || 0)) return 1;
    if ((leftParts[index] || 0) < (rightParts[index] || 0)) return -1;
  }

  return 0;
}

function createBaseVersionStatus() {
  return {
    currentVersion: pkg.version,
    latestVersion: null,
    hasUpdate: false,
    downloadUrl: null,
    releaseUrl: null,
    releaseNotes: null,
    publishedAt: null,
    checkedAt: VERSION_STATE.checkedAt ? new Date(VERSION_STATE.checkedAt).toISOString() : null,
  };
}

async function fetchLatestRelease() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "NexusAIGateway",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub release lookup failed with status ${response.status}`);
    }

    const data = await response.json();
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const winAsset = assets.find((asset) => asset.name?.includes("win") && asset.name?.endsWith(".zip"));

    return {
      latestVersion: String(data.tag_name || "").replace(/^v/, ""),
      downloadUrl: winAsset?.browser_download_url || data.html_url || null,
      releaseUrl: data.html_url || null,
      releaseNotes: typeof data.body === "string" ? data.body.slice(0, 300) : null,
      publishedAt: data.published_at || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshVersionStatus() {
  if (VERSION_STATE.inflight) {
    return VERSION_STATE.inflight;
  }

  VERSION_STATE.inflight = (async () => {
    try {
      const release = await fetchLatestRelease();
      const currentVersion = pkg.version;
      const hasUpdate = compareVersions(release.latestVersion, currentVersion) > 0;

      VERSION_STATE.status = {
        currentVersion,
        latestVersion: release.latestVersion,
        hasUpdate,
        downloadUrl: release.downloadUrl,
        releaseUrl: release.releaseUrl,
        releaseNotes: release.releaseNotes,
        publishedAt: release.publishedAt,
        checkedAt: new Date().toISOString(),
      };
      VERSION_STATE.checkedAt = Date.now();
    } catch {
      if (!VERSION_STATE.status) {
        VERSION_STATE.status = createBaseVersionStatus();
      }
      if (!VERSION_STATE.checkedAt) {
        VERSION_STATE.checkedAt = Date.now();
        VERSION_STATE.status.checkedAt = new Date(VERSION_STATE.checkedAt).toISOString();
      }
    } finally {
      VERSION_STATE.inflight = null;
    }

    return VERSION_STATE.status;
  })();

  return VERSION_STATE.inflight;
}

export async function getVersionStatus({ preferFast = true } = {}) {
  if (VERSION_STATE.status && Date.now() - VERSION_STATE.checkedAt < CACHE_TTL_MS) {
    return VERSION_STATE.status;
  }

  if (preferFast) {
    if (!VERSION_STATE.inflight) {
      void refreshVersionStatus();
    }
    return VERSION_STATE.status || createBaseVersionStatus();
  }

  return refreshVersionStatus();
}
