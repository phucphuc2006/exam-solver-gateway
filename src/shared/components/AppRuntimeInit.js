"use client";

import { useEffect } from "react";

let initialized = false;

export default function AppRuntimeInit() {
  useEffect(() => {
    if (initialized) return;
    initialized = true;

    const runInit = () => {
      fetch("/api/init", {
        method: "GET",
        cache: "no-store",
        keepalive: true,
      }).catch(() => {});
    };

    if (typeof window === "undefined") {
      runInit();
      return undefined;
    }

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(() => {
        runInit();
      }, { timeout: 4_000 });

      return () => {
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(runInit, 1_500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
