// ── ChatGPT Web — Web Connect Modal ──
"use client";

import Button from "@/shared/components/Button";
import Modal from "@/shared/components/Modal";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";

/**
 * Modal for connecting ChatGPT Web via browser capture flow.
 * Guides user through: (1) Open ChatGPT, (2) Run capture script, (3) Paste captured data.
 */
export default function WebConnectModal({
  isOpen,
  onClose,
  scriptCopied,
  onCopyScript,
  tokenInput,
  onTokenInputChange,
  onImportToken,
  onWebAutoConnect,
  webAutoConnectBusy,
  webConnectBusy,
  sessionBusy,
}) {
  const { t } = useRuntimeLocale();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("Kết nối qua trình duyệt Web")}
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <span className="text-lg font-bold text-emerald-500">1</span>
          <div className="space-y-2 flex-1">
            <p className="text-sm font-semibold">{t("Mở ChatGPT và đăng nhập")}</p>
            <p className="text-xs text-text-muted">{t("Đăng nhập tài khoản ChatGPT bình thường trong tab mới.")}</p>
            <Button
              variant="secondary"
              icon="open_in_new"
              onClick={() => window.open("https://chatgpt.com", "_blank")}
            >
              {t("Mở ChatGPT")}
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <span className="text-lg font-bold text-primary">2</span>
          <div className="space-y-2 flex-1">
            <p className="text-sm font-semibold">{t("Chạy script capture request thật")}</p>
            <p className="text-xs text-text-muted">{t("Script sẽ chờ request conversation của chat thường có Authorization Bearer, rồi copy toàn bộ headers cần thiết cùng cookie hiện tại.")}</p>
            <Button
              variant={scriptCopied ? "secondary" : "primary"}
              icon={scriptCopied ? "check" : "content_copy"}
              onClick={onCopyScript}
            >
              {t(scriptCopied ? "Đã copy script! ✓" : "Copy Script")}
            </Button>
            <div className="space-y-1.5 pt-1">
              <p className="text-xs text-text-muted">{t("Trên tab ChatGPT:")}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded bg-black/10 px-2 py-0.5 text-[11px] font-mono font-bold dark:bg-white/10">F12</span>
                <span className="text-text-muted">→</span>
                <span className="inline-flex items-center rounded bg-black/10 px-2 py-0.5 text-[11px] font-mono font-bold dark:bg-white/10">Console</span>
                <span className="text-text-muted">→</span>
                <span className="inline-flex items-center rounded bg-black/10 px-2 py-0.5 text-[11px] font-mono font-bold dark:bg-white/10">Ctrl+V</span>
                <span className="text-text-muted">→</span>
                <span className="inline-flex items-center rounded bg-black/10 px-2 py-0.5 text-[11px] font-mono font-bold dark:bg-white/10">Enter</span>
              </div>
              <p className="text-xs text-text-muted">{t("Sau khi bật script, hãy gửi 1 tin nhắn ngắn trong chat thường của ChatGPT. Khi bắt được request phù hợp, script sẽ tự copy dữ liệu.")}</p>
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t("Nếu gửi tin nhắn mà vẫn không có request conversation, thì tab này chưa tạo đúng request backend-api hoặc bạn đang nhìn nhầm tab Network.")}
                </p>
              </div>
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
                <p className="text-xs text-red-400">
                  <span className="font-bold">⚠</span>{" "}
                  {t("Nếu Chrome yêu cầu, gõ")}{" "}
                  <code className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[11px] dark:bg-white/10">allow pasting</code>
                  {" "}{t("rồi Enter trước.")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <span className="text-lg font-bold text-amber-500">3</span>
          <div className="space-y-3 flex-1">
            <p className="text-sm font-semibold">{t("Dán capture request thật vào đây")}</p>
            <p className="text-xs text-text-muted">{t("Hãy dán dữ liệu JSON do script capture copy ra hoặc request cURL thật của conversation. Dữ liệu cookie-only kiểu cũ không còn đủ để bridge chat thường hoạt động.")}</p>
            <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2">
              <p className="text-xs text-sky-700 dark:text-sky-300">
                {t("JSON hợp lệ tối thiểu phải có Authorization Bearer thật và route conversation của chat thường. Có thêm requestTemplate thì bridge sẽ replay sát web thật hơn nhiều.")}
              </p>
            </div>
            <textarea
              value={tokenInput}
              onChange={(e) => onTokenInputChange(e.target.value)}
              placeholder={"{\"headers\":{\"authorization\":\"Bearer ...\"},\"captureUrl\":\"https://chatgpt.com/backend-api/f/conversation\",\"capturedTargetPath\":\"/backend-api/f/conversation\",\"requestTemplate\":{\"action\":\"next\",\"messages\":[...]}}"}
              className="h-32 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-main font-mono outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-white/5"
            />
            <Button
              fullWidth
              variant="secondary"
              icon="bolt"
              onClick={onWebAutoConnect}
              loading={webAutoConnectBusy}
              disabled={sessionBusy && !webAutoConnectBusy}
            >
              {t("Lấy từ clipboard & kết nối")}
            </Button>
            <Button
              fullWidth
              icon="link"
              onClick={onImportToken}
              disabled={!tokenInput.trim()}
              loading={webConnectBusy}
            >
              {t("Kết nối")}
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t("Đóng")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
