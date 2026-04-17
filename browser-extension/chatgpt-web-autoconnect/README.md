# NexusAI Web Auto Connect Extension

Extension Chrome/Edge MV3 để dashboard Web Bridge trong NexusAI có thể one-click connect cho ChatGPT Web, Gemini Web và Grok Web.

## Cài nhanh

1. Mở `chrome://extensions` hoặc `edge://extensions`
2. Bật `Developer mode`
3. Bấm `Load unpacked`
4. Chọn thư mục này:
   `9router_temp/browser-extension/chatgpt-web-autoconnect`

## Luồng hoạt động

- Dashboard web gửi yêu cầu sang extension.
- Với `ChatGPT Web`, extension arm `webRequest` để chờ request thật của chat thường tới route conversation, rồi gửi capture bundle về dashboard.
- Với `Gemini Web`, extension tự lấy cookie `__Secure-1PSID` và `__Secure-1PSIDTS` từ phiên đang đăng nhập trên `gemini.google.com`.
- Với `Grok Web`, extension tự lấy cookie hiện có trên `grok.com`.
- Dashboard import session vừa lấy được rồi validate lại theo từng provider.

## Kiểm tra kết nối dashboard

1. Mở tab NexusAI tại đúng trang `/dashboard/chatgpt-web`
2. Bấm icon extension `NexusAI Web Auto Connect`
3. Bấm `Kiểm tra kết nối Dashboard`

Popup sẽ báo một trong các trạng thái:

- `Đã kết nối`: extension đang thấy đúng trang bridge `/dashboard/chatgpt-web`
- `Đúng host, sai trang`: đã thấy tab NexusAI nhưng chưa ở đúng trang dashboard Web Bridge
- `Chưa thấy dashboard`: chưa có tab NexusAI phù hợp trong trình duyệt này
- `Bridge chưa phản hồi`: nên reload tab dashboard hoặc reload extension rồi kiểm tra lại

## Host đã bật sẵn

- `http://localhost/*`
- `http://127.0.0.1/*`
- `https://*.trycloudflare.com/*`
- `https://*.ngrok-free.app/*`

Nếu dashboard của bạn chạy trên domain khác, hãy thêm domain đó vào:

- `manifest.json` -> `host_permissions`
- `manifest.json` -> `content_scripts[*].matches`

Rồi reload extension.

## Giới hạn hiện tại

- `ChatGPT Web` vẫn cần request thật từ chat thường, nên sau khi bấm `Tự động kết nối` có thể bạn vẫn cần gửi 1 tin nhắn ngắn ở tab ChatGPT để extension bắt đúng request.
- `Gemini Web` và `Grok Web` phụ thuộc vào cookie của đúng profile trình duyệt đang đăng nhập.
- One-click trên web chỉ hoạt động khi extension đã được cài trong đúng profile trình duyệt đang mở dashboard.
