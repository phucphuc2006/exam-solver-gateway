// ── ChatGPT Web — Connection Card ──
"use client";

import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import SegmentedControl from "@/shared/components/SegmentedControl";
import Toggle from "@/shared/components/Toggle";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";
import { formatDate } from "./chatgptWebUtils";

/**
 * Connection card: bridge mode toggle, action buttons (connect, validate, disconnect),
 * extension status, auto-connect section, capture metadata, and inject-mode info.
 */
export default function ConnectionCard({
  // ── Bridge mode ──
  bridgeMode,
  bridgeModeOptions,
  onBridgeModeChange,
  // ── Session ──
  session,
  sessionBusy,
  sessionStatusVariant,
  sessionStatusLabel,
  // ── Action handlers ──
  onConnect,
  onOpenWebConnect,
  onWebAutoConnect,
  onOpenCurlModal,
  onValidate,
  onDisconnect,
  onRunAutoConnect,
  onToggleAutoConnect,
  // ── Busy states ──
  connectBusy,
  webAutoConnectBusy,
  validateBusy,
  autoConnectBusy,
  busyAction,
  // ── Extension ──
  browserExtensionAvailable,
  webExtensionCaptureWaiting,
  // ── Auto-connect ──
  autoConnectEnabled,
  autoStatusVariant,
  autoStatusLabel,
  autoStatusDescription,
  // ── Capture info ──
  captureMode,
  captureModeVariant,
  captureModeLabel,
  // ── Environment ──
  isElectron,
}) {
  const { t } = useRuntimeLocale();

  return (
    <Card className="min-w-0 space-y-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Connection card")}</h2>
          <p className="text-sm text-text-muted">
            {t(bridgeMode === "inject"
              ? "Route prompts through browser extension inject into ChatGPT tab."
              : "Capture a ChatGPT Web session from regular chat, then store and validate it locally."
            )}
          </p>
        </div>
        <Badge
          variant={bridgeMode === "inject" ? "primary" : sessionStatusVariant}
          dot
        >
          {t(bridgeMode === "inject" ? "Inject Mode" : sessionStatusLabel)}
        </Badge>
      </div>

      <SegmentedControl
        options={bridgeModeOptions}
        value={bridgeMode}
        onChange={onBridgeModeChange}
      />

      {bridgeMode === "direct" && (
        <>
          <div className="flex flex-wrap gap-3">
            {isElectron && (
              <Button
                icon="login"
                onClick={onConnect}
                loading={connectBusy}
                disabled={sessionBusy && !connectBusy}
              >
                {t(session ? "Reconnect via WebView" : "Connect via WebView")}
              </Button>
            )}
            <Button
              variant="primary"
              icon="language"
              onClick={onOpenWebConnect}
              disabled={sessionBusy}
            >
              {t("Kết nối qua Web")}
            </Button>
            {!isElectron && (
              <Button
                variant="secondary"
                icon="bolt"
                onClick={onWebAutoConnect}
                loading={webAutoConnectBusy}
                disabled={sessionBusy && !webAutoConnectBusy}
              >
                {t("Tự động kết nối")}
              </Button>
            )}
            <Button
              variant="secondary"
              icon="input"
              onClick={onOpenCurlModal}
              loading={connectBusy}
              disabled={sessionBusy && !connectBusy}
            >
              {t("Nhập cURL")}
            </Button>
            <Button
              variant="secondary"
              icon="verified"
              onClick={onValidate}
              disabled={!session || (sessionBusy && !validateBusy)}
              loading={validateBusy}
            >
              {t("Validate")}
            </Button>
            <Button
              variant="ghost"
              icon="delete"
              onClick={onDisconnect}
              disabled={!session || sessionBusy}
              loading={busyAction === "disconnect"}
            >
              {t("Disconnect")}
            </Button>
          </div>

          {!isElectron && (
            <Card.Section className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={webExtensionCaptureWaiting ? "primary" : browserExtensionAvailable ? "success" : "warning"}
                  size="sm"
                >
                  {t(
                    webExtensionCaptureWaiting
                      ? "Đang chờ request thật"
                      : browserExtensionAvailable
                        ? "Extension ready"
                        : "Extension missing",
                  )}
                </Badge>
                <p className="text-xs text-text-muted">
                  {t(
                    browserExtensionAvailable
                      ? webExtensionCaptureWaiting
                        ? "Extension đã arm capture cho chat thường. Nếu request chưa tự chạy, hãy gửi 1 tin nhắn ngắn trong tab ChatGPT."
                        : "Dashboard đã bắt được bridge của extension. Nút tự động kết nối sẽ chờ request conversation thật từ trình duyệt."
                      : "Cài extension để web tự bắt request chat thường thật của ChatGPT mà không cần dán tay."
                  )}
                </p>
              </div>
            </Card.Section>
          )}

          {!isElectron && webExtensionCaptureWaiting && (
            <Card.Section className="border-primary/20 bg-primary/5">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.18em] text-primary">{t("Extension capture")}</p>
                <p className="text-sm text-text-main">
                  {t("Đang chờ request conversation thật từ tab ChatGPT. Hãy gửi 1 tin nhắn ngắn trong chat thường nếu trang chưa tự tạo request mới.")}
                </p>
              </div>
            </Card.Section>
          )}

          {isElectron && (
            <Card.Section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Auto-connect")}</p>
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={autoConnectEnabled}
                    onChange={onToggleAutoConnect}
                    label={t("Tự động")}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="bolt"
                    onClick={onRunAutoConnect}
                    loading={autoConnectBusy}
                    disabled={sessionBusy && !autoConnectBusy}
                  >
                    {t("Chạy ngay")}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={autoStatusVariant} size="sm">{t(autoStatusLabel)}</Badge>
                <p className="text-xs text-text-muted">{t(autoStatusDescription)}</p>
              </div>
            </Card.Section>
          )}

          <Card.Section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Captured at")}</p>
              <p className="text-sm font-medium">{formatDate(session?.capturedAt)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Last validated")}</p>
              <p className="text-sm font-medium">{formatDate(session?.lastValidatedAt)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Cookies")}</p>
              <p className="text-sm font-medium">{session?.cookieCount ?? 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Captured headers")}</p>
              <p className="text-sm font-medium">{session?.headerKeys?.length ?? 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Request template")}</p>
              <p className="text-sm font-medium">{t(session?.hasCapturedRequestTemplate ? "Đã capture" : "Chưa có")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Capture source")}</p>
              <p className="text-sm font-medium">
                {session?.captureSource === "browser-extension"
                  ? t("Browser extension")
                  : session?.captureSource
                    ? session.captureSource
                    : "—"}
              </p>
            </div>
          </Card.Section>

          <Card.Section className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Captured route")}</p>
            <p
              className="rounded-lg bg-black/5 px-3 py-2 text-xs font-mono text-text-muted break-all dark:bg-white/5"
              style={{ overflowWrap: "anywhere" }}
            >
              {session?.capturedTargetPath || "—"}
            </p>
          </Card.Section>

          <Card.Section className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Capture mode")}</p>
            <div className="flex items-center gap-2">
              <Badge variant={captureModeVariant} size="sm">{t(captureModeLabel)}</Badge>
              <p className="text-xs text-text-muted">
                {t(
                  captureMode === "conversation"
                    ? "Bridge hiện đang dùng chat thường của ChatGPT."
                    : "Chưa xác định được mode từ dữ liệu capture hiện tại."
                )}
              </p>
            </div>
          </Card.Section>

          {captureMode === "conversation" && session && !session.hasCapturedRequestTemplate && (
            <Card.Section className="border-amber-500/20 bg-amber-500/5">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">{t("Replay template")}</p>
                <p className="text-sm text-amber-700 dark:text-amber-200">
                  {t("Session này chưa có request template từ web thật. Hãy disconnect rồi auto-connect lại bằng extension mới trước khi chạy test chat thường.")}
                </p>
              </div>
            </Card.Section>
          )}
        </>
      )}

      {bridgeMode === "inject" && (
        <>
          <Card.Section className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge
                variant={browserExtensionAvailable ? "success" : "warning"}
                size="sm"
              >
                {t(browserExtensionAvailable ? "Extension ✓" : "Extension ✗")}
              </Badge>
              <p className="text-xs text-text-muted">
                {t(browserExtensionAvailable
                  ? "Extension bridge đã kết nối. Prompts sẽ được inject trực tiếp vào tab ChatGPT."
                  : "Chưa phát hiện extension. Cài extension ChatGPT Web để sử dụng inject mode."
                )}
              </p>
            </div>
          </Card.Section>

          <Card.Section className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Inject info")}</p>
            <div className="space-y-2 text-sm text-text-muted">
              <p>{t("Inject mode gửi prompt trực tiếp vào tab ChatGPT đang mở qua extension, không cần capture session thủ công.")}</p>
              <p>{t("Đảm bảo: (1) Extension đã cài, (2) Tab ChatGPT đã đăng nhập, (3) Tab dashboard đã load.")}</p>
            </div>
          </Card.Section>

          <Card.Section className="border-primary/20 bg-primary/5">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-primary">{t("How it works")}</p>
              <p className="text-sm text-text-main">
                {t("Khi API bên ngoài gửi request, backend sẽ tạo inject task → extension nhận task → inject prompt vào ChatGPT tab → stream response về.")}
              </p>
            </div>
          </Card.Section>
        </>
      )}
    </Card>
  );
}
