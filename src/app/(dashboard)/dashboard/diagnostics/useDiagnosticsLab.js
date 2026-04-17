import { useState, useEffect, useMemo } from "react";
import { defaultPrompts } from "./diagnosticsLabUtils";

export function useDiagnosticsLab() {
  const [connections, setConnections] = useState([]);
  const [models, setModels] = useState([]);
  const [results, setResults] = useState([]);
  const [latestFlags, setLatestFlags] = useState([]);
  const [storageStatus, setStorageStatus] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [model, setModel] = useState("");
  const [modality, setModality] = useState("text");
  const [prompt, setPrompt] = useState(defaultPrompts.text);
  const [attachment, setAttachment] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState("");

  const selectedConnection = useMemo(
    () => connections.find((item) => item.id === selectedConnectionId) || null,
    [connections, selectedConnectionId],
  );

  const supportedCount = latestFlags.filter((item) => item.supported).length;

  async function loadDiagnostics(connectionId) {
    const query = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : "";
    const response = await fetch(`/api/diagnostics/results${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load diagnostics");
    }
    setResults(data.results || []);
    setLatestFlags(data.latestFlags || []);
  }

  async function loadStorageStatus() {
    const response = await fetch("/api/storage/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load storage status");
    }
    setStorageStatus(data);
  }

  async function loadConnections() {
    const response = await fetch("/api/providers", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load providers");
    }

    const safeConnections = data.connections || [];
    setConnections(safeConnections);
    if (!selectedConnectionId && safeConnections.length > 0) {
      setSelectedConnectionId(safeConnections[0].id);
    }
  }

  async function loadModels(connectionId) {
    if (!connectionId) {
      setModels([]);
      return;
    }

    setLoadingModels(true);
    try {
      const response = await fetch(`/api/providers/${connectionId}/models`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load models");
      }

      const nextModels = (data.models || []).map((item) => ({
        value: item.id || item.name,
        label: item.name || item.id,
      }));
      setModels(nextModels);

      if (nextModels.length > 0 && !nextModels.some((item) => item.value === model)) {
        setModel(nextModels[0].value);
      }
    } catch (caughtError) {
      setModels([]);
      setError(caughtError.message || "Failed to load models");
    } finally {
      setLoadingModels(false);
    }
  }

  useEffect(() => {
    Promise.all([loadConnections(), loadDiagnostics(), loadStorageStatus()]).catch((caughtError) => {
      setError(caughtError.message || "Failed to load diagnostics lab");
    });
  }, []);

  useEffect(() => {
    if (!selectedConnectionId) return;
    loadModels(selectedConnectionId).catch((caughtError) => {
      setError(caughtError.message || "Failed to load models");
    });
    loadDiagnostics(selectedConnectionId).catch((caughtError) => {
      setError(caughtError.message || "Failed to refresh diagnostics");
    });
  }, [selectedConnectionId]);

  async function handleAttachmentChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }

    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read attachment"));
      reader.readAsDataURL(file);
    });

    setAttachment({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      dataUrl,
      approxBytes: file.size,
    });
  }

  async function handleRunDiagnostic() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/diagnostics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          model,
          modality,
          prompt,
          attachmentDataUrl: attachment?.dataUrl || null,
          attachmentMimeType: attachment?.mimeType || null,
          attachmentName: attachment?.name || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Diagnostic run failed");
      }

      setLatestResult(data.result);
      await loadDiagnostics(selectedConnectionId);
      await loadStorageStatus();
    } catch (caughtError) {
      setError(caughtError.message || "Diagnostic run failed");
    } finally {
      setLoading(false);
    }
  }

  return {
    state: {
      connections,
      models,
      results,
      latestFlags,
      storageStatus,
      selectedConnectionId,
      model,
      modality,
      prompt,
      attachment,
      latestResult,
      loading,
      loadingModels,
      error,
      selectedConnection,
      supportedCount,
    },
    actions: {
      setConnections,
      setModels,
      setResults,
      setLatestFlags,
      setStorageStatus,
      setSelectedConnectionId,
      setModel,
      setModality,
      setPrompt,
      setAttachment,
      setLatestResult,
      setLoading,
      setLoadingModels,
      setError,
      handleAttachmentChange,
      handleRunDiagnostic,
    }
  };
}
