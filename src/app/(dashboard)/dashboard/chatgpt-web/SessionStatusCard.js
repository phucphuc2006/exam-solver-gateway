// ── ChatGPT Web — Session Status Card ──
"use client";

import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import Input from "@/shared/components/Input";
import Toggle from "@/shared/components/Toggle";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";
import { coerceNonNegativeInteger } from "./chatgptWebUtils";

/**
 * Session Status card: user-agent, available models, conversation controls
 * (history sync, session mode, rotation interval), and status texts.
 */
export default function SessionStatusCard({
  session,
  sessionBusy,
  // ── Conversation controls ──
  historySyncEnabled,
  sessionModeEnabled,
  rotationDraft,
  onRotationDraftChange,
  updateConversationSettings,
  settingsBusy,
  // ── Status texts ──
  webHistoryStatusText,
  sessionConversationStatusText,
}) {
  const { t } = useRuntimeLocale();

  return (
    <Card className="min-w-0 space-y-5 overflow-hidden">
      <div>
        <h2 className="text-lg font-semibold">{t("Session status")}</h2>
        <p className="text-sm text-text-muted">
          {t("The bridge never exposes raw cookies or raw captured headers through the dashboard API.")}
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("User-Agent")}</p>
          <p
            className="rounded-lg bg-black/5 px-3 py-2 text-xs font-mono text-text-muted break-all dark:bg-white/5"
            style={{ overflowWrap: "anywhere" }}
          >
            {session?.userAgent || "—"}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Available models")}</p>
            <Badge size="sm">{session?.availableModelCount ?? 0}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {session?.availableModels?.length ? (
              session.availableModels.map((model) => (
                <Badge key={model.id} variant="primary" size="sm">
                  {model.name || model.id}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-text-muted">{t("No models discovered yet. Run validation again after reconnecting.")}</p>
            )}
          </div>
        </div>
      </div>

      <Card.Section className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Conversation controls")}</p>
          <p className="text-sm text-text-muted">
            {t("Điều khiển việc lịch sử có xuất hiện trên ChatGPT Web hay không, có giữ session hội thoại hay không, và khi nào phải xoay sang conversation mới.")}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-black/5 bg-black/[0.02] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
            <Toggle
              checked={historySyncEnabled}
              onChange={(value) => updateConversationSettings({ historySyncEnabled: value })}
              disabled={!session || sessionBusy}
              label={t("Lịch sử web")}
              description={t("Bật để request mới xuất hiện trong lịch sử ChatGPT Web thường.")}
            />
          </div>

          <div className="rounded-lg border border-black/5 bg-black/[0.02] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
            <Toggle
              checked={sessionModeEnabled}
              onChange={(value) => updateConversationSettings({ sessionModeEnabled: value })}
              disabled={!session || sessionBusy}
              label={t("Session hội thoại")}
              description={t("Bật để các lần gửi tiếp theo nối tiếp cùng conversation hiện tại.")}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col rounded-lg border border-black/5 bg-black/[0.02] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="space-y-2 flex-1">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t("Xoay conversation sau N lượt")}</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={rotationDraft}
                    onChange={(event) => onRotationDraftChange(event.target.value)}
                    disabled={!session || !sessionModeEnabled || sessionBusy}
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => updateConversationSettings({
                      conversationRotationInterval: coerceNonNegativeInteger(rotationDraft, 0),
                    })}
                    disabled={!session || !sessionModeEnabled || sessionBusy}
                    loading={settingsBusy}
                  >
                    {t("Lưu")}
                  </Button>
                </div>
                <p className="text-xs text-text-muted">
                  {t("Đặt 0 để tắt. Ví dụ 3 nghĩa là sau 3 câu trả lời thì lần gửi kế tiếp sẽ mở conversation mới.")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col space-y-3 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Lịch sử web")}</p>
              <p className="text-sm text-text-main">{t(webHistoryStatusText)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Trạng thái session")}</p>
              <p className="text-sm text-text-main">{t(sessionConversationStatusText)}</p>
            </div>
          </div>
        </div>
      </Card.Section>
    </Card>
  );
}
