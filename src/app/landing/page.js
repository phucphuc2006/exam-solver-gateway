"use client";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();
  return (
    <div className="relative text-white font-sans overflow-x-hidden antialiased selection:bg-[#00d4ff] selection:text-white">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#0a0f1a]">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: `linear-gradient(to right, #00d4ff 1px, transparent 1px), linear-gradient(to bottom, #00d4ff 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}></div>
        
        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-1/4 w-[700px] h-[700px] bg-[#00d4ff]/12 rounded-full blur-[130px] animate-blob"></div>
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-[#1e3a5f]/20 rounded-full blur-[130px] animate-blob" style={{ animationDelay: '2s', animationDuration: '22s' }}></div>
        <div className="absolute bottom-0 left-1/2 w-[650px] h-[650px] bg-blue-500/8 rounded-full blur-[130px] animate-blob" style={{ animationDelay: '4s', animationDuration: '25s' }}></div>
      </div>

      <div className="relative z-10">
        {/* Navigation */}
        <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00d4ff] to-[#1e3a5f] flex items-center justify-center text-white font-black text-lg">ES</div>
            <span className="text-xl font-bold">Exam Solver AI Gateway</span>
          </div>
          <button 
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2.5 rounded-lg bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0a0f1a] font-bold transition-all"
          >
            Open Dashboard
          </button>
        </nav>
        
        <main>
          {/* Hero Section */}
          <section className="pt-20 pb-16 px-6">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-sm font-medium mb-8">
                <span className="material-symbols-outlined text-sm">bolt</span>
                Exam Solver AI Gateway v1.0
              </div>
              
              <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
                Kết nối AI cho
                <span className="bg-gradient-to-r from-[#00d4ff] to-[#3B82F6] bg-clip-text text-transparent"> Exam Solver</span>
              </h1>
              
              <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
                Đăng nhập tài khoản GPT hoặc Kiro và bắt đầu sử dụng Exam Solver ngay lập tức. Không cần API Key phức tạp.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button 
                  onClick={() => router.push("/dashboard")}
                  className="w-full sm:w-auto h-14 px-10 rounded-lg bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0a0f1a] text-lg font-bold transition-all shadow-[0_0_20px_rgba(0,212,255,0.5)]"
                >
                  Mở Dashboard
                </button>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="py-20 px-6">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-black text-center mb-16">Cách hoạt động</h2>
              
              <div className="grid md:grid-cols-3 gap-8">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-3xl text-[#3B82F6]">login</span>
                  </div>
                  <h3 className="text-xl font-bold mb-3">1. Đăng nhập</h3>
                  <p className="text-gray-400">Kết nối tài khoản GPT (Codex OAuth) hoặc Kiro AI miễn phí qua Dashboard</p>
                </div>
                
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#00d4ff]/20 flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-3xl text-[#00d4ff]">router</span>
                  </div>
                  <h3 className="text-xl font-bold mb-3">2. Gateway xử lý</h3>
                  <p className="text-gray-400">Gateway tự động chuyển đổi và định tuyến request đến AI provider phù hợp</p>
                </div>
                
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#FF6B35]/20 flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-3xl text-[#FF6B35]">school</span>
                  </div>
                  <h3 className="text-xl font-bold mb-3">3. Exam Solver sử dụng</h3>
                  <p className="text-gray-400">Exam Solver gọi API qua localhost:20128/v1 — nhanh, ổn định, không lộ key</p>
                </div>
              </div>
            </div>
          </section>

          {/* Providers */}
          <section className="py-20 px-6 bg-white/[0.02]">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-black mb-12">Providers được hỗ trợ</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-white/5 border border-[#3B82F6]/30 rounded-2xl p-6">
                  <div className="w-14 h-14 rounded-xl bg-[#3B82F6]/20 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl font-bold text-[#3B82F6]">CX</span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">OpenAI Codex</h3>
                  <p className="text-sm text-gray-400 mb-3">OAuth — Đăng nhập bằng tài khoản ChatGPT</p>
                  <span className="inline-block px-3 py-1 rounded-full bg-[#3B82F6]/20 text-[#3B82F6] text-xs font-medium">GPT-5.x Codex</span>
                </div>
                
                <div className="bg-white/5 border border-[#FF6B35]/30 rounded-2xl p-6">
                  <div className="w-14 h-14 rounded-xl bg-[#FF6B35]/20 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl font-bold text-[#FF6B35]">KR</span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">Kiro AI</h3>
                  <p className="text-sm text-gray-400 mb-3">AWS Builder ID — Miễn phí không giới hạn</p>
                  <span className="inline-block px-3 py-1 rounded-full bg-[#FF6B35]/20 text-[#FF6B35] text-xs font-medium">Claude FREE</span>
                </div>
                
                <div className="bg-white/5 border border-[#10A37F]/30 rounded-2xl p-6">
                  <div className="w-14 h-14 rounded-xl bg-[#10A37F]/20 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl font-bold text-[#10A37F]">OA</span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">OpenAI API</h3>
                  <p className="text-sm text-gray-400 mb-3">API Key — Nhập key từ platform.openai.com</p>
                  <span className="inline-block px-3 py-1 rounded-full bg-[#10A37F]/20 text-[#10A37F] text-xs font-medium">GPT-4o, o1</span>
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-32 px-6">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl md:text-5xl font-black mb-6">Sẵn sàng sử dụng?</h2>
              <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
                Mở Dashboard, kết nối tài khoản AI của bạn, và bắt đầu giải đề ngay.
              </p>
              <button 
                onClick={() => router.push("/dashboard")}
                className="h-14 px-10 rounded-lg bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0a0f1a] text-lg font-bold transition-all shadow-[0_0_20px_rgba(0,212,255,0.5)]"
              >
                Mở Dashboard →
              </button>
            </div>
          </section>
        </main>
        
        {/* Footer */}
        <footer className="border-t border-white/10 py-8 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#1e3a5f] flex items-center justify-center text-white font-bold text-xs">ES</div>
              <span className="text-sm text-gray-500">Exam Solver AI Gateway v1.0</span>
            </div>
            <span className="text-sm text-gray-600">Powered by Exam Solver Team</span>
          </div>
        </footer>
      </div>
      
      {/* Global styles */}
      <style jsx global>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob { animation: blob 20s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
