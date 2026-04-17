/* global chrome */

const DASHBOARD_BRIDGE_PING_TYPE = "PING_DASHBOARD_BRIDGE";
const DASHBOARD_BRIDGE_TIMEOUT_MS = 1500;
const DASHBOARD_ROUTE = "/dashboard/chatgpt-web";
const POPUP_STATUS_STORAGE_KEY = "nexusai-web-autoconnect-popup-status";

const checkButton = document.getElementById("check-button");
const statusBadge = document.getElementById("status-badge");
const statusDetail = document.getElementById("status-detail");
const statusMeta = document.getElementById("status-meta");

function readStoredStatus() {
  try {
    const raw = window.localStorage.getItem(POPUP_STATUS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return {
      tone: String(parsed.tone || "").trim(),
      label: String(parsed.label || "").trim(),
      detail: String(parsed.detail || "").trim(),
      meta: String(parsed.meta || "").trim(),
    };
  } catch {
    return null;
  }
}

function writeStoredStatus(status) {
  try {
    if (!status || typeof status !== "object") {
      window.localStorage.removeItem(POPUP_STATUS_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(POPUP_STATUS_STORAGE_KEY, JSON.stringify({
      tone: String(status.tone || "").trim(),
      label: String(status.label || "").trim(),
      detail: String(status.detail || "").trim(),
      meta: String(status.meta || "").trim(),
    }));
  } catch {
  }
}

function setStatus(tone, label, detail, meta = "", { persist = true } = {}) {
  statusBadge.className = `status-badge status-${tone}`;
  statusBadge.textContent = label;
  statusDetail.textContent = detail;
  statusMeta.textContent = meta;

  if (persist) {
    writeStoredStatus({ tone, label, detail, meta });
  }
}

function setChecking(isChecking) {
  checkButton.disabled = isChecking;
  checkButton.textContent = isChecking
    ? "Đang kiểm tra..."
    : "Kiểm tra kết nối Dashboard";
}

function getDashboardMatches() {
  const manifest = chrome.runtime.getManifest();
  const matches = [];

  for (const script of manifest.content_scripts || []) {
    for (const match of script.matches || []) {
      matches.push(match);
    }
  }

  return [...new Set(matches)];
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || "Không thể truy vấn tab dashboard."));
        return;
      }

      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function sendPingToTab(tabId, timeoutMs) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      {
        type: DASHBOARD_BRIDGE_PING_TYPE,
        timeoutMs,
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          resolve({
            ok: false,
            error: runtimeError.message || "Không thể gửi ping tới dashboard.",
          });
          return;
        }

        if (!response || typeof response !== "object") {
          resolve({
            ok: false,
            error: "Dashboard không trả về trạng thái kết nối.",
          });
          return;
        }

        resolve(response);
      },
    );
  });
}

function sortTabsByPriority(tabs) {
  return [...tabs].sort((left, right) => {
    return (
      Number(Boolean(right.active)) - Number(Boolean(left.active))
      || Number(Boolean(right.highlighted)) - Number(Boolean(left.highlighted))
      || Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0)
    );
  });
}

function compactPathname(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return String(url || "");
  }
}

function getTabLabel(result) {
  return String(result?.activeTabLabel || "").trim() || "Web Bridge";
}

function buildSuccessMeta(result, totalTabs) {
  const pieces = [
    `Đang mở tab: ${getTabLabel(result)}`,
    `Tab: ${result.title || "NexusAI dashboard"}`,
    `URL: ${compactPathname(result.dashboardUrl)}`,
    `Đã dò ${totalTabs} tab dashboard`,
  ];

  if (result.respondedAt) {
    pieces.push(`Phản hồi lúc: ${new Date(result.respondedAt).toLocaleTimeString()}`);
  }

  return pieces.join("\n");
}

function buildPartialMeta(result, totalTabs) {
  const pieces = [
    `Tab bridge mong đợi: ChatGPT Web / Gemini Web / Grok Web`,
    `Tab hiện có: ${result.title || "NexusAI dashboard"}`,
    `URL: ${compactPathname(result.dashboardUrl)}`,
    `Cần mở đúng route: ${DASHBOARD_ROUTE}`,
    `Đã dò ${totalTabs} tab dashboard`,
  ];

  return pieces.join("\n");
}

function buildErrorMeta(result, totalTabs) {
  const pieces = [
    `Đã dò ${totalTabs} tab dashboard`,
  ];

  if (result?.title) {
    pieces.push(`Tab gần nhất: ${result.title}`);
  }

  if (result?.dashboardUrl) {
    pieces.push(`URL: ${compactPathname(result.dashboardUrl)}`);
  }

  if (result?.error) {
    pieces.push(`Lỗi: ${result.error}`);
  }

  return pieces.join("\n");
}

async function inspectDashboardTabs() {
  const matches = getDashboardMatches();
  if (matches.length === 0) {
    setStatus(
      "error",
      "Thiếu cấu hình",
      "Extension chưa có host match để dò dashboard NexusAI.",
      "Kiểm tra lại manifest của content script.",
    );
    return;
  }

  const tabs = sortTabsByPriority(await queryTabs({ url: matches }));
  if (tabs.length === 0) {
    setStatus(
      "warning",
      "Chưa thấy dashboard",
      "Chưa thấy tab NexusAI nào trong trình duyệt này.",
      `Host đang dò:\n${matches.join("\n")}`,
    );
    return;
  }

  const results = [];
  for (const tab of tabs) {
    const response = await sendPingToTab(tab.id, DASHBOARD_BRIDGE_TIMEOUT_MS);
    results.push({
      ...response,
      tabId: tab.id,
      title: response.title || tab.title || "",
      dashboardUrl: response.dashboardUrl || tab.url || "",
    });
  }

  const connected = results.find((entry) => entry.ok !== false && entry.bridgeReady === true);
  if (connected) {
    setStatus(
      "success",
      "Đã kết nối",
      `Extension đang nối đúng với dashboard NexusAI ${getTabLabel(connected)}.`,
      buildSuccessMeta(connected, tabs.length),
    );
    return;
  }

  const partial = results.find((entry) => entry.ok !== false);
  if (partial) {
    setStatus(
      "warning",
      "Đúng host, sai trang",
      "Đã thấy tab NexusAI nhưng page bridge của ChatGPT Web, Gemini Web hoặc Grok Web chưa sẵn sàng.",
      buildPartialMeta(partial, tabs.length),
    );
    return;
  }

  setStatus(
    "warning",
    "Bridge chưa phản hồi",
    "Đã thấy tab NexusAI nhưng content bridge chưa trả lời. Hãy reload tab dashboard rồi thử lại.",
    buildErrorMeta(results[0], tabs.length),
  );
}

async function handleCheckClick() {
  setChecking(true);
  setStatus(
    "checking",
    "Đang kiểm tra",
    "Đang ping trực tiếp vào dashboard NexusAI Web Bridge...",
    "",
    { persist: false },
  );

  try {
    await inspectDashboardTabs();
  } catch (error) {
    setStatus(
      "error",
      "Kiểm tra thất bại",
      "Không thể đọc trạng thái kết nối dashboard từ extension.",
      String(error?.message || error || "Unknown popup error."),
    );
  } finally {
    setChecking(false);
  }
}

checkButton.addEventListener("click", () => {
  void handleCheckClick();
});

const storedStatus = readStoredStatus();
if (storedStatus?.tone && storedStatus?.label && storedStatus?.detail) {
  setStatus(
    storedStatus.tone,
    storedStatus.label,
    storedStatus.detail,
    storedStatus.meta || "",
    { persist: false },
  );
}
