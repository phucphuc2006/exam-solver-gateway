import { useState, useCallback, useEffect, useMemo } from "react";

export function useBridgeMode(config) {
  const [bridgeMode, setBridgeModeState] = useState("direct"); // "direct" | "inject"
  const [browserInjectMode, setBrowserInjectMode] = useState(false);

  // ── Load bridgeMode từ localStorage + backend ──
  const BRIDGE_MODE_KEY = `nexusai-bridge-mode-${config.providerKey}`;
  const setBridgeMode = useCallback((mode) => {
    const validMode = mode === "inject" ? "inject" : "direct";
    setBridgeModeState(validMode);
    setBrowserInjectMode(validMode === "inject");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BRIDGE_MODE_KEY, validMode);
    }
    // Sync to backend
    fetch("/api/inject-relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-mode", provider: config.providerKey, mode: validMode }),
    }).catch(() => {});
  }, [BRIDGE_MODE_KEY, config.providerKey]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedMode = window.localStorage.getItem(BRIDGE_MODE_KEY);
      if (savedMode === "inject") {
        setBridgeModeState("inject");
        setBrowserInjectMode(true);
      }
    }
  }, [BRIDGE_MODE_KEY]);

  const bridgeModeOptions = useMemo(() => ([
    { value: "direct", label: "🔗 Direct API" },
    { value: "inject", label: "🌐 Browser Inject" },
  ]), []);

  return {
    bridgeMode,
    browserInjectMode,
    setBridgeMode,
    bridgeModeOptions,
  };
}
