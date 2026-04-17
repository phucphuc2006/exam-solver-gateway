const TEXT_PART_TYPES = new Set(["text", "input_text"]);
const IMAGE_PART_TYPES = new Set(["image_url", "input_image"]);
const FILE_PART_TYPES = new Set(["file"]);

export const WEB_BRIDGE_MAX_ATTACHMENT_COUNT = 6;
export const WEB_BRIDGE_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFileExtensionFromMimeType(mimeType = "") {
  const normalized = normalizeString(mimeType).toLowerCase();
  if (!normalized) return "bin";

  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/svg+xml") return "svg";
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "application/json") return "json";
  if (normalized === "text/plain") return "txt";
  if (normalized === "text/markdown") return "md";

  const slashIndex = normalized.indexOf("/");
  if (slashIndex >= 0 && slashIndex < normalized.length - 1) {
    const suffix = normalized.slice(slashIndex + 1).split("+")[0];
    if (suffix) {
      return suffix;
    }
  }

  return "bin";
}

function guessMimeTypeFromFilename(filename = "") {
  const normalized = normalizeString(filename).toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".md")) return "text/markdown";
  if (normalized.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function decodeUrlEncodedPayload(value = "") {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function parseDataUrl(dataUrl, label = "attachment") {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:([^;,]+)?((?:;[^,]+)*?),(.*)$/s);
  if (!match) {
    throw new Error(`${label} phải là data URL hợp lệ.`);
  }

  const mimeType = normalizeString(match[1]) || "application/octet-stream";
  const flags = normalizeString(match[2]).toLowerCase();
  const payload = match[3] || "";
  const isBase64 = flags.includes(";base64");

  const bytes = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeUrlEncodedPayload(payload), "utf8");

  return {
    mimeType,
    bytes,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
  };
}

function buildImageAttachment(part, index) {
  const imageValue = isPlainObject(part?.image_url) ? part.image_url : part;
  const rawUrl = normalizeString(imageValue?.url || part?.url);
  if (!rawUrl) {
    throw new Error(`Thiếu dữ liệu ảnh ở attachment #${index + 1}.`);
  }

  const { mimeType, bytes, dataUrl } = parseDataUrl(rawUrl, `Ảnh #${index + 1}`);
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Ảnh #${index + 1} có mime type không hợp lệ: ${mimeType}.`);
  }

  const explicitName = normalizeString(
    imageValue?.filename
    || imageValue?.name
    || part?.filename
    || part?.name,
  );

  return {
    type: "image",
    kind: "image",
    filename: explicitName || `image-${index + 1}.${getFileExtensionFromMimeType(mimeType)}`,
    mimeType,
    size: bytes.length,
    bytes,
    dataUrl,
    width: Number.isFinite(Number(imageValue?.width)) ? Number(imageValue.width) : null,
    height: Number.isFinite(Number(imageValue?.height)) ? Number(imageValue.height) : null,
  };
}

function buildFileAttachment(part, index) {
  const fileValue = isPlainObject(part?.file) ? part.file : part;
  const rawData = normalizeString(fileValue?.file_data || part?.file_data);
  if (!rawData) {
    throw new Error(`Thiếu dữ liệu tệp ở attachment #${index + 1}.`);
  }

  const parsed = parseDataUrl(rawData, `Tệp #${index + 1}`);
  const explicitName = normalizeString(
    fileValue?.filename
    || fileValue?.name
    || part?.filename
    || part?.name,
  );
  const mimeType = normalizeString(
    fileValue?.mime_type
    || fileValue?.mimeType
    || part?.mime_type
    || part?.mimeType,
  ) || parsed.mimeType || guessMimeTypeFromFilename(explicitName);

  return {
    type: "file",
    kind: "file",
    filename: explicitName || `file-${index + 1}.${getFileExtensionFromMimeType(mimeType)}`,
    mimeType,
    size: parsed.bytes.length,
    bytes: parsed.bytes,
    dataUrl: `data:${mimeType};base64,${parsed.bytes.toString("base64")}`,
  };
}

export function createAttachmentFallbackText(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  const imageCount = list.filter((item) => item?.kind === "image").length;
  const fileCount = list.length - imageCount;

  if (imageCount > 0 && fileCount > 0) {
    return "Vui lòng phân tích các ảnh và tệp đính kèm.";
  }

  if (imageCount > 0) {
    return imageCount > 1
      ? "Vui lòng phân tích các ảnh đính kèm."
      : "Vui lòng phân tích ảnh đính kèm.";
  }

  if (fileCount > 0) {
    return fileCount > 1
      ? "Vui lòng phân tích các tệp đính kèm."
      : "Vui lòng phân tích tệp đính kèm.";
  }

  return "";
}

export function normalizeWebBridgeContentParts(
  content,
  {
    providerLabel = "Web Bridge",
    allowImages = true,
    allowFiles = true,
    role = "user",
  } = {},
) {
  if (typeof content === "string") {
    return {
      text: content,
      parts: content ? [{ type: "text", text: content }] : [],
      attachments: [],
      imageAttachments: [],
      fileAttachments: [],
    };
  }

  // Handle null/undefined/number/boolean — treat as empty text
  if (content == null || typeof content !== "object") {
    const text = content != null ? String(content) : "";
    return {
      text,
      parts: text ? [{ type: "text", text }] : [],
      attachments: [],
      imageAttachments: [],
      fileAttachments: [],
    };
  }

  if (!Array.isArray(content)) {
    throw new Error(`${providerLabel} chỉ hỗ trợ content dạng text hoặc array parts.`);
  }

  const parts = [];
  const attachments = [];
  const textParts = [];

  for (let index = 0; index < content.length; index += 1) {
    const part = content[index];

    if (typeof part === "string") {
      const text = String(part);
      parts.push({ type: "text", text });
      if (text) {
        textParts.push(text);
      }
      continue;
    }

    if (!isPlainObject(part)) {
      throw new Error(`${providerLabel} nhận được part không hợp lệ ở vị trí ${index + 1}.`);
    }

    const partType = normalizeString(part.type).toLowerCase();

    if (TEXT_PART_TYPES.has(partType)) {
      const text = String(part.text ?? "");
      parts.push({ type: "text", text });
      if (text) {
        textParts.push(text);
      }
      continue;
    }

    if (role === "system") {
      throw new Error(`${providerLabel} chưa hỗ trợ attachment trong system message.`);
    }

    if (IMAGE_PART_TYPES.has(partType)) {
      if (!allowImages) {
        throw new Error(`${providerLabel} hiện chưa hỗ trợ gửi ảnh thật.`);
      }

      const attachment = buildImageAttachment(part, attachments.length);
      attachments.push(attachment);
      parts.push(attachment);
      continue;
    }

    if (FILE_PART_TYPES.has(partType)) {
      if (!allowFiles) {
        throw new Error(`${providerLabel} hiện chưa hỗ trợ gửi tệp hoặc hội thoại đính kèm.`);
      }

      const attachment = buildFileAttachment(part, attachments.length);
      attachments.push(attachment);
      parts.push(attachment);
      continue;
    }

    throw new Error(`${providerLabel} chưa hỗ trợ content type \`${partType || "unknown"}\`.`);
  }

  if (attachments.length > WEB_BRIDGE_MAX_ATTACHMENT_COUNT) {
    throw new Error(
      `${providerLabel} chỉ cho phép tối đa ${WEB_BRIDGE_MAX_ATTACHMENT_COUNT} attachment trong một request.`,
    );
  }

  for (const attachment of attachments) {
    if (attachment.size > WEB_BRIDGE_MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `${providerLabel} chỉ nhận attachment tối đa ${Math.floor(WEB_BRIDGE_MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB mỗi tệp.`,
      );
    }
  }

  return {
    text: textParts.join("\n"),
    parts,
    attachments,
    imageAttachments: attachments.filter((attachment) => attachment.kind === "image"),
    fileAttachments: attachments.filter((attachment) => attachment.kind !== "image"),
  };
}

export function normalizeWebBridgeMessages(
  messages = [],
  {
    providerLabel = "Web Bridge",
    allowImages = true,
    allowFiles = true,
    allowedRoles = null,
  } = {},
) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Field `messages` must be a non-empty array.");
  }

  return messages.map((message, index) => {
    if (!isPlainObject(message)) {
      throw new Error(`Message at index ${index} is invalid.`);
    }

    const role = normalizeString(message.role);
    if (!role) {
      throw new Error(`Message at index ${index} is missing role.`);
    }

    if (allowedRoles && !allowedRoles.has(role)) {
      throw new Error(`Message role \`${role}\` is not supported.`);
    }

    const normalizedContent = normalizeWebBridgeContentParts(message.content, {
      providerLabel,
      allowImages,
      allowFiles,
      role,
    });

    return {
      role,
      content: normalizedContent.text,
      contentParts: normalizedContent.parts,
      attachments: normalizedContent.attachments,
      imageAttachments: normalizedContent.imageAttachments,
      fileAttachments: normalizedContent.fileAttachments,
      hasAttachments: normalizedContent.attachments.length > 0,
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
      toolCallId: normalizeString(message.tool_call_id) || null,
    };
  });
}

export function formatWebBridgeMessagesAsPrompt(
  messages = [],
  {
    emptyAttachmentLabel = "",
  } = {},
) {
  const normalized = Array.isArray(messages) ? messages : [];
  const lines = [];

  for (const message of normalized) {
    const role = normalizeString(message?.role || "user").toLowerCase();
    const content = normalizeString(message?.content);
    const hasAttachments = Array.isArray(message?.attachments) && message.attachments.length > 0;
    const toolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];

    if (!content && !hasAttachments && toolCalls.length === 0) {
      continue;
    }

    const value = content || emptyAttachmentLabel;

    let finalContent = "";
    if (toolCalls.length > 0) {
      const callsStr = toolCalls.map((tc) => {
        return `[Action / Tool Called: ${tc.function?.name || "unknown"}]\n[Arguments]:\n${tc.function?.arguments || "{}"}`;
      }).join("\n\n");
      finalContent = value ? `${value}\n\n${callsStr}` : callsStr;
    } else {
      finalContent = value;
    }

    if (!finalContent) {
      continue;
    }

    if (role === "system") {
      lines.push(`[SYSTEM]\n${finalContent}`);
      continue;
    }

    let speaker = "User";
    if (role === "assistant") {
      speaker = "Assistant";
    } else if (role === "tool") {
      speaker = `Tool Result ${message.toolCallId ? `[${message.toolCallId}]` : ""}`;
    }

    lines.push(`${speaker}: ${finalContent}`);
  }

  return lines.join("\n\n").trim();
}
