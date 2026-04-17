"use client";

import { startTransition, useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SegmentedControl from "@/shared/components/SegmentedControl";
import { CardSkeleton } from "@/shared/components/Loading";

const ChatgptWebPageClient = dynamic(() => import("./ChatgptWebPageClient"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const GeminiWebPageClient = dynamic(() => import("./GeminiWebPageClient"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const GrokWebPageClient = dynamic(() => import("./GrokWebPageClient"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const WEB_BRIDGE_TABS = [
  { value: "chatgpt", label: "GPT Bridge", icon: "robot_2" },
  { value: "gemini", label: "Gemini Web", icon: "auto_awesome" },
  { value: "grok", label: "Grok Web", icon: "psychiatry" },
];
const WEB_BRIDGE_EXTENSION_SOURCE = "nexusai-chatgpt-web-extension";
const WEB_BRIDGE_PAGE_SOURCE = "nexusai-chatgpt-web-page";

function normalizeTab(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (WEB_BRIDGE_TABS.some((tab) => tab.value === raw)) {
    return raw;
  }
  return "chatgpt";
}

export default function ChatgptWebPageShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = normalizeTab(searchParams.get("tab"));

  useEffect(() => {
    const rawTab = searchParams.get("tab");
    if (!rawTab) {
      return;
    }

    const normalizedTab = normalizeTab(rawTab);
    if (normalizedTab === rawTab) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    if (normalizedTab === "chatgpt") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", normalizedTab);
    }

    const query = nextParams.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleDashboardBridgePing = (event) => {
      if (event.source !== window) {
        return;
      }

      const payload = event.data;
      if (
        !payload
        || payload.source !== WEB_BRIDGE_EXTENSION_SOURCE
        || payload.type !== "DASHBOARD_PAGE_BRIDGE_PING"
      ) {
        return;
      }

      const activeTabConfig = WEB_BRIDGE_TABS.find((tab) => tab.value === activeTab) || WEB_BRIDGE_TABS[0];

      window.postMessage({
        source: WEB_BRIDGE_PAGE_SOURCE,
        type: "DASHBOARD_PAGE_BRIDGE_PONG",
        requestId: payload.requestId,
        payload: {
          bridgeReady: true,
          route: "/dashboard/chatgpt-web",
          dashboardUrl: window.location.href,
          title: document.title,
          respondedAt: new Date().toISOString(),
          activeTab,
          activeTabLabel: activeTabConfig.label,
        },
      }, "*");
    };

    window.addEventListener("message", handleDashboardBridgePing);
    return () => {
      window.removeEventListener("message", handleDashboardBridgePing);
    };
  }, [activeTab]);

  const handleTabChange = (nextTab) => {
    const normalizedTab = normalizeTab(nextTab);
    if (normalizedTab === activeTab) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    if (normalizedTab === "chatgpt") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", normalizedTab);
    }

    const query = nextParams.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={WEB_BRIDGE_TABS}
          value={activeTab}
          onChange={handleTabChange}
          size="lg"
        />
        <p className="text-xs text-text-muted">
          Mỗi tab dùng session và bridge riêng.
        </p>
      </div>

      {activeTab === "chatgpt" ? <ChatgptWebPageClient /> : null}
      {activeTab === "gemini" ? <GeminiWebPageClient /> : null}
      {activeTab === "grok" ? <GrokWebPageClient /> : null}
    </div>
  );
}
