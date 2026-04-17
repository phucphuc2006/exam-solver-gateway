// ── ChatGPT Web — API Usage Card ──
"use client";

import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import Input from "@/shared/components/Input";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";

/**
 * Displays the WebSocket endpoint URL, API key badge, and a sample wscat command.
 */
export default function ApiUsageCard({
  endpointUrl,
  wsExample,
  requireApiKey,
  copied,
  onCopyEndpoint,
  onCopyExample,
}) {
  const { t } = useRuntimeLocale();

  return (
    <Card className="min-w-0 space-y-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("API usage card")}</h2>
          <p className="text-sm text-text-muted">
            {t("Call the bridge directly over WebSocket with an OpenAI-style payload.")}
          </p>
        </div>
        <Badge variant={requireApiKey ? "warning" : "success"} size="sm">
          {t(requireApiKey ? "API key required" : "Local mode")}
        </Badge>
      </div>

      <div className="flex min-w-0 gap-2">
        <Input
          value={endpointUrl}
          readOnly
          className="flex-1"
          inputClassName="font-mono text-xs"
        />
        <Button
          variant="secondary"
          icon={copied === "chatgpt-web-endpoint" ? "check" : "content_copy"}
          onClick={onCopyEndpoint}
        >
          {t(copied === "chatgpt-web-endpoint" ? "Copied!" : "Copy")}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">{t("Sample wscat")}</p>
        <div className="min-w-0 rounded-xl border border-black/5 bg-black/5 p-4 dark:border-white/5 dark:bg-white/5">
          <pre
            className="max-w-full overflow-x-auto whitespace-pre-wrap break-words text-xs text-text-muted"
            style={{ overflowWrap: "anywhere" }}
          >
            {wsExample}
          </pre>
        </div>
        <Button
          variant="ghost"
          icon={copied === "chatgpt-web-curl" ? "check" : "content_copy"}
          onClick={onCopyExample}
        >
          {t(copied === "chatgpt-web-curl" ? "Copied!" : "Copy example")}
        </Button>
      </div>
    </Card>
  );
}
