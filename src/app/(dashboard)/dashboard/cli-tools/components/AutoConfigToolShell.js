"use client";

import Image from "next/image";
import { Card } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

function hexToRgba(hex, alpha) {
  const raw = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `rgba(56, 189, 248, ${alpha})`;
  }

  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getModeLabel(configType) {
  if (configType === "guide") return "Manual guide";
  if (configType === "mitm") return "MITM";
  return "One-click";
}

export function getAutoConfigStatusMeta(status) {
  if (status === "configured") {
    return {
      label: "Linked",
      icon: "check_circle",
      textColor: "#b8ffcb",
      background: "rgba(46, 204, 113, 0.16)",
      borderColor: "rgba(46, 204, 113, 0.3)",
    };
  }

  if (status === "not_configured") {
    return {
      label: "Pending",
      icon: "hourglass_top",
      textColor: "#ffe19a",
      background: "rgba(245, 158, 11, 0.16)",
      borderColor: "rgba(245, 158, 11, 0.28)",
    };
  }

  if (status === "other") {
    return {
      label: "External",
      icon: "compare_arrows",
      textColor: "#9fd8ff",
      background: "rgba(59, 130, 246, 0.16)",
      borderColor: "rgba(59, 130, 246, 0.28)",
    };
  }

  return {
    label: "Guide",
    icon: "menu_book",
    textColor: "#f6e6bf",
    background: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.12)",
  };
}

function renderToolVisual(tool) {
  if (tool?.image) {
    return (
      <Image
        src={tool.image}
        alt={tool.name}
        width={32}
        height={32}
        className="size-8 object-contain rounded-lg"
        sizes="32px"
      />
    );
  }

  if (tool?.icon) {
    return (
      <span className="material-symbols-outlined text-[20px]" style={{ color: tool?.color || "#38bdf8" }}>
        {tool.icon}
      </span>
    );
  }

  if (tool?.id) {
    return (
      <Image
        src={`/providers/${tool.id}.png`}
        alt={tool.name}
        width={32}
        height={32}
        className="size-8 object-contain rounded-lg"
        sizes="32px"
      />
    );
  }

  return (
    <div className="size-8 rounded-lg bg-white/10" />
  );
}

export default function AutoConfigToolShell({
  tool,
  isExpanded,
  onToggle,
  status,
  children,
  className,
}) {
  const accent = tool?.color || "#38bdf8";
  const accentSoft = hexToRgba(accent, 0.16);
  const accentGlow = hexToRgba(accent, 0.28);
  const statusMeta = getAutoConfigStatusMeta(status);

  return (
    <Card
      padding="none"
      className={cn("overflow-hidden border-0 bg-transparent shadow-none", className)}
    >
      <div
        className="relative overflow-hidden rounded-[22px] border shadow-[0_14px_34px_rgba(0,0,0,0.22)]"
        style={{
          borderColor: "rgba(228, 217, 191, 0.08)",
          background: "linear-gradient(180deg, rgba(16, 30, 31, 0.98) 0%, rgba(22, 29, 26, 0.99) 52%, rgba(37, 29, 23, 1) 100%)",
          boxShadow: `0 18px 40px ${hexToRgba(accent, 0.12)}`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, ${accentGlow} 0%, ${accent} 50%, ${accentGlow} 100%)` }}
        />
        <div
          className="pointer-events-none absolute -right-10 top-0 h-28 w-28 rounded-full blur-3xl"
          style={{ background: accentSoft }}
        />
        <div
          className="pointer-events-none absolute -bottom-10 left-0 h-24 w-28 rounded-full blur-3xl"
          style={{ background: "rgba(214, 156, 92, 0.12)" }}
        />

        <button
          type="button"
          onClick={onToggle}
          className="group relative flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.03]"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <div
              className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border"
              style={{
                borderColor: "rgba(236, 226, 205, 0.1)",
                background: `linear-gradient(180deg, ${hexToRgba(accent, 0.18)} 0%, rgba(255,255,255,0.025) 100%)`,
                boxShadow: `inset 0 1px 0 ${hexToRgba(accent, 0.22)}`,
              }}
            >
              {renderToolVisual(tool)}
            </div>

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-white/42">
                  {getModeLabel(tool?.configType)}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]"
                  style={{
                    color: statusMeta.textColor,
                    background: statusMeta.background,
                    borderColor: statusMeta.borderColor,
                  }}
                >
                  <span className="material-symbols-outlined text-[12px]">{statusMeta.icon}</span>
                  {statusMeta.label}
                </span>
              </div>

              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold tracking-tight text-white">
                  {tool?.name}
                </h3>
                <p className="line-clamp-1 text-[13px] leading-5 text-white/64">
                  {tool?.description}
                </p>
              </div>
            </div>
          </div>

          <div
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border transition-transform duration-200"
            style={{
              borderColor: "rgba(236, 226, 205, 0.1)",
              background: isExpanded ? accentSoft : "rgba(255,255,255,0.04)",
              color: isExpanded ? accent : "rgba(255,255,255,0.58)",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <span className="material-symbols-outlined text-[16px]">expand_more</span>
          </div>
        </button>

        {isExpanded ? (
          <div
            className="border-t px-3 py-3 backdrop-blur-sm"
            style={{
              borderColor: "rgba(236, 226, 205, 0.08)",
              background: "linear-gradient(180deg, rgba(6, 13, 13, 0.36) 0%, rgba(17, 19, 16, 0.5) 100%)",
            }}
          >
            {children}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
