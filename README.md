# 🚀 NexusAI Gateway

> **Smart AI Gateway** – Router thông minh đa nguồn AI, hỗ trợ kết nối và định tuyến đến nhiều AI provider.

## ✨ Tính năng

- 🔄 **Multi-Provider Routing** - Kết nối OpenAI Codex, Kiro AI, và Custom API Key
- ⚡ **Auto Failover** - Tự động chuyển provider khi gặp lỗi
- 📊 **Usage Tracking** - Theo dõi chi tiết token, request, costs
- 🧪 **Diagnostics Lab** - Kiểm tra thủ công text, vision, audio, tool-calling và lưu capability flags
- 🎯 **Model Combos** - Gom nhiều model vào combo với fallback
- 🔐 **OAuth Integration** - Đăng nhập Codex PKCE & Kiro Device Code
- 🌐 **Web Dashboard** - Giao diện quản lý premium, dark theme
- 🗄️ **SQLite Canonical Storage** - Drizzle + better-sqlite3 + legacy JSON migration
- 🔄 **Auto Update** - Tự kiểm tra và thông báo phiên bản mới

## 📦 Cài đặt & Sử dụng

### Cách 1: Download bản portable
1. Tải file `.zip` từ [Releases](../../releases/latest)
2. Giải nén
3. Chạy `NexusAI-Gateway.bat`
4. Mở trình duyệt: `http://localhost:21088`
5. Truy cập `/login` và tạo mật khẩu admin ở lần chạy đầu tiên

### Cách 2: Chạy từ source
```bash
git clone <your-repo-url>
cd nexusai-gateway
npm install
npm run dev
```

Nếu bạn đang nâng cấp từ dữ liệu cũ trong `./data`, chạy:

```bash
npm run db:migrate -- --force
```

## ⚙️ Cấu hình

File `.env` chứa thông số cấu hình:

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `21088` | Port server |
| `DATA_DIR` | `./data` | Thư mục lưu dữ liệu |

SQLite canonical database mặc định sẽ được tạo tại `./data/nexusai-gateway.sqlite`, còn `db.json`, `usage.json`, `request-details.json`, `log.txt` được giữ lại như backup nhập liệu.

## 🔧 Build portable package

```powershell
.\build-exe.ps1
```

Kết quả sẽ nằm trong `dist/nexusai-gateway/`

## 🔐 Bảo mật khởi tạo

- Gateway tự vô hiệu hóa các secret placeholder mặc định và sẽ sinh secret runtime mới nếu cần.
- Lần chạy đầu tiên chỉ cho phép bootstrap mật khẩu admin từ `localhost`.
- Các route quản trị nhạy cảm hiện có rate limiting để giảm spam và brute-force.
- Diagnostics Lab nằm tại `/dashboard/diagnostics` và sẽ lưu kết quả kiểm tra capability vào SQLite với `source=manual`.

## 📝 License

MIT © 2026 Phuc
