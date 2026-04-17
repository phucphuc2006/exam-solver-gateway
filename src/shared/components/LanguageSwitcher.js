"use client";

import { useState, useEffect, useRef } from "react";
import { LOCALES, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { reloadTranslations } from "@/i18n/runtime";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

// Locale display names and flags
const getLocaleInfo = (locale) => {
  const locales = {
    "en": { name: "English", flag: "🇺🇸" },
    "vi": { name: "Tiếng Việt", flag: "🇻🇳" },
    "zh-CN": { name: "简体中文", flag: "🇨🇳" },
    "zh-TW": { name: "繁體中文", flag: "🇹🇼" },
    "ja": { name: "日本語", flag: "🇯🇵" },
    "pt-BR": { name: "Português (Brasil)", flag: "🇧🇷" },
    "pt-PT": { name: "Português (Portugal)", flag: "🇵🇹" },
    "ko": { name: "한국어", flag: "🇰🇷" },
    "es": { name: "Español", flag: "🇪🇸" },
    "de": { name: "Deutsch", flag: "🇩🇪" },
    "fr": { name: "Français", flag: "🇫🇷" },
    "he": { name: "עברית", flag: "🇮🇱" },
    "ar": { name: "العربية", flag: "🇸🇦" },
    "ru": { name: "Русский", flag: "🇷🇺" },
    "pl": { name: "Polski", flag: "🇵🇱" },
    "cs": { name: "Čeština", flag: "🇨🇿" },
    "nl": { name: "Nederlands", flag: "🇳🇱" },
    "tr": { name: "Türkçe", flag: "🇹🇷" },
    "uk": { name: "Українська", flag: "🇺🇦" },
    "tl": { name: "Tagalog", flag: "🇵🇭" },
    "id": { name: "Indonesia", flag: "🇮🇩" },
    "th": { name: "ไทย", flag: "🇹🇭" },
    "hi": { name: "हिन्दी", flag: "🇮🇳" },
    "bn": { name: "বাংলা", flag: "🇧🇩" },
    "ur": { name: "اردو", flag: "🇵🇰" },
    "ro": { name: "Română", flag: "🇷🇴" },
    "sv": { name: "Svenska", flag: "🇸🇪" },
    "it": { name: "Italiano", flag: "🇮🇹" },
    "el": { name: "Ελληνικά", flag: "🇬🇷" },
    "hu": { name: "Magyar", flag: "🇭🇺" },
    "fi": { name: "Suomi", flag: "🇫🇮" },
    "da": { name: "Dansk", flag: "🇩🇰" },
    "no": { name: "Norsk", flag: "🇳🇴" }
  };
  return locales[locale] || { name: locale, flag: "🌐" };
};

export default function LanguageSwitcher({ className = "" }) {
  const { t } = useRuntimeLocale();
  const [locale, setLocale] = useState("en");
  const [isPending, setIsPending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    setLocale(getLocaleFromCookie());
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    if (!isOpen) setSearch("");
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen]);

  const handleSetLocale = async (nextLocale) => {
    if (nextLocale === locale || isPending) return;

    setIsPending(true);
    setIsOpen(false);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });

      await reloadTranslations();
      setLocale(nextLocale);
    } catch (err) {
      console.error("Failed to set locale:", err);
    } finally {
      setIsPending(false);
    }
  };

  const filteredLocales = LOCALES.filter((item) => {
    if (!search) return true;
    const info = getLocaleInfo(item);
    const q = search.toLowerCase();
    return (
      info.name.toLowerCase().includes(q) ||
      item.toLowerCase().includes(q)
    );
  });

  const currentInfo = getLocaleInfo(locale);

  return (
    <div className={`relative ${className}`} ref={dropdownRef} data-i18n-skip="true">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-text-muted hover:text-text-main hover:bg-surface/60 transition-all duration-200"
        title={t("Language")}
        data-i18n-skip="true"
      >
        <span className="text-xl leading-none">{currentInfo.flag}</span>
        <span className="text-sm font-medium hidden sm:inline">{currentInfo.name}</span>
        <span
          className="material-symbols-outlined text-[16px] transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-64 bg-surface border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
          style={{
            animation: "dropdownIn 150ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-white/5">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-text-muted pointer-events-none">
                search
              </span>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search...")}
                className="w-full pl-8 pr-3 py-2 text-sm bg-black/10 dark:bg-white/5 border-0 rounded-lg text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Language list */}
          <div className="max-h-72 overflow-y-auto overscroll-contain py-1 scrollbar-thin">
            {filteredLocales.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-muted">
                {t("No results found")}
              </div>
            ) : (
              filteredLocales.map((item) => {
                const active = locale === item;
                const info = getLocaleInfo(item);
                return (
                  <button
                    key={item}
                    onClick={() => handleSetLocale(item)}
                    disabled={isPending}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm transition-colors duration-100 ${
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-text-main hover:bg-white/5"
                    } ${isPending ? "opacity-70 cursor-wait" : ""}`}
                    title={info.name}
                  >
                    <span className="text-lg leading-none shrink-0">{info.flag}</span>
                    <span className="font-medium truncate flex-1 text-left">{info.name}</span>
                    {active && (
                      <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                        check
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Dropdown animation keyframes */}
      <style jsx>{`
        @keyframes dropdownIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
