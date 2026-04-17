"use client";

import { formatResetTime, calculatePercentage } from "./utils";
import ProviderIcon from "@/shared/components/ProviderIcon";

/**
 * Get provider ID / logo from model name
 */
function getProviderIdFromModel(modelName) {
  if (!modelName) return 'default';
  const name = modelName.toLowerCase();
  
  // Specific model families
  if (name.includes('gpt') || name.includes('o1-') || name.includes('o3-') || name.includes('dall-e')) return 'openai';
  if (name.includes('claude')) return 'anthropic';
  if (name.includes('gemini') || name.includes('gemma')) return 'google';
  if (name.includes('sonar') || name.includes('perplexity')) return 'perplexity';
  if (name.includes('qwen') || name.includes('qwq')) return 'qwen';
  if (name.includes('llama') || name.includes('meta')) return 'meta';
  if (name.includes('mistral') || name.includes('mixtral') || name.includes('codestral') || name.includes('pixtral')) return 'mistral';
  if (name.includes('deepseek')) return 'deepseek';
  if (name.includes('cohere') || name.includes('command')) return 'cohere';
  if (name.includes('moonshot') || name.includes('kimi')) return 'moonshot';
  if (name.includes('doubao')) return 'doubao';
  if (name.includes('ernie')) return 'ernie';
  if (name.includes('yi-') || name.includes('01.ai')) return 'yi';
  if (name.includes('glm') || name.includes('zhipu')) return 'zhipu';
  if (name.includes('baichuan')) return 'baichuan';
  if (name.includes('grok')) return 'xai';
  if (name.includes('silicon')) return 'siliconflow';
  if (name.includes('groq')) return 'groq';
  if (name.includes('openrouter')) return 'openrouter';
  
  return 'default';
}

/**
 * Format reset time display (Today, 12:00 PM)
 * ...
 */
function formatResetTimeDisplay(resetTime) {
  if (!resetTime) return null;
  
  try {
    const date = new Date(resetTime);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let dayStr = "";
    if (date >= today && date < tomorrow) {
      dayStr = "Today";
    } else if (date >= tomorrow && date < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
      dayStr = "Tomorrow";
    } else {
      dayStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    
    const timeStr = date.toLocaleTimeString("en-US", { 
      hour: "numeric", 
      minute: "2-digit",
      hour12: true 
    });
    
    return `${dayStr}, ${timeStr}`;
  } catch {
    return null;
  }
}

/**
 * Get color classes based on remaining percentage
 */
function getColorClasses(remainingPercentage) {
  if (remainingPercentage > 70) {
    return {
      text: "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.4)]",
      bg: "bg-gradient-to-r from-emerald-500 to-green-400",
      shadow: "shadow-[0_0_12px_rgba(34,197,94,0.5)]",
      track: "bg-white/5 border border-white/10 shadow-inner",
      emoji: "🟢"
    };
  }
  
  if (remainingPercentage >= 30) {
    return {
      text: "text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]",
      bg: "bg-gradient-to-r from-orange-400 to-yellow-400",
      shadow: "shadow-[0_0_12px_rgba(234,179,8,0.5)]",
      track: "bg-white/5 border border-white/10 shadow-inner",
      emoji: "🟡"
    };
  }
  
  return {
    text: "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]",
    bg: "bg-gradient-to-r from-rose-500 to-red-500",
    shadow: "shadow-[0_0_12px_rgba(239,68,68,0.5)]",
    track: "bg-white/5 border border-white/10 shadow-inner",
    emoji: "🔴"
  };
}

/**
 * Quota Table Component - Table-based display for quota data
 */
export default function QuotaTable({ quotas = [] }) {
  if (!quotas || quotas.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto p-1 rounded-xl bg-black/10 dark:bg-[#11111a]/50 border border-black/5 dark:border-white/5">
      <table className="w-full table-fixed">
        <colgroup><col className="w-[28%]" /><col className="w-[45%]" /><col className="w-[27%]" /></colgroup>
        <tbody>
          {quotas.map((quota, index) => {
            const remaining = quota.remainingPercentage !== undefined
              ? Math.round(quota.remainingPercentage)
              : calculatePercentage(quota.used, quota.total);
            
            const colors = getColorClasses(remaining);
            const countdown = formatResetTime(quota.resetAt);
            const resetDisplay = formatResetTimeDisplay(quota.resetAt);
            const logoId = getProviderIdFromModel(quota.name);
            const cleanLabel = (quota.name || "").replace(/^\?+|\?+$/g, '').trim();

            return (
              <tr 
                key={index}
                className="group border-b border-black/5 dark:border-white/5 last:border-b-0 hover:bg-white/[0.03] transition-all duration-300"
              >
                {/* Model Name with Status Icon */}
                <td className="py-4 px-4 align-middle">
                  <div className="flex items-center gap-2.5">
                    {logoId !== 'default' && (
                      <ProviderIcon 
                        src={`/providers/${logoId}.png`}
                        alt={logoId}
                        size={20}
                        className="rounded-md select-none shrink-0"
                      />
                    )}
                    <span className="text-xl shrink-0 opacity-90 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                      {colors.emoji}
                    </span>
                    <span className="text-sm font-semibold tracking-wide text-text-primary group-hover:text-primary transition-colors truncate">
                      {cleanLabel}
                    </span>
                  </div>
                </td>

                {/* Limit (Progress + Numbers) */}
                <td className="py-4 px-3 align-middle">
                  <div className="space-y-2">
                    {/* Progress bar with glassmorphism & neon */}
                    <div className={`h-1.5 rounded-full relative overflow-hidden ${colors.track}`}>
                      <div
                        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-700 ease-out ${colors.bg} ${colors.shadow}`}
                        style={{ width: `${Math.min(remaining, 100)}%` }}
                      />
                    </div>
                    
                    {/* Numbers */}
                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="flex items-center gap-1 text-text-muted font-mono">
                        <span className="bg-white/5 px-1 rounded text-text-main">
                          {quota.used.toLocaleString()}
                        </span>
                        <span className="opacity-50">/</span>
                        <span className="bg-white/5 px-1 rounded text-text-main">
                          {quota.total > 0 ? quota.total.toLocaleString() : "∞"}
                        </span>
                      </div>
                      <span className={`font-bold ${colors.text}`}>
                        {remaining}%
                      </span>
                    </div>
                  </div>
                </td>

                {/* Reset Time */}
                <td className="py-4 px-4 align-middle text-right">
                  {countdown !== "-" || resetDisplay ? (
                    <div className="flex flex-col items-end justify-center h-full space-y-1">
                      {countdown !== "-" && (
                        <div className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-text-primary">
                          <span className="material-symbols-outlined text-[14px] text-text-muted">timer</span>
                          in {countdown}
                        </div>
                      )}
                      {resetDisplay && (
                        <div className="text-[10px] uppercase tracking-widest text-text-muted/60 font-medium">
                          {resetDisplay}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-text-muted/50 italic flex items-center justify-end h-full">N/A</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
