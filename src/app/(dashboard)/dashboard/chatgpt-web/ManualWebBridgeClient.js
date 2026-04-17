"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "@/shared/components/Badge";
import Card from "@/shared/components/Card";
import SegmentedControl from "@/shared/components/SegmentedControl";
import { CardSkeleton } from "@/shared/components/Loading";
import { useNotificationStore } from "@/store/notificationStore";
import { coerceNonNegativeInteger, parseErrorResponse } from "./chatgptWebUtils";
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
import {
  readWebBridgeMetricsFromHeaders,
  statusVariant,
  statusLabel,
} from "./manualWebBridgeUtils";
import {
  getCachedInitialPageLoad,
  BOOTSTRAP_CACHE_KEY,
  readStickyExtensionAvailability,
} from "./manualWebBridgeCache";
import { useBridgeMode } from "./hooks/useBridgeMode";
import { useExtensionBridge } from "./hooks/useExtensionBridge";
import { useInjectMode } from "./hooks/useInjectMode";
import { useSessionActions } from "./hooks/useSessionActions";
import DirectModePanel from "./panels/DirectModePanel";
import InjectModePanel from "./panels/InjectModePanel";
import BridgeTestCard from "./cards/BridgeTestCard";

const WebBridgeAttachmentComposer = dynamic(() => import("./WebBridgeAttachmentComposer"), {
  ssr: false,
});


export default function ManualWebBridgeClient({ config }) {
  // ── Core state ──
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [bootstrap, setBootstrap] = useState({
    requireApiKey: false,
    keys: [],
    tunnel: { enabled: false, publicUrl: "" },
    webBridge: { wsUrl: "", protocols: [] },
  });
  const [origin, setOrigin] = useState("");
  const [prompt, setPrompt] = useState(config.defaultPrompt || "");
  const [selectedModel, setSelectedModel] = useState(config.defaultModel || "");
  const [stream, setStream] = useState(false);
  const [useExtensionCapture, setUseExtensionCapture] = useState(false);
  const [testMode, setTestMode] = useState("prompt");
  const [rawPayload, setRawPayload] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [testMetrics, setTestMetrics] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [psid, setPsid] = useState("");
  const [psidts, setPsidts] = useState("");
  const [cookieHeader, setCookieHeader] = useState("");
  const [rotationDraft, setRotationDraft] = useState("0");

  const isElectron = typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent || "");

  // ── Hooks ──
  const {
    browserExtensionAvailable,
    markBrowserExtensionAvailable,
    requestBrowserExtension,
  } = useExtensionBridge({ isElectron });

  const {
    bridgeMode,
    browserInjectMode,
    setBridgeMode,
    bridgeModeOptions,
  } = useBridgeMode(config);

  // ── Data loading ──
  const loadData = useCallback(async ({ preferCache = false } = {}) => {
    setLoading(true);
    try {
      const sessionResult = await getCachedInitialPageLoad(
        `manual:${config.providerKey}`,
        async () => {
          const response = await fetch(`/api/${config.providerKey}/session`, { cache: "no-store" });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload?.error || `Failed to load ${config.title}`);
          }

          return {
            session: payload.session || null,
          };
        },
        { preferCache },
      );

      setSession(sessionResult.session);
      setSelectedModel((current) => current || sessionResult.session?.availableModels?.[0] || config.defaultModel || "");
      setLoading(false);

      void getCachedInitialPageLoad(
        BOOTSTRAP_CACHE_KEY,
        async () => {
          const response = await fetch("/api/endpoint/bootstrap", { cache: "no-store" });
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error || "Failed to load endpoint bootstrap");
          }

          return normalizeWebBridgeBootstrap(payload);
        },
        { preferCache: true },
      )
        .then((nextBootstrap) => {
          setBootstrap(nextBootstrap);
        })
        .catch(() => {});
    } catch (error) {
      useNotificationStore.getState().error(error.message || `Failed to load ${config.title}`);
    } finally {
      setLoading(false);
    }
  }, [config.defaultModel, config.providerKey, config.title]);

  const refreshSessionState = useCallback(async () => {
    const response = await fetch(`/api/${config.providerKey}/session`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Failed to refresh ${config.title}`);
    }

    const nextSession = payload?.session || null;
    setSession(nextSession);
    return nextSession;
  }, [config.providerKey, config.title]);

  // ── Derived state ──
  const historySyncEnabled = session?.historySyncEnabled === true;
  const sessionModeEnabled = session?.sessionModeEnabled === true;
  const conversationRotationInterval = coerceNonNegativeInteger(session?.conversationRotationInterval, 0);
  const conversationTurnCount = coerceNonNegativeInteger(session?.conversationTurnCount, 0);
  const conversationWillRotateNext = sessionModeEnabled
    && conversationRotationInterval > 0
    && conversationTurnCount >= conversationRotationInterval;
  const webHistoryStatusText = historySyncEnabled
    ? "Bật: tin nhắn mới sẽ được bridge ghi vào lịch sử web nếu upstream hỗ trợ."
    : sessionModeEnabled
      ? "Tắt: bridge ưu tiên không ghi lịch sử web nhưng vẫn giữ mạch trong session hiện tại."
      : "Tắt: bridge ưu tiên không ghi lịch sử web và mỗi lần gửi sẽ tách conversation mới.";
  const sessionStatusText = !sessionModeEnabled
    ? "Session đang tắt: mỗi lần gửi sẽ mở conversation mới."
    : conversationWillRotateNext
      ? "Session đang bật: lần gửi tiếp theo sẽ xoay sang conversation mới."
      : conversationRotationInterval > 0
        ? `Session đang bật: hiện ở ${conversationTurnCount}/${conversationRotationInterval} lượt của conversation này.`
        : "Session đang bật: các lần gửi tiếp theo sẽ nối tiếp cùng conversation hiện tại.";

  // ── Session actions hook ──
  const {
    busyAction,
    setBusyAction,
    autoConnectBusy,
    connectBusy,
    validateBusy,
    disconnectBusy,
    settingsBusy,
    testBusy,
    updateConversationSettings,
    handleConnect,
    handleValidate,
    handleAutoConnect,
    handleDisconnect,
    notify,
  } = useSessionActions({
    config,
    setSession,
    setTestOutput,
    setTestMetrics,
    setAttachments,
    setPsid,
    setPsidts,
    setCookieHeader,
    loadData,
    markBrowserExtensionAvailable,
    requestBrowserExtension,
    psid,
    psidts,
    cookieHeader,
    historySyncEnabled,
    sessionModeEnabled,
    conversationRotationInterval,
    useExtensionCapture,
  });

  // ── Inject mode hook ──
  const { injectReady, injectTaskIdRef } = useInjectMode({
    browserInjectMode,
    browserExtensionAvailable,
    requestBrowserExtension,
    config,
    origin,
    setTestOutput,
    setTestMetrics,
    setBusyAction,
  });

  // ── Init effects ──
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    void loadData({ preferCache: true });
  }, [loadData]);

  useEffect(() => {
    setRotationDraft(String(coerceNonNegativeInteger(session?.conversationRotationInterval, 0)));
  }, [session?.conversationRotationInterval]);

  // ── Memos ──
  const availableModels = useMemo(() => (
    Array.isArray(session?.availableModels) && session.availableModels.length > 0
      ? session.availableModels
      : config.models || []
  ), [config.models, session?.availableModels]);

  const endpointUrl = useMemo(() => {
    return getWebBridgePublicEndpointUrl({ bootstrap, origin });
  }, [bootstrap, origin]);

  const wsExample = useMemo(() => {
    const exampleModel = ensureWebBridgeModel(
      selectedModel || availableModels[0] || config.defaultModel || "auto",
      config.providerKey,
    );

    return buildWebBridgeWsCliExample({
      endpointUrl,
      requireApiKey: bootstrap.requireApiKey,
      apiKey: bootstrap.keys?.[0]?.key || "",
      exampleModel,
      stream,
      promptText: `Hello from the ${config.title} bridge`,
    });
  }, [availableModels, bootstrap.keys, bootstrap.requireApiKey, config.defaultModel, config.providerKey, config.title, endpointUrl, selectedModel, stream]);

  const testModeOptions = useMemo(() => ([
    { value: "prompt", label: "Prompt thường", icon: "chat" },
    { value: "raw", label: "Raw JSON", icon: "data_object" },
  ]), []);

  const supportsImageAttachments = config.supportsImageAttachments === true;
  const supportsFileAttachments = config.supportsFileAttachments === true;
  const supportsConversationAttachments = config.supportsConversationAttachments === true;
  const canSubmitTest = hasWebBridgeRunTestInput({
    mode: testMode,
    rawPayload,
    prompt,
    attachments,
  });

  // ── Attachment handlers ──
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

  // ── Test runner ──
  const handleRunTest = async () => {
    setBusyAction("test");
    setTestOutput("");
    setTestMetrics(null);

    try {
      // ── Browser Inject Mode ──
      if ((bridgeMode === "inject" || browserInjectMode) && testMode === "prompt") {
        const taskId = `inject-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        injectTaskIdRef.current = taskId;
        const startTime = Date.now();
        setTestMetrics({ _startTime: startTime });

        const result = await requestBrowserExtension("INJECT_PROMPT", {
          provider: config.providerKey,
          prompt: prompt.trim(),
          taskId,
        }, 10_000);

        if (!result?.ok) {
          throw new Error(result?.error || "Inject failed — extension không phản hồi.");
        }

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
            model: ensureWebBridgeModel(rawRequestBody.model, config.providerKey),
          };

        const result = await runWebBridgeWsRequest({
          requestBody,
          bootstrap,
          origin,
          onOutput: (nextOutput) => {
            setTestOutput(nextOutput);
          },
          onMetrics: (nextMetrics) => {
            setTestMetrics((current) => ({ ...(current || {}), ...(nextMetrics || {}) }));
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

        const headerMetrics = readWebBridgeMetricsFromHeaders(response.headers);
        if (headerMetrics) {
          setTestMetrics((current) => ({ ...(current || {}), ...headerMetrics }));
        }

        if (!stream) {
          const payload = await response.json();
          setTestOutput(payload?.choices?.[0]?.message?.content || JSON.stringify(payload, null, 2));
        } else {
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
              const eventType = rawMessage
                .split("\n")
                .find((entry) => entry.startsWith("event:"))
                ?.slice(6)
                .trim()
                || "message";
              const dataLines = rawMessage
                .split("\n")
                .filter((entry) => entry.startsWith("data:"))
                .map((entry) => entry.slice(5).trim());
              if (dataLines.length === 0) continue;

              const payload = dataLines.join("\n").trim();
              if (!payload || payload === "[DONE]") continue;

              try {
                if (eventType === "bridge_metrics") {
                  setTestMetrics(JSON.parse(payload));
                  continue;
                }

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
      }

      if (testMode === "prompt") {
        setAttachments([]);
      }
      if (config.supportsHistorySync) {
        await refreshSessionState().catch(() => {});
      }
    } catch (error) {
      setTestOutput(error.message || `${config.title} test failed`);
      notify.error(error.message || `${config.title} test failed`);
    } finally {
      setBusyAction("");
    }
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text-main">{config.title}</h2>
            {bridgeMode === "direct" ? (
              <Badge variant={statusVariant(session?.status)} dot size="sm">
                {statusLabel(session?.status)}
              </Badge>
            ) : (
              <Badge variant={injectReady ? "success" : "warning"} dot size="sm">
                {injectReady ? "Inject sẵn sàng" : "Inject chưa sẵn sàng"}
              </Badge>
            )}
          </div>
          <Badge variant={browserExtensionAvailable ? "success" : "warning"} size="sm">
            {browserExtensionAvailable ? "Extension ✓" : "No extension"}
          </Badge>
        </div>

        <SegmentedControl
          options={bridgeModeOptions}
          value={bridgeMode}
          onChange={setBridgeMode}
          size="sm"
        />

        {bridgeMode === "direct" && (
          <DirectModePanel
            config={config}
            session={session}
            isElectron={isElectron}
            availableModels={availableModels}
            endpointUrl={endpointUrl}
            wsExample={wsExample}
            onAutoConnect={handleAutoConnect}
            onValidate={handleValidate}
            onDisconnect={handleDisconnect}
            onConnect={handleConnect}
            updateConversationSettings={updateConversationSettings}
            useExtensionCapture={useExtensionCapture}
            setUseExtensionCapture={setUseExtensionCapture}
            psid={psid} setPsid={setPsid}
            psidts={psidts} setPsidts={setPsidts}
            cookieHeader={cookieHeader} setCookieHeader={setCookieHeader}
            rotationDraft={rotationDraft} setRotationDraft={setRotationDraft}
            autoConnectBusy={autoConnectBusy}
            validateBusy={validateBusy}
            disconnectBusy={disconnectBusy}
            connectBusy={connectBusy}
            settingsBusy={settingsBusy}
            busyAction={busyAction}
            historySyncEnabled={historySyncEnabled}
            sessionModeEnabled={sessionModeEnabled}
            webHistoryStatusText={webHistoryStatusText}
            sessionStatusText={sessionStatusText}
          />
        )}

        {bridgeMode === "inject" && (
          <InjectModePanel
            config={config}
            browserExtensionAvailable={browserExtensionAvailable}
            injectReady={injectReady}
          />
        )}
      </Card>

      <BridgeTestCard
        config={config}
        bridgeMode={bridgeMode}
        stream={stream} setStream={setStream}
        testModeOptions={testModeOptions}
        testMode={testMode} setTestMode={setTestMode}
        rawPayload={rawPayload} setRawPayload={setRawPayload}
        prompt={prompt} setPrompt={setPrompt}
        attachments={attachments}
        session={session}
        busyAction={busyAction} testBusy={testBusy}
        supportsImageAttachments={supportsImageAttachments}
        supportsFileAttachments={supportsFileAttachments}
        supportsConversationAttachments={supportsConversationAttachments}
        handleAddImageFiles={handleAddImageFiles}
        handleAddGeneralFiles={handleAddGeneralFiles}
        handleAddConversationAttachment={handleAddConversationAttachment}
        handleRemoveAttachment={handleRemoveAttachment}
        testMetrics={testMetrics}
        selectedModel={selectedModel} setSelectedModel={setSelectedModel}
        availableModels={availableModels}
        canSubmitTest={canSubmitTest} injectReady={injectReady}
        handleRunTest={handleRunTest} testOutput={testOutput} notify={notify}
      />
    </div>
  );
}
