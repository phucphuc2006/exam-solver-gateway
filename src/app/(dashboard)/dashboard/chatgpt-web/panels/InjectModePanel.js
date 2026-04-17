export default function InjectModePanel({
  config,
  browserExtensionAvailable,
  injectReady
}) {
  return (
    <div className="space-y-4 rounded-xl border border-black/5 bg-black/[0.01] p-4 dark:border-white/10 dark:bg-white/[0.01]">
      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg border px-4 py-3 ${browserExtensionAvailable ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
          <p className="text-[10px] uppercase tracking-widest text-text-muted">Extension</p>
          <p className={`mt-1 text-sm font-semibold ${browserExtensionAvailable ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {browserExtensionAvailable ? "✅ Đã kết nối" : "⚠️ Chưa sẵn sàng"}
          </p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${injectReady ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
          <p className="text-[10px] uppercase tracking-widest text-text-muted">Tab {config.title}</p>
          <p className={`mt-1 text-sm font-semibold ${injectReady ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {injectReady ? "✅ Tab đã sẵn sàng" : "⚠️ Chưa phát hiện tab"}
          </p>
        </div>
      </div>

      {/* Inject Info */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <strong>ℹ️ Chế độ Browser Inject:</strong> Khi API bên ngoài gọi, prompt sẽ được inject trực tiếp vào tab {config.title} đang mở trên trình duyệt. Response sẽ được scrape từ UI thật.
        </p>
      </div>

      {/* Help when not ready */}
      {!browserExtensionAvailable && (
        <div className="rounded-lg border border-black/5 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-xs text-text-muted">
            1. Cài extension NexusAI Web Bridge<br />
            2. Mở tab {config.title} và đăng nhập<br />
            3. Reload dashboard này
          </p>
        </div>
      )}

      {!injectReady && browserExtensionAvailable && (
        <div className="rounded-lg border border-black/5 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-xs text-text-muted">
            Extension đã sẵn sàng nhưng chưa phát hiện tab {config.title}. Hãy mở tab mới tới trang {config.title} và đợi content script inject.
          </p>
        </div>
      )}
    </div>
  );
}
