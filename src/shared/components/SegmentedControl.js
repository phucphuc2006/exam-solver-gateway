"use client";

import { cn } from "@/shared/utils/cn";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  const sizes = {
    sm: "h-7 text-xs",
    md: "h-9 text-sm",
    lg: "h-11 text-base",
  };

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center p-1 rounded-lg gap-1",
        "bg-black/5 dark:bg-white/5",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-4 rounded-md font-medium transition-all flex items-center justify-center whitespace-nowrap gap-1.5 shrink-0",
            sizes[size],
            value === option.value
              ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
              : "text-text-muted hover:text-text-main"
          )}
        >
          {option.icon && (
            <span className="material-symbols-outlined text-[16px]">
              {option.icon}
            </span>
          )}
          {option.label}
        </button>
      ))}
    </div>
  );
}
