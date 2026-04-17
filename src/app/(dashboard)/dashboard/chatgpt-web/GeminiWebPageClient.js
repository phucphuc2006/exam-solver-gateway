"use client";

import ManualWebBridgeClient from "./ManualWebBridgeClient";

export default function GeminiWebPageClient() {
  return (
    <ManualWebBridgeClient
      config={{
        providerKey: "gemini-web",
        title: "Gemini Web",
        description: "Bridge beta cho Gemini Web thường bằng session cookie riêng, không dùng chung state với ChatGPT Web.",
        autoConnectOriginLabel: "gemini.google.com",
        autoConnectDescription: "Nếu extension đã cài và bạn đang đăng nhập Gemini trong trình duyệt này, bấm nút là NexusAI sẽ tự lấy cookie Gemini rồi validate ngay.",
        connectMode: "gemini-tokens",
        connectTitle: "Kết nối thủ công",
        connectDescription: "Dán trực tiếp 2 cookie quan trọng lấy từ trình duyệt đang đăng nhập Gemini Web.",
        helpText: "Cần đúng __Secure-1PSID và __Secure-1PSIDTS từ gemini.google.com. Sau khi connect nên bấm Validate ngay để lấy token phiên mới nhất.",
        defaultPrompt: "Tóm tắt cây cầu Brooklyn trong một câu.",
        promptPlaceholder: "Nhập prompt thử cho Gemini Web...",
        defaultModel: "gemini-3.0-flash",
        models: ["gemini-3.1-pro", "gemini-3.0-flash", "gemini-3.0-flash-thinking"],
        betaLabel: "Gemini beta",
        supportsHistorySync: true,
        supportsImageAttachments: true,
        supportsFileAttachments: true,
        supportsConversationAttachments: true,
        attachmentHelpText: "Gemini Web bridge đã bật upload thật cho ảnh, tệp và transcript hội thoại. Nếu upstream đổi format nội bộ, attachment có thể cần validate session lại.",
        historySyncNote: "Lưu ý: Gemini Web không tách lịch sử mạnh như ChatGPT/Grok. Nếu upstream đổi hành vi, web vẫn có thể sinh lịch sử riêng dù bridge đang ưu tiên chế độ tách rời.",
        autoConnectTimeoutMs: 15000,
      }}
    />
  );
}
