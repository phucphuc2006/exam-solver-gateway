import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import Toggle from "@/shared/components/Toggle";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { formatTimingMs, shouldShowSessionLastError, statusVariant, statusLabel } from "../manualWebBridgeUtils";
import { formatDate } from "../manualWebBridgeCache";
import { coerceNonNegativeInteger } from "../chatgptWebUtils";

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

export default function DirectModePanel({
  config,
  session,
  isElectron,
  availableModels,
  endpointUrl,
  wsExample,
  // Actions
  onAutoConnect,
  onValidate,
  onDisconnect,
  onConnect,
  updateConversationSettings,
  // State 
  useExtensionCapture,
  setUseExtensionCapture,
  psid, setPsid,
  psidts, setPsidts,
  cookieHeader, setCookieHeader,
  rotationDraft, setRotationDraft,
  // Status flags
  autoConnectBusy,
  validateBusy,
  disconnectBusy,
  connectBusy,
  settingsBusy,
  busyAction,
  // Conversation controls
  historySyncEnabled,
  sessionModeEnabled,
  webHistoryStatusText,
  sessionStatusText,
}) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="space-y-4 rounded-xl border border-black/5 bg-black/[0.01] p-4 dark:border-white/10 dark:bg-white/[0.01]">
      {/* Quick Connect Row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={onAutoConnect}
          loading={autoConnectBusy}
          disabled={isElectron || (busyAction !== "" && !autoConnectBusy)}
        >
          {config.autoConnectButtonLabel || "⚡ Auto Connect"}
        </Button>
        <Button onClick={onValidate} loading={validateBusy} disabled={!session || (busyAction !== "" && !validateBusy)} variant="secondary">
          Validate
        </Button>
        <Button variant="ghost" onClick={onDisconnect} loading={disconnectBusy} disabled={!session || (busyAction !== "" && !disconnectBusy)}>
          Disconnect
        </Button>
        <Toggle
          checked={useExtensionCapture}
          onChange={setUseExtensionCapture}
          label="Extension capture"
        />
      </div>

      {/* Manual Connect (collapsible) */}
      <details className="group">
        <summary className="cursor-pointer select-none text-xs uppercase tracking-[0.18em] text-text-muted transition hover:text-text-main">
          {config.connectTitle || "Manual connect"} ▾
        </summary>
        <div className="mt-3 space-y-3">
          {config.connectMode === "gemini-tokens" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={psid} onChange={(event) => setPsid(event.target.value)} placeholder="__Secure-1PSID" />
              <Input value={psidts} onChange={(event) => setPsidts(event.target.value)} placeholder="__Secure-1PSIDTS" />
            </div>
          ) : (
            <FieldTextarea value={cookieHeader} onChange={setCookieHeader} rows={3} placeholder={config.cookiePlaceholder} />
          )}
          <Button onClick={onConnect} loading={connectBusy} disabled={busyAction !== "" && !connectBusy}>
            Kết nối
          </Button>
          {config.helpText ? (
            <p className="text-xs text-text-muted/70">{config.helpText}</p>
          ) : null}
        </div>
      </details>

      {/* Session Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Captured", value: formatDate(session?.capturedAt) },
          { label: "Validated", value: formatDate(session?.lastValidatedAt) },
          { label: "Cookies", value: session?.cookieCount ?? 0 },
          { label: "Models", value: availableModels.length },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-[10px] uppercase tracking-widest text-text-muted">{item.label}</p>
            <p className="mt-0.5 text-sm font-medium text-text-main">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Last Error */}
      {shouldShowSessionLastError(session) ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-xs font-medium text-red-500">Error: {session.lastError}</p>
          <p className="text-[10px] text-red-400">{formatDate(session.lastErrorAt)}</p>
        </div>
      ) : null}

      {/* Conversation Controls (collapsible) */}
      <details className="group">
        <summary className="cursor-pointer select-none text-xs uppercase tracking-[0.18em] text-text-muted transition hover:text-text-main">
          Conversation controls ▾
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              checked={historySyncEnabled}
              onChange={(value) => updateConversationSettings({ historySyncEnabled: value })}
              disabled={!session || busyAction !== ""}
              label="Lịch sử web"
            />
            <Toggle
              checked={sessionModeEnabled}
              onChange={(value) => updateConversationSettings({ sessionModeEnabled: value })}
              disabled={!session || busyAction !== ""}
              label="Session hội thoại"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="shrink-0 text-xs text-text-muted">Xoay sau</label>
            <Input
              type="number" min="0" step="1"
              value={rotationDraft}
              onChange={(event) => setRotationDraft(event.target.value)}
              disabled={!session || !sessionModeEnabled || busyAction !== ""}
              className="w-20"
            />
            <label className="shrink-0 text-xs text-text-muted">lượt</label>
            <Button
              variant="secondary" size="sm"
              onClick={() => updateConversationSettings({ conversationRotationInterval: coerceNonNegativeInteger(rotationDraft, 0) })}
              disabled={!session || !sessionModeEnabled || busyAction !== ""}
              loading={settingsBusy}
            >
              Lưu
            </Button>
          </div>
          <div className="flex gap-4 text-xs text-text-muted">
            <span>Web: <strong className="text-text-main">{webHistoryStatusText}</strong></span>
            <span>Session: <strong className="text-text-main">{sessionStatusText}</strong></span>
          </div>
        </div>
      </details>

      {/* API Endpoint */}
      <div className="space-y-3 rounded-lg border border-black/5 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-main">API Endpoint</h3>
          <Badge variant={config.bootstrap?.requireApiKey ? "warning" : "success"} size="sm">
            {config.bootstrap?.requireApiKey ? "Key required" : "Local"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Input value={endpointUrl} readOnly className="flex-1" inputClassName="font-mono text-xs" />
          <Button
            variant="secondary"
            icon={copied === `${config.providerKey}-endpoint` ? "check" : "content_copy"}
            onClick={() => copy(endpointUrl, `${config.providerKey}-endpoint`)}
          />
        </div>
        <details className="group">
          <summary className="cursor-pointer select-none text-xs uppercase tracking-[0.18em] text-text-muted transition hover:text-text-main">
            wscat example ▾
          </summary>
          <div className="mt-2 space-y-2">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/5 p-3 text-xs text-text-muted dark:bg-white/5">{wsExample}</pre>
            <Button variant="ghost" icon={copied === `${config.providerKey}-curl` ? "check" : "content_copy"} onClick={() => copy(wsExample, `${config.providerKey}-curl`)}>
              {copied === `${config.providerKey}-curl` ? "Copied!" : "Copy"}
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}
