/**
 * Hook managing browser extension bridge lifecycle (PING/PONG, message routing, request/response).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  WEB_EXTENSION_PAGE_SOURCE,
  WEB_EXTENSION_BRIDGE_SOURCE,
  WEB_EXTENSION_REQUEST_TIMEOUT_MS,
  readStickyExtensionAvailability,
  writeStickyExtensionAvailability,
} from "../manualWebBridgeCache";

/**
 * @param {{ isElectron: boolean }} options
 * @returns {{
 *   browserExtensionAvailable: boolean,
 *   markBrowserExtensionAvailable: (value: boolean) => void,
 *   requestBrowserExtension: (type: string, payload?: object, timeoutMs?: number) => Promise<any>,
 * }}
 */
export function useExtensionBridge({ isElectron }) {
  const extensionRequestResolversRef = useRef(new Map());
  const [browserExtensionAvailable, setBrowserExtensionAvailable] = useState(false);
  const browserExtensionAvailableRef = useRef(false);

  const markBrowserExtensionAvailable = useCallback((value) => {
    setBrowserExtensionAvailable(value);
    browserExtensionAvailableRef.current = value;
    writeStickyExtensionAvailability(value);
  }, []);

  const requestBrowserExtension = useCallback((type, payload = {}, timeoutMs = WEB_EXTENSION_REQUEST_TIMEOUT_MS) => (
    new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("Browser extension bridge is unavailable on the server."));
        return;
      }

      const extensionWasAvailable = browserExtensionAvailableRef.current;
      const requestId = crypto.randomUUID();
      const timeoutId = window.setTimeout(() => {
        extensionRequestResolversRef.current.delete(requestId);
        reject(new Error(
          extensionWasAvailable
            ? "Bridge của browser extension đang hiện diện nhưng request không trả lời. Hãy reload extension và tải lại tab dashboard rồi thử lại."
            : "Browser extension không phản hồi. Hãy kiểm tra extension đã được cài và bật cho dashboard.",
        ));
      }, timeoutMs);

      extensionRequestResolversRef.current.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      window.postMessage({
        source: WEB_EXTENSION_PAGE_SOURCE,
        type,
        requestId,
        payload,
      }, "*");
    })
  ), []);

  // ── Initial sticky extension availability ──
  useEffect(() => {
    if (typeof window !== "undefined" && readStickyExtensionAvailability()) {
      setBrowserExtensionAvailable(true);
      browserExtensionAvailableRef.current = true;
    }
  }, []);

  // ── Extension message listener + PING probe ──
  useEffect(() => {
    if (typeof window === "undefined" || isElectron) {
      markBrowserExtensionAvailable(false);
      return undefined;
    }

    const pendingExtensionRequests = extensionRequestResolversRef.current;
    const handleExtensionMessage = (event) => {
      if (event.source !== window) {
        return;
      }

      const payload = event.data;
      if (!payload || payload.source !== WEB_EXTENSION_BRIDGE_SOURCE) {
        return;
      }

      if (payload.type === "READY" || payload.type === "PONG") {
        markBrowserExtensionAvailable(true);
      }

      const requestId = String(payload.requestId || "");
      if (!requestId) {
        return;
      }

      const pending = pendingExtensionRequests.get(requestId);
      if (!pending) {
        return;
      }

      window.clearTimeout(pending.timeoutId);
      pendingExtensionRequests.delete(requestId);

      if (payload.ok === false) {
        pending.reject(new Error(
          String(payload.error || payload.message || "Browser extension request failed."),
        ));
        return;
      }

      pending.resolve(payload.payload ?? payload);
    };

    window.addEventListener("message", handleExtensionMessage);

    let cancelled = false;
    const stickyAvailable = readStickyExtensionAvailability();
    if (stickyAvailable) {
      setBrowserExtensionAvailable(true);
    }

    void requestBrowserExtension("PING", {}, 4_000)
      .then(() => {
        if (!cancelled) {
          markBrowserExtensionAvailable(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBrowserExtensionAvailable(false);
          writeStickyExtensionAvailability(false);
        }
      });

    return () => {
      cancelled = true;
      window.removeEventListener("message", handleExtensionMessage);
      for (const [requestId, pending] of pendingExtensionRequests.entries()) {
        window.clearTimeout(pending.timeoutId);
        pending.reject(new Error("Browser extension bridge was reset."));
        pendingExtensionRequests.delete(requestId);
      }
    };
  }, [isElectron, markBrowserExtensionAvailable, requestBrowserExtension]);

  return {
    browserExtensionAvailable,
    markBrowserExtensionAvailable,
    requestBrowserExtension,
  };
}
