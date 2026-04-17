import pkg from "../../../package.json" with { type: "json" };
import { APP_DESCRIPTION, APP_NAME } from "./app.js";

// App configuration
export const APP_CONFIG = {
  name: APP_NAME,
  description: APP_DESCRIPTION,
  version: pkg.version,
};

// Theme configuration
export const THEME_CONFIG = {
  storageKey: "theme",
  defaultTheme: "system", // "light" | "dark" | "system"
};

// API endpoints
export const API_ENDPOINTS = {
  users: "/api/users",
  providers: "/api/providers",
  auth: "/api/auth",
};

export const CONSOLE_LOG_CONFIG = {
  maxLines: 200,
  pollIntervalMs: 1000,
};

// Provider API endpoints (for display only)
export const PROVIDER_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
};

// Re-export from providers.js for backward compatibility
export {
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  AI_PROVIDERS,
  AUTH_METHODS,
} from "./providers.js";

// Re-export from models.js for backward compatibility
export {
  PROVIDER_MODELS,
  AI_MODELS,
} from "./models.js";
