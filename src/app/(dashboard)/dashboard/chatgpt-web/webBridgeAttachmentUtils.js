export const WEB_BRIDGE_MAX_ATTACHMENTS = 6;
export const WEB_BRIDGE_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const WEB_BRIDGE_MAX_CONVERSATION_CHARS = 200_000;

function createAttachmentId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `attachment_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function createError(message) {
  return new Error(message);
}

function ensureAttachmentSlots(existingAttachments = [], incomingCount = 0) {
  const total = (Array.isArray(existingAttachments) ? existingAttachments.length : 0) + incomingCount;
  if (total > WEB_BRIDGE_MAX_ATTACHMENTS) {
    throw createError(`Chỉ được đính kèm tối đa ${WEB_BRIDGE_MAX_ATTACHMENTS} mục mỗi lần gửi.`);
  }
}

function ensureAttachmentSize(file) {
  if (file.size > WEB_BRIDGE_MAX_ATTACHMENT_BYTES) {
    throw createError(`"${file.name}" vượt quá giới hạn ${Math.floor(WEB_BRIDGE_MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.`);
  }
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

function getFileExtensionFromMimeType(mimeType = "") {
  const normalized = normalizeString(mimeType).toLowerCase();
  if (!normalized) return "bin";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "text/plain") return "txt";
  if (normalized === "application/json") return "json";
  if (normalized === "text/markdown") return "md";

  const slashIndex = normalized.indexOf("/");
  if (slashIndex >= 0 && slashIndex < normalized.length - 1) {
    return normalized.slice(slashIndex + 1).split("+")[0] || "bin";
  }

  return "bin";
}

function formatBytesAsDataUrl(bytes, mimeType) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Không thể đọc tệp."));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width || null, height: image.height || null });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = dataUrl;
  });
}

export async function createAttachmentsFromFileList(fileList, existingAttachments = []) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    return [];
  }

  ensureAttachmentSlots(existingAttachments, files.length);
  const attachments = [];

  for (const file of files) {
    ensureAttachmentSize(file);

    const dataUrl = await readFileAsDataUrl(file);
    const mimeType = normalizeString(file.type) || guessMimeTypeFromFilename(file.name);
    const isImage = mimeType.startsWith("image/");
    const imageMeta = isImage ? await readImageDimensions(dataUrl) : { width: null, height: null };

    attachments.push({
      id: createAttachmentId(),
      kind: isImage ? "image" : "file",
      name: file.name || `file-${Date.now()}.${getFileExtensionFromMimeType(mimeType)}`,
      mimeType,
      size: file.size || 0,
      dataUrl,
      fileData: dataUrl,
      width: imageMeta.width,
      height: imageMeta.height,
      source: "local",
    });
  }

  return attachments;
}

export function createConversationAttachment({ title, content }) {
  const normalizedContent = String(content || "").trim();
  if (!normalizedContent) {
    throw createError("Nội dung hội thoại đính kèm đang rỗng.");
  }

  if (normalizedContent.length > WEB_BRIDGE_MAX_CONVERSATION_CHARS) {
    throw createError(`Hội thoại đính kèm quá dài. Giới hạn ${WEB_BRIDGE_MAX_CONVERSATION_CHARS.toLocaleString()} ký tự.`);
  }

  const normalizedTitle = normalizeString(title) || `conversation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
  const bytes = new TextEncoder().encode(normalizedContent);
  if (bytes.length > WEB_BRIDGE_MAX_ATTACHMENT_BYTES) {
    throw createError(`Hội thoại đính kèm vượt quá giới hạn ${Math.floor(WEB_BRIDGE_MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.`);
  }

  const mimeType = normalizedTitle.toLowerCase().endsWith(".json") ? "application/json" : "text/plain";
  const dataUrl = formatBytesAsDataUrl(bytes, mimeType);

  return {
    id: createAttachmentId(),
    kind: "conversation",
    name: normalizedTitle,
    mimeType,
    size: bytes.length,
    dataUrl,
    fileData: dataUrl,
    previewText: normalizedContent.slice(0, 160),
    source: "conversation",
  };
}

export function buildWebBridgeUserMessageContent(prompt, attachments = []) {
  const normalizedPrompt = String(prompt || "");
  const normalizedAttachments = Array.isArray(attachments) ? attachments : [];

  if (normalizedAttachments.length === 0) {
    return normalizedPrompt;
  }

  const content = [];
  if (normalizedPrompt) {
    content.push({ type: "text", text: normalizedPrompt });
  }

  for (const attachment of normalizedAttachments) {
    if (attachment?.kind === "image" && attachment?.dataUrl) {
      content.push({
        type: "image_url",
        image_url: {
          url: attachment.dataUrl,
          filename: attachment.name,
          width: attachment.width ?? null,
          height: attachment.height ?? null,
        },
      });
      continue;
    }

    if (attachment?.fileData) {
      content.push({
        type: "file",
        file: {
          file_data: attachment.fileData,
          filename: attachment.name,
          mime_type: attachment.mimeType || guessMimeTypeFromFilename(attachment.name),
        },
      });
    }
  }

  return content;
}

export function formatAttachmentSize(size) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let current = value / 1024;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function getAttachmentKindLabel(attachment) {
  if (attachment?.kind === "image") return "Ảnh";
  if (attachment?.kind === "conversation") return "Hội thoại";
  return "Tệp";
}
