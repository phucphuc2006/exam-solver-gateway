/**
 * Hook providing session action handlers: connect, validate, disconnect, auto-connect, update settings.
 */
import { useCallback, useState } from "react";
import { useNotificationStore } from "@/store/notificationStore";

/**
 * @param {{
 *   config: object,
 *   setSession: Function,
 *   setTestOutput: Function,
 *   setTestMetrics: Function,
 *   setAttachments: Function,
 *   setPsid: Function,
 *   setPsidts: Function,
 *   setCookieHeader: Function,
 *   loadData: Function,
 *   markBrowserExtensionAvailable: Function,
 *   requestBrowserExtension: Function,
 *   psid: string,
 *   psidts: string,
 *   cookieHeader: string,
 *   historySyncEnabled: boolean,
 *   sessionModeEnabled: boolean,
 *   conversationRotationInterval: number,
 *   useExtensionCapture: boolean,
 * }} options
 */
export function useSessionActions({
  config,
  setSession,
  setTestOutput,
  setTestMetrics,
  setAttachments,
  setPsid,
  setPsidts,
  setCookieHeader,
  loadData,
  markBrowserExtensionAvailable,
  requestBrowserExtension,
  psid,
  psidts,
  cookieHeader,
  historySyncEnabled,
  sessionModeEnabled,
  conversationRotationInterval,
  useExtensionCapture,
}) {
  const notify = useNotificationStore();
  const [busyAction, setBusyAction] = useState("");

  const autoConnectBusy = busyAction === "auto-connect";
  const connectBusy = busyAction === "connect";
  const validateBusy = busyAction === "validate";
  const disconnectBusy = busyAction === "disconnect";
  const settingsBusy = busyAction === "settings";
  const testBusy = busyAction === "test";

  const updateConversationSettings = useCallback(async (patch = {}) => {
    setBusyAction("settings");
    try {
      const response = await fetch(`/api/${config.providerKey}/session`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historySyncEnabled,
          sessionModeEnabled,
          conversationRotationInterval,
          ...patch,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Không thể cập nhật cài đặt hội thoại cho ${config.title}.`);
      }

      setSession(data?.session || null);
      notify.success(`${config.title} đã cập nhật cài đặt hội thoại.`);
    } catch (error) {
      notify.error(error.message || `Không thể cập nhật cài đặt hội thoại cho ${config.title}.`);
    } finally {
      setBusyAction("");
    }
  }, [config.providerKey, config.title, historySyncEnabled, sessionModeEnabled, conversationRotationInterval, notify, setSession]);

  const handleConnect = useCallback(async () => {
    setBusyAction("connect");
    try {
      const payload = config.connectMode === "gemini-tokens"
        ? { psid, psidts }
        : { cookieHeader };

      const response = await fetch(`/api/${config.providerKey}/session/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Không thể kết nối ${config.title}.`);
      }

      setSession(data.session || null);
      notify.success(`${config.title} đã lưu session.`);
      if (config.connectMode === "cookie-header") {
        setCookieHeader("");
      }
    } catch (error) {
      notify.error(error.message || `Không thể kết nối ${config.title}.`);
    } finally {
      setBusyAction("");
    }
  }, [config.connectMode, config.providerKey, config.title, cookieHeader, notify, psid, psidts, setCookieHeader, setSession]);

  const handleValidate = useCallback(async () => {
    setBusyAction("validate");
    try {
      const response = await fetch(`/api/${config.providerKey}/session/validate`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Không thể validate ${config.title}.`);
      }

      setSession(data.session || null);
      notify.success(`${config.title} đã validate thành công.`);
    } catch (error) {
      notify.error(error.message || `Không thể validate ${config.title}.`);
    } finally {
      setBusyAction("");
    }
  }, [config.providerKey, config.title, notify, setSession]);

  const handleAutoConnect = useCallback(async () => {
    setBusyAction("auto-connect");

    try {
      const extensionResult = await requestBrowserExtension(
        "AUTO_CONNECT",
        { provider: config.providerKey, enableHtmlFetch: useExtensionCapture },
        config.autoConnectTimeoutMs || 15_000,
      );

      const sessionPayload = extensionResult?.sessionPayload;
      if (!sessionPayload || typeof sessionPayload !== "object" || Array.isArray(sessionPayload)) {
        throw new Error(`${config.title} extension không trả về session hợp lệ.`);
      }

      const importResponse = await fetch(`/api/${config.providerKey}/session/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionPayload),
      });
      const importData = await importResponse.json();

      if (!importResponse.ok) {
        throw new Error(importData?.error || `Không thể import session ${config.title} từ extension.`);
      }

      if (importData?.session) {
        setSession(importData.session);
      }

      let validateData = null;
      if (importData?.session?.status !== "validated") {
        const validateResponse = await fetch(`/api/${config.providerKey}/session/validate`, {
          method: "POST",
        });
        validateData = await validateResponse.json();

        if (!validateResponse.ok) {
          if (validateData?.session) {
            setSession(validateData.session);
          } else {
            await loadData().catch(() => {});
          }
          throw new Error(validateData?.error || `Không thể validate ${config.title} sau khi import từ extension.`);
        }
      }

      setSession(validateData?.session || importData.session || null);
      setPsid("");
      setPsidts("");
      setCookieHeader("");
      markBrowserExtensionAvailable(true);
      notify.success(extensionResult?.message || `${config.title} đã tự kết nối qua extension.`);
    } catch (error) {
      notify.error(error.message || `Không thể tự động kết nối ${config.title}.`);
    } finally {
      setBusyAction("");
    }
  }, [config, loadData, markBrowserExtensionAvailable, notify, requestBrowserExtension, setCookieHeader, setPsid, setPsidts, setSession, useExtensionCapture]);

  const handleDisconnect = useCallback(async () => {
    setBusyAction("disconnect");
    try {
      const response = await fetch(`/api/${config.providerKey}/session`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Không thể ngắt ${config.title}.`);
      }

      setSession(null);
      setTestOutput("");
      setTestMetrics(null);
      setAttachments([]);
      notify.success(`${config.title} đã ngắt kết nối.`);
    } catch (error) {
      notify.error(error.message || `Không thể ngắt ${config.title}.`);
    } finally {
      setBusyAction("");
    }
  }, [config.providerKey, config.title, notify, setAttachments, setSession, setTestMetrics, setTestOutput]);

  return {
    busyAction,
    setBusyAction,
    autoConnectBusy,
    connectBusy,
    validateBusy,
    disconnectBusy,
    settingsBusy,
    testBusy,
    updateConversationSettings,
    handleConnect,
    handleValidate,
    handleAutoConnect,
    handleDisconnect,
    notify,
  };
}
