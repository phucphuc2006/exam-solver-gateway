"use client";

import { Card, Button, Input, Modal, CardSkeleton, Toggle, Badge, Tooltip } from "@/shared/components";
import { useEndpoint } from "./useEndpoint";

const TUNNEL_BENEFITS = [
  { icon: "public", title: "Access Anywhere", desc: "Use your API from any network" },
  { icon: "group", title: "Share Endpoint", desc: "Share URL with team members" },
  { icon: "code", title: "Use in Cursor/Cline", desc: "Connect AI tools remotely" },
  { icon: "lock", title: "Encrypted", desc: "End-to-end TLS via Cloudflare" },
];

export default function APIPageClient() {
  const {
    state: {
      keys, loading, showAddModal, newKeyName, createdKey,
      requireApiKey, tunnelEnabled, tunnelUrl, tunnelPublicUrl, tunnelShortId,
      tunnelLoading, tunnelProgress, tunnelStatus, showDisableModal, showEnableModal,
      visibleKeys, baseUrl, copied
    },
    actions: {
      setShowAddModal, setNewKeyName, setCreatedKey, setShowDisableModal, setShowEnableModal,
      handleRequireApiKey, handleEnableTunnel, handleDisableTunnel,
      handleCreateKey, handleDeleteKey, handleToggleKey, toggleKeyVisibility, maskKey, copy
    }
  } = useEndpoint();

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const currentEndpoint = tunnelEnabled && tunnelPublicUrl ? `${tunnelPublicUrl}/v1` : baseUrl;

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Endpoint Card ─── */}
      <Card className="relative overflow-hidden es-card-glow">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary via-accent to-secondary rounded-l-lg" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <span className="material-symbols-outlined text-primary text-[22px]">api</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold">API Endpoint</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {tunnelEnabled ? (
                  <Badge variant="success" dot size="sm">Connected via Tunnel</Badge>
                ) : (
                  <Badge variant="default" dot size="sm">Local Server</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tunnelEnabled ? (
              <Button
                size="sm"
                variant="secondary"
                icon="cloud_off"
                onClick={() => setShowDisableModal(true)}
                disabled={tunnelLoading}
                className="bg-red-500/10! text-red-500! hover:bg-red-500/20! border-red-500/30!"
              >
                Disable Tunnel
              </Button>
            ) : (
              <Button
                variant="primary"
                icon="cloud_upload"
                onClick={() => setShowEnableModal(true)}
                disabled={tunnelLoading}
                className="bg-linear-to-r from-primary to-blue-500 hover:from-primary-hover hover:to-blue-600"
              >
                {tunnelLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    {tunnelProgress || "Creating tunnel..."}
                  </span>
                ) : (
                  "Enable Tunnel"
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Endpoint URL */}
        <div className="flex gap-2">
          <Input
            value={currentEndpoint}
            readOnly
            className={`flex-1 font-mono text-sm ${tunnelEnabled ? "animate-border-glow" : ""}`}
          />
          <Tooltip text={copied === "endpoint_url" ? "Copied!" : "Copy to clipboard"}>
            <Button
              variant="secondary"
              icon={copied === "endpoint_url" ? "check" : "content_copy"}
              onClick={() => copy(currentEndpoint, "endpoint_url")}
              className={copied === "endpoint_url" ? "text-green-500! border-green-500/30!" : ""}
            >
              {copied === "endpoint_url" ? "Copied!" : "Copy"}
            </Button>
          </Tooltip>
        </div>

        {/* Tunnel Status Toast */}
        {tunnelStatus && (
          <div
            className={`mt-4 flex items-center gap-2 p-3 rounded-lg text-sm animate-fade-in-up ${
              tunnelStatus.type === "success"
                ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                : tunnelStatus.type === "warning"
                ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"
                : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {tunnelStatus.type === "success" ? "check_circle" : tunnelStatus.type === "warning" ? "warning" : "error"}
            </span>
            {tunnelStatus.message}
          </div>
        )}
      </Card>

      {/* ─── API Keys Card ─── */}
      <Card className="es-card-glow">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <span className="material-symbols-outlined text-primary text-[22px]">vpn_key</span>
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">API Keys</h2>
              {keys.length > 0 && (
                <Badge variant="default" size="sm">{keys.length}</Badge>
              )}
            </div>
          </div>
          <Button icon="add" onClick={() => setShowAddModal(true)}>
            Create Key
          </Button>
        </div>

        {/* Require API Key Toggle */}
        <Card.Section className="mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px] text-text-muted">shield</span>
              <div>
                <p className="font-medium text-sm">Require API key</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Requests without a valid key will be rejected
                </p>
              </div>
            </div>
            <Toggle
              checked={requireApiKey}
              onChange={() => handleRequireApiKey(!requireApiKey)}
            />
          </div>
        </Card.Section>

        {/* Keys List */}
        {keys.length === 0 ? (
          <div className="text-center py-14">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4 animate-neon-pulse">
              <span className="material-symbols-outlined text-[32px]">vpn_key</span>
            </div>
            <p className="text-text-main font-semibold mb-1">No API keys yet</p>
            <p className="text-sm text-text-muted mb-5 max-w-xs mx-auto">
              Create your first API key to authenticate requests to your endpoint
            </p>
            <Button icon="add" onClick={() => setShowAddModal(true)}>
              Create Key
            </Button>
          </div>
        ) : (
          <div className="flex flex-col">
            {keys.map((key, index) => (
              <div
                key={key.id}
                className={`group flex items-center justify-between py-3 border-b border-black/[0.03] dark:border-white/[0.03] last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors rounded-lg px-3 -mx-3 animate-fade-in-up ${key.isActive === false ? "opacity-60" : ""}`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {/* Key info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium">{key.name}</p>
                    {key.isActive === false ? (
                      <Badge variant="warning" dot size="sm">Paused</Badge>
                    ) : (
                      <Badge variant="success" dot size="sm">Active</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <code className="text-xs text-text-muted font-mono">
                      {visibleKeys.has(key.id) ? key.key : maskKey(key.key)}
                    </code>
                    <Tooltip text={visibleKeys.has(key.id) ? "Hide key" : "Show key"}>
                      <button
                        onClick={() => toggleKeyVisibility(key.id)}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {visibleKeys.has(key.id) ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </Tooltip>
                    <Tooltip text="Copy key">
                      <button
                        onClick={() => copy(key.key, key.id)}
                        className={`p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded opacity-0 group-hover:opacity-100 transition-all ${
                          copied === key.id ? "text-green-500 opacity-100!" : "text-text-muted hover:text-primary"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copied === key.id ? "check" : "content_copy"}
                        </span>
                      </button>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Toggle
                    size="sm"
                    checked={key.isActive ?? true}
                    onChange={(checked) => {
                      if (key.isActive && !checked) {
                        if (
                          confirm(
                            `Pause API key "${key.name}"?\n\nThis key will stop working immediately but can be resumed later.`
                          )
                        ) {
                          handleToggleKey(key.id, checked);
                        }
                      } else {
                        handleToggleKey(key.id, checked);
                      }
                    }}
                  />
                  <Tooltip text="Delete key">
                    <button
                      onClick={() => handleDeleteKey(key.id)}
                      className="p-1.5 hover:bg-red-500/10 rounded-md text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── Add Key Modal ─── */}
      <Modal
        isOpen={showAddModal}
        title="Create API Key"
        onClose={() => {
          setShowAddModal(false);
          setNewKeyName("");
        }}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Key Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. Production Key"
            icon="label"
          />
          <div className="flex gap-2">
            <Button onClick={handleCreateKey} fullWidth disabled={!newKeyName.trim()}>
              Create
            </Button>
            <Button
              onClick={() => {
                setShowAddModal(false);
                setNewKeyName("");
              }}
              variant="ghost"
              fullWidth
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Created Key Modal ─── */}
      <Modal
        isOpen={!!createdKey}
        title="API Key Created"
        onClose={() => setCreatedKey(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-400">warning</span>
              <div>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-1 font-medium">
                  Save this key now!
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  This is the only time you will see this key. Store it securely.
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={createdKey || ""}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="secondary"
              icon={copied === "created_key" ? "check" : "content_copy"}
              onClick={() => copy(createdKey, "created_key")}
            >
              {copied === "created_key" ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button onClick={() => setCreatedKey(null)} fullWidth>
            Done
          </Button>
        </div>
      </Modal>

      {/* ─── Enable Tunnel Modal ─── */}
      <Modal
        isOpen={showEnableModal}
        title="Enable Tunnel"
        onClose={() => setShowEnableModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">cloud_upload</span>
              <div>
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-1">
                  Cloudflare Tunnel
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Expose your local ES Gateway to the internet. No port forwarding, no static IP needed. Share endpoint URL with your team or use it in Cursor, Cline, and other AI tools from anywhere.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {TUNNEL_BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex flex-col items-center text-center p-3 rounded-lg bg-sidebar/50 hover:bg-primary/5 transition-colors">
                <span className="material-symbols-outlined text-xl text-primary mb-1">{benefit.icon}</span>
                <p className="text-xs font-semibold">{benefit.title}</p>
                <p className="text-xs text-text-muted">{benefit.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-text-muted">
            Requires outbound port 7844 (TCP/UDP). Connection may take 10-30s.
          </p>

          <div className="flex gap-2">
            <Button
              onClick={handleEnableTunnel}
              fullWidth
              className="bg-linear-to-r from-primary to-blue-500 hover:from-primary-hover hover:to-blue-600 text-white!"
            >
              Start Tunnel
            </Button>
            <Button
              onClick={() => setShowEnableModal(false)}
              variant="ghost"
              fullWidth
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Disable Tunnel Modal ─── */}
      <Modal
        isOpen={showDisableModal}
        title="Disable Tunnel"
        onClose={() => !tunnelLoading && setShowDisableModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-red-600 dark:text-red-400">warning</span>
              <div>
                <p className="text-sm text-red-800 dark:text-red-200 font-medium mb-1">
                  Warning
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  The tunnel will be disconnected. Remote access will stop working.
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-text-muted">Are you sure you want to disable the tunnel?</p>

          <div className="flex gap-2">
            <Button
              onClick={handleDisableTunnel}
              fullWidth
              disabled={tunnelLoading}
              className="bg-red-500! hover:bg-red-600! text-white!"
            >
              {tunnelLoading ? (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  Disabling...
                </span>
              ) : (
                "Disable Tunnel"
              )}
            </Button>
            <Button
              onClick={() => setShowDisableModal(false)}
              variant="ghost"
              fullWidth
              disabled={tunnelLoading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
