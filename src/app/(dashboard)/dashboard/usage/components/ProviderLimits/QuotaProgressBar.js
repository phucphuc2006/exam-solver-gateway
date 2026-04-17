"use client";

import { cn } from "@/shared/utils/cn";
import { formatResetTime } from "./utils";

// Calculate color based on remaining percentage
const getColorClasses = (remainingPercentage) => {
  if (remainingPercentage > 70) {
    return {
      text: "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]",
      bg: "bg-gradient-to-r from-emerald-500 to-green-400",
      shadow: "shadow-[0_0_15px_rgba(34,197,94,0.6)]",
      track: "bg-black/20 dark:bg-white/5 border border-white/5 shadow-inner",
      emoji: "🟢"
    };
  }
  
  if (remainingPercentage >= 30) {
    return {
      text: "text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]",
      bg: "bg-gradient-to-r from-orange-400 to-yellow-400",
      shadow: "shadow-[0_0_15px_rgba(234,179,8,0.6)]",
      track: "bg-black/20 dark:bg-white/5 border border-white/5 shadow-inner",
      emoji: "🟡"
    };
  }
  
  // 0-29% including 0% (out of quota) - show red
  return {
    text: "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]",
    bg: "bg-gradient-to-r from-rose-500 to-red-500",
    shadow: "shadow-[0_0_15px_rgba(239,68,68,0.6)]",
    track: "bg-black/20 dark:bg-white/5 border border-white/5 shadow-inner",
    emoji: "🔴"
  };
};

// Format reset time display
const formatResetTimeDisplay = (resetTime) => {
  if (!resetTime) return null;
  
  try {
    const resetDate = new Date(resetTime);
    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();
    const isTomorrow = resetDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    
    const timeStr = resetDate.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    
    if (isToday) return `Today, ${timeStr}`;
    if (isTomorrow) return `Tomorrow, ${timeStr}`;
    
    return resetDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
};

export default function QuotaProgressBar({
  percentage = 0,
  label = "",
  used = 0,
  total = 0,
  unlimited = false,
  resetTime = null
}) {
  const colors = getColorClasses(percentage);
  const countdown = formatResetTime(resetTime);
  const resetDisplay = formatResetTimeDisplay(resetTime);
  
  // Strip question marks and trim extraneous emojis from label if the API returns them mangled
  const cleanLabel = label.replace(/^\?+|\?+$/g, '').trim();

  // percentage is already remaining percentage (from ProviderLimitCard)
  const remaining = percentage;
  
  return (
    <div className="space-y-3 p-3 rounded-xl bg-black/10 dark:bg-[#11111a] border border-black/5 dark:border-white/5 hover:border-primary/30 transition-colors duration-300">
      {/* Label and percentage */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">
            {colors.emoji}
          </span>
          <span className="font-semibold text-text-primary tracking-wide">
            {cleanLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("font-bold text-lg", colors.text)}>
            {remaining}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {!unlimited && (
        <div className={cn("h-2.5 rounded-full overflow-hidden relative", colors.track)}>
          <div
            className={cn("absolute top-0 left-0 h-full transition-all duration-700 ease-out rounded-full", colors.bg, colors.shadow)}
            style={{ width: `${Math.min(remaining, 100)}%` }}
          />
        </div>
      )}

      {/* Usage details and countdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
        <div className="flex items-center gap-1.5 text-text-muted">
          <span className="font-mono bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-text-main">
            {used.toLocaleString()}
          </span>
          <span>/</span>
          <span className="font-mono bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-text-main">
            {total.toLocaleString()}
          </span>
          <span>requests</span>
        </div>
        
        {countdown !== "-" && (
          <div className="flex items-center gap-1.5 text-text-muted justify-end">
            <span className="material-symbols-outlined text-[14px]">timer</span>
            <span className="font-medium animate-pulse text-text-main">in {countdown}</span>
          </div>
        )}
      </div>

      {/* Reset time display */}
      {resetDisplay && (
        <div className="text-[10px] text-text-muted/60 text-right uppercase tracking-wider font-semibold">
          Reset {resetDisplay}
        </div>
      )}
    </div>
  );
}
