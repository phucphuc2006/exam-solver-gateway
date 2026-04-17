"use client";

import ManualWebBridgeClient from "./ManualWebBridgeClient";

export default function GrokWebPageClient() {
  return (
    <ManualWebBridgeClient
      config={{
        providerKey: "grok-web",
        title: "Grok Web",
        description: "Bridge beta cho Grok Web thường bằng cookie session từ grok.com, tách riêng hoàn toàn khỏi ChatGPT Web.",
        autoConnectOriginLabel: "grok.com",
        autoConnectDescription: "Nếu extension đã cài, bấm nút rồi mở tab Grok chat thường và gửi 1 tin nhắn ngắn. NexusAI sẽ bắt request thật để lấy đúng cookie, header và template đang hoạt động.",
        connectMode: "cookie-header",
        connectTitle: "Cookie header / raw cookies",
        connectDescription: "Dán cookie header đầy đủ của grok.com hoặc chuỗi cookie thô lấy từ DevTools.",
        cookiePlaceholder: "sso=...; cf_clearance=...; ...",
        helpText: "Ưu tiên auto-connect bằng extension hoặc dán cookie lấy từ request chat thật trên grok.com. Grok đổi payload/cookie nội bộ khá thường xuyên, nên capture request thật ổn định hơn chỉ đọc cookie rời.",
        defaultPrompt: "Giải thích ngắn gọn vì sao bầu trời có màu xanh.",
        promptPlaceholder: "Nhập prompt thử cho Grok Web...",
        defaultModel: "grok-3",
        models: ["grok-3"],
        betaLabel: "Grok beta",
        supportsHistorySync: true,
        supportsImageAttachments: true,
        supportsFileAttachments: true,
        supportsConversationAttachments: true,
        attachmentHelpText: "Grok Web bridge có thể gửi ảnh, tệp và transcript hội thoại qua upload-file. Attachment chỉ tồn tại cho lần gửi hiện tại, gửi xong sẽ được xoá khỏi test box.",
        historySyncNote: "Khi tắt lịch sử web, bridge sẽ ưu tiên gửi ở chế độ temporary. Nếu session hội thoại vẫn bật, Grok vẫn giữ mạch trả lời trong temporary conversation hiện tại.",
        autoConnectTimeoutMs: 90000,
      }}
    />
  );
}
