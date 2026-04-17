/**
 * OAuth Provider Configurations and Handlers
 * NexusAI Gateway — Only Codex + Kiro
 */

// Ensure outbound fetch respects HTTP(S)_PROXY/ALL_PROXY in Node runtime
import "open-sse/index.js";

import { generatePKCE, generateState } from "./utils/pkce";
import {
  CODEX_CONFIG,
  KIRO_CONFIG,
  AMAZONQ_CONFIG,
  GITLAB_DUO_CONFIG,
  CODEBUDDY_CONFIG,
} from "./constants/oauth";

// Provider configurations
const PROVIDERS = {
  codex: {
    config: CODEX_CONFIG,
    flowType: "authorization_code_pkce",
    fixedPort: 1455,
    callbackPath: "/auth/callback",
    buildAuthUrl: (config, redirectUri, state, codeChallenge) => {
      const params = {
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: redirectUri,
        scope: config.scope,
        code_challenge: codeChallenge,
        code_challenge_method: config.codeChallengeMethod,
        ...config.extraParams,
        state: state,
      };
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&");
      return `${config.authorizeUrl}?${queryString}`;
    },
    exchangeToken: async (config, code, redirectUri, codeVerifier) => {
      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.clientId,
          code: code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
      }

      return await response.json();
    },
    mapTokens: (tokens) => ({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresIn: tokens.expires_in,
    }),
  },

  kiro: {
    config: KIRO_CONFIG,
    flowType: "device_code",
    // Kiro uses AWS SSO OIDC - requires client registration first
    requestDeviceCode: async (config) => {
      // Step 1: Register client with AWS SSO OIDC
      const registerRes = await fetch(config.registerClientUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          clientName: config.clientName,
          clientType: config.clientType,
          scopes: config.scopes,
          grantTypes: config.grantTypes,
          issuerUrl: config.issuerUrl,
        }),
      });

      if (!registerRes.ok) {
        const error = await registerRes.text();
        throw new Error(`Client registration failed: ${error}`);
      }

      const clientInfo = await registerRes.json();

      // Step 2: Request device authorization
      const deviceRes = await fetch(config.deviceAuthUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          clientId: clientInfo.clientId,
          clientSecret: clientInfo.clientSecret,
          startUrl: config.startUrl,
        }),
      });

      if (!deviceRes.ok) {
        const error = await deviceRes.text();
        throw new Error(`Device authorization failed: ${error}`);
      }

      const deviceData = await deviceRes.json();

      // Return combined data for polling
      return {
        device_code: deviceData.deviceCode,
        user_code: deviceData.userCode,
        verification_uri: deviceData.verificationUri,
        verification_uri_complete: deviceData.verificationUriComplete,
        expires_in: deviceData.expiresIn,
        interval: deviceData.interval || 5,
        // Store client credentials for token exchange
        _clientId: clientInfo.clientId,
        _clientSecret: clientInfo.clientSecret,
      };
    },
    pollToken: async (config, deviceCode, codeVerifier, extraData) => {
      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          clientId: extraData?._clientId,
          clientSecret: extraData?._clientSecret,
          deviceCode: deviceCode,
          grantType: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        const text = await response.text();
        data = { error: "invalid_response", error_description: text };
      }

      // AWS SSO OIDC returns camelCase
      if (data.accessToken) {
        return {
          ok: true,
          data: {
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
            expires_in: data.expiresIn,
            profile_arn: data?.profileArn || null,
            // Store client credentials for refresh
            _clientId: extraData?._clientId,
            _clientSecret: extraData?._clientSecret,
          },
        };
      }

      return {
        ok: false,
        data: {
          error: data.error || "authorization_pending",
          error_description: data.error_description || data.message,
        },
      };
    },
    mapTokens: (tokens) => {
      const mapped = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        providerSpecificData: {
          profileArn: tokens?.profile_arn || null,
          clientId: tokens._clientId,
          clientSecret: tokens._clientSecret,
        },
      };
      return mapped;
    },
  },

  amazonq: {
    config: AMAZONQ_CONFIG,
    flowType: "device_code",
    requestDeviceCode: async (config) => {
      // Step 1: Register client with AWS SSO OIDC
      const registerRes = await fetch(config.registerClientUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          clientName: config.clientName,
          clientType: config.clientType,
          scopes: config.scopes,
          grantTypes: config.grantTypes,
          issuerUrl: config.issuerUrl,
        }),
      });

      if (!registerRes.ok) {
        const error = await registerRes.text();
        throw new Error(`Client registration failed: ${error}`);
      }

      const clientInfo = await registerRes.json();

      // Step 2: Request device authorization
      const deviceRes = await fetch(config.deviceAuthUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          clientId: clientInfo.clientId,
          clientSecret: clientInfo.clientSecret,
          startUrl: config.startUrl,
        }),
      });

      if (!deviceRes.ok) {
        const error = await deviceRes.text();
        throw new Error(`Device authorization failed: ${error}`);
      }

      const deviceData = await deviceRes.json();

      return {
        device_code: deviceData.deviceCode,
        user_code: deviceData.userCode,
        verification_uri: deviceData.verificationUri,
        verification_uri_complete: deviceData.verificationUriComplete,
        expires_in: deviceData.expiresIn,
        interval: deviceData.interval || 5,
        _clientId: clientInfo.clientId,
        _clientSecret: clientInfo.clientSecret,
      };
    },
    pollToken: async (config, deviceCode, codeVerifier, extraData) => {
      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          clientId: extraData?._clientId,
          clientSecret: extraData?._clientSecret,
          deviceCode: deviceCode,
          grantType: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      let data;
      try { data = await response.json(); } catch (e) {
        return { ok: false, data: { error: "invalid_response", error_description: await response.text() } };
      }

      if (data.accessToken) {
        return {
          ok: true,
          data: {
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
            expires_in: data.expiresIn,
            profile_arn: data?.profileArn || null,
            _clientId: extraData?._clientId,
            _clientSecret: extraData?._clientSecret,
          },
        };
      }

      return { ok: false, data: { error: data.error || "authorization_pending", error_description: data.error_description || data.message } };
    },
    mapTokens: (tokens) => ({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      providerSpecificData: {
        profileArn: tokens?.profile_arn || null,
        clientId: tokens._clientId,
        clientSecret: tokens._clientSecret,
      },
    }),
  },

  gitlab: {
    config: GITLAB_DUO_CONFIG,
    flowType: "device_code",
    requestDeviceCode: async (config) => {
      const baseUrl = config.defaultBaseUrl;
      const deviceRes = await fetch(`${baseUrl}${config.deviceAuthPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: config.clientId,
          scope: config.scope,
        }),
      });

      if (!deviceRes.ok) {
        throw new Error(`GitLab device authorization failed: ${await deviceRes.text()}`);
      }

      return await deviceRes.json();
    },
    pollToken: async (config, deviceCode) => {
      const baseUrl = config.defaultBaseUrl;
      const response = await fetch(`${baseUrl}${config.tokenPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: config.clientId,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      let data;
      try { data = await response.json(); } catch (e) {
        return { ok: false, data: { error: "invalid_response", error_description: await response.text() } };
      }

      if (data.access_token) return { ok: true, data };
      return { ok: false, data: { error: data.error || "authorization_pending", error_description: data.error_description } };
    },
    mapTokens: (tokens) => ({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    }),
  },

  codebuddy: {
    config: CODEBUDDY_CONFIG,
    flowType: "device_code",
    requestDeviceCode: async (config) => {
      const deviceRes = await fetch(config.deviceAuthUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: config.clientId }),
      });

      if (!deviceRes.ok) throw new Error(`CodeBuddy device authorization failed: ${await deviceRes.text()}`);
      return await deviceRes.json();
    },
    pollToken: async (config, deviceCode) => {
      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: config.clientId,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      let data;
      try { data = await response.json(); } catch (e) {
        return { ok: false, data: { error: "invalid_response", error_description: await response.text() } };
      }

      if (data.access_token) return { ok: true, data };
      return { ok: false, data: { error: data.error || "authorization_pending", error_description: data.error_description } };
    },
    mapTokens: (tokens) => ({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    }),
  },
};

/**
 * Get provider handler
 */
export function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return provider;
}

/**
 * Get all provider names
 */
export function getProviderNames() {
  return Object.keys(PROVIDERS);
}

/**
 * Generate auth data for a provider
 * @param {object} [meta] - Provider-specific metadata
 */
export function generateAuthData(providerName, redirectUri, meta) {
  const provider = getProvider(providerName);
  const { codeVerifier, codeChallenge, state } = generatePKCE();

  let authUrl;
  if (provider.flowType === "device_code") {
    // Device code flow doesn't have auth URL upfront
    authUrl = null;
  } else if (provider.flowType === "authorization_code_pkce") {
    authUrl = provider.buildAuthUrl(provider.config, redirectUri, state, codeChallenge, meta || {});
  } else {
    authUrl = provider.buildAuthUrl(provider.config, redirectUri, state, undefined, meta || {});
  }

  return {
    authUrl,
    state,
    codeVerifier,
    codeChallenge,
    redirectUri,
    flowType: provider.flowType,
    fixedPort: provider.fixedPort,
    callbackPath: provider.callbackPath || "/callback",
  };
}

/**
 * Exchange code for tokens
 * @param {object} [meta] - Provider-specific metadata
 */
export async function exchangeTokens(providerName, code, redirectUri, codeVerifier, state, meta) {
  const provider = getProvider(providerName);

  const tokens = await provider.exchangeToken(provider.config, code, redirectUri, codeVerifier, state, meta || {});

  let extra = null;
  if (provider.postExchange) {
    extra = await provider.postExchange(tokens);
  }

  return provider.mapTokens(tokens, extra);
}

/**
 * Request device code (for device_code flow)
 */
export async function requestDeviceCode(providerName, codeChallenge) {
  const provider = getProvider(providerName);
  if (provider.flowType !== "device_code") {
    throw new Error(`Provider ${providerName} does not support device code flow`);
  }
  return await provider.requestDeviceCode(provider.config, codeChallenge);
}

/**
 * Poll for token (for device_code flow)
 * @param {string} providerName - Provider name
 * @param {string} deviceCode - Device code from requestDeviceCode
 * @param {string} codeVerifier - PKCE code verifier (optional for some providers)
 * @param {object} extraData - Extra data from device code response
 */
export async function pollForToken(providerName, deviceCode, codeVerifier, extraData) {
  const provider = getProvider(providerName);
  if (provider.flowType !== "device_code") {
    throw new Error(`Provider ${providerName} does not support device code flow`);
  }

  const result = await provider.pollToken(provider.config, deviceCode, codeVerifier, extraData);

  if (result.ok) {
    // For device code flows, success is only when we have an access token
    if (result.data.access_token) {
      // Call postExchange to get additional data
      let extra = null;
      if (provider.postExchange) {
        extra = await provider.postExchange(result.data);
      }
      return { success: true, tokens: provider.mapTokens(result.data, extra) };
    } else {
      // Check if it's still pending authorization
      if (result.data.error === 'authorization_pending' || result.data.error === 'slow_down') {
        return {
          success: false,
          error: result.data.error,
          errorDescription: result.data.error_description || result.data.message,
          pending: result.data.error === 'authorization_pending'
        };
      } else {
        return {
          success: false,
          error: result.data.error || 'no_access_token',
          errorDescription: result.data.error_description || result.data.message || 'No access token received'
        };
      }
    }
  }

  return { success: false, error: result.data.error, errorDescription: result.data.error_description };
}
