// ── ChatGPT Web Page — Browser Extension Hook ──
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotificationStore } from "@/store/notificationStore";
import {
  CHATGPT_WEB_EXTENSION_PAGE_SOURCE,
  CHATGPT_WEB_EXTENSION_BRIDGE_SOURCE,
  CHATGPT_WEB_EXTENSION_REQUEST_TIMEOUT_MS,
  readStickyExtensionAvailability,
  writeStickyExtensionAvailability,
  getBrowserExtensionErrorMessage,
} from "./extensionBridge";

/**
 * Custom hook managing browser extension lifecycle:
 * - Detects extension availability via PING/PONG
 * - Manages postMessage request/response with timeout
 * - Clears stale extension-related notifications
 *
 * @param {{ isElectron: boolean }} options
 * @returns {{
 *   browserExtensionAvailable: boolean,
 *   browserExtensionAvailableRef: React.MutableRefObject<boolean>,
 *   markBrowserExtensionAvailable: (value: boolean) => void,
 *   clearExtensionBridgeNotifications: () => void,
 *   requestBrowserExtension: (type: string, payload?: object, timeoutMs?: number) => Promise<any>,
 *   extensionRequestResolversRef: React.MutableRefObject<Map>,
 * }}
 */
export function useBrowserExtension({ isElectron = false } = {}) {
  const [browserExtensionAvailable, setBrowserExtensionAvailable] = useState(false);
  const browserExtensionAvailableRef = useRef(false);
  const extensionRequestResolversRef = useRef(new Map());

  const markBrowserExtensionAvailable = useCallback((value) => {
    setBrowserExtensionAvailable(value);
    browserExtensionAvailableRef.current = value;
    writeStickyExtensionAvailability(value);
  }, []);

  const clearExtensionBridgeNotifications = useCallback(() => {
    const { notifications, removeNotification } = useNotificationStore.getState();
    const patterns = [
      /chatgpt web extension/i,
      /browser extension/i,
      /bridge cũ/i,
      /không phản hồi/i,
      /tải lại tab/i,
      /reload extension/i,
      /one-click qua browser extension/i,
    ];

    for (const entry of notifications) {
      const message = String(entry?.message || "");
      if (!message) {
        continue;
      }

      if (patterns.some((pattern) => pattern.test(message))) {
        removeNotification(entry.id);
      }
    }
  }, []);

  const requestBrowserExtension = useCallback((type, payload = {}, timeoutMs = CHATGPT_WEB_EXTENSION_REQUEST_TIMEOUT_MS) => (
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
            : "ChatGPT Web extension không phản hồi. Hãy kiểm tra extension đã được cài và bật cho dashboard.",
        ));
      }, timeoutMs);

      extensionRequestResolversRef.current.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      window.postMessage({
        source: CHATGPT_WEB_EXTENSION_PAGE_SOURCE,
        type,
        requestId,
        payload,
      }, "*");
    })
  ), []);

  // ── Extension message listener + PING probe ──
  useEffect(() => {
    if (typeof window === "undefined" || isElectron) {
      markBrowserExtensionAvailable(false);
      return;
    }

    const pendingExtensionRequests = extensionRequestResolversRef.current;
    const handleExtensionMessage = (event) => {
      if (event.source !== window) {
        return;
      }

      const payload = event.data;
      if (!payload || payload.source !== CHATGPT_WEB_EXTENSION_BRIDGE_SOURCE) {
        return;
      }

      if (payload.type === "READY" || payload.type === "PONG") {
        markBrowserExtensionAvailable(true);
        clearExtensionBridgeNotifications();
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
        const errorMessage = getBrowserExtensionErrorMessage(
          payload.error || payload.message,
          payload.code,
        );
        pending.reject(new Error(errorMessage));
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
          clearExtensionBridgeNotifications();
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
        pending.reject(new Error("ChatGPT Web extension bridge was reset."));
        pendingExtensionRequests.delete(requestId);
      }
    };
  }, [clearExtensionBridgeNotifications, isElectron, markBrowserExtensionAvailable, requestBrowserExtension]);

  // Hydrate sticky availability on mount
  useEffect(() => {
    if (typeof window !== "undefined" && readStickyExtensionAvailability()) {
      setBrowserExtensionAvailable(true);
      browserExtensionAvailableRef.current = true;
    }
  }, []);

  return {
    browserExtensionAvailable,
    browserExtensionAvailableRef,
    markBrowserExtensionAvailable,
    clearExtensionBridgeNotifications,
    requestBrowserExtension,
    extensionRequestResolversRef,
  };
}
