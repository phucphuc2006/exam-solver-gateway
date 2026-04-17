/**
 * Hook managing inject-mode lifecycle — relay messages from extension, config sync.
 */
import { useEffect, useRef, useState } from "react";

/**
 * @param {{
 *   browserInjectMode: boolean,
 *   browserExtensionAvailable: boolean,
 *   requestBrowserExtension: Function,
 *   config: { providerKey: string },
 *   origin: string,
 *   setTestOutput: (value: string) => void,
 *   setTestMetrics: (updater: Function) => void,
 *   setBusyAction: (value: string) => void,
 * }} options
 * @returns {{ injectReady: boolean, injectTaskIdRef: React.MutableRefObject<string|null> }}
 */
export function useInjectMode({
  browserInjectMode,
  browserExtensionAvailable,
  requestBrowserExtension,
  config,
  origin,
  setTestOutput,
  setTestMetrics,
  setBusyAction,
}) {
  const [injectReady, setInjectReady] = useState(false);
  const injectTaskIdRef = useRef(null);

  // ── Listen for relay messages from extension ──
  useEffect(() => {
    if (!browserInjectMode) return;

    function handleInjectMessage(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== "nexusai-chatgpt-web-extension") return;

      const taskId = data.taskId || "";
      if (taskId && injectTaskIdRef.current && taskId !== injectTaskIdRef.current) return;

      if (data.type === "INJECT_DELTA") {
        setTestOutput(data.fullText || "");
      } else if (data.type === "INJECT_DONE") {
        setTestOutput(data.text || "");
        setTestMetrics((m) => ({ ...(m || {}), completedMs: Date.now() - (m?._startTime || Date.now()) }));
        setBusyAction("");
        injectTaskIdRef.current = null;
      } else if (data.type === "INJECT_ERROR") {
        setTestOutput(`Inject Error: ${data.error || "Unknown error"}`);
        setBusyAction("");
        injectTaskIdRef.current = null;
      } else if (data.type === "INJECT_SUBMITTED") {
        setTestMetrics((m) => ({ ...(m || {}), upstreamReadyMs: Date.now() - (m?._startTime || Date.now()) }));
      } else if (data.type === "INJECTOR_READY") {
        if (data.provider === config.providerKey) {
          setInjectReady(true);
        }
      }
    }

    window.addEventListener("message", handleInjectMessage);
    return () => window.removeEventListener("message", handleInjectMessage);
  }, [browserInjectMode, config.providerKey, setBusyAction, setTestMetrics, setTestOutput]);

  // ── Config sync: notify extension + backend when inject mode toggles ──
  useEffect(() => {
    if (!browserExtensionAvailable) {
      setInjectReady(false);
      return;
    }

    const baseUrl = origin || (typeof window !== "undefined" ? window.location.origin : "");

    // Send INJECT_RELAY_CONFIG to extension (persistent WS connection)
    requestBrowserExtension("INJECT_RELAY_CONFIG", {
      provider: config.providerKey,
      enabled: browserInjectMode,
      baseUrl,
      wsPort: 21099,
    }, 5000).catch(() => {});

    if (browserInjectMode) {
      // Check content script readiness
      requestBrowserExtension("INJECT_STATUS", { provider: config.providerKey }, 5000)
        .then((res) => setInjectReady(res?.ready === true))
        .catch(() => setInjectReady(false));

      // POST config to backend
      fetch("/api/inject-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "config", provider: config.providerKey, enabled: true }),
      }).catch(() => {});
    } else {
      setInjectReady(false);

      fetch("/api/inject-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "config", provider: config.providerKey, enabled: false }),
      }).catch(() => {});
    }
  }, [browserInjectMode, browserExtensionAvailable, config.providerKey, origin, requestBrowserExtension]);

  return { injectReady, injectTaskIdRef };
}
