// ── ChatGPT Web — Test Prompt Card ──
"use client";

import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import SegmentedControl from "@/shared/components/SegmentedControl";
import Toggle from "@/shared/components/Toggle";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";
import { TestOutputPreview } from "./markdownRenderer";
import WebBridgeAttachmentComposer from "./WebBridgeAttachmentComposer";

/**
 * Test prompt card: lets users send a live request through the bridge.
 * Supports "normal" (prompt + model pick + attachments) and "raw" (JSON payload) modes.
 */
export default function TestPromptCard({
  // ── Test mode ──
  testMode,
  testModeOptions,
  onTestModeChange,
  // ── Prompt fields ──
  prompt,
  onPromptChange,
  rawPayload,
  onRawPayloadChange,
  // ── Stream ──
  stream,
  onStreamChange,
  // ── Model ──
  selectedModel,
  onSelectedModelChange,
  availableModels,
  // ── Attachments ──
  attachments,
  session,
  sessionBusy,
  onAddImageFiles,
  onAddGeneralFiles,
  onAddConversationAttachment,
  onRemoveAttachment,
  onAttachmentError,
  // ── Test action ──
  onRunTest,
  canSubmitTest,
  busyAction,
  bridgeMode,
  // ── Response ──
  testOutput,
}) {
  const { t } = useRuntimeLocale();

  return (
    <Card className="min-w-0 space-y-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("Test prompt box")}</h2>
          <p className="text-sm text-text-muted">
            {t("Run a live request against the bridge without leaving the dashboard.")}
          </p>
        </div>
        <Toggle
          checked={stream}
          onChange={onStreamChange}
          label={t("Stream")}
          disabled={testMode === "raw"}
        />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_320px] xl:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0 space-y-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-main">{t("Chế độ test")}</label>
            <SegmentedControl
              options={testModeOptions}
              value={testMode}
              onChange={onTestModeChange}
              size="sm"
            />
          </div>

          {testMode === "raw" ? (
            <>
              <label className="text-sm font-medium text-text-main">{t("Raw JSON payload")}</label>
              <textarea
                value={rawPayload}
                onChange={(event) => onRawPayloadChange(event.target.value)}
                className="min-h-[320px] w-full rounded-lg border border-black/10 bg-white px-3 py-2 font-mono text-sm text-text-main shadow-inner outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-white/5"
                placeholder={'{\n  "model": "chatgpt-web/auto",\n  "messages": [\n    {\n      "role": "system",\n      "content": "You are a personal assistant running inside OpenClaw..."\n    },\n    {\n      "role": "user",\n      "content": "alo"\n    }\n  ],\n  "stream": false\n}'}
              />
              <div className="rounded-lg border border-black/5 bg-black/[0.02] px-3 py-3 text-xs text-text-muted dark:border-white/10 dark:bg-white/[0.02]">
                {t("Raw JSON sẽ đi qua WebSocket bridge khi model là chatgpt-web/*, gemini-web/* hoặc grok-web/*; nếu không phải web bridge thì dashboard sẽ fallback về /api/v1/chat/completions như cũ. Bạn cũng có thể dán nguyên file web-bridge-last-request.json, hệ thống sẽ tự bóc rawRequestBody nếu phát hiện snapshot debug. Ở mode này, prompt, attachment, model picker và stream toggle không còn quyết định payload nữa.")}
              </div>
            </>
          ) : (
            <>
              <label className="text-sm font-medium text-text-main">{t("Prompt")}</label>
              <textarea
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                className="min-h-24 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-main shadow-inner outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-white/5"
              />
              <WebBridgeAttachmentComposer
                attachments={attachments}
                disabled={!session || sessionBusy}
                supportsImageAttachments
                supportsFileAttachments
                supportsConversationAttachments
                attachmentHelpText="GPT Bridge có thể gửi ảnh, tệp và transcript hội thoại. Sau khi gửi thành công, attachment sẽ tự được xoá khỏi test box để tránh gửi lặp."
                onAddImageFiles={onAddImageFiles}
                onAddGeneralFiles={onAddGeneralFiles}
                onAddConversationAttachment={onAddConversationAttachment}
                onRemoveAttachment={onRemoveAttachment}
                onAttachmentError={onAttachmentError}
              />
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-main">{t("Model")}</label>
              <select
                value={selectedModel}
                onChange={(event) => onSelectedModelChange(event.target.value)}
                disabled={testMode === "raw"}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-main outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-white/5"
              >
                {(availableModels?.length ? availableModels : [{ id: "gpt-5", name: "gpt-5" }]).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id}
                  </option>
                ))}
              </select>
            </div>
            <Button
              fullWidth
              icon="send"
              onClick={onRunTest}
              disabled={bridgeMode === "inject" ? (!canSubmitTest || busyAction === "test") : (!session || !canSubmitTest || sessionBusy)}
              loading={busyAction === "test"}
            >
              {t(bridgeMode === "inject" ? "🌐 Inject Test" : "Run test")}
            </Button>
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Response")}</p>
            </div>
            <div
              className="custom-scrollbar min-w-0 h-[calc(100vh-380px)] min-h-[250px] max-h-[500px] overflow-x-hidden overflow-y-auto rounded-xl border border-black/5 bg-black/5 p-4 pr-3 dark:border-white/5 dark:bg-white/5"
              style={{ scrollbarGutter: "stable" }}
            >
              <TestOutputPreview content={testOutput} emptyLabel={t("No response yet.")} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
