"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "./config";
import { onLocaleChange, translate } from "./runtime";

function readLocaleFromCookie() {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }

  const cookie = document.cookie
    .split(";")
    .find((value) => value.trim().startsWith(`${LOCALE_COOKIE}=`));

  if (!cookie) {
    return DEFAULT_LOCALE;
  }

  return normalizeLocale(decodeURIComponent(cookie.split("=")[1]));
}

export function useRuntimeLocale() {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [, setRevision] = useState(0);

  useEffect(() => {
    const syncLocale = (nextLocale) => {
      setLocale(nextLocale || readLocaleFromCookie());
      setRevision((current) => current + 1);
    };

    syncLocale();
    return onLocaleChange(syncLocale);
  }, []);

  const t = useCallback(
    (text) => {
      if (locale === DEFAULT_LOCALE) {
        return text;
      }

      return translate(text);
    },
    [locale]
  );

  return { locale, t };
}
