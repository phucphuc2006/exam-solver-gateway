// ── ChatGPT Web — cURL Import Modal ──
"use client";

import Button from "@/shared/components/Button";
import Modal from "@/shared/components/Modal";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";

/**
 * Modal for importing a ChatGPT Web session from a cURL command.
 * User copies cURL from browser DevTools Network tab and pastes it here.
 */
export default function CurlImportModal({
  isOpen,
  onClose,
  curlInput,
  onCurlInputChange,
  onImportCurl,
  importDisabled,
}) {
  const { t } = useRuntimeLocale();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("Nhập cURL thủ công")}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          {t("Mở trình duyệt, truy cập ChatGPT, nhấn F12 rồi vào Network. Gửi 1 tin nhắn trong chat thường để tạo request conversation thật của ChatGPT. Bảo đảm request có Authorization Bearer thật, rồi chọn Copy -> Copy as cURL (bash) và dán vào đây.")}
        </p>
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("Nếu bạn đã gửi tin nhắn mà Network vẫn không có request conversation, hãy thử gửi lại trong đúng tab ChatGPT. Bridge chỉ dùng được session khi capture đúng request backend-api thật.")}
          </p>
        </div>
        <textarea
          value={curlInput}
          onChange={(e) => onCurlInputChange(e.target.value)}
          placeholder={"curl 'https://chatgpt.com/backend-api/...' -H 'cookie: ...' ..."}
          className="h-40 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-main shadow-inner outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-white/5"
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {t("Hủy")}
          </Button>
          <Button onClick={onImportCurl} disabled={importDisabled}>
            {t("Xác nhận")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
