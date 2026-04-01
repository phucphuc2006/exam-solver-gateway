"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import Link from "next/link";
import PropTypes from "prop-types";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { ThemeToggle, LanguageSwitcher } from "@/shared/components";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { translate } from "@/i18n/runtime";

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
    return { title: "Providers", description: "Quản lý kết nối AI provider", icon: "dns", breadcrumbs: [] };
  if (pathname.includes("/combos"))
    return { title: "Combos", description: "Model combos với fallback", icon: "layers", breadcrumbs: [] };
  if (pathname.includes("/usage"))
    return { title: "Usage & Analytics", description: "Theo dõi API usage, token và request logs", icon: "bar_chart", breadcrumbs: [] };
  if (pathname.includes("/quota"))
    return { title: "Quota Tracker", description: "Quản lý giới hạn API quota", icon: "data_usage", breadcrumbs: [] };
  if (pathname.includes("/mitm"))
    return { title: "MITM Proxy", description: "Chặn traffic CLI tool và route qua ES Gateway", icon: "security", breadcrumbs: [] };
  if (pathname.includes("/cli-tools"))
    return { title: "CLI Tools", description: "Cấu hình CLI tools", icon: "terminal", breadcrumbs: [] };
  if (pathname.includes("/proxy-pools"))
    return { title: "Proxy Pools", description: "Quản lý cấu hình proxy pool", icon: "lan", breadcrumbs: [] };
  if (pathname.includes("/endpoint"))
    return { title: "Endpoint", description: "Cấu hình API endpoint", icon: "api", breadcrumbs: [] };
  if (pathname.includes("/profile"))
    return { title: "Settings", description: "Quản lý cài đặt hệ thống", icon: "settings", breadcrumbs: [] };
  if (pathname.includes("/translator"))
    return { title: "Translator", description: "Debug translation flow", icon: "translate", breadcrumbs: [] };
  if (pathname.includes("/console-log"))
    return { title: "Console Log", description: "Live server console output", icon: "monitor", breadcrumbs: [] };
  if (pathname === "/dashboard")
    return { title: "Endpoint", description: "Cấu hình API endpoint", icon: "api", breadcrumbs: [] };
  return { title: "", description: "", breadcrumbs: [] };
};

export default function Header({ onMenuClick, showMenuButton = true }) {
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

  return (
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
                    {crumb.label}
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
                      {translate(crumb.label)}
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
                  style={{background: 'rgba(0, 212, 255, 0.08)', border: '1px solid rgba(0, 212, 255, 0.1)'}}
                >
                  <span className="material-symbols-outlined text-[#00d4ff] text-[18px]">
                    {icon}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-text-main">
                  {translate(title)}
                </h1>
                {description && (
                  <p className="text-xs text-text-muted mt-0.5">
                    {translate(description)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Theme toggle */}
        <ThemeToggle />

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
          title="Đăng xuất"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
        </button>
      </div>
    </header>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
};
