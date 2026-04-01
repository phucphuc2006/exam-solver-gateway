"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import Button from "./Button";
import { ConfirmModal } from "./Modal";

const navItems = [
  { href: "/dashboard/endpoint", label: "Endpoint", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combos", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/profile", label: "Settings", icon: "settings" },
];

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [enableTranslator, setEnableTranslator] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => { if (data.enableTranslator) setEnableTranslator(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/version")
      .then(res => res.json())
      .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
      .catch(() => {});
  }, []);

  const isActive = (href) => {
    if (href === "/dashboard/endpoint") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
  };

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/shutdown", { method: "POST" });
    } catch (e) {
      // Expected to fail as server shuts down
    }
    setIsShuttingDown(false);
    setShowShutdownModal(false);
    setIsDisconnected(true);
  };

  const NavLink = ({ item }) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group relative",
          active
            ? "text-[#00d4ff]"
            : "text-text-muted hover:text-text-main"
        )}
        style={active ? {
          background: 'rgba(0, 212, 255, 0.08)',
          boxShadow: 'inset 0 0 0 1px rgba(0, 212, 255, 0.12)',
        } : {}}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent';
        }}
      >
        {/* Active indicator */}
        {active && (
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
            style={{background: 'linear-gradient(180deg, #00d4ff, #7c3aed)'}}
          />
        )}
        <span
          className={cn(
            "material-symbols-outlined text-[18px] transition-all duration-200",
            active ? "fill-1 text-[#00d4ff]" : "group-hover:text-[#00d4ff]"
          )}
        >
          {item.icon}
        </span>
        <span className="text-sm font-medium">{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <aside 
        className="flex w-72 flex-col min-h-full relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(10, 15, 26, 0.98) 100%)',
          borderRight: '1px solid rgba(148, 226, 255, 0.06)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Subtle gradient overlay at top */}
        <div 
          className="absolute top-0 left-0 right-0 h-32 pointer-events-none opacity-30"
          style={{background: 'radial-gradient(ellipse at 50% 0%, rgba(0, 212, 255, 0.1) 0%, transparent 70%)'}}
        />

        {/* Traffic lights */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-2 relative z-10">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56] transition-all hover:brightness-125" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E] transition-all hover:brightness-125" />
          <div className="w-3 h-3 rounded-full bg-[#27C93F] transition-all hover:brightness-125" />
        </div>

        {/* Logo */}
        <div className="px-6 py-4 flex flex-col gap-2 relative z-10">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div 
              className="flex items-center justify-center size-10 rounded-xl text-white font-bold text-sm transition-all duration-300 group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #00d4ff 0%, #1e3a5f 60%, #7c3aed 100%)',
                boxShadow: '0 0 20px rgba(0, 212, 255, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
            >
              ES
            </div>
            <div className="flex flex-col">
              <h1 className="text-[15px] font-semibold tracking-tight text-[#e2e8f0] group-hover:text-white transition-colors">
                {APP_CONFIG.name}
              </h1>
              <span className="text-[11px] text-[#475569] font-mono">v{APP_CONFIG.version}</span>
            </div>
          </Link>
          {updateInfo && (
            <div className="flex flex-col gap-0.5 mt-1">
              <span className="text-xs font-semibold text-emerald-400">
                ↑ Phiên bản mới: v{updateInfo.latestVersion}
              </span>
              <code className="text-[10px] text-emerald-400/60 font-mono select-all">
                npm install -g es-gateway@latest
              </code>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-5 es-divider" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto custom-scrollbar relative z-10">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          {/* Debug section */}
          <div className="pt-5 mt-3">
            <p className="px-4 text-[10px] font-semibold text-[#475569] uppercase tracking-[0.15em] mb-2 flex items-center gap-2">
              <span className="w-4 h-[1px] bg-[#1e293b]" />
              Debug
            </p>
            {enableTranslator && (
              <NavLink item={{ href: "/dashboard/translator", label: "Translator", icon: "translate" }} />
            )}
            {debugItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>

          {/* System section */}
          <div className="pt-5 mt-3">
            <p className="px-4 text-[10px] font-semibold text-[#475569] uppercase tracking-[0.15em] mb-2 flex items-center gap-2">
              <span className="w-4 h-[1px] bg-[#1e293b]" />
              System
            </p>
            {systemItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </nav>

        {/* Footer section */}
        <div className="p-3 relative z-10" style={{borderTop: '1px solid rgba(148, 226, 255, 0.06)'}}>
          {/* Info message */}
          <div 
            className="flex items-start gap-2.5 p-3 rounded-xl mb-2"
            style={{
              background: 'rgba(0, 212, 255, 0.04)',
              border: '1px solid rgba(0, 212, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-center size-6 rounded-lg shrink-0 mt-0.5"
              style={{background: 'rgba(0, 212, 255, 0.1)'}}
            >
              <span className="material-symbols-outlined text-[14px] text-[#00d4ff]">info</span>
            </div>
            <span className="text-[11px] font-medium text-[#94a3b8] leading-relaxed">
              Service đang chạy trên terminal. Có thể đóng trang web này. Shutdown sẽ dừng service.
            </span>
          </div>

          {/* Shutdown button */}
          <button
            onClick={() => setShowShutdownModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-red-400 hover:text-red-300"
            style={{
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.1)';
            }}
          >
            <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
            Shutdown
          </button>
        </div>
      </aside>

      {/* Shutdown Confirmation Modal */}
      <ConfirmModal
        isOpen={showShutdownModal}
        onClose={() => setShowShutdownModal(false)}
        onConfirm={handleShutdown}
        title="Tắt Server"
        message="Bạn có chắc muốn tắt proxy server không?"
        confirmText="Tắt"
        cancelText="Huỷ"
        variant="danger"
        loading={isShuttingDown}
      />

      {/* Disconnected Overlay */}
      {isDisconnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background: 'rgba(10, 15, 26, 0.9)', backdropFilter: 'blur(8px)'}}>
          <div className="text-center p-8 animate-fade-in-up">
            <div 
              className="flex items-center justify-center size-20 rounded-2xl mx-auto mb-5"
              style={{background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.15)'}}
            >
              <span className="material-symbols-outlined text-[36px] text-red-400">power_off</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Server đã ngắt</h2>
            <p className="text-[#94a3b8] mb-6 text-sm">Proxy server đã được dừng thành công.</p>
            <button 
              onClick={() => globalThis.location.reload()}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-[#00d4ff] transition-all duration-200"
              style={{
                background: 'rgba(0, 212, 255, 0.08)',
                border: '1px solid rgba(0, 212, 255, 0.15)',
              }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      )}
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};
