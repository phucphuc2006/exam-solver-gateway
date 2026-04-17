// ── Gemini Web Bridge — Response Parser ──
// Handles: HTML token parsing, model hash discovery, reply extraction, stream parsing

import {
  GEMINI_WEB_MODEL_PAYLOADS,
  normalizeString,
} from "./constants.js";

// ── Model hash parsing from HTML page ──

/**
 * Parse model hashes từ HTML page Gemini Web.
 * Rất có thể Google đã giấu hash khỏi HTML page. 
 * Nếu tìm được trong HTML thì dùng, nếu KHÔNG thì TRẢ VỀ NULL để fallback xài hardcode cố định.
 */
function parseModelIdsFromPage(html = "") {
  const pageStr = String(html);
  const result = { pro: null, thinking: null, allHashes: [], hardcodeValid: {} };

  const foundSet = new Set();
  const hexPattern1 = /["']([a-f0-9]{32})["']/g;
  const hexPattern2 = /[=:,\s]([a-f0-9]{32})[,\]\}\s"']/g;
  const hexPattern3 = /(?<![a-f0-9])([a-f0-9]{32})(?![a-f0-9])/g;

  let m;
  while ((m = hexPattern1.exec(pageStr)) !== null) foundSet.add(m[1]);
  while ((m = hexPattern2.exec(pageStr)) !== null) foundSet.add(m[1]);
  while ((m = hexPattern3.exec(pageStr)) !== null) foundSet.add(m[1]);

  result.allHashes = [...foundSet];

  // Validate hash hardcode hiện tại có còn trong page không
  const KNOWN_HASHES = {
    pro: GEMINI_WEB_MODEL_PAYLOADS["gemini-3.1-pro"]?.modelId,
    thinking: GEMINI_WEB_MODEL_PAYLOADS["gemini-3.0-flash-thinking"]?.modelId,
  };

  for (const [name, hash] of Object.entries(KNOWN_HASHES)) {
    if (hash) {
      result.hardcodeValid[name] = foundSet.has(hash);
    }
  }

  // Nếu tìm thấy ở đâu đó trong HTML thì đánh dấu là có thể lấy
  if (KNOWN_HASHES.pro && foundSet.has(KNOWN_HASHES.pro)) result.pro = KNOWN_HASHES.pro;
  if (KNOWN_HASHES.thinking && foundSet.has(KNOWN_HASHES.thinking)) result.thinking = KNOWN_HASHES.thinking;

  // Xóa bỏ tính năng tự động bịa hash duy nhất, bởi vì `91f30755d6a6b787dcc2a4062e6e9824` 
  // có thể chỉ là hash nhảm. Nếu null nó sẽ tự gài lại mã hardcode ở executeGeminiWebCompletion!
  return result;
}

export function parseGeminiTokensFromPage(html = "") {
  const snlm0eMatch = String(html).match(/"SNlM0e":"(.*?)"/);
  if (!snlm0eMatch) {
    throw new Error("Không đọc được token SNlM0e từ Gemini. Cookie có thể đã hết hạn.");
  }

  const sidMatch = String(html).match(/"FdrFJe":"([\d-]+)"/);
  const blMatch = String(html).match(/"cfb2h":"(.*?)"/);

  // Parse model hashes từ page HTML
  let modelHashes = null;
  try {
    modelHashes = parseModelIdsFromPage(html);
    if (modelHashes) {
      const { hardcodeValid, allHashes, pro, thinking } = modelHashes;
      console.log(`[Gemini Web] Model hash scan: found ${allHashes.length} hashes in page`);
      console.log(`[Gemini Web] Hardcode valid: pro=${hardcodeValid.pro ?? "N/A"}, thinking=${hardcodeValid.thinking ?? "N/A"}`);
      if (pro) console.log(`[Gemini Web] Active Pro hash: ${pro}`);
      if (thinking) console.log(`[Gemini Web] Active Thinking hash: ${thinking}`);

      // Cảnh báo nếu hash hardcode không còn trong page
      if (hardcodeValid.pro === false) {
        console.warn(`[Gemini Web] ⚠ Hash Pro hardcode KHÔNG CÒN trong page! Model Pro có thể gửi sai.`);
        if (pro) {
          console.warn(`[Gemini Web] → Đã tự tìm hash Pro thay thế: ${pro}`);
        } else {
          console.warn(`[Gemini Web] → KHÔNG tìm được hash Pro thay thế. Tất cả hash tìm thấy: ${allHashes.join(", ")}`);
        }
      }
      if (hardcodeValid.thinking === false) {
        console.warn(`[Gemini Web] ⚠ Hash Thinking hardcode KHÔNG CÒN trong page!`);
        if (thinking) {
          console.warn(`[Gemini Web] → Đã tự tìm hash Thinking thay thế: ${thinking}`);
        }
      }
    }
    } catch (err) {
      console.warn(`[Gemini Web] Không parse được model hashes từ page: ${err.message}`);
    }

    return {
      snlm0e: snlm0eMatch[1],
      sid: sidMatch ? sidMatch[1] : "",
      bl: blMatch ? blMatch[1] : "boq_assistant-bard-web-server_20240514.20_p0",
      modelHashes,
    };
  }

// ── Reply extraction ──

function isPlausibleGeminiReply(value) {
  const text = normalizeString(value);
  if (!text || text.length < 5) return false;
  if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("//")) return false;
  
  // Filter Gemini internal IDs: r_xxx, c_xxx, rc_xxx, etc.
  if (/^[a-z]{1,3}_[a-f0-9]{8,}$/i.test(text)) return false;
  
  // Filter pure hex strings (model hashes, session tokens)
  if (/^[a-f0-9]{16,}$/i.test(text)) return false;
  
  // Xóa rác Base64/Hash Session từ Google: Chuỗi liền tù tì quá 40 ký tự không khoảng trắng
  const noSpace = text.replace(/\s+/g, '');
  if (text.length > 40 && noSpace.length === text.length) return false;
  
  return true;
}

function extractGeminiReply(inner) {
  // Lấy thẳng tay chuỗi Trả về Trực tiếp chuẩn nhất của Google thay vì ngâm cứu dài ngắn
  try {
    const direct = inner?.[4]?.[0]?.[1]?.[0];
    if (typeof direct === "string" && direct.trim().length > 0 && isPlausibleGeminiReply(direct)) {
      return direct.trim();
    }
  } catch {}

  try {
    const fallback = inner?.[0]?.[0];
    if (typeof fallback === "string" && fallback.trim().length > 0 && isPlausibleGeminiReply(fallback)) {
      return fallback.trim();
    }
  } catch {}

  let best = "";

  function walk(value, depth = 0) {
    if (depth > 6) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, depth + 1);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) {
        walk(nested, depth + 1);
      }
      return;
    }

    if (typeof value === "string") {
      const v = value.trim();
      // Gom lại thằng nào to nhất phòng khi ko nằm ở [4][0][1][0]
      if (isPlausibleGeminiReply(v) && v.length > best.length) {
        best = v;
      }
    }
  }

  walk(inner);
  return best || "";
}

export function extractGeminiContext(inner) {
  return {
    conversationId: normalizeString(inner?.[1]?.[0]),
    responseId: normalizeString(inner?.[1]?.[1]),
    choiceId: normalizeString(inner?.[4]?.[0]?.[0]),
  };
}

// ── Frame-based response parsing ──

const LENGTH_MARKER_PATTERN = /^(\d+)\n/;

function getCharCountForUtf16Units(str, startIdx, utf16Units) {
  let count = 0;
  let units = 0;
  const limit = str.length;

  while (units < utf16Units && (startIdx + count) < limit) {
    const code = str.charCodeAt(startIdx + count);
    const u = code > 0xFFFF ? 2 : 1;
    if (units + u > utf16Units) break;
    units += u;
    count++;
  }

  return { count, units };
}

function parseResponseByFrame(content, startPos = 0) {
  let pos = startPos;
  const totalLen = content.length;
  const frames = [];

  while (pos < totalLen) {
    while (pos < totalLen && /\s/.test(content[pos])) pos++;
    if (pos >= totalLen) break;

    const preview = content.slice(pos, pos + 20);
    const match = LENGTH_MARKER_PATTERN.exec(preview);
    if (!match) break;

    const lengthVal = match[1];
    const length = parseInt(lengthVal, 10);
    const startContent = pos + lengthVal.length;
    const { count: charCount, units: unitsFound } = getCharCountForUtf16Units(content, startContent, length);

    if (unitsFound < length) break;

    const endPos = startContent + charCount;
    const chunk = content.slice(startContent, endPos).trim();
    pos = endPos;

    if (!chunk) continue;

    try {
      const parsed = JSON.parse(chunk);
      if (Array.isArray(parsed)) {
        frames.push(...parsed);
      } else {
        frames.push(parsed);
      }
    } catch {
    }
  }

  return { frames, nextPos: pos };
}

function extractCandidatesFromParts(parts) {
  const candidates = [];

  for (const part of parts) {
    if (!Array.isArray(part)) continue;

    const innerJsonStr = part.length >= 3 && typeof part[2] === "string" ? part[2] : null;
    if (!innerJsonStr) continue;

    try {
      const inner = JSON.parse(innerJsonStr);
      const reply = extractGeminiReply(inner);
      if (reply) {
        candidates.push({
          text: reply,
          ...extractGeminiContext(inner),
        });
      }
    } catch {
    }
  }

  return candidates;
}

function deduplicateCandidates(candidates) {
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalizedText = normalizeString(candidate?.text);
    if (!normalizedText || seen.has(normalizedText)) {
      continue;
    }
    seen.add(normalizedText);
    unique.push({
      ...candidate,
      text: normalizedText,
    });
  }
  return unique;
}

function extractGeminiFailureReason(parts = []) {
  for (const part of parts) {
    if (!Array.isArray(part) || part.length === 0) {
      continue;
    }

    const eventName = normalizeString(part[0]);
    if (eventName === "e") {
      const eventCode = normalizeString(part[1]);
      const detailCode = normalizeString(part[4]);
      const suffix = [
        eventCode ? `/${eventCode}` : "",
        detailCode ? ` (${detailCode})` : "",
      ].join("");
      return `Gemini Web không trả về nội dung text. Upstream event e${suffix}. Request raw có thể quá lớn hoặc không hợp lệ.`;
    }
  }

  return "";
}

// ── Main response parser ──

export function parseGeminiGenerateResponse(raw = "", { logFailure = true, state = null } = {}) {
  let text = String(raw || "");
  let offset = 0;

  if (text.startsWith(")]}'\\n")) {
    text = text.slice(5);
    offset = 5;
  } else if (text.startsWith(")]}'")) {
    text = text.slice(4);
    offset = 4;
  }

  const trimmed = text.trimStart();
  offset += (text.length - trimmed.length);

  const candidates = [];
  let framesToProcess = [];

  // --- Strategy 1: Length-prefixed framing protocol (Google's new format) ---
  if (state) {
    const parseStart = Math.max(0, state.lastPos - offset);
    const result = parseResponseByFrame(trimmed, parseStart);
    state.lastPos = result.nextPos + offset;
    if (result.frames.length > 0) {
      state.accumulatedFrames.push(...result.frames);
    }
    framesToProcess = state.accumulatedFrames;
  } else {
    framesToProcess = parseResponseByFrame(trimmed, 0).frames;
  }

  if (framesToProcess.length > 0) {
    candidates.push(...extractCandidatesFromParts(framesToProcess));
  }

  // --- Strategy 2: NDJSON fallback (legacy format) ---
  if (candidates.length === 0 && !state) {
    for (const line of trimmed.split("\\n")) {
      const normalizedLine = line.trim();
      if (!normalizedLine) continue;

      let outer;
      try {
        outer = JSON.parse(normalizedLine);
      } catch {
        continue;
      }

      if (!Array.isArray(outer)) continue;
      candidates.push(...extractCandidatesFromParts(outer));
    }
  }

  const unique = deduplicateCandidates(candidates);

  if (unique.length === 0) {
    const failureReason = extractGeminiFailureReason(framesToProcess);
    const snippet = text.slice(0, 500);
    if (logFailure) {
      console.error("[Gemini Web] Parse failed. Raw response snippet:", snippet);
    }
    throw new Error(
      failureReason || "Không parse được phản hồi Gemini Web. Có thể Google vừa đổi format nội bộ."
    );
  }

  return unique.sort((left, right) => right.text.length - left.text.length)[0];
}

// ── Stream response parser ──

function getAppendedText(previousText = "", nextText = "") {
  const previous = String(previousText || "");
  const next = String(nextText || "");
  if (!next || next === previous) {
    return "";
  }

  if (!previous) {
    return next;
  }

  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }

  return next;
}

export async function parseGeminiCompletionResponse(response, { onDelta, onFirstByte } = {}) {
  if (!response?.body || typeof onDelta !== "function") {
    return parseGeminiGenerateResponse(await response.text());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let emittedText = "";
  let markedFirstByte = false;
  
  // State for incremental framing parsing
  const parseState = { lastPos: 0, accumulatedFrames: [] };

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      if (!markedFirstByte) {
        markedFirstByte = true;
        await onFirstByte?.();
      }
      raw += decoder.decode(value, { stream: !done });
      try {
        const parsed = parseGeminiGenerateResponse(raw, { logFailure: false, state: parseState });
        const nextText = normalizeString(parsed?.text);
        const delta = getAppendedText(emittedText, nextText);
        if (delta) {
          emittedText = nextText;
          await onDelta(delta, parsed);
        }
      } catch {
      }
    }

    if (done) {
      raw += decoder.decode();
      break;
    }
  }

  try {
    if (typeof window === "undefined" && raw) {
      require("fs").writeFileSync(
        "C:/Users/phucv/Downloads/autoloadanh/9router_temp/gemini_stream_dump.txt",
        raw,
        "utf-8"
      );
    }
  } catch {}

  const finalParsed = parseGeminiGenerateResponse(raw, { state: parseState });
  const finalText = normalizeString(finalParsed?.text);
  const tailDelta = getAppendedText(emittedText, finalText);
  if (tailDelta) {
    emittedText = finalText;
    await onDelta(tailDelta, finalParsed);
  }

  return finalParsed;
}

// ── Helper ──

export function readResponseTextSnippet(response) {
  return response.text()
    .then((text) => normalizeString(text).slice(0, 300))
    .catch(() => "");
}
