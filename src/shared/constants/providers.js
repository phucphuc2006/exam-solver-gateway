// Provider definitions — NexusAI Gateway
// Curated around providers that are already wired into validation/model fetching flows.

// Free Providers
export const FREE_PROVIDERS = {
  kiro: { id: "kiro", alias: "kr", name: "Kiro AI", icon: "psychology_alt", color: "#FF6B35" },
};

// Free Tier Providers
export const FREE_TIER_PROVIDERS = {
  openrouter: {
    id: "openrouter",
    alias: "or",
    name: "OpenRouter Free",
    icon: "hub",
    color: "#8B5CF6",
    textIcon: "OR",
    website: "https://openrouter.ai",
    passthroughModels: true,
    modelsFetcher: {
      url: "https://openrouter.ai/api/v1/models",
      type: "openrouter-free",
    },
  },
  groq: {
    id: "groq",
    alias: "groq",
    name: "Groq",
    icon: "bolt",
    color: "#F55036",
    textIcon: "GQ",
    website: "https://console.groq.com",
    passthroughModels: true,
  },
  gemini: {
    id: "gemini",
    alias: "gm",
    name: "Google Gemini",
    icon: "diamond",
    color: "#4285F4",
    textIcon: "GE",
    website: "https://ai.google.dev",
    passthroughModels: true,
  },
  cohere: {
    id: "cohere",
    alias: "co",
    name: "Cohere",
    icon: "blur_on",
    color: "#39594B",
    textIcon: "CH",
    website: "https://dashboard.cohere.com",
    passthroughModels: true,
  },
  cerebras: {
    id: "cerebras",
    alias: "cb",
    name: "Cerebras",
    icon: "memory",
    color: "#22C55E",
    textIcon: "CE",
    website: "https://cloud.cerebras.ai",
    passthroughModels: true,
  },
  nvidia: {
    id: "nvidia",
    alias: "nv",
    name: "NVIDIA NIM",
    icon: "developer_board",
    color: "#76B900",
    textIcon: "NV",
    website: "https://build.nvidia.com",
    passthroughModels: true,
  },
  sambanova: {
    id: "sambanova",
    alias: "sv",
    name: "SambaNova",
    icon: "graphic_eq",
    color: "#F97316",
    textIcon: "SN",
    website: "https://cloud.sambanova.ai",
    passthroughModels: true,
  },
};

// OAuth Providers
export const OAUTH_PROVIDERS = {
  codex: { id: "codex", alias: "cx", name: "OpenAI Codex", icon: "code", color: "#3B82F6" },
  amazonq: { id: "amazonq", alias: "amazonq", name: "Amazon Q", icon: "cloud", color: "#FF9900", textIcon: "AQ", website: "https://aws.amazon.com/q/" },
  gitlab: { id: "gitlab", alias: "gitlab", name: "GitLab Duo", icon: "commit", color: "#FC6D26", textIcon: "GL", website: "https://about.gitlab.com/gitlab-duo/" },
  codebuddy: { id: "codebuddy", alias: "codebuddy", name: "CodeBuddy", icon: "smart_toy", color: "#10B981", textIcon: "CB", website: "https://codebuddy.ca" },
};

export const APIKEY_PROVIDERS = {
  openai: { id: "openai", alias: "openai", name: "OpenAI", icon: "auto_awesome", color: "#10A37F", textIcon: "OA", website: "https://platform.openai.com" },
  requesty: { id: "requesty", alias: "requesty", name: "Requesty AI", icon: "router", color: "#3B82F6", textIcon: "RQ", website: "https://requesty.ai" },
  lepton: { id: "lepton", alias: "lepton", name: "Lepton AI", icon: "flash_on", color: "#9333EA", textIcon: "LP", website: "https://lepton.ai" },
  anyscale: { id: "anyscale", alias: "anyscale", name: "Anyscale", icon: "scale", color: "#2563EB", textIcon: "AN", website: "https://endpoints.anyscale.com" },
  deepinfra: { id: "deepinfra", alias: "deepinfra", name: "DeepInfra", icon: "settings_input_component", color: "#4F46E5", textIcon: "DI", website: "https://deepinfra.com" },
  sambanova: { id: "sambanova", alias: "sambanova", name: "SambaNova", icon: "blur_circular", color: "#EA580C", textIcon: "SN", website: "https://cloud.sambanova.ai" },
  lambda: { id: "lambda", alias: "lambda", name: "Lambda Chat", icon: "functions", color: "#06B6D4", textIcon: "LB", website: "https://lambda.chat" },
  novita: { id: "novita", alias: "novita", name: "Novita AI", icon: "new_releases", color: "#D946EF", textIcon: "NV", website: "https://novita.ai" },
  baichuan: { id: "baichuan", alias: "baichuan", name: "Baichuan", icon: "chat", color: "#F43F5E", textIcon: "BC", website: "https://platform.baichuan-ai.com" },
  doubao: { id: "doubao", alias: "doubao", name: "Doubao (Volcano)", icon: "volcano", color: "#E11D48", textIcon: "DB", website: "https://www.volcengine.com/product/doubao" },
  moonshot: { id: "moonshot", alias: "moonshot", name: "Moonshot (Kimi)", icon: "dark_mode", color: "#1D4ED8", textIcon: "MS", website: "https://platform.moonshot.cn" },
  yi: { id: "yi", alias: "yi", name: "01.AI (Yi)", icon: "filter_1", color: "#0D9488", textIcon: "YI", website: "https://platform.01.ai" },
  zhipu: { id: "zhipu", alias: "zhipu", name: "Zhipu (GLM)", icon: "psychology", color: "#0284C7", textIcon: "ZP", website: "https://open.bigmodel.cn" },
  ernie: { id: "ernie", alias: "ernie", name: "Baidu ERNIE", icon: "pets", color: "#2563EB", textIcon: "ER", website: "https://cloud.baidu.com/product/wenxinworkshop" },
};

export const OPENAI_COMPATIBLE_PREFIX = "openai-compatible-";
export const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";

export function isOpenAICompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
}

export function isAnthropicCompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
}

// All providers (combined)
export const AI_PROVIDERS = { ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...OAUTH_PROVIDERS, ...APIKEY_PROVIDERS };

// Auth methods
export const AUTH_METHODS = {
  oauth: { id: "oauth", name: "OAuth", icon: "lock" },
  apikey: { id: "apikey", name: "API Key", icon: "key" },
};

// Helper: Get provider by alias
export function getProviderByAlias(alias) {
  for (const provider of Object.values(AI_PROVIDERS)) {
    if (provider.alias === alias || provider.id === alias) {
      return provider;
    }
  }
  return null;
}

// Helper: Get provider ID from alias
export function resolveProviderId(aliasOrId) {
  const provider = getProviderByAlias(aliasOrId);
  return provider?.id || aliasOrId;
}

// Helper: Get alias from provider ID
export function getProviderAlias(providerId) {
  const provider = AI_PROVIDERS[providerId];
  return provider?.alias || providerId;
}

// Alias to ID mapping (for quick lookup)
export const ALIAS_TO_ID = Object.values(AI_PROVIDERS).reduce((acc, p) => {
  acc[p.alias] = p.id;
  return acc;
}, {});

// ID to Alias mapping
export const ID_TO_ALIAS = Object.values(AI_PROVIDERS).reduce((acc, p) => {
  acc[p.id] = p.alias;
  return acc;
}, {});

// Providers that support usage/quota API
export const USAGE_SUPPORTED_PROVIDERS = [
  "codex",
  "kiro",
];
