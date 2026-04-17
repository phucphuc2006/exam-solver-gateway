import { useState, useEffect } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

const TUNNEL_ACTION_TIMEOUT_MS = 90000;

export function useEndpoint() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);

  // Tunnel state
  const [requireApiKey, setRequireApiKey] = useState(false);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [tunnelShortId, setTunnelShortId] = useState("");
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelProgress, setTunnelProgress] = useState("");
  const [tunnelStatus, setTunnelStatus] = useState(null);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showEnableModal, setShowEnableModal] = useState(false);
  
  // API key visibility toggle state
  const [visibleKeys, setVisibleKeys] = useState(new Set());
  const [baseUrl, setBaseUrl] = useState("/v1");

  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/v1`);
    }
  }, []);

  const loadBootstrapData = async () => {
    try {
      const response = await fetch("/api/endpoint/bootstrap", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setRequireApiKey(data.requireApiKey || false);
        setKeys(data.keys || []);
        setTunnelEnabled(data.tunnel?.enabled || false);
        setTunnelUrl(data.tunnel?.tunnelUrl || "");
        setTunnelPublicUrl(data.tunnel?.publicUrl || "");
        setTunnelShortId(data.tunnel?.shortId || "");
      }
    } catch (error) {
      console.log("Error loading endpoint bootstrap:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrapData();
  }, []);

  const fetchData = async () => {
    try {
      const keysRes = await fetch("/api/keys");
      const keysData = await keysRes.json();
      if (keysRes.ok) {
        setKeys(keysData.keys || []);
      }
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequireApiKey = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireApiKey: value }),
      });
      if (res.ok) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  };

  const handleEnableTunnel = async () => {
    setShowEnableModal(false);
    setTunnelLoading(true);
    setTunnelStatus(null);
    setTunnelProgress("Connecting to server...");

    const progressSteps = [
      { delay: 2000, msg: "Creating tunnel..." },
      { delay: 5000, msg: "Starting cloudflared..." },
      { delay: 15000, msg: "Establishing connections..." },
      { delay: 30000, msg: "Waiting for tunnel ready..." },
    ];
    const timers = progressSteps.map(({ delay, msg }) =>
      setTimeout(() => setTunnelProgress(msg), delay)
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TUNNEL_ACTION_TIMEOUT_MS);
      const res = await fetch("/api/tunnel/enable", {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      timers.forEach(clearTimeout);
      const data = await res.json();
      if (res.ok) {
        setTunnelEnabled(true);
        setTunnelUrl(data.tunnelUrl || "");
        setTunnelPublicUrl(data.publicUrl || "");
        setTunnelShortId(data.shortId || "");
        setTunnelStatus({ type: "success", message: "Tunnel connected!" });
      } else {
        setTunnelStatus({ type: "error", message: data.error || "Failed to enable tunnel" });
      }
    } catch (error) {
      timers.forEach(clearTimeout);
      const msg = error?.name === "AbortError" ? "Tunnel creation timed out" : error.message;
      setTunnelStatus({ type: "error", message: msg });
    } finally {
      setTunnelLoading(false);
      setTunnelProgress("");
    }
  };

  const handleDisableTunnel = async () => {
    setTunnelLoading(true);
    setTunnelStatus(null);
    try {
      const res = await fetch("/api/tunnel/disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTunnelEnabled(false);
        setTunnelUrl("");
        setTunnelPublicUrl("");
        setTunnelStatus({ type: "success", message: "Tunnel disabled" });
        setShowDisableModal(false);
      } else {
        setTunnelStatus({ type: "error", message: data.error || "Failed to disable tunnel" });
      }
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      setTunnelLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();

      if (res.ok) {
        setCreatedKey(data.key);
        await fetchData();
        setNewKeyName("");
        setShowAddModal(false);
      }
    } catch (error) {
      console.log("Error creating key:", error);
    }
  };

  const handleDeleteKey = async (id) => {
    if (!confirm("Delete this API key?")) return;

    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setKeys(keys.filter((k) => k.id !== id));
        setVisibleKeys((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    } catch (error) {
      console.log("Error deleting key:", error);
    }
  };

  const handleToggleKey = async (id, isActive) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive } : k)));
      }
    } catch (error) {
      console.log("Error toggling key:", error);
    }
  };

  const toggleKeyVisibility = (keyId) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  const maskKey = (fullKey) => {
    if (!fullKey) return "";
    return fullKey.length > 8 ? fullKey.slice(0, 8) + "..." : fullKey;
  };

  return {
    state: {
      keys,
      loading,
      showAddModal,
      newKeyName,
      createdKey,
      requireApiKey,
      tunnelEnabled,
      tunnelUrl,
      tunnelPublicUrl,
      tunnelShortId,
      tunnelLoading,
      tunnelProgress,
      tunnelStatus,
      showDisableModal,
      showEnableModal,
      visibleKeys,
      baseUrl,
      copied,
    },
    actions: {
      setShowAddModal,
      setNewKeyName,
      setCreatedKey,
      setShowDisableModal,
      setShowEnableModal,
      handleRequireApiKey,
      handleEnableTunnel,
      handleDisableTunnel,
      handleCreateKey,
      handleDeleteKey,
      handleToggleKey,
      toggleKeyVisibility,
      maskKey,
      copy,
    }
  };
}
