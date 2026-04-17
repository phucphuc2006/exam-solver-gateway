"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "space_dashboard" },
  { href: "/dashboard/endpoint", label: "API Gateway", icon: "api" },
  { href: "/dashboard/chatgpt-web", label: "Web Bridge", icon: "smart_toy" },
  { href: "/dashboard/cli-tools", label: "Auto Config", icon: "tune" },
  { href: "/dashboard/providers", label: "Integrations", icon: "dns" },
  { href: "/dashboard/combos", label: "Workflows", icon: "layers" },
  { href: "/dashboard/usage", label: "Analytics", icon: "bar_chart" },
  { href: "/dashboard/diagnostics", label: "System Health", icon: "science" },
  { href: "/dashboard/quota", label: "Limit Monitor", icon: "data_usage" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "System Logs", icon: "terminal" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Network Setup", icon: "lan" },
  { href: "/dashboard/profile", label: "Settings", icon: "settings" },
];

const SIDEBAR_BOOTSTRAP_CACHE_TTL_MS = 30_000;
let sidebarBootstrapCache = null;
let sidebarBootstrapCacheAt = 0;
let sidebarBootstrapPromise = null;
const prefetchedSidebarRoutes = new Set();

function getSidebarBootstrapClientCache() {
  const now = Date.now();
  if (sidebarBootstrapCache && (now - sidebarBootstrapCacheAt) < SIDEBAR_BOOTSTRAP_CACHE_TTL_MS) {
    return Promise.resolve(sidebarBootstrapCache);
  }

  if (sidebarBootstrapPromise) {
    return sidebarBootstrapPromise;
  }

  sidebarBootstrapPromise = fetch("/api/dashboard/overview?scope=sidebar", { cache: "no-store" })
    .then((res) => res.json())
    .then((data) => {
      sidebarBootstrapCache = data?.sidebar || null;
      sidebarBootstrapCacheAt = Date.now();
      return sidebarBootstrapCache;
    })
    .finally(() => {
      sidebarBootstrapPromise = null;
    });

  return sidebarBootstrapPromise;
}

export default function Sidebar({ onClose, initialData = null }) {
  const { t } = useRuntimeLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [updateInfo, setUpdateInfo] = useState(initialData?.updateInfo || null);
  const [enableTranslator, setEnableTranslator] = useState(Boolean(initialData?.enableTranslator));

  useEffect(() => {
    setUpdateInfo(initialData?.updateInfo || null);
    setEnableTranslator(Boolean(initialData?.enableTranslator));
  }, [initialData]);

  useEffect(() => {
    if (initialData) {
      sidebarBootstrapCache = initialData;
      sidebarBootstrapCacheAt = Date.now();
      return;
    }

    getSidebarBootstrapClientCache()
      .then((data) => {
        setUpdateInfo(data?.updateInfo || null);
        setEnableTranslator(Boolean(data?.enableTranslator));
      })
      .catch(() => {});
  }, [initialData]);

  useEffect(() => {
    const routesToWarm = [
      ...navItems.map((item) => item.href),
      ...debugItems.map((item) => item.href),
      ...systemItems.map((item) => item.href),
      "/dashboard/translator",
    ];

    const warmRoutes = () => {
      routesToWarm.forEach((href) => {
        if (prefetchedSidebarRoutes.has(href)) return;
        prefetchedSidebarRoutes.add(href);
        router.prefetch(href);
      });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => warmRoutes(), { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(warmRoutes, 250);
    return () => window.clearTimeout(timeoutId);
  }, [router]);

  const isActive = (href) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    if (href === "/dashboard/endpoint") {
      return pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
  };

  const prefetchRoute = (href) => {
    if (!href || prefetchedSidebarRoutes.has(href)) return;
    prefetchedSidebarRoutes.add(href);
    router.prefetch(href);
  };

  const NavLink = ({ item }) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        prefetch
        onClick={onClose}
        onMouseEnter={() => prefetchRoute(item.href)}
        onFocus={() => prefetchRoute(item.href)}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group relative",
          active
            ? "text-[#f637ec]"
            : "text-text-muted hover:text-text-main"
        )}
        style={active ? {
          background: 'rgba(246, 55, 236, 0.08)',
          boxShadow: 'inset 0 0 0 1px rgba(246, 55, 236, 0.12)',
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
            style={{background: 'linear-gradient(180deg, #f637ec, #7c3aed)'}}
          />
        )}
        <span
          className={cn(
            "material-symbols-outlined text-[18px] transition-all duration-200",
            active ? "fill-1 text-[#f637ec]" : "group-hover:text-[#f637ec]"
          )}
        >
          {item.icon}
        </span>
        <span className="text-sm font-medium">{t(item.label)}</span>
      </Link>
    );
  };

  return (
    <>
      <aside 
        className="flex w-72 flex-col min-h-full relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(12, 0, 21, 0.96) 0%, rgba(15, 0, 30, 0.98) 100%)',
          borderRight: '1px solid rgba(168, 85, 247, 0.08)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Subtle gradient overlay at top */}
        <div 
          className="absolute top-0 left-0 right-0 h-32 pointer-events-none opacity-30"
          style={{background: 'radial-gradient(ellipse at 50% 0%, rgba(246, 55, 236, 0.08) 0%, transparent 70%)'}}
        />



        {/* Logo */}
        <div className="px-6 py-4 flex flex-col gap-2 relative z-10">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div 
              className="flex items-center justify-center size-10 rounded-xl text-white font-bold text-base transition-all duration-300 group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #f637ec 0%, #7c3aed 60%, #a855f7 100%)',
                boxShadow: '0 0 20px rgba(246, 55, 236, 0.25), 0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
            >
              N
            </div>
            <div className="flex flex-col">
              <h1 className="text-[15px] font-semibold tracking-tight text-[#e2e8f0] group-hover:text-white transition-colors">
                {APP_CONFIG.name}
              </h1>
              <span className="text-[11px] text-[#475569] font-mono">v{APP_CONFIG.version}</span>
            </div>
          </Link>
          {updateInfo?.hasUpdate && (
            <div className="flex flex-col gap-0.5 mt-1">
              <span className="text-xs font-semibold text-emerald-400">
                ↑ {t("New version")}: v{updateInfo.latestVersion}
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
              {t("Debug")}
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
              {t("System")}
            </p>
            {systemItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </nav>
      </aside>
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
  initialData: PropTypes.shape({
    enableTranslator: PropTypes.bool,
    updateInfo: PropTypes.shape({
      hasUpdate: PropTypes.bool,
      latestVersion: PropTypes.string,
    }),
  }),
};
