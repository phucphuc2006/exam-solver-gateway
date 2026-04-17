import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import Toggle from "@/shared/components/Toggle";
import SegmentedControl from "@/shared/components/SegmentedControl";
import WebBridgeAttachmentComposer from "../WebBridgeAttachmentComposer";
import { formatTimingMs } from "../manualWebBridgeUtils";

function FieldTextarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-main outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/5"
    />
  );
}

export default function BridgeTestCard({
  config,
  bridgeMode,
  stream, setStream,
  testModeOptions, testMode, setTestMode,
  rawPayload, setRawPayload,
  prompt, setPrompt,
  attachments,
  session, busyAction, testBusy,
  supportsImageAttachments, supportsFileAttachments, supportsConversationAttachments,
  handleAddImageFiles, handleAddGeneralFiles, handleAddConversationAttachment, handleRemoveAttachment,
  testMetrics,
  selectedModel, setSelectedModel,
  availableModels,
  canSubmitTest, injectReady,
  handleRunTest, testOutput, notify
}) {
  return (
    <div className="space-y-4 rounded-xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-dark-paper">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-text-main">Test</h3>
          <Badge variant="info" size="sm">{config.betaLabel}</Badge>
          <Badge variant={bridgeMode === "inject" ? "warning" : "default"} size="sm">
            {bridgeMode === "inject" ? "via Inject" : "via API"}
          </Badge>
        </div>
        <Toggle checked={stream} onChange={setStream} label="Stream" disabled={testMode === "raw" || bridgeMode === "inject"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px] xl:grid-cols-[1.2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3">
          {bridgeMode === "direct" && (
            <SegmentedControl options={testModeOptions} value={testMode} onChange={setTestMode} size="sm" />
          )}

          {testMode === "raw" && bridgeMode === "direct" ? (
            <FieldTextarea
              value={rawPayload}
              onChange={setRawPayload}
              rows={10}
              placeholder={'{\n  "model": "gemini-web/gemini-3.1-pro",\n  "messages": [...],\n  "stream": false\n}'}
            />
          ) : (
            <>
              <FieldTextarea value={prompt} onChange={setPrompt} rows={3} placeholder={config.promptPlaceholder} />
              {bridgeMode === "direct" && (
                <WebBridgeAttachmentComposer
                  attachments={attachments}
                  disabled={!session || (busyAction !== "" && !testBusy)}
                  supportsImageAttachments={supportsImageAttachments}
                  supportsFileAttachments={supportsFileAttachments}
                  supportsConversationAttachments={supportsConversationAttachments}
                  attachmentHelpText={config.attachmentHelpText}
                  onAddImageFiles={handleAddImageFiles}
                  onAddGeneralFiles={handleAddGeneralFiles}
                  onAddConversationAttachment={handleAddConversationAttachment}
                  onRemoveAttachment={handleRemoveAttachment}
                  onAttachmentError={(error) => notify.error(error?.message || "Không thể thêm attachment.")}
                />
              )}
            </>
          )}

          {/* Timing metrics */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Upstream", value: formatTimingMs(testMetrics?.upstreamReadyMs) },
              { label: "1st byte", value: formatTimingMs(testMetrics?.firstByteMs) },
              { label: "1st delta", value: formatTimingMs(testMetrics?.firstDeltaMs) },
              { label: "Done", value: formatTimingMs(testMetrics?.completedMs) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-black/5 bg-black/[0.03] px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[10px] uppercase tracking-widest text-text-muted">{item.label}</p>
                <p className="text-sm font-medium text-text-main">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {bridgeMode === "direct" && (
            <Input
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              placeholder={config.defaultModel || "Model"}
              disabled={testMode === "raw"}
            />
          )}
          <Button
            fullWidth
            onClick={handleRunTest}
            loading={testBusy}
            disabled={
              bridgeMode === "direct"
                ? (!session || !canSubmitTest || (busyAction !== "" && !testBusy))
                : (!injectReady || !prompt.trim() || (busyAction !== "" && !testBusy))
            }
          >
            {bridgeMode === "inject" ? "🌐 Inject Test" : "Run test"}
          </Button>
          {bridgeMode === "direct" && testMode !== "raw" && availableModels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {availableModels.slice(0, 4).map((model) => (
                <button
                  key={model} type="button"
                  className="rounded-full border border-black/10 px-2.5 py-0.5 text-[11px] text-text-muted transition hover:border-primary/30 hover:text-text-main dark:border-white/10"
                  onClick={() => setSelectedModel(model)}
                >
                  {model}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-black/5 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-[10px] uppercase tracking-widest text-text-muted">Response</p>
            <pre
              className="custom-scrollbar h-[calc(100vh-380px)] min-h-[200px] max-h-[500px] overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-black/5 p-3 pr-2 text-sm text-text-main dark:bg-white/5"
              style={{ scrollbarGutter: "stable" }}
            >
              {testOutput || "—"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
