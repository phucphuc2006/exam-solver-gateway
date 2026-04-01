"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/settings`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.requireLogin === false) {
            router.push("/dashboard");
            router.refresh();
            return;
          }
          setHasPassword(!!data.hasPassword);
        } else {
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Sai mật khẩu");
      }
    } catch (err) {
      setError("Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0a0f1a 0%, #0d1b2a 50%, #0a0f1a 100%)'}}>
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#00d4ff] animate-spin" />
            <div className="absolute inset-1 rounded-full border-2 border-transparent border-b-[#7c3aed] animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}} />
          </div>
          <p className="text-[#94a3b8] mt-4 text-sm">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{background: 'linear-gradient(135deg, #0a0f1a 0%, #0d1b2a 50%, #0a0f1a 100%)'}}>
      
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20"
          style={{
            background: 'radial-gradient(circle, #00d4ff 0%, transparent 70%)',
            top: '-15%',
            right: '-10%',
            animation: 'float-orb 8s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-15"
          style={{
            background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)',
            bottom: '-10%',
            left: '-5%',
            animation: 'float-orb 10s ease-in-out infinite reverse',
          }}
        />
        <div 
          className="absolute w-[300px] h-[300px] rounded-full blur-[80px] opacity-10"
          style={{
            background: 'radial-gradient(circle, #00d4ff 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'float-orb 12s ease-in-out infinite',
          }}
        />
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(0,212,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Login card */}
      <div 
        className={`relative w-full max-w-[420px] mx-4 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
      >
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          {/* Logo with glow */}
          <div className="relative inline-block mb-5">
            <div 
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-black text-3xl relative z-10"
              style={{
                background: 'linear-gradient(135deg, #00d4ff 0%, #1e3a5f 60%, #7c3aed 100%)',
                boxShadow: '0 0 40px rgba(0, 212, 255, 0.3), 0 8px 32px rgba(0, 0, 0, 0.3)',
              }}
            >
              ES
            </div>
            <div 
              className="absolute -inset-2 rounded-3xl opacity-30 blur-xl -z-1"
              style={{background: 'linear-gradient(135deg, #00d4ff, #7c3aed)'}}
            />
          </div>
          
          <h1 className="text-3xl font-bold mb-2 tracking-tight">
            <span className="es-gradient-text">Exam Solver</span>
          </h1>
          <p className="text-[#64748b] text-sm font-medium tracking-wide uppercase">
            AI Gateway Console
          </p>
        </div>

        {/* Glass login card */}
        <div 
          className="rounded-2xl p-8 relative overflow-hidden"
          style={{
            background: 'rgba(30, 41, 59, 0.5)',
            backdropFilter: 'blur(24px) saturate(150%)',
            WebkitBackdropFilter: 'blur(24px) saturate(150%)',
            border: '1px solid rgba(148, 226, 255, 0.1)',
            boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* Top accent line */}
          <div 
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{background: 'linear-gradient(90deg, transparent, #00d4ff, #7c3aed, transparent)'}}
          />

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[#94a3b8] flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#00d4ff]">lock</span>
                Mật khẩu truy cập
              </label>
              <div className="relative group">
                <input
                  type="password"
                  placeholder="Nhập mật khẩu..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3.5 rounded-xl text-[#e2e8f0] text-sm font-medium placeholder-[#475569] outline-none transition-all duration-300 focus:ring-2 focus:ring-[#00d4ff]/30"
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(148, 226, 255, 0.1)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(0, 212, 255, 0.4)';
                    e.target.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(148, 226, 255, 0.1)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-sm text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
              style={{
                background: loading 
                  ? 'rgba(0, 212, 255, 0.3)' 
                  : 'linear-gradient(135deg, #00d4ff 0%, #0099cc 50%, #7c3aed 100%)',
                backgroundSize: '200% 200%',
                boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.boxShadow = '0 6px 30px rgba(0, 212, 255, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2)';
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.boxShadow = '0 4px 20px rgba(0, 212, 255, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang xác thực...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  Đăng nhập
                </span>
              )}
            </button>

            <div className="text-center">
              <p className="text-xs text-[#475569]">
                Mật khẩu mặc định: <code className="bg-[#0f172a] text-[#00d4ff] px-2 py-0.5 rounded-md font-mono border border-[#1e293b]">123456</code>
              </p>
            </div>
          </form>
        </div>

        {/* Bottom branding */}
        <div className="text-center mt-6">
          <p className="text-[10px] text-[#334155] uppercase tracking-[0.2em] font-medium">
            Powered by Exam Solver Technologies
          </p>
        </div>
      </div>
    </div>
  );
}
