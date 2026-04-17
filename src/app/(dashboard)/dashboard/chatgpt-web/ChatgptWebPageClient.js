"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import Input from "@/shared/components/Input";

import Toggle from "@/shared/components/Toggle";
import CurlImportModal from "./CurlImportModal";
import WebConnectModal from "./WebConnectModal";
import ApiUsageCard from "./ApiUsageCard";
import TestPromptCard from "./TestPromptCard";
import ConnectionCard from "./ConnectionCard";
import SessionStatusCard from "./SessionStatusCard";
import { CardSkeleton } from "@/shared/components/Loading";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useNotificationStore } from "@/store/notificationStore";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";

import {
  WEB_BRIDGE_MAX_ATTACHMENTS,
  createAttachmentsFromFileList,
  createConversationAttachment,
} from "./webBridgeAttachmentUtils";
import {
  buildWebBridgeRunTestRequestBody,
  hasWebBridgeRunTestInput,
} from "./webBridgeTestPayloadUtils";
import {
  buildWebBridgeWsCliExample,
  ensureWebBridgeModel,
  getWebBridgePublicEndpointUrl,
  normalizeWebBridgeBootstrap,
  runWebBridgeWsRequest,
  shouldUseWebBridgeWs,
} from "./webBridgeWsClient";

// ── Extracted modules ──
import {
  getCachedInitialPageLoad,
  formatDate,
  coerceNonNegativeInteger,
  parseErrorResponse,
  hasBearerAuthorizationHeader,
} from "./chatgptWebUtils";
import {
  looksLikeChatgptWebCurl,
  getCaptureMode,
} from "./captureHelpers";

import {
  AUTO_CONNECT_STORAGE_KEY,
  CHATGPT_WEB_EXTENSION_AUTO_CONNECT_TIMEOUT_MS,
  readStickyExtensionAvailability,
  getSessionAttemptKey,
  getBrowserExtensionErrorMessage,
} from "./extensionBridge";

// ── Custom hooks ──
import { useBrowserExtension } from "./useBrowserExtension";
import { useCaptureImport, CAPTURE_CONSOLE_SCRIPT } from "./useCaptureImport";

export default function ChatgptWebPageClient() {
  const { t } = useRuntimeLocale();
  const notify = useNotificationStore();
  const { copied, copy } = useCopyToClipboard();

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [session, setSession] = useState(null);
  const [bootstrap, setBootstrap] = useState({
    requireApiKey: false,
    keys: [],
    tunnel: { enabled: false, publicUrl: "" },
    webBridge: { wsUrl: "", protocols: [] },
  });
  const [origin, setOrigin] = useState("");
  const [prompt, setPrompt] = useState("Give me a one-sentence summary of this bridge.");
  const [selectedModel, setSelectedModel] = useState("");
  const [stream, setStream] = useState(false);
  const [testMode, setTestMode] = useState("prompt");
  const [rawPayload, setRawPayload] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [rotationDraft, setRotationDraft] = useState("0");
  const [showCurlModal, setShowCurlModal] = useState(false);
  const [curlInput, setCurlInput] = useState("");
  const [showWebConnectModal, setShowWebConnectModal] = useState(false);
  const [autoStatus, setAutoStatus] = useState("idle");
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(true);
  const [autoConnectHydrated, setAutoConnectHydrated] = useState(false);
  const [bridgeMode, setBridgeModeState] = useState("direct"); // "direct" | "inject"

  const bridgeModeOptions = useMemo(() => [
    { value: "direct", label: "🔗 Direct API" },
    { value: "inject", label: "🌐 Browser Inject" },
  ], []);

  const setBridgeMode = useCallback(async (mode) => {
    const validMode = mode === "inject" ? "inject" : "direct";
    setBridgeModeState(validMode);
    try {
      localStorage.setItem("bridgeMode:chatgpt-web", validMode);
    } catch {}
    try {
      await fetch("/api/inject-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-mode", provider: "chatgpt-web", mode: validMode }),
      });
    } catch {}
  }, []);

  // Hydrate bridgeMode from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bridgeMode:chatgpt-web");
      if (saved === "inject" || saved === "direct") {
        setBridgeModeState(saved);
      }
    } catch {}
  }, []);

  const autoConnectAttemptedRef = useRef(false);
  const autoValidateAttemptedRef = useRef("");
  const autoRecoverAttemptedRef = useRef("");
  const autoReconnectAttemptedRef = useRef("");
  const autoPausedRef = useRef(false);
  const completionsRoutePrewarmedRef = useRef(false);

  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.chatgptWebLogin;

  // ── Browser extension hook ──
  const {
    browserExtensionAvailable,
    markBrowserExtensionAvailable,
    clearExtensionBridgeNotifications,
    requestBrowserExtension,
  } = useBrowserExtension({ isElectron });

  const resetAutoAttempts = () => {
    autoConnectAttemptedRef.current = false;
    autoValidateAttemptedRef.current = "";
    autoRecoverAttemptedRef.current = "";
    autoReconnectAttemptedRef.current = "";
  };

  const loadData = useCallback(async ({ preferCache = false } = {}) => {
    setLoading(true);
    try {
      const result = await getCachedInitialPageLoad(
        "chatgpt-web",
        async () => {
          const [sessionResponse, bootstrapResponse] = await Promise.all([
            fetch("/api/chatgpt-web/session", { cache: "no-store" }),
            fetch("/api/endpoint/bootstrap", { cache: "no-store" }),
          ]);

          const [sessionPayload, bootstrapPayload] = await Promise.all([
            sessionResponse.json(),
            bootstrapResponse.json(),
          ]);

          if (!sessionResponse.ok) {
            throw new Error(sessionPayload?.error || "Failed to load ChatGPT Web session");
          }

          if (!bootstrapResponse.ok) {
            throw new Error(bootstrapPayload?.error || "Failed to load endpoint bootstrap");
          }

          return {
            session: sessionPayload.session || null,
            bootstrap: normalizeWebBridgeBootstrap(bootstrapPayload),
          };
        },
        { preferCache },
      );

      setSession(result.session);
      setBootstrap(result.bootstrap);
    } catch (error) {
      useNotificationStore.getState().error(error.message || "Failed to load ChatGPT Web bridge");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    void loadData({ preferCache: true });
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined" || completionsRoutePrewarmedRef.current) {
      return;
    }

    completionsRoutePrewarmedRef.current = true;
    void fetch("/api/chatgpt-web/chat/completions", {
      method: "OPTIONS",
      cache: "no-store",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(AUTO_CONNECT_STORAGE_KEY);
    setAutoConnectEnabled(stored !== "0");
    setAutoConnectHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !autoConnectHydrated) {
      return;
    }

    window.localStorage.setItem(AUTO_CONNECT_STORAGE_KEY, autoConnectEnabled ? "1" : "0");
  }, [autoConnectEnabled, autoConnectHydrated]);

  const [scriptCopied, setScriptCopied] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  // ── Capture import hook ──
  const {
    importCaptureBundle,
    importCapturedToken,
    importCaptureFromCurl,
  } = useCaptureImport({
    loadData,
    autoConnectEnabled,
    autoPausedRef,
    resetAutoAttempts,
    setAutoStatus,
    setBusyAction,
    setShowCurlModal,
    setShowWebConnectModal,
    setTokenInput,
    setCurlInput,
  });

  const handleCopyWebScript = async () => {
    try {
      await navigator.clipboard.writeText(CAPTURE_CONSOLE_SCRIPT);
      setScriptCopied(true);
      notify.success("Đã copy script!");
    } catch {
      notify.error("Không thể copy");
    }
  };

  const handleImportToken = async () => {
    try {
      await importCapturedToken(tokenInput, {
        action: "web-connect",
        closeWebConnectModal: true,
        clearTokenInput: true,
      });
      notify.success("ChatGPT Web đã kết nối thành công!");
    } catch (error) {
      notify.error(error.message || "Lỗi kết nối");
    }
  };

  const handleOpenWebConnect = () => {
    setShowWebConnectModal(true);
    setScriptCopied(false);
    setTokenInput("");
  };

  const handleCloseWebConnect = () => {
    setShowWebConnectModal(false);
  };

  const handleToggleAutoConnect = (nextValue) => {
    const nextEnabled = nextValue === true;
    setAutoConnectEnabled(nextEnabled);
    resetAutoAttempts();
    autoPausedRef.current = false;
    setAutoStatus(nextEnabled ? "idle" : "disabled");
  };

  useEffect(() => {
    const availableModels = Array.isArray(session?.availableModels) ? session.availableModels : [];

    if (availableModels.length === 0) {
      if (selectedModel) {
        setSelectedModel("");
      }
      return;
    }

    const currentModelExists = availableModels.some((model) => model.id === selectedModel);
    if (!selectedModel || !currentModelExists) {
      setSelectedModel(availableModels[0].id);
    }
  }, [session, selectedModel]);

  useEffect(() => {
    setRotationDraft(String(coerceNonNegativeInteger(session?.conversationRotationInterval, 0)));
  }, [session?.conversationRotationInterval]);

  const connectBusy = busyAction === "connect" || busyAction === "auto-connect" || busyAction === "auto-reconnect";
  const validateBusy = busyAction === "validate" || busyAction === "auto-validate";
  const autoConnectBusy = busyAction === "auto-connect" || busyAction === "auto-validate" || busyAction === "auto-reconnect";
  const webAutoConnectBusy = busyAction === "web-auto-connect" || busyAction === "web-auto-connect-extension";
  const webExtensionCaptureWaiting = busyAction === "web-auto-connect-extension";
  const webConnectBusy = busyAction === "web-connect" || webAutoConnectBusy;
  const settingsBusy = busyAction === "settings";
  const sessionBusy = Boolean(busyAction) && busyAction !== "test";
  const testModeOptions = useMemo(() => ([
    { value: "prompt", label: t("Prompt thường"), icon: "chat" },
    { value: "raw", label: t("Raw JSON"), icon: "data_object" },
  ]), [t]);
  const canSubmitTest = hasWebBridgeRunTestInput({
    mode: testMode,
    rawPayload,
    prompt,
    attachments,
  });
  const historySyncEnabled = session?.historySyncEnabled === true;
  const sessionModeEnabled = session?.sessionModeEnabled === true;
  const conversationRotationInterval = coerceNonNegativeInteger(session?.conversationRotationInterval, 0);
  const conversationTurnCount = coerceNonNegativeInteger(session?.conversationTurnCount, 0);
  const conversationWillRotateNext = sessionModeEnabled
    && conversationRotationInterval > 0
    && conversationTurnCount >= conversationRotationInterval;
  const webHistoryStatusText = historySyncEnabled
    ? "Bật: các request mới sẽ ghi vào lịch sử ChatGPT Web thường."
    : sessionModeEnabled
      ? "Tắt: bridge ưu tiên chat tạm thời, không đưa vào lịch sử web nhưng vẫn giữ mạch trong session hiện tại."
      : "Tắt: bridge ưu tiên chat tạm thời và mỗi lần gửi sẽ mở conversation mới.";
  const sessionConversationStatusText = !sessionModeEnabled
    ? "Session đang tắt: mỗi lần gửi sẽ mở conversation mới."
    : conversationWillRotateNext
      ? "Session đang bật: lần gửi kế tiếp sẽ xoay sang conversation mới."
      : conversationRotationInterval > 0
        ? `Session đang bật: hiện ở ${conversationTurnCount}/${conversationRotationInterval} lượt của conversation này.`
        : "Session đang bật: các lần gửi tiếp theo sẽ nối tiếp conversation hiện tại.";

  const sessionStatusVariant = session?.status === "active"
    ? "success"
    : session?.status === "expired" || session?.status === "error"
      ? "warning"
      : "default";

  const sessionStatusLabel = session?.status === "active"
    ? "Connected"
    : session?.status === "expired"
      ? "Expired"
      : session?.status === "error"
        ? "Needs reconnect"
        : session
          ? "Pending validation"
          : "Disconnected";

  const autoStatusVariant = autoStatus === "ready"
    ? "success"
    : autoStatus === "failed"
      ? "warning"
      : autoStatus === "disabled"
        ? "default"
      : autoStatus === "paused" || autoStatus === "idle"
        ? "default"
        : "primary";
  const autoStatusLabel = autoStatus === "connecting"
    ? "Đang tự kết nối"
    : autoStatus === "validating"
      ? "Đang tự validate"
      : autoStatus === "reconnecting"
        ? "Đang tự bắt lại session"
        : autoStatus === "disabled"
          ? "Đã tắt"
        : autoStatus === "failed"
          ? "Tự kết nối lỗi"
          : autoStatus === "paused"
            ? "Đã tạm dừng"
            : autoStatus === "ready"
              ? "Tự kết nối sẵn sàng"
              : "Chờ tự kết nối";
  const autoStatusDescription = autoStatus === "connecting"
    ? "Dashboard đang tự mở WebView để bắt lại session ChatGPT."
    : autoStatus === "validating"
      ? "Dashboard đang tự xác thực lại session hiện tại."
      : autoStatus === "reconnecting"
        ? "Session lỗi hoặc hết hạn, bridge đang tự recapture rồi validate lại."
        : autoStatus === "disabled"
          ? "Auto-connect đang tắt. Bridge chỉ kết nối khi anh bấm tay."
        : autoStatus === "failed"
          ? "Auto-connect đã thử xong nhưng vẫn thất bại. Anh có thể bấm kết nối thủ công một lần."
          : autoStatus === "paused"
            ? "Auto-connect tạm dừng sau khi anh chủ động ngắt kết nối."
            : autoStatus === "ready"
              ? "Trong Electron, bridge sẽ tự validate hoặc tự reconnect khi session có vấn đề."
              : "Mở trang này trong Electron là bridge sẽ tự lo phần connect/validate.";

  const captureMode = getCaptureMode(session?.capturedTargetPath || session?.captureUrl || "");
  const captureModeLabel = captureMode === "conversation"
    ? "Chat thường"
    : "Chưa rõ";
  const captureModeVariant = captureMode === "conversation"
    ? "success"
    : "default";
  const endpointUrl = useMemo(() => {
    return getWebBridgePublicEndpointUrl({ bootstrap, origin });
  }, [bootstrap, origin]);

  const refreshSessionState = useCallback(async () => {
    const response = await fetch("/api/chatgpt-web/session", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to refresh ChatGPT Web session");
    }
    setSession(payload?.session || null);
    return payload?.session || null;
  }, []);

  const updateConversationSettings = useCallback(async (patch = {}) => {
    if (!session) {
      return;
    }

    setBusyAction("settings");
    try {
      const response = await fetch("/api/chatgpt-web/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historySyncEnabled,
          sessionModeEnabled,
          conversationRotationInterval,
          ...patch,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update ChatGPT Web conversation settings");
      }

      setSession(payload?.session || null);
      notify.success("Đã cập nhật cài đặt conversation của Web Bridge.");
    } catch (error) {
      notify.error(error.message || "Failed to update ChatGPT Web conversation settings");
    } finally {
      setBusyAction("");
    }
  }, [conversationRotationInterval, historySyncEnabled, notify, session, sessionModeEnabled]);

  const wsExample = useMemo(() => {
    const exampleModel = ensureWebBridgeModel(
      selectedModel || session?.availableModels?.[0]?.id || "gpt-5",
      "chatgpt-web",
    );

    return buildWebBridgeWsCliExample({
      endpointUrl,
      requireApiKey: bootstrap.requireApiKey,
      apiKey: bootstrap.keys?.[0]?.key || "",
      exampleModel,
      stream,
      promptText: "Hello from the ChatGPT Web bridge",
    });
  }, [bootstrap.keys, bootstrap.requireApiKey, endpointUrl, selectedModel, session?.availableModels, stream]);

  const refreshAllState = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const validateSession = useCallback(async ({ action = "validate", silent = false } = {}) => {
    setBusyAction(action);
    try {
      const response = await fetch("/api/chatgpt-web/session/validate", {
        method: "POST",
      });

      if (!response.ok) {
        await refreshAllState().catch(() => {});
        throw new Error(await parseErrorResponse(response));
      }

      await refreshAllState();
      if (!silent) {
        notify.success("ChatGPT Web session validated");
      }
    } catch (error) {
      if (!silent) {
        notify.error(error.message || "Failed to validate ChatGPT Web session");
      }
      throw error;
    } finally {
      setBusyAction("");
    }
  }, [notify, refreshAllState]);

  const connectViaElectron = useCallback(async ({ action = "connect", silent = false } = {}) => {
    if (!isElectron || !window.electronAPI?.chatgptWebLogin) {
      const error = new Error("This setup flow is only available inside the desktop app.");
      if (!silent) {
        notify.warning(error.message);
      }
      throw error;
    }

    setBusyAction(action);
    try {
      const capture = await window.electronAPI.chatgptWebLogin();

      const importResponse = await fetch("/api/chatgpt-web/session/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capture),
      });

      if (!importResponse.ok) {
        throw new Error(await parseErrorResponse(importResponse));
      }

      const validateResponse = await fetch("/api/chatgpt-web/session/validate", {
        method: "POST",
      });

      if (!validateResponse.ok) {
        await refreshAllState().catch(() => {});
        throw new Error(await parseErrorResponse(validateResponse));
      }

      await refreshAllState();
      if (!silent) {
        notify.success("ChatGPT Web bridge connected");
      }
    } catch (error) {
      if (!silent) {
        notify.error(error.message || "Failed to connect ChatGPT Web bridge");
      }
      throw error;
    } finally {
      setBusyAction("");
    }
  }, [isElectron, notify, refreshAllState]);

  const handleConnect = async () => {
    autoPausedRef.current = false;
    resetAutoAttempts();
    setAutoStatus("connecting");

    try {
      await connectViaElectron({ action: "connect" });
      setAutoStatus(autoConnectEnabled ? "ready" : "disabled");
    } catch {
      setAutoStatus("failed");
    }
  };

  const handleImportCurl = async () => {
    try {
      await importCaptureFromCurl(curlInput, {
        action: "connect",
        closeCurlModal: true,
        clearCurlInput: true,
      });
      notify.success("ChatGPT Web bridge connected from cURL");
    } catch (error) {
      notify.error(error.message || "Failed to import from cURL");
    }
  };

  const handleWebAutoConnect = async () => {
    if (browserExtensionAvailable) {
      setBusyAction("web-auto-connect-extension");
      try {
        notify.info("Extension đang chờ bắt request thật của chat thường. Nếu tab ChatGPT chưa tự phát request, hãy gửi 1 tin nhắn ngắn trong chat thường.");
        const extensionResult = await requestBrowserExtension(
          "AUTO_CONNECT",
          {},
          CHATGPT_WEB_EXTENSION_AUTO_CONNECT_TIMEOUT_MS,
        );
        const extensionCapture = extensionResult?.capture || extensionResult;
        if (!extensionCapture || typeof extensionCapture !== "object" || Array.isArray(extensionCapture)) {
          throw new Error("ChatGPT Web extension không trả về capture bundle hợp lệ.");
        }

        await importCaptureBundle(extensionCapture, {
          action: "web-auto-connect-extension",
          closeWebConnectModal: true,
          clearTokenInput: true,
          closeCurlModal: true,
          clearCurlInput: true,
        });
        markBrowserExtensionAvailable(true);
        clearExtensionBridgeNotifications();
        notify.success(extensionResult?.message || "ChatGPT Web đã tự kết nối qua browser extension bằng request thật của chat thường.");
      } catch (error) {
        const errorMessage = getBrowserExtensionErrorMessage(error?.message || error);
        notify.error(errorMessage || "One-click qua browser extension thất bại.");
      } finally {
        setBusyAction("");
      }
      return;
    }

    let clipboardText = "";
    try {
      clipboardText = await navigator.clipboard.readText();
    } catch {
      handleOpenWebConnect();
      notify.warning("Trình duyệt không cho đọc clipboard. Tôi đã mở luồng Kết nối qua Web để anh/chị dán dữ liệu.");
      return;
    }

    const rawClipboard = clipboardText.trim();
    if (!rawClipboard) {
      handleOpenWebConnect();
      notify.warning("Clipboard đang trống. Tôi đã mở luồng Kết nối qua Web để anh/chị dán dữ liệu capture.");
      return;
    }

    const clipboardLooksLikeCurl = looksLikeChatgptWebCurl(rawClipboard);

    try {
      if (clipboardLooksLikeCurl) {
        await importCaptureFromCurl(rawClipboard, {
          action: "web-auto-connect",
          closeCurlModal: false,
          clearCurlInput: true,
        });
      } else {
        await importCapturedToken(rawClipboard, {
          action: "web-auto-connect",
          closeWebConnectModal: false,
          clearTokenInput: true,
        });
      }
      notify.success("ChatGPT Web đã tự kết nối từ clipboard.");
    } catch (error) {
      if (clipboardLooksLikeCurl) {
        setCurlInput(rawClipboard);
        setShowCurlModal(true);
      } else {
        setTokenInput(rawClipboard);
        setShowWebConnectModal(true);
      }
      notify.error(error.message || "Không thể tự kết nối từ clipboard.");
    }
  };

  const handleValidate = async () => {
    setAutoStatus("validating");
    try {
      await validateSession({ action: "validate" });
      setAutoStatus(autoConnectEnabled ? "ready" : "disabled");
    } catch {
      setAutoStatus("failed");
    }
  };

  const handleRunAutoConnect = async () => {
    if (!isElectron) {
      notify.warning("Tự kết nối chỉ khả dụng trong ứng dụng desktop.");
      return;
    }

    setAutoConnectEnabled(true);
    autoPausedRef.current = false;
    resetAutoAttempts();

    try {
      if (!session) {
        setAutoStatus("connecting");
        await connectViaElectron({ action: "auto-connect", silent: true });
        setAutoStatus("ready");
        notify.success("Auto-connect đã kết nối lại ChatGPT Web.");
        return;
      }

      if (session.status === "captured") {
        setAutoStatus("validating");
        try {
          await validateSession({ action: "auto-validate", silent: true });
          setAutoStatus("ready");
          notify.success("Auto-connect đã validate session ChatGPT Web.");
        } catch (error) {
          setAutoStatus("reconnecting");
          try {
            await connectViaElectron({ action: "auto-reconnect", silent: true });
            setAutoStatus("ready");
            notify.success("Auto-connect đã bắt lại session ChatGPT Web.");
          } catch (reconnectError) {
            setAutoStatus("failed");
            notify.error(reconnectError.message || error.message || "Tự reconnect ChatGPT Web thất bại.");
          }
        }
        return;
      }

      if (session.status === "expired" || session.status === "error") {
        setAutoStatus("validating");
        try {
          await validateSession({ action: "auto-validate", silent: true });
          setAutoStatus("ready");
          notify.success("Auto-connect đã phục hồi session ChatGPT Web.");
        } catch (error) {
          setAutoStatus("reconnecting");
          try {
            await connectViaElectron({ action: "auto-reconnect", silent: true });
            setAutoStatus("ready");
            notify.success("Auto-connect đã bắt lại session ChatGPT Web.");
          } catch (reconnectError) {
            setAutoStatus("failed");
            notify.error(reconnectError.message || error.message || "Tự reconnect ChatGPT Web thất bại.");
          }
        }
        return;
      }

      setAutoStatus("ready");
      notify.success("Session ChatGPT Web đang sẵn sàng.");
    } catch (error) {
      setAutoStatus("failed");
      notify.error(error.message || "Auto-connect ChatGPT Web thất bại.");
    }
  };

  const handleDisconnect = async () => {
    setBusyAction("disconnect");
    try {
      const response = await fetch("/api/chatgpt-web/session", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      if (window.electronAPI?.chatgptWebClearSession) {
        await window.electronAPI.chatgptWebClearSession().catch(() => {});
      }

      autoPausedRef.current = true;
      resetAutoAttempts();
      setAutoStatus(autoConnectEnabled ? "paused" : "disabled");
      setSelectedModel("");
      setTestOutput("");
      setAttachments([]);
      await refreshAllState();
      notify.success("ChatGPT Web bridge disconnected");
    } catch (error) {
      notify.error(error.message || "Failed to disconnect ChatGPT Web bridge");
    } finally {
      setBusyAction("");
    }
  };

  // ── Auto-connect state machine (Electron only) ──
  useEffect(() => {
    if (!isElectron) {
      setAutoStatus("idle");
      return;
    }

    if (!autoConnectHydrated) {
      return;
    }

    if (!autoConnectEnabled) {
      setAutoStatus("disabled");
      return;
    }

    if (loading || sessionBusy) {
      return;
    }

    if (autoPausedRef.current) {
      setAutoStatus("paused");
      return;
    }

    if (!session) {
      if (autoConnectAttemptedRef.current) {
        return;
      }

      autoConnectAttemptedRef.current = true;
      setAutoStatus("connecting");
      void connectViaElectron({ action: "auto-connect", silent: true })
        .then(() => {
          setAutoStatus("ready");
        })
        .catch((error) => {
          setAutoStatus("failed");
          notify.error(error.message || "Tự kết nối ChatGPT Web thất bại.");
        });
      return;
    }

    autoConnectAttemptedRef.current = false;

    if (session.status === "active") {
      setAutoStatus("ready");
      return;
    }

    if (session.status === "captured") {
      const attemptKey = getSessionAttemptKey(session, "captured");
      if (autoValidateAttemptedRef.current === attemptKey) {
        return;
      }

      autoValidateAttemptedRef.current = attemptKey;
      setAutoStatus("validating");
      void validateSession({ action: "auto-validate", silent: true })
        .then(() => {
          setAutoStatus("ready");
        })
        .catch((error) => {
          if (autoReconnectAttemptedRef.current === attemptKey) {
            setAutoStatus("failed");
            notify.error(error.message || "Tự validate ChatGPT Web thất bại.");
            return;
          }

          autoReconnectAttemptedRef.current = attemptKey;
          setAutoStatus("reconnecting");
          void connectViaElectron({ action: "auto-reconnect", silent: true })
            .then(() => {
              setAutoStatus("ready");
            })
            .catch((reconnectError) => {
              setAutoStatus("failed");
              notify.error(reconnectError.message || error.message || "Tự reconnect ChatGPT Web thất bại.");
            });
        });
      return;
    }

    if (session.status === "expired" || session.status === "error") {
      const attemptKey = getSessionAttemptKey(session, "recover");
      if (autoRecoverAttemptedRef.current === attemptKey) {
        return;
      }

      autoRecoverAttemptedRef.current = attemptKey;
      setAutoStatus("validating");
      void (async () => {
        try {
          await validateSession({ action: "auto-validate", silent: true });
          setAutoStatus("ready");
        } catch (error) {
          if (autoReconnectAttemptedRef.current === attemptKey) {
            setAutoStatus("failed");
            notify.error(error.message || "Tự phục hồi ChatGPT Web thất bại.");
            return;
          }

          autoReconnectAttemptedRef.current = attemptKey;
          setAutoStatus("reconnecting");
          try {
            await connectViaElectron({ action: "auto-reconnect", silent: true });
            setAutoStatus("ready");
          } catch (reconnectError) {
            setAutoStatus("failed");
            notify.error(reconnectError.message || error.message || "Tự reconnect ChatGPT Web thất bại.");
          }
        }
      })();
      return;
    }

    setAutoStatus("idle");
  }, [autoConnectEnabled, autoConnectHydrated, connectViaElectron, isElectron, loading, notify, session, sessionBusy, validateSession]);

  const handleAddImageFiles = useCallback(async (fileList) => {
    const createdAttachments = await createAttachmentsFromFileList(fileList, attachments);
    const invalidFile = createdAttachments.find((attachment) => attachment.kind !== "image");
    if (invalidFile) {
      throw new Error(`"${invalidFile.name}" không phải là ảnh hợp lệ.`);
    }

    setAttachments((current) => current.concat(createdAttachments));
  }, [attachments]);

  const handleAddGeneralFiles = useCallback(async (fileList) => {
    const createdAttachments = await createAttachmentsFromFileList(fileList, attachments);
    setAttachments((current) => current.concat(createdAttachments));
  }, [attachments]);

  const handleAddConversationAttachment = useCallback(async ({ title, content }) => {
    if (attachments.length >= WEB_BRIDGE_MAX_ATTACHMENTS) {
      throw new Error(`Chỉ được đính kèm tối đa ${WEB_BRIDGE_MAX_ATTACHMENTS} mục mỗi lần gửi.`);
    }

    const attachment = createConversationAttachment({ title, content });
    setAttachments((current) => current.concat(attachment));
  }, [attachments]);

  const handleRemoveAttachment = useCallback((attachmentId) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const handleRunTest = async () => {
    setBusyAction("test");
    setTestOutput("");

    try {
      // ── Browser Inject Mode: gửi prompt tới extension → content script inject vào ChatGPT tab ──
      if (bridgeMode === "inject" && testMode === "prompt") {
        const taskId = `inject-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const startTime = Date.now();

        const result = await requestBrowserExtension("INJECT_PROMPT", {
          provider: "chatgpt-web",
          prompt: prompt.trim(),
          taskId,
        }, 10_000);

        if (!result?.ok) {
          throw new Error(result?.error || "Inject failed — extension không phản hồi.");
        }

        // Response sẽ được xử lý qua event listener (INJECT_DELTA / INJECT_DONE / INJECT_ERROR)
        return;
      }

      const rawRequestBody = buildWebBridgeRunTestRequestBody({
        mode: testMode,
        rawPayload,
        prompt,
        attachments,
        model: selectedModel,
        stream,
      });
      const useWsTransport = testMode !== "raw" || shouldUseWebBridgeWs(rawRequestBody);

      if (useWsTransport) {
        const requestBody = testMode === "raw"
          ? rawRequestBody
          : {
            ...rawRequestBody,
            model: ensureWebBridgeModel(rawRequestBody.model, "chatgpt-web"),
          };

        const result = await runWebBridgeWsRequest({
          requestBody,
          bootstrap,
          origin,
          onOutput: (nextOutput) => {
            setTestOutput(nextOutput);
          },
        });

        if (!stream) {
          setTestOutput(
            result?.output
            || result?.payload?.choices?.[0]?.message?.content
            || JSON.stringify(result?.payload || {}, null, 2),
          );
        }
      } else {
        const response = await fetch("/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rawRequestBody),
        });

        if (!response.ok) {
          throw new Error(await parseErrorResponse(response));
        }

        if (!stream) {
          const payload = await response.json();
          setTestOutput(
            payload?.choices?.[0]?.message?.content
            || JSON.stringify(payload, null, 2),
          );
          if (testMode === "prompt") {
            setAttachments([]);
          }
          await refreshSessionState().catch(() => {});
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let output = "";

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split("\n\n");
          buffer = messages.pop() || "";

          for (const rawMessage of messages) {
            const line = rawMessage
              .split("\n")
              .find((entry) => entry.startsWith("data:"));
            if (!line) continue;

            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta?.content || "";
              if (delta) {
                output += delta;
                setTestOutput(output);
              }
            } catch {
            }
          }
        }
      }

      if (testMode === "prompt") {
        setAttachments([]);
      }
      await refreshSessionState().catch(() => {});
    } catch (error) {
      setTestOutput(error.message || "ChatGPT Web test failed");
      notify.error(error.message || "ChatGPT Web test failed");
    } finally {
      setBusyAction("");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[1.2fr_0.8fr] items-stretch">
        <ConnectionCard
          bridgeMode={bridgeMode}
          bridgeModeOptions={bridgeModeOptions}
          onBridgeModeChange={setBridgeMode}
          session={session}
          sessionBusy={sessionBusy}
          sessionStatusVariant={sessionStatusVariant}
          sessionStatusLabel={sessionStatusLabel}
          onConnect={handleConnect}
          onOpenWebConnect={handleOpenWebConnect}
          onWebAutoConnect={handleWebAutoConnect}
          onOpenCurlModal={() => setShowCurlModal(true)}
          onValidate={handleValidate}
          onDisconnect={handleDisconnect}
          onRunAutoConnect={handleRunAutoConnect}
          onToggleAutoConnect={handleToggleAutoConnect}
          connectBusy={connectBusy}
          webAutoConnectBusy={webAutoConnectBusy}
          validateBusy={validateBusy}
          autoConnectBusy={autoConnectBusy}
          busyAction={busyAction}
          browserExtensionAvailable={browserExtensionAvailable}
          webExtensionCaptureWaiting={webExtensionCaptureWaiting}
          autoConnectEnabled={autoConnectEnabled}
          autoStatusVariant={autoStatusVariant}
          autoStatusLabel={autoStatusLabel}
          autoStatusDescription={autoStatusDescription}
          captureMode={captureMode}
          captureModeVariant={captureModeVariant}
          captureModeLabel={captureModeLabel}
          isElectron={isElectron}
        />

        <SessionStatusCard
          session={session}
          sessionBusy={sessionBusy}
          historySyncEnabled={historySyncEnabled}
          sessionModeEnabled={sessionModeEnabled}
          rotationDraft={rotationDraft}
          onRotationDraftChange={setRotationDraft}
          updateConversationSettings={updateConversationSettings}
          settingsBusy={settingsBusy}
          webHistoryStatusText={webHistoryStatusText}
          sessionConversationStatusText={sessionConversationStatusText}
        />
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[2fr_3fr]">
        <ApiUsageCard
          endpointUrl={endpointUrl}
          wsExample={wsExample}
          requireApiKey={bootstrap.requireApiKey}
          copied={copied}
          onCopyEndpoint={() => copy(endpointUrl, "chatgpt-web-endpoint")}
          onCopyExample={() => copy(wsExample, "chatgpt-web-curl")}
        />
        <TestPromptCard
          testMode={testMode}
          testModeOptions={testModeOptions}
          onTestModeChange={setTestMode}
          prompt={prompt}
          onPromptChange={setPrompt}
          rawPayload={rawPayload}
          onRawPayloadChange={setRawPayload}
          stream={stream}
          onStreamChange={setStream}
          selectedModel={selectedModel}
          onSelectedModelChange={setSelectedModel}
          availableModels={session?.availableModels}
          attachments={attachments}
          session={session}
          sessionBusy={sessionBusy}
          onAddImageFiles={handleAddImageFiles}
          onAddGeneralFiles={handleAddGeneralFiles}
          onAddConversationAttachment={handleAddConversationAttachment}
          onRemoveAttachment={handleRemoveAttachment}
          onAttachmentError={(error) => notify.error(error?.message || "Không thể thêm attachment.")}
          onRunTest={handleRunTest}
          canSubmitTest={canSubmitTest}
          busyAction={busyAction}
          bridgeMode={bridgeMode}
          testOutput={testOutput}
        />
      </div>
      <CurlImportModal
        isOpen={showCurlModal}
        onClose={() => setShowCurlModal(false)}
        curlInput={curlInput}
        onCurlInputChange={setCurlInput}
        onImportCurl={handleImportCurl}
        importDisabled={!curlInput.trim() || busyAction === "connect"}
      />
      <WebConnectModal
        isOpen={showWebConnectModal}
        onClose={handleCloseWebConnect}
        scriptCopied={scriptCopied}
        onCopyScript={handleCopyWebScript}
        tokenInput={tokenInput}
        onTokenInputChange={setTokenInput}
        onImportToken={handleImportToken}
        onWebAutoConnect={handleWebAutoConnect}
        webAutoConnectBusy={webAutoConnectBusy}
        webConnectBusy={webConnectBusy}
        sessionBusy={sessionBusy}
      />
    </div>
  );
}
