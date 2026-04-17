"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import PropTypes from "prop-types";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { LanguageSwitcher } from "@/shared/components";
import { ConfirmModal } from "@/shared/components/Modal";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";

const getPageInfo = (pathname) => {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const providerInfo =
      OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        breadcrumbs: [
          { label: "Providers", href: "/dashboard/providers" },
          {
            label: providerInfo.name,
            image: `/providers/${providerInfo.id}.png`,
          },
        ],
      };
    }
  }

  if (pathname.includes("/providers"))
    return { title: "Providers", description: "Manage AI provider connections", icon: "dns", breadcrumbs: [] };
  if (pathname.includes("/combos"))
    return { title: "Combos", description: "Build model workflows with fallback support", icon: "layers", breadcrumbs: [] };
  if (pathname.includes("/usage"))
    return { title: "Usage & Analytics", description: "Track API usage, token consumption, and request logs", icon: "bar_chart", breadcrumbs: [] };
  if (pathname.includes("/quota"))
    return { title: "Quota Tracker", description: "Monitor API quota limits", icon: "data_usage", breadcrumbs: [] };
  if (pathname.includes("/diagnostics"))
    return { title: "Diagnostics Lab", description: "Check model capabilities and diagnostics", icon: "science", breadcrumbs: [] };
  if (pathname.includes("/mitm"))
    return { title: "MITM Proxy", description: "Intercept CLI tool traffic and route through NexusAI Gateway", icon: "security", breadcrumbs: [] };
  if (pathname.includes("/cli-tools"))
    return {
      title: "Auto Config",
      description: "Configure OpenClaw, Codex, OpenCode, Claude and IDE tools automatically",
      icon: "tune",
      breadcrumbs: [],
    };
  if (pathname.includes("/proxy-pools"))
    return { title: "Proxy Pools", description: "Manage proxy pool configuration", icon: "lan", breadcrumbs: [] };
  if (pathname.includes("/endpoint"))
    return { title: "Endpoint", description: "Configure API endpoint", icon: "api", breadcrumbs: [] };
  if (pathname.includes("/chatgpt-web"))
    return {
      title: "Web Bridge",
      description: "Bridge logged-in ChatGPT, Gemini, and Grok web sessions into an experimental HTTP API",
      icon: "smart_toy",
      breadcrumbs: [],
    };
  if (pathname.includes("/profile"))
    return { title: "Settings", description: "Manage system settings", icon: "settings", breadcrumbs: [] };
  if (pathname.includes("/translator"))
    return { title: "Translator", description: "Debug translation flow", icon: "translate", breadcrumbs: [] };
  if (pathname.includes("/console-log"))
    return { title: "Console Log", description: "Live server console output", icon: "monitor", breadcrumbs: [] };
  if (pathname === "/dashboard")
    return { title: "Endpoint", description: "Configure API endpoint", icon: "api", breadcrumbs: [] };
  return { title: "", description: "", breadcrumbs: [] };
};

export default function Header({ onMenuClick, showMenuButton = true }) {
  const { t } = useRuntimeLocale();
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
  const { title, description, icon, breadcrumbs } = pageInfo;

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        router.push("/login");
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
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

  return (
    <>
    <header 
      className="flex items-center justify-between px-8 py-4 z-10 sticky top-0"
      style={{
        background: 'rgba(var(--color-bg), 0.8)',
        backdropFilter: 'blur(16px) saturate(150%)',
        WebkitBackdropFilter: 'blur(16px) saturate(150%)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Mobile menu button */}
      <div className="flex items-center gap-3 lg:hidden">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="text-text-main hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        )}
      </div>

      {/* Page title with breadcrumbs - desktop */}
      <div className="hidden lg:flex flex-col">
        {breadcrumbs.length > 0 ? (
          <div className="flex items-center gap-2">
            {breadcrumbs.map((crumb, index) => (
              <div
                key={`${crumb.label}-${crumb.href || "current"}`}
                className="flex items-center gap-2"
              >
                {index > 0 && (
                  <span className="material-symbols-outlined text-text-muted text-base">
                    chevron_right
                  </span>
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-text-muted hover:text-primary transition-colors"
                  >
                    {t(crumb.label)}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    {crumb.image && (
                      <ProviderIcon
                        src={crumb.image}
                        alt={crumb.label}
                        size={28}
                        className="object-contain rounded max-w-[28px] max-h-[28px]"
                        fallbackText={crumb.label.slice(0, 2).toUpperCase()}
                      />
                    )}
                    <h1 className="text-xl font-semibold text-text-main tracking-tight">
                      {t(crumb.label)}
                    </h1>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : title ? (
          <div>
            <div className="flex items-center gap-2.5">
              {icon && (
                <div 
                  className="flex items-center justify-center size-8 rounded-lg"
                  style={{background: 'rgba(246, 55, 236, 0.08)', border: '1px solid rgba(246, 55, 236, 0.1)'}}
                >
                  <span className="material-symbols-outlined text-[#f637ec] text-[18px]">
                    {icon}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-text-main">
                  {t(title)}
                </h1>
                {description && (
                  <p className="text-xs text-text-muted mt-0.5">
                    {t(description)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 ml-auto">
        <LanguageSwitcher />

        {/* Shutdown button */}
        <button
          onClick={() => setShowShutdownModal(true)}
          className="flex items-center justify-center p-2 rounded-lg text-text-muted hover:text-red-400 transition-all duration-200"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          title={t("Shut down server")}
        >
          <span className="material-symbols-outlined text-[20px]">power_settings_new</span>
        </button>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="flex items-center justify-center p-2 rounded-lg text-text-muted hover:text-red-400 transition-all duration-200"
          style={{}}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          title={t("Logout")}
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
        </button>
      </div>
    </header>
      
      {/* Shutdown Confirmation Modal */}
      <ConfirmModal
        isOpen={showShutdownModal}
        onClose={() => setShowShutdownModal(false)}
        onConfirm={handleShutdown}
        title={t("Shut Down")}
        message={t("Are you sure you want to shut down the proxy server?")}
        confirmText={t("Shut Down")}
        cancelText={t("Cancel")}
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
            <h2 className="text-xl font-bold text-white mb-2">{t("Server disconnected")}</h2>
            <p className="text-[#94a3b8] mb-6 text-sm">{t("The proxy server has been stopped successfully.")}</p>
            <button 
              onClick={() => globalThis.location.reload()}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-[#f637ec] transition-all duration-200"
              style={{
                background: 'rgba(246, 55, 236, 0.08)',
                border: '1px solid rgba(246, 55, 236, 0.15)',
              }}
            >
              {t("Reload page")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
};
