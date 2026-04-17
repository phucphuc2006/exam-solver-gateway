// ── Gemini Web Bridge — File Upload ──
// Handles: resumable upload to Google content-push, message attachment upload

import {
  GEMINI_WEB_BASE_URL,
  GEMINI_WEB_UPLOAD_URL,
  GEMINI_WEB_UPLOAD_HEADERS,
  GEMINI_WEB_BASE_HEADERS,
  normalizeString,
  createGeminiError,
} from "./constants.js";
import { readResponseTextSnippet } from "./responseParser.js";

// ── Resumable upload ──

export async function uploadGeminiAttachmentResumable(attachment) {
  const filename = normalizeString(attachment?.filename || attachment?.name) || `file-${Date.now()}`;
  const mimeType = normalizeString(attachment?.mimeType) || "application/octet-stream";
  const bytes = Buffer.isBuffer(attachment?.bytes) ? attachment.bytes : Buffer.from([]);

  if (bytes.length === 0) {
    throw createGeminiError("Gemini Web bridge khong doc duoc noi dung attachment de upload.", 400);
  }

  await fetch(GEMINI_WEB_UPLOAD_URL, {
    method: "OPTIONS",
    headers: GEMINI_WEB_UPLOAD_HEADERS,
  }).catch(() => null);

  const startHeaders = {
    ...GEMINI_WEB_UPLOAD_HEADERS,
    size: String(bytes.length),
    "x-goog-upload-command": "start",
    "x-goog-upload-header-content-length": String(bytes.length),
    "x-goog-upload-header-content-type": mimeType,
  };
  const startResponse = await fetch(GEMINI_WEB_UPLOAD_URL, {
    method: "POST",
    headers: startHeaders,
    body: `File name: ${filename}`,
  });

  if (!startResponse.ok) {
    const detail = await readResponseTextSnippet(startResponse);
    throw createGeminiError(
      `Gemini Web upload start failed with HTTP ${startResponse.status}${detail ? `: ${detail}` : ""}`,
      startResponse.status,
    );
  }

  const uploadUrl = normalizeString(startResponse.headers.get("x-goog-upload-url"));
  if (!uploadUrl) {
    throw createGeminiError("Gemini Web upload start khong tra ve X-Goog-Upload-Url.", 502);
  }

  const uploadHeaders = {
    accept: "*/*",
    origin: GEMINI_WEB_BASE_URL,
    referer: `${GEMINI_WEB_BASE_URL}/`,
    "user-agent": GEMINI_WEB_BASE_HEADERS["User-Agent"],
    "x-goog-upload-command": "upload, finalize",
    "x-goog-upload-offset": "0",
    "content-type": mimeType,
  };

  await fetch(uploadUrl, {
    method: "OPTIONS",
    headers: {
      ...uploadHeaders,
      size: String(bytes.length),
      "x-goog-upload-command": "start",
    },
  }).catch(() => null);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: uploadHeaders,
    body: bytes,
  });

  if (!uploadResponse.ok) {
    const detail = await readResponseTextSnippet(uploadResponse);
    throw createGeminiError(
      `Gemini Web upload finalize failed with HTTP ${uploadResponse.status}${detail ? `: ${detail}` : ""}`,
      uploadResponse.status,
    );
  }

  const reference = normalizeString(await uploadResponse.text());
  if (!reference) {
    throw createGeminiError("Gemini Web upload khong tra ve upload reference hop le.", 502);
  }

  return {
    reference,
    name: filename,
    mimeType,
    size: bytes.length,
  };
}

// ── Upload attachments for all messages ──

export async function uploadGeminiMessageAttachments(messages = []) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];

  for (const message of normalizedMessages) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    for (const attachment of attachments) {
      if (normalizeString(attachment?.upload?.reference)) {
        continue;
      }

      attachment.upload = await uploadGeminiAttachmentResumable(attachment);
    }
  }
}
