export type DiagnosticModality = "text" | "vision" | "audio" | "tool-calling";

export interface DiagnosticResultRecord {
  id: string;
  provider: string | null;
  connectionId: string | null;
  model: string;
  modality: DiagnosticModality;
  source: "manual" | string;
  supported: boolean;
  lastTestedAt: string;
  latencyMs: number | null;
  summary: string | null;
  requestPayload: unknown;
  responsePayload: unknown;
  metadata: Record<string, unknown>;
}

export interface StorageMigrationStatus {
  schemaVersion: number;
  importedLegacyAt: string | null;
  importedLegacyHash: string | null;
  counts: {
    providerConnections: number;
    providerNodes: number;
    proxyPools: number;
    combos: number;
    apiKeys: number;
    usageHistory: number;
    usageLifetime: number;
    requestDetails: number;
    diagnostics: number;
  };
}
