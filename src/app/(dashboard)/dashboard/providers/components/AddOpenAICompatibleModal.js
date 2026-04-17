import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Badge,
  Button,
  Input,
  Modal,
  Select,
} from "@/shared/components";

const OPENAI_COMPATIBLE_FREE_PRESETS = [
  {
    id: "sambanova",
    name: "SambaNova Cloud",
    prefix: "samba",
    baseUrl: "https://api.sambanova.ai/v1",
    apiType: "chat",
    note: "Official OpenAI-compatible endpoint with free API access.",
  },
  {
    id: "huggingface",
    name: "Hugging Face Router",
    prefix: "hf",
    baseUrl: "https://router.huggingface.co/v1",
    apiType: "chat",
    note: "OpenAI-compatible router; free monthly credits depend on your HF plan.",
  },
];

export default function AddOpenAICompatibleModal({ isOpen, onClose, onCreated }) {
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    apiType: "chat",
    baseUrl: "https://api.openai.com/v1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const apiTypeOptions = [
    { value: "chat", label: "Chat Completions" },
    { value: "responses", label: "Responses API" },
  ];

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      name: "",
      prefix: "",
      apiType: "chat",
      baseUrl: "https://api.openai.com/v1",
    });
    setCheckKey("");
    setCheckModelId("");
    setValidationResult(null);
  }, [isOpen]);

  const applyPreset = (preset) => {
    setFormData({
      name: preset.name,
      prefix: preset.prefix,
      apiType: preset.apiType,
      baseUrl: preset.baseUrl,
    });
    setValidationResult(null);
  };

  const handleSubmit = async () => {
    if (
      !formData.name.trim() ||
      !formData.prefix.trim() ||
      !formData.baseUrl.trim()
    )
      return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          prefix: formData.prefix,
          apiType: formData.apiType,
          baseUrl: formData.baseUrl,
          type: "openai-compatible",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.node);
        setFormData({
          name: "",
          prefix: "",
          apiType: "chat",
          baseUrl: "https://api.openai.com/v1",
        });
        setCheckKey("");
        setValidationResult(null);
      }
    } catch (error) {
      console.log("Error creating OpenAI Compatible node:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: "openai-compatible",
          modelId: checkModelId.trim() || undefined,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, method } = validationResult;

    if (valid) {
      return (
        <>
          <Badge variant="success">Valid</Badge>
          {method === "chat" && (
            <span className="text-sm text-text-muted">
              (via inference test)
            </span>
          )}
        </>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="error">Invalid</Badge>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} title="Add OpenAI Compatible" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text">Quick presets</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPENAI_COMPATIBLE_FREE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-xl border border-border bg-bg-subtle px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-bg"
              >
                <div className="text-sm font-medium text-text">{preset.name}</div>
                <div className="mt-1 text-xs text-text-muted">{preset.baseUrl}</div>
                <div className="mt-2 text-xs text-text-muted">{preset.note}</div>
              </button>
            ))}
          </div>
        </div>
        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="OpenAI Compatible (Prod)"
          hint="Required. A friendly label for this node."
        />
        <Input
          label="Prefix"
          value={formData.prefix}
          onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
          placeholder="oc-prod"
          hint="Required. Used as the provider prefix for model IDs."
        />
        <Select
          label="API Type"
          options={apiTypeOptions}
          value={formData.apiType}
          onChange={(e) =>
            setFormData({ ...formData, apiType: e.target.value })
          }
        />
        <Input
          label="Base URL"
          value={formData.baseUrl}
          onChange={(e) =>
            setFormData({ ...formData, baseUrl: e.target.value })
          }
          placeholder="https://api.openai.com/v1"
          hint="Use the base URL (ending in /v1) for your OpenAI-compatible API."
        />
        <Input
          label="API Key (for Check)"
          type="password"
          value={checkKey}
          onChange={(e) => setCheckKey(e.target.value)}
        />
        <Input
          label="Model ID (optional)"
          value={checkModelId}
          onChange={(e) => setCheckModelId(e.target.value)}
          placeholder="e.g. gpt-4, claude-3-opus"
          hint="If provider lacks /models endpoint, enter a model ID to validate via chat/completions instead."
        />
        <div className="flex items-center gap-3">
          <Button
            onClick={handleValidate}
            disabled={!checkKey || validating || !formData.baseUrl.trim()}
            variant="secondary"
          >
            {validating ? "Checking..." : "Check"}
          </Button>
          {renderValidationResult()}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={
              !formData.name.trim() ||
              !formData.prefix.trim() ||
              !formData.baseUrl.trim() ||
              submitting
            }
          >
            {submitting ? "Creating..." : "Create"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

AddOpenAICompatibleModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};
