// ── ChatGPT Web Page — Capture Import Hook ──
"use client";

import { useCallback } from "react";
import { parseErrorResponse, hasBearerAuthorizationHeader } from "./chatgptWebUtils";
import {
  getBackendApiUrlFromCurl,
  extractJsonRequestBodyFromCurl,
  getTargetPathFromCaptureUrl,
  isSupportedCaptureUrl,
  resolveCaptureTargetPath,
} from "./captureHelpers";
import {
  parseCookieHeaderString,
  extractImportedCookies,
  looksLikeCookieHeaderValue,
} from "./cookieHelpers";

/**
 * Console script for capturing ChatGPT Web requests.
 * Intercepts fetch/XHR to backend-api conversation endpoints,
 * extracts headers + cookies + request template, then copies to clipboard.
 */
export const CAPTURE_CONSOLE_SCRIPT = `(()=>{
const targets=["/backend-api/f/conversation","/backend-api/conversation"];
if(window.__nexusCaptureInstalled){alert("Capture da bat san. Hay gui 1 tin nhan trong ChatGPT de script bat request conversation.");return;}
window.__nexusCaptureInstalled=true;
const toHeaders=(src)=>{try{if(!src)return{};if(src instanceof Headers)return Object.fromEntries(src.entries());if(Array.isArray(src))return Object.fromEntries(src);if(typeof src.forEach==="function"){const out={};src.forEach((v,k)=>out[k]=v);return out;}if(typeof src==="object")return Object.fromEntries(Object.entries(src));}catch{}return{};};
const matchTarget=(url)=>targets.find((path)=>String(url||"").includes(path))||"";
const parseBody=(body)=>{try{if(!body)return null;if(typeof body==="string")return JSON.parse(body);if(body instanceof URLSearchParams)return JSON.parse(body.toString());if(typeof body==="object"&&!Array.isArray(body))return body;}catch{}return null;};
const done=()=>{try{window.fetch=origFetch;XMLHttpRequest.prototype.open=origOpen;XMLHttpRequest.prototype.send=origSend;XMLHttpRequest.prototype.setRequestHeader=origSet;}catch{}window.__nexusCaptureInstalled=false;};
const deliver=(url,headers,targetPath,body)=>{const normalized=Object.fromEntries(Object.entries(toHeaders(headers)).map(([k,v])=>[String(k).toLowerCase(),String(v??"").trim()]).filter(([k,v])=>k&&v));if(!/^bearer\\\\s+\\\\S+/i.test(normalized.authorization||""))return false;const requestTemplate=parseBody(body);const payload=JSON.stringify({headers:normalized,c:document.cookie,ua:navigator.userAgent,u:String(url||location.href),captureUrl:String(url||location.href),capturedTargetPath:String(targetPath||""),requestTemplate,ts:new Date().toISOString()});const finish=()=>{done();alert("Da bat duoc request "+(targetPath||"/backend-api/f/conversation")+" va copy du lieu. Quay lai Dashboard de dan vao.");};navigator.clipboard.writeText(payload).then(finish).catch(()=>{prompt("Copy dong nay:",payload);finish();});return true;};
const origFetch=window.fetch.bind(window);
window.fetch=function(input,init){try{const req=input instanceof Request?input:null;const url=req?req.url:input;const targetPath=matchTarget(url);if(targetPath){deliver(url,init?.headers||req?.headers,targetPath,init?.body);}}catch{}return origFetch.apply(this,arguments);};
const origOpen=XMLHttpRequest.prototype.open;
const origSet=XMLHttpRequest.prototype.setRequestHeader;
const origSend=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(method,url){this.__nexusUrl=url;this.__nexusHeaders={};return origOpen.apply(this,arguments);};
XMLHttpRequest.prototype.setRequestHeader=function(name,value){try{this.__nexusHeaders[String(name).toLowerCase()]=String(value);}catch{}return origSet.apply(this,arguments);};
XMLHttpRequest.prototype.send=function(body){try{const targetPath=matchTarget(this.__nexusUrl);if(targetPath){deliver(this.__nexusUrl,this.__nexusHeaders,targetPath,body);}}catch{}return origSend.apply(this,arguments);};
alert("Capture da san sang. Bay gio hay gui 1 tin nhan trong chat thuong cua ChatGPT. Script se chi copy khi bat duoc request conversation.");
})();`;

/**
 * Custom hook for importing captured ChatGPT Web sessions.
 * Handles:
 * - Raw capture bundle import (JSON with headers/cookies)
 * - Token/JSON capture string parsing and import
 * - cURL string parsing and import
 *
 * @param {{
 *   loadData: () => Promise<void>,
 *   autoConnectEnabled: boolean,
 *   autoPausedRef: React.MutableRefObject<boolean>,
 *   resetAutoAttempts: () => void,
 *   setAutoStatus: (status: string) => void,
 *   setBusyAction: (action: string) => void,
 *   setShowCurlModal: (show: boolean) => void,
 *   setShowWebConnectModal: (show: boolean) => void,
 *   setTokenInput: (value: string) => void,
 *   setCurlInput: (value: string) => void,
 * }} deps
 */
export function useCaptureImport({
  loadData,
  autoConnectEnabled,
  autoPausedRef,
  resetAutoAttempts,
  setAutoStatus,
  setBusyAction,
  setShowCurlModal,
  setShowWebConnectModal,
  setTokenInput,
  setCurlInput,
}) {
  // ── Import a fully-formed capture bundle (JSON with headers/cookies) ──
  const importCaptureBundle = useCallback(async (
    capture,
    {
      action = "connect",
      closeWebConnectModal = false,
      clearTokenInput = false,
      closeCurlModal = false,
      clearCurlInput = false,
    } = {},
  ) => {
    if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
      throw new Error("Capture bundle không hợp lệ.");
    }

    setBusyAction(action);
    if (closeCurlModal) {
      setShowCurlModal(false);
    }

    try {
      const importResponse = await fetch("/api/chatgpt-web/session/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capture),
      });

      if (!importResponse.ok) {
        throw new Error(await parseErrorResponse(importResponse));
      }

      const validateResponse = await fetch("/api/chatgpt-web/session/validate", {
        method: "POST",
      });

      if (!validateResponse.ok) {
        await loadData().catch(() => {});
        throw new Error(await parseErrorResponse(validateResponse));
      }

      await loadData();
      autoPausedRef.current = false;
      resetAutoAttempts();
      setAutoStatus(autoConnectEnabled ? "ready" : "disabled");

      if (closeWebConnectModal) {
        setShowWebConnectModal(false);
      }
      if (clearTokenInput) {
        setTokenInput("");
      }
      if (clearCurlInput) {
        setCurlInput("");
      }
    } finally {
      setBusyAction("");
    }
  }, [autoConnectEnabled, autoPausedRef, loadData, resetAutoAttempts, setAutoStatus, setBusyAction, setCurlInput, setShowCurlModal, setShowWebConnectModal, setTokenInput]);

  // ── Parse raw token/JSON capture string and import ──
  const importCapturedToken = useCallback(async (
    rawInput,
    {
      action = "web-connect",
      closeWebConnectModal = true,
      clearTokenInput = true,
    } = {},
  ) => {
    const raw = String(rawInput || "").trim();
    if (!raw) {
      throw new Error("Không có dữ liệu capture để import.");
    }

    let accessToken = "";
    let cookieStr = "";
    let importedUserAgent = "";
    let capturedHeaders = {};
    let captureUrl = "";
    let capturedTargetPath = "";
    let captureSource = "";
    let importedCookies = [];
    let requestTemplate = null;

    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        importedCookies = extractImportedCookies(parsed);

        if (Array.isArray(parsed)) {
          captureSource = importedCookies.length > 0 ? "browser-cookie-import" : "";
        } else if (parsed && typeof parsed === "object") {
          accessToken = parsed.t || parsed.accessToken || parsed.token || "";
          if (!accessToken && typeof parsed.authorization === "string") {
            accessToken = parsed.authorization;
          }
          cookieStr = parsed.c || parsed.cookieHeader || "";
          importedUserAgent = parsed.ua || parsed.userAgent || "";
          captureUrl = parsed.captureUrl || parsed.u || parsed.url || parsed.requestUrl || "";
          capturedTargetPath = parsed.capturedTargetPath || "";
          captureSource = parsed.captureSource || (importedCookies.length > 0 ? "browser-cookie-import" : "");
          requestTemplate = parsed.requestTemplate || parsed.requestBody || parsed.bodyTemplate || null;
          if (parsed.headers && typeof parsed.headers === "object" && !Array.isArray(parsed.headers)) {
            capturedHeaders = Object.fromEntries(
              Object.entries(parsed.headers)
                .map(([key, value]) => [String(key).toLowerCase(), String(value ?? "").trim()])
                .filter(([key, value]) => key && value),
            );
          }
        }
      } catch {
        if (looksLikeCookieHeaderValue(raw)) {
          cookieStr = raw;
          captureSource = "browser-cookie-import";
        } else {
          accessToken = raw;
        }
      }
    } else if (looksLikeCookieHeaderValue(raw)) {
      cookieStr = raw;
      captureSource = "browser-cookie-import";
    } else {
      accessToken = raw;
    }

    const cookies = importedCookies.length > 0
      ? importedCookies
      : parseCookieHeaderString(cookieStr);

    if (!cookies.length && !accessToken) {
      throw new Error("Không tìm thấy cookie, token hoặc cookie JSON hợp lệ để import.");
    }

    const resolvedCaptureTargetPath = resolveCaptureTargetPath(captureUrl, capturedTargetPath);
    const headers = { ...capturedHeaders };
    const cookieOnlyImport = !Object.keys(headers).length && cookies.length > 0;
    if (accessToken && !headers.authorization) {
      headers.authorization = /^bearer\s+\S+/i.test(accessToken) ? accessToken : "Bearer " + accessToken;
    }

    if (cookieOnlyImport) {
      throw new Error("Dữ liệu cookie-only kiểu cũ không còn đủ để gọi bridge chat thường. Hãy chạy script capture request thật hoặc dùng 'Nhập cURL' cho route conversation của chat thường.");
    }

    if (!hasBearerAuthorizationHeader(headers.authorization)) {
      throw new Error("Capture hiện tại chưa có Authorization Bearer hợp lệ. Hãy chạy lại script hoặc dùng 'Nhập cURL' từ request conversation thật của ChatGPT.");
    }
    if (!resolvedCaptureTargetPath) {
      throw new Error("Capture hiện tại chưa có route của request chat thường. Hãy bắt lại đúng request conversation rồi import.");
    }
    if (resolvedCaptureTargetPath && !isSupportedCaptureUrl(resolvedCaptureTargetPath)) {
      throw new Error("Capture hiện tại không phải từ route conversation của chat thường. Hãy capture lại đúng request backend-api của ChatGPT.");
    }

    await importCaptureBundle({
      cookies,
      headers,
      userAgent: importedUserAgent || navigator.userAgent,
      captureUrl,
      capturedTargetPath: resolvedCaptureTargetPath || null,
      capturedAt: new Date().toISOString(),
      captureSource: captureSource || null,
      requestTemplate: requestTemplate && typeof requestTemplate === "object" && !Array.isArray(requestTemplate)
        ? requestTemplate
        : null,
    }, {
      action,
      closeWebConnectModal,
      clearTokenInput,
    });
  }, [importCaptureBundle]);

  // ── Parse cURL string, extract headers/cookies, and import ──
  const importCaptureFromCurl = useCallback(async (
    rawCurl,
    {
      action = "connect",
      closeCurlModal = true,
      clearCurlInput = true,
    } = {},
  ) => {
    const trimmedCurl = String(rawCurl || "").trim();
    if (!trimmedCurl) {
      throw new Error("Không có cURL để import.");
    }

    const headers = {};
    const captureUrl = getBackendApiUrlFromCurl(trimmedCurl);
    const requestTemplate = extractJsonRequestBodyFromCurl(trimmedCurl);
    const parts = trimmedCurl.split(/(?:-H|--header)\s+/);
    for (let i = 1; i < parts.length; i++) {
      let p = parts[i].trim();
      let quote = "";
      if (p.startsWith("'") || p.startsWith('"')) {
        quote = p[0];
        p = p.slice(1);
        const endIdx = p.indexOf(quote);
        if (endIdx !== -1) p = p.slice(0, endIdx);
      } else {
        const spaceIdx = p.indexOf(" ");
        if (spaceIdx > -1) p = p.slice(0, spaceIdx);
      }
      const colon = p.indexOf(":");
      if (colon > 0) {
        const key = p.slice(0, colon).trim().toLowerCase();
        const val = p.slice(colon + 1).trim();
        headers[key] = val;
      }
    }

    if (!hasBearerAuthorizationHeader(headers["authorization"])) {
      throw new Error("Lệnh cURL phải chứa Authorization Bearer hợp lệ từ request backend-api thật của ChatGPT.");
    }
    const capturedTargetPath = getTargetPathFromCaptureUrl(captureUrl);
    if (!captureUrl || !isSupportedCaptureUrl(captureUrl)) {
      throw new Error("Hãy dán cURL của đúng request conversation thật của ChatGPT Web.");
    }

    const cookies = [];
    if (headers["cookie"]) {
      const cookieParts = headers["cookie"].split(";");
      for (const cookiePart of cookieParts) {
        const eq = cookiePart.indexOf("=");
        if (eq > 0) {
          cookies.push({
            name: cookiePart.slice(0, eq).trim(),
            value: cookiePart.slice(eq + 1).trim(),
            domain: "chatgpt.com",
            path: "/"
          });
        }
      }
    }

    const capture = {
      cookies,
      headers,
      userAgent: headers["user-agent"] || navigator.userAgent,
      captureUrl,
      capturedTargetPath,
      capturedAt: new Date().toISOString(),
      requestTemplate,
    };

    await importCaptureBundle(capture, {
      action,
      closeCurlModal,
      clearCurlInput,
    });
  }, [importCaptureBundle]);

  return {
    importCaptureBundle,
    importCapturedToken,
    importCaptureFromCurl,
  };
}
