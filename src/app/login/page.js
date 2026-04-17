"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowRight, Lock, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [bootstrap, setBootstrap] = useState({
    loading: true,
    needsSetup: false,
    localSetupAllowed: false,
  });
  const [password, setPassword] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    loadBootstrapStatus();
  }, []);

  const loadBootstrapStatus = async () => {
    try {
      const res = await fetch("/api/bootstrap/status", { cache: "no-store" });
      const data = await res.json();
      setBootstrap({
        loading: false,
        needsSetup: data.needsSetup === true,
        localSetupAllowed: data.localSetupAllowed === true,
      });
    } catch (err) {
      setBootstrap({
        loading: false,
        needsSetup: true,
        localSetupAllowed: false,
      });
      setError("Unable to load gateway bootstrap status.");
    }
  };

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

      const data = await res.json();

      if (!res.ok) {
        if (data.bootstrapRequired) {
          await loadBootstrapStatus();
        }
        throw new Error(data.error || "Mật khẩu không chính xác");
      }

      router.replace("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapSetup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/bootstrap/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: setupPassword,
          confirmPassword: setupConfirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete bootstrap setup");
      }

      router.replace("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || bootstrap.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
         <div className="w-8 h-8 border-2 border-[var(--nexus-pink)] border-t-transparent inset-0 rounded-full animate-spin"></div>
      </div>
    );
  }

  const isBootstrapMode = bootstrap.needsSetup;

  return (
    <div className="split-screen bg-[var(--bg-deep)]">
      
      {/* Nửa Trái: Branding & Visuals (Biến mất ở mobile) */}
      <div className="split-left">
        {/* Animated Background Gradients inside Left Side */}
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[var(--nexus-pink)] rounded-full mix-blend-screen filter blur-[150px] opacity-10 animate-blob"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-[var(--nexus-purple)] rounded-full mix-blend-screen filter blur-[150px] opacity-10 animate-blob" style={{animationDelay: '2s'}}></div>
        
        <div className="relative z-10 max-w-lg">
          <Link href="/" className="inline-flex items-center gap-3 mb-16 hover:opacity-80 transition-opacity">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--nexus-pink)] to-[var(--nexus-purple)] flex flex-col items-center justify-center shadow-[0_0_15px_rgba(246,55,236,0.5)] border border-white/20">
              <span className="font-black text-white text-2xl leading-none">N</span>
            </div>
            <span className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              NexusAI
            </span>
          </Link>


        </div>
      </div>

      {/* Nửa Phải: Login Form */}
      <div className="split-right">
        <div className="w-full max-w-[400px] mx-auto opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards]">
          {/* Mobile Header (Only visible when split-left is hidden) */}
          <div className="md:hidden flex flex-col items-center mb-10">
             <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--nexus-pink)] to-[var(--nexus-purple)] flex items-center justify-center shadow-[0_0_20px_rgba(246,55,236,0.4)] border border-white/20 mb-4">
                <span className="font-black text-white text-3xl">N</span>
             </div>
             <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">NexusAI</h2>
          </div>

          <div className="mb-10 text-center md:text-left">
            <h2 className="text-3xl font-bold text-white mb-3">
              {isBootstrapMode ? "First-run Security Setup" : "Welcome System"}
            </h2>
            <p className="text-[var(--text-secondary)] text-lg">
              {isBootstrapMode
                ? "Create the first admin password before opening the dashboard."
                : "Authenticate to access the Gateway."}
            </p>
          </div>

          {/* Form wrapper */}
          <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[2rem] backdrop-blur-2xl shadow-2xl relative">
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-40 h-[1px] bg-gradient-to-r from-transparent via-[var(--nexus-pink)] to-transparent"></div>
            
            <form onSubmit={isBootstrapMode ? handleBootstrapSetup : handleLogin} className="flex flex-col gap-6">
              {isBootstrapMode && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
                    <div>
                      <p className="font-medium text-white">Bootstrap mode is local-only</p>
                      <p className="mt-1 text-blue-100/80">
                        {bootstrap.localSetupAllowed
                          ? "You're on localhost, so you can create the admin password now."
                          : "Open this page from the machine hosting the gateway to complete the first-run setup."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-[var(--text-secondary)] flex items-center gap-2">
                  {isBootstrapMode ? "Admin Password" : "Access Key"}
                </label>

                {isBootstrapMode ? (
                  <div className="grid gap-4">
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-[var(--nexus-pink)] transition-colors" />
                      </div>
                      <input
                        type="password"
                        placeholder="Create admin password..."
                        value={setupPassword}
                        onChange={(e) => setSetupPassword(e.target.value)}
                        required
                        minLength={8}
                        autoFocus
                        className="w-full pl-12 pr-4 py-4 rounded-xl text-white text-sm font-medium placeholder-gray-600 outline-none transition-all duration-300 bg-black/40 border border-white/10 focus:border-[var(--nexus-pink)] focus:ring-1 focus:ring-[var(--nexus-pink)]/50 focus:shadow-[0_0_20px_rgba(246,55,236,0.15)]"
                      />
                    </div>

                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-[var(--nexus-pink)] transition-colors" />
                      </div>
                      <input
                        type="password"
                        placeholder="Confirm admin password..."
                        value={setupConfirmPassword}
                        onChange={(e) => setSetupConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        className="w-full pl-12 pr-4 py-4 rounded-xl text-white text-sm font-medium placeholder-gray-600 outline-none transition-all duration-300 bg-black/40 border border-white/10 focus:border-[var(--nexus-pink)] focus:ring-1 focus:ring-[var(--nexus-pink)]/50 focus:shadow-[0_0_20px_rgba(246,55,236,0.15)]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-[var(--nexus-pink)] transition-colors" />
                    </div>
                    <input
                      type="password"
                      placeholder="Enter access mask..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                      className="w-full pl-12 pr-4 py-4 rounded-xl text-white text-sm font-medium placeholder-gray-600 outline-none transition-all duration-300 bg-black/40 border border-white/10 focus:border-[var(--nexus-pink)] focus:ring-1 focus:ring-[var(--nexus-pink)]/50 focus:shadow-[0_0_20px_rgba(246,55,236,0.15)]"
                    />
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-4 py-3 rounded-xl border border-red-500/20 animate-pulse">
                    {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-2 rounded-xl font-semibold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group shadow-[0_4px_20px_rgba(124,58,237,0.3)] bg-gradient-to-r from-[var(--nexus-purple)] to-[var(--nexus-pink)] hover:scale-[1.02]"
              >
                <div className="absolute inset-0 w-full h-full bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {isBootstrapMode ? "Securing gateway..." : "Authenticating..."}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {isBootstrapMode ? "Create Admin Password" : "Initialize Session"}{" "}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                )}
              </button>

              {isBootstrapMode && (
                <div className="text-center pt-2">
                  <p className="text-xs text-gray-500">
                    Minimum length is <code className="bg-black/50 text-[var(--nexus-pink)] px-2 py-1 rounded-md font-mono border border-white/5">8</code> characters. Default passwords are disabled.
                  </p>
                </div>
              )}
            </form>
          </div>
          
          <div className="mt-12 text-center text-sm text-[var(--text-secondary)]">
            Powered by the <span className="text-white font-medium">NexusAI Core Engine</span>. <br/>
            &copy; {new Date().getFullYear()} Phuc. All rights reserved.
          </div>
        </div>
      </div>

    </div>
  );
}
