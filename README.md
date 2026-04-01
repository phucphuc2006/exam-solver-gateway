# 🚀 Exam Solver AI Gateway

> **Smart AI Gateway** – Router thông minh cho hệ thống Exam Solver, hỗ trợ kết nối đa nguồn AI miễn phí.

## ✨ Tính năng

- 🔄 **Multi-Provider Routing** - Kết nối OpenAI Codex, Kiro AI, và OpenAI API Key
- ⚡ **Auto Failover** - Tự động chuyển provider khi gặp lỗi
- 📊 **Usage Tracking** - Theo dõi chi tiết token, request, costs
- 🎯 **Model Combos** - Gom nhiều model vào combo với fallback
- 🔐 **OAuth Integration** - Đăng nhập Codex PKCE & Kiro Device Code
- 🌐 **Web Dashboard** - Giao diện quản lý premium, dark theme
- 🔄 **Auto Update** - Tự kiểm tra và thông báo phiên bản mới

## 📦 Cài đặt & Sử dụng

### Cách 1: Download bản portable
1. Tải file `.zip` từ [Releases](../../releases/latest)
2. Giải nén
3. Chạy `ExamSolverGateway.bat`
4. Mở trình duyệt: `http://localhost:21088`
5. Mật khẩu mặc định: `123456`

### Cách 2: Chạy từ source
```bash
git clone https://github.com/phucphuc2006/exam-solver-gateway.git
cd exam-solver-gateway
npm install
npm run dev
```

## ⚙️ Cấu hình

File `.env` chứa thông số cấu hình:

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `21088` | Port server |
| `INITIAL_PASSWORD` | `123456` | Mật khẩu đăng nhập |
| `DATA_DIR` | `./data` | Thư mục lưu dữ liệu |

## 🔧 Build portable package

```powershell
.\build-exe.ps1
```

Kết quả sẽ nằm trong `dist/exam-solver-gateway/`

## 📝 License

MIT
