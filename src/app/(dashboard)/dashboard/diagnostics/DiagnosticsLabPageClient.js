"use client";

import { Badge, Button, Card, Input, Select, SegmentedControl } from "@/shared/components";
import { useDiagnosticsLab } from "./useDiagnosticsLab";
import { formatDateTime, getStatusVariant, modalityOptions, defaultPrompts } from "./diagnosticsLabUtils";

export default function DiagnosticsLabPageClient() {
  const {
    state: {
      connections, models, results, latestFlags, storageStatus, selectedConnectionId, model, modality, prompt, attachment, latestResult, loading, loadingModels, error, selectedConnection, supportedCount,
    },
    actions: {
      setSelectedConnectionId, setModel, setModality, setPrompt, handleAttachmentChange, handleRunDiagnostic,
    }
  } = useDiagnosticsLab();

  return (
    <div className="flex flex-col gap-6">
      <section
        className="relative overflow-hidden rounded-[28px] border border-black/5 dark:border-white/10 p-6 md:p-8"
        style={{
          background:
            "linear-gradient(135deg, rgba(246,55,236,0.12) 0%, rgba(124,58,237,0.12) 42%, rgba(12,0,21,0.92) 100%)",
          boxShadow: "0 30px 90px -50px rgba(124, 58, 237, 0.45)",
        }}
      >
        <div className="absolute -right-12 -top-16 size-40 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-16 left-12 size-52 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="primary" size="lg" icon="science" className="backdrop-blur-sm">
                Manual Diagnostics Lab
              </Badge>
              <Badge variant="info" size="lg" dot>
                SQLite canonical storage active
              </Badge>
            </div>
            <div className="max-w-3xl">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
                Probe model capabilities without leaving the gateway.
              </h1>
              <p className="mt-3 text-sm md:text-base text-white/70 leading-7">
                Run manual diagnostics for text, vision, audio, and tool-calling, then persist normalized capability flags in the new SQLite storage layer.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <MetricCard label="Saved Flags" value={String(latestFlags.length)} icon="flag" />
            <MetricCard label="Supported" value={String(supportedCount)} icon="verified" />
            <MetricCard
              label="Legacy Import"
              value={storageStatus?.importedLegacyAt ? "Imported" : "Fresh"}
              icon="database"
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] w-full">
        <Card
          className="min-w-0 rounded-[24px] border-white/10 bg-surface/90 shadow-[0_20px_80px_-50px_rgba(15,23,42,0.45)]"
          title="Run Diagnostic"
          subtitle="Choose a connection, target model, modality, and attachment if needed."
          icon="experiment"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <Select
                label="Connection"
                value={selectedConnectionId}
                onChange={(event) => setSelectedConnectionId(event.target.value)}
                options={connections.map((connection) => ({
                  value: connection.id,
                  label: `${connection.provider} · ${connection.name || connection.id.slice(0, 8)}`,
                }))}
                placeholder="Select a connection"
                required
              />
            </div>

            <div className="flex flex-col gap-2 min-w-0">
              <label className="text-sm font-medium text-text-main">Modality</label>
              <SegmentedControl
                options={modalityOptions}
                value={modality}
                onChange={(value) => {
                  setModality(value);
                  setPrompt(defaultPrompts[value]);
                }}
                className="w-full justify-start overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
            <Input
              label="Target Model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={loadingModels ? "Loading models..." : "gpt-5.4"}
              hint={selectedConnection ? `Resolved as ${selectedConnection.provider}/${model || "<model>"}` : "Choose a connection first"}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-main">Detected Models</label>
              <select
                value={models.some((item) => item.value === model) ? model : ""}
                onChange={(event) => setModel(event.target.value)}
                className="h-[42px] rounded-md border border-black/10 bg-white px-3 text-sm text-text-main focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-white/5"
              >
                <option value="">Use custom model ID</option>
                {models.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-main" htmlFor="diagnostic-prompt">
              Prompt
            </label>
            <textarea
              id="diagnostic-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[16px] text-text-main shadow-inner transition-all focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 sm:text-sm dark:border-white/10 dark:bg-white/5"
            />
            <p className="text-xs text-text-muted">
              Audio mode currently stores a manual diagnostic record because the gateway does not yet expose an audio transcription proxy route.
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-main" htmlFor="diagnostic-attachment">
                Attachment
              </label>
              <input
                id="diagnostic-attachment"
                type="file"
                accept={modality === "vision" ? "image/*" : modality === "audio" ? "audio/*,video/*" : "*/*"}
                onChange={handleAttachmentChange}
                className="block w-full rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-3 text-sm text-text-main transition-all file:mr-4 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary dark:border-white/10 dark:bg-white/5"
              />
              <p className="text-xs text-text-muted">
                {attachment
                  ? `${attachment.name} · ${(attachment.approxBytes / 1024).toFixed(1)} KB`
                  : modality === "vision"
                    ? "Attach a screenshot or sample image."
                    : modality === "audio"
                      ? "Attach audio/video to keep the manual diagnostic record complete."
                      : "Attachment is optional for this modality."}
              </p>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleRunDiagnostic}
                loading={loading}
                disabled={!selectedConnectionId || !model}
                size="lg"
                icon="play_arrow"
              >
                Run Diagnostic
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 min-w-0 w-full">
          <Card
            className="min-w-0 rounded-[24px] border-white/10 bg-surface/90 shadow-[0_20px_80px_-50px_rgba(15,23,42,0.45)]"
            title="Latest Result"
            subtitle="Normalized capability output persisted with source=manual."
            icon="lab_profile"
          >
            {latestResult ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getStatusVariant(latestResult.supported)} size="lg" dot>
                    {latestResult.supported ? "Supported" : "Follow-up needed"}
                  </Badge>
                  <Badge variant="default" size="lg">
                    {latestResult.modality}
                  </Badge>
                  <Badge variant="info" size="lg">
                    {latestResult.latencyMs ? `${latestResult.latencyMs} ms` : "No live round-trip"}
                  </Badge>
                </div>
                <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]">
                  <p className="text-sm font-medium text-text-main break-words">{latestResult.summary}</p>
                  <p className="mt-2 text-xs text-text-muted">
                    {latestResult.model} · {formatDateTime(latestResult.lastTestedAt)}
                  </p>
                </div>
                <pre className="max-h-80 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all rounded-2xl border border-black/5 bg-[#0b1120] p-4 text-xs leading-6 text-slate-200 dark:border-white/5">
                  {JSON.stringify(latestResult.responsePayload || latestResult.metadata || {}, null, 2)}
                </pre>
              </div>
            ) : (
              <EmptyState
                icon="robot_2"
                title="No manual diagnostic yet"
                body="Run the first diagnostic to populate capability flags and response previews."
              />
            )}
          </Card>

          <Card
            className="min-w-0 rounded-[24px] border-white/10 bg-surface/90 shadow-[0_20px_80px_-50px_rgba(15,23,42,0.45)]"
            title="Storage Status"
            subtitle="Canonical SQLite snapshot after legacy import."
            icon="database"
          >
            {storageStatus ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <StorageMetric label="Schema Version" value={String(storageStatus.schemaVersion || "—")} />
                <StorageMetric label="Legacy Import" value={storageStatus.importedLegacyAt ? formatDateTime(storageStatus.importedLegacyAt) : "Fresh install"} />
                <StorageMetric label="Connections" value={String(storageStatus.counts?.providerConnections || 0)} />
                <StorageMetric label="Usage Rows" value={String(storageStatus.counts?.usageHistory || 0)} />
                <StorageMetric label="Request Details" value={String(storageStatus.counts?.requestDetails || 0)} />
                <StorageMetric label="Diagnostics" value={String(storageStatus.counts?.diagnostics || 0)} />
              </div>
            ) : (
              <EmptyState
                icon="database_off"
                title="Storage status unavailable"
                body="The dashboard could not load SQLite migration metadata."
              />
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] w-full">
        <Card
          className="min-w-0 rounded-[24px] border-white/10 bg-surface/90 shadow-[0_20px_80px_-50px_rgba(15,23,42,0.45)]"
          title="Capability Flags"
          subtitle="Latest normalized status per modality."
          icon="flag"
        >
          {latestFlags.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {latestFlags.map((flag) => (
                <div
                  key={`${flag.connectionId}:${flag.model}:${flag.capabilityFlag}`}
                  className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusVariant(flag.supported)} dot>
                      {flag.capabilityFlag}
                    </Badge>
                    <Badge variant="default">{flag.modality}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-medium text-text-main">{flag.model}</p>
                  <p className="mt-1 text-xs text-text-muted">{flag.provider || "unknown provider"}</p>
                  <p className="mt-3 text-sm text-text-muted leading-6 break-words">{flag.summary}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                    <span>{formatDateTime(flag.lastTestedAt)}</span>
                    <span>{flag.latencyMs ? `${flag.latencyMs} ms` : "manual"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="flag"
              title="No capability flags yet"
              body="Saved diagnostics will appear here once you start probing models."
            />
          )}
        </Card>

        <Card
          className="min-w-0 rounded-[24px] border-white/10 bg-surface/90 shadow-[0_20px_80px_-50px_rgba(15,23,42,0.45)]"
          title="Recent Runs"
          subtitle="Persisted diagnostic history from the new \`diagnostic_results\` table."
          icon="history"
        >
          {results.length > 0 ? (
            <div className="flex max-h-[520px] flex-col gap-3 overflow-auto pr-1 pb-1">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusVariant(result.supported)} dot>
                      {result.supported ? "Supported" : "Manual follow-up"}
                    </Badge>
                    <Badge variant="default">{result.modality}</Badge>
                    <Badge variant="info">{result.source}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-medium text-text-main">{result.model}</p>
                  <p className="mt-1 text-xs text-text-muted">{formatDateTime(result.lastTestedAt)}</p>
                  <p className="mt-3 text-sm leading-6 text-text-muted break-words">{result.summary}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="schedule"
              title="No saved runs"
              body="Your diagnostic history is empty right now."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/70">{label}</span>
        <span className="material-symbols-outlined text-white/80">{icon}</span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function StorageMetric({ label, value }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]">
      <p className="text-xs uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-text-main">{value}</p>
    </div>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 px-6 py-10 text-center dark:border-white/10">
      <span className="material-symbols-outlined text-4xl text-text-muted">{icon}</span>
      <h3 className="mt-4 text-base font-semibold text-text-main">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">{body}</p>
    </div>
  );
}
