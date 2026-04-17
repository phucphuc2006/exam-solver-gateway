import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getCachedValue, setCachedValue } from "@/lib/serverCache";
import { getProviderNodeById } from "@/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { getDefaultModel } from "open-sse/config/providerModels.js";

const VALIDATION_CACHE_TTL_MS = 30_000;

function getValidationCacheKey(provider, apiKey) {
  return crypto.createHash("sha256").update(`${provider}:${apiKey}`).digest("hex");
}

function getFriendlyValidationError(error) {
  if (error?.cause?.code === "ECONNREFUSED") return "Connection refused - provider node offline or unreachable";
  if (error?.cause?.code === "ENOTFOUND") return "DNS lookup failed - invalid domain or network issue";
  if (error?.cause?.code === "CERT_HAS_EXPIRED") return "SSL certificate expired";
  if (String(error?.message || "").toLowerCase().includes("timeout")) {
    return "Request timeout (>10s) - provider node not responding";
  }
  return error?.message || "Invalid API key";
}

function getCapabilityHints(provider) {
  const knownHints = {
    openai: { supportsVision: true, supportsTools: true, supportsAudio: true },
    anthropic: { supportsVision: true, supportsTools: true },
    gemini: { supportsVision: true, supportsTools: true, supportsAudio: true },
    openrouter: { supportsVision: true, supportsTools: true },
    sambanova: { supportsVision: true, supportsTools: true, supportsAudio: true },
    vertex: { supportsVision: true, supportsTools: true, supportsAudio: true },
    "vertex-partner": { supportsVision: true, supportsTools: true, supportsAudio: true },
  };

  return knownHints[provider] || null;
}

// POST /api/providers/validate - Validate API key with provider
export async function POST(request) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "providers.validate", limit: 10, windowMs: 60_000 },
    "Too many provider validation attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const body = await request.json();
    const { provider, apiKey } = body;

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Provider and API key required" }, { status: 400 });
    }

    const cacheKey = getValidationCacheKey(provider, apiKey);
    const cached = getCachedValue(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    let isValid = false;
    let error = null;
    let method = "unknown";
    const startedAt = Date.now();

    // Validate with each provider
    try {
      if (isOpenAICompatibleProvider(provider)) {
        method = "models";
        const node = await getProviderNodeById(provider);
        if (!node) {
          return NextResponse.json({ error: "OpenAI Compatible node not found" }, { status: 404 });
        }
        const modelsUrl = `${node.baseUrl?.replace(/\/$/, "")}/models`;
        const res = await fetch(modelsUrl, {
          headers: { "Authorization": `Bearer ${apiKey}` },
        });
        isValid = res.ok;
        const payload = {
          valid: isValid,
          error: isValid ? null : "Invalid API key",
          method,
          latencyMs: Date.now() - startedAt,
          capabilityHints: getCapabilityHints(provider),
        };
        setCachedValue(cacheKey, payload, VALIDATION_CACHE_TTL_MS);
        return NextResponse.json(payload);
      }

      if (isAnthropicCompatibleProvider(provider)) {
        method = "models";
        const node = await getProviderNodeById(provider);
        if (!node) {
          return NextResponse.json({ error: "Anthropic Compatible node not found" }, { status: 404 });
        }

        let normalizedBase = node.baseUrl?.trim().replace(/\/$/, "") || "";
        if (normalizedBase.endsWith("/messages")) {
          normalizedBase = normalizedBase.slice(0, -9); // remove /messages
        }

        const modelsUrl = `${normalizedBase}/models`;

        const res = await fetch(modelsUrl, {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Authorization": `Bearer ${apiKey}`
          },
        });

        isValid = res.ok;
        const payload = {
          valid: isValid,
          error: isValid ? null : "Invalid API key",
          method,
          latencyMs: Date.now() - startedAt,
          capabilityHints: getCapabilityHints(provider),
        };
        setCachedValue(cacheKey, payload, VALIDATION_CACHE_TTL_MS);
        return NextResponse.json(payload);
      }

      switch (provider) {
        case "openai":
          method = "models";
          const openaiRes = await fetch("https://api.openai.com/v1/models", {
            headers: { "Authorization": `Bearer ${apiKey}` },
          });
          isValid = openaiRes.ok;
          break;

        case "anthropic":
          method = "messages";
          const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 1,
              messages: [{ role: "user", content: "test" }],
            }),
          });
          isValid = anthropicRes.status !== 401;
          break;

        case "gemini":
          method = "models";
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
          isValid = geminiRes.ok;
          break;

        case "openrouter":
          method = "models";
          const openrouterRes = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { "Authorization": `Bearer ${apiKey}` },
          });
          isValid = openrouterRes.ok;
          break;

        case "glm":
        case "glm-cn":
        case "kimi":
        case "minimax":
        case "minimax-cn":
        case "alicode-intl":
        case "alicode": {
          method = provider === "glm-cn" || provider === "alicode" || provider === "alicode-intl"
            ? "chat.completions"
            : "messages";
          const claudeBaseUrls = {
            glm: "https://api.z.ai/api/anthropic/v1/messages",
            "glm-cn": "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
            kimi: "https://api.kimi.com/coding/v1/messages",
            minimax: "https://api.minimax.io/anthropic/v1/messages",
            "minimax-cn": "https://api.minimaxi.com/anthropic/v1/messages",
            alicode: "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
            "alicode-intl": "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions",
          };

          // glm-cn, alicode and alicode-intl use OpenAI format
          if (provider === "glm-cn" || provider === "alicode" || provider === "alicode-intl") {
            const testModel = getDefaultModel(provider);
            const glmCnRes = await fetch(claudeBaseUrls[provider], {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: testModel,
                max_tokens: 1,
                messages: [{ role: "user", content: "test" }],
              }),
            });
            isValid = glmCnRes.status !== 401 && glmCnRes.status !== 403;
          } else {
            const claudeRes = await fetch(claudeBaseUrls[provider], {
              method: "POST",
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1,
                messages: [{ role: "user", content: "test" }],
              }),
            });
            isValid = claudeRes.status !== 401;
          }
          break;
        }

        case "deepseek":
        case "groq":
        case "xai":
        case "mistral":
        case "perplexity":
        case "together":
        case "fireworks":
        case "cerebras":
        case "cohere":
        case "nebius":
        case "siliconflow":
        case "hyperbolic":
        case "sambanova":
        case "ollama":
        case "ollama-local":
        case "assemblyai":
        case "nanobanana":
        case "chutes":
        case "nvidia": {
          method = "models";
          const endpoints = {
            deepseek: "https://api.deepseek.com/models",
            groq: "https://api.groq.com/openai/v1/models",
            xai: "https://api.x.ai/v1/models",
            mistral: "https://api.mistral.ai/v1/models",
            perplexity: "https://api.perplexity.ai/models",
            together: "https://api.together.xyz/v1/models",
            fireworks: "https://api.fireworks.ai/inference/v1/models",
            cerebras: "https://api.cerebras.ai/v1/models",
            cohere: "https://api.cohere.ai/v1/models",
            nebius: "https://api.studio.nebius.ai/v1/models",
            siliconflow: "https://api.siliconflow.cn/v1/models",
            hyperbolic: "https://api.hyperbolic.xyz/v1/models",
            sambanova: "https://api.sambanova.ai/v1/models",
            ollama: "https://ollama.com/api/tags",
            "ollama-local": "http://localhost:11434/api/tags",
            assemblyai: "https://api.assemblyai.com/v1/account",
            nanobanana: "https://api.nanobananaapi.ai/v1/models",
            chutes: "https://llm.chutes.ai/v1/models",
            nvidia: "https://integrate.api.nvidia.com/v1/models"
          };
          const res = await fetch(endpoints[provider], {
            headers: { "Authorization": `Bearer ${apiKey}` },
          });
          isValid = res.ok;
          break;
        }

        case "deepgram": {
          method = "projects";
          const res = await fetch("https://api.deepgram.com/v1/projects", {
            headers: { "Authorization": `Token ${apiKey}` },
          });
          isValid = res.ok;
          break;
        }

        case "vertex": {
          method = "probe";
          // Raw key: probe global endpoint (always 404 for unknown model, never 401)
          // SA JSON: attempt token mint via JWT assertion
          const saJson = (() => { try { const p = JSON.parse(apiKey); return p.type === "service_account" ? p : null; } catch { return null; } })();
          if (saJson) {
            // Validate SA JSON has required fields
            isValid = !!(saJson.client_email && saJson.private_key && saJson.project_id);
          } else {
            // Raw key: probe Vertex — 404 means key is valid (model just doesn't exist), 401 means invalid key
            const probeRes = await fetch(
              `https://aiplatform.googleapis.com/v1/publishers/google/models/__probe__:generateContent?key=${apiKey}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
            );
            isValid = probeRes.status !== 401 && probeRes.status !== 403;
          }
          break;
        }

        case "vertex-partner": {
          method = "probe";
          const saJson = (() => { try { const p = JSON.parse(apiKey); return p.type === "service_account" ? p : null; } catch { return null; } })();
          if (saJson) {
            isValid = !!(saJson.client_email && saJson.private_key && saJson.project_id);
          } else {
            const probeRes = await fetch(
              `https://aiplatform.googleapis.com/v1/publishers/google/models/__probe__:generateContent?key=${apiKey}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
            );
            isValid = probeRes.status !== 401 && probeRes.status !== 403;
          }
          break;
        }

        default:
          return NextResponse.json({ error: "Provider validation not supported" }, { status: 400 });
      }
    } catch (err) {
      error = getFriendlyValidationError(err);
      isValid = false;
    }

    const payload = {
      valid: isValid,
      error: isValid ? null : (error || "Invalid API key"),
      method,
      latencyMs: Date.now() - startedAt,
      capabilityHints: getCapabilityHints(provider),
    };
    setCachedValue(cacheKey, payload, VALIDATION_CACHE_TTL_MS);
    return NextResponse.json(payload);
  } catch (error) {
    console.log("Error validating API key:", error);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
