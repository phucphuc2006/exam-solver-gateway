/**
 * OAuth Configuration Constants — NexusAI Gateway
 * Only keeps: Codex (OAuth), Kiro (OAuth/Free), OpenAI (API Key reuse)
 */

// Codex (OpenAI) OAuth Configuration (Authorization Code Flow with PKCE)
export const CODEX_CONFIG = {
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  scope: "openid profile email offline_access",
  codeChallengeMethod: "S256",
  // Additional OpenAI-specific params
  extraParams: {
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "codex_cli_rs",
  },
};

// Fallback configs for deprecated providers to prevent build errors
export const GEMINI_CONFIG = { clientId: "", clientSecret: "" };
export const ANTIGRAVITY_CONFIG = { clientId: "", clientSecret: "" };

// OpenAI OAuth Configuration (Authorization Code Flow with PKCE)
export const OPENAI_CONFIG = {
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  scope: "openid profile email offline_access",
  codeChallengeMethod: "S256",
  extraParams: {
    id_token_add_organizations: "true",
    originator: "openai_native",
  },
};

// Kiro OAuth Configuration
// Supports multiple auth methods:
// 1. AWS Builder ID (Device Code Flow)
// 2. AWS IAM Identity Center/IDC (Device Code Flow with custom startUrl/region)
// 3. Google/GitHub Social Login (Authorization Code Flow - manual callback)
// 4. Import Token (paste refresh token from Kiro IDE)
export const KIRO_CONFIG = {
  // AWS SSO OIDC endpoints for Builder ID/IDC (Device Code Flow)
  ssoOidcEndpoint: "https://oidc.us-east-1.amazonaws.com",
  registerClientUrl: "https://oidc.us-east-1.amazonaws.com/client/register",
  deviceAuthUrl: "https://oidc.us-east-1.amazonaws.com/device_authorization",
  tokenUrl: "https://oidc.us-east-1.amazonaws.com/token",
  // AWS Builder ID default start URL
  startUrl: "https://view.awsapps.com/start",
  // Client registration params
  clientName: "kiro-oauth-client",
  clientType: "public",
  scopes: ["codewhisperer:completions", "codewhisperer:analysis", "codewhisperer:conversations"],
  grantTypes: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  issuerUrl: "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6",
  // Social auth endpoints (Google/GitHub via AWS Cognito)
  socialAuthEndpoint: "https://prod.us-east-1.auth.desktop.kiro.dev",
  socialLoginUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/login",
  socialTokenUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/oauth/token",
  socialRefreshUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
  // Auth methods
  authMethods: ["builder-id", "idc", "google", "github", "import"],
};

// Amazon Q Developer (AWS SSO OIDC) Configuration
export const AMAZONQ_CONFIG = {
  // AWS SSO OIDC endpoints for Builder ID/IDC (Device Code Flow)
  ssoOidcEndpoint: "https://oidc.us-east-1.amazonaws.com",
  registerClientUrl: "https://oidc.us-east-1.amazonaws.com/client/register",
  deviceAuthUrl: "https://oidc.us-east-1.amazonaws.com/device_authorization",
  tokenUrl: "https://oidc.us-east-1.amazonaws.com/token",
  startUrl: "https://view.awsapps.com/start",
  clientName: "amazonq-oauth-client",
  clientType: "public",
  scopes: ["amazonq:completions", "amazonq:analysis", "amazonq:conversations"],
  grantTypes: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  issuerUrl: "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6",
};

// GitLab Duo OAuth Configuration (Device Grant Flow)
export const GITLAB_DUO_CONFIG = {
  // Using default gitlab.com, can be overridden per request
  defaultBaseUrl: "https://gitlab.com",
  deviceAuthPath: "/oauth/authorize_device",
  tokenPath: "/oauth/token",
  clientId: "9a7bb7d53037c767664c39f15de0bdce4ed130b4ec2b651bc2dc3b06ac721ba1", // Example client ID, usually they have one
  scope: "api read_user openid profile email",
};

// CodeBuddy (Tencent) Device Flow Configuration
export const CODEBUDDY_CONFIG = {
  deviceAuthUrl: "https://copilot.tencent.com/v1/auth/device",
  tokenUrl: "https://copilot.tencent.com/v1/auth/token",
  clientId: "codebuddy-vscode",
};

// OAuth timeout (5 minutes)
export const OAUTH_TIMEOUT = 300000;

// Provider list
export const PROVIDERS = {
  CODEX: "codex",
  OPENAI: "openai",
  KIRO: "kiro",
  AMAZONQ: "amazonq",
  GITLAB_DUO: "gitlab",
  CODEBUDDY: "codebuddy",
};
