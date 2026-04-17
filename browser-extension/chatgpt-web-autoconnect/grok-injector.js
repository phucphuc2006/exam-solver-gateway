/* global chrome */

/**
 * Grok Injector — Content Script (v4 — Prompt Anchor)
 *
 * Chiến thuật: Dùng chính prompt của user làm mỏ neo.
 * Sau khi submit, tìm prompt trong body.innerText,
 * lấy mọi text phía sau prompt = response của AI.
 * Không phụ thuộc bất kỳ CSS selector nào của Grok.
 */

(() => {
  "use strict";

  const SELECTORS = {
    input: [
      "div[contenteditable='true'][role='textbox']",
      "div.ProseMirror[contenteditable='true']",
      "p[contenteditable='true']",
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='Message']",
      "textarea[aria-label]",
      "textarea",
    ],
    submit: [
      "button[aria-label='Submit']",
      "button[aria-label='Send message']",
      "button[type='submit']",
      "form button:last-of-type",
    ],
  };

  const PROVIDER = "grok-web";
  const INJECT_TIMEOUT_MS = 120_000;
  const IDLE_DONE_MS = 4000;       // Text ngừng thay đổi 4s → coi như xong
  const MIN_DELTA_INTERVAL_MS = 50;
  const POLL_INTERVAL_MS = 300;

  let currentTaskId = null;
  let currentPollId = null;
  let currentObserver = null;

  // ── Helpers ──

  function querySelector(selectorList) {
    for (const selector of selectorList) {
      try {
        const els = document.querySelectorAll(selector);
        for (const el of els) {
          if (el.getBoundingClientRect().height > 0) return el;
        }
      } catch { /* skip */ }
    }
    return null;
  }

  function waitForElement(selectorList, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const existing = querySelector(selectorList);
      if (existing) { resolve(existing); return; }
      const timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Element not found: ${selectorList[0]}`));
      }, timeoutMs);
      const obs = new MutationObserver(() => {
        const el = querySelector(selectorList);
        if (el) { clearTimeout(timer); obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  function setInputValue(element, text) {
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      element.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )?.set;
      if (nativeSetter) nativeSetter.call(element, text);
      else element.value = text;
      const tracker = element._valueTracker;
      if (tracker) tracker.setValue("");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (element.getAttribute("contenteditable") !== null) {
      element.focus();
      element.innerHTML = "";
      document.execCommand("insertText", false, text);
      if (!element.textContent.trim()) {
        element.textContent = text;
        element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      }
    }
  }

  function clickSubmit() {
    let btn = querySelector(SELECTORS.submit);
    if (!btn) {
      const inputEl = querySelector(SELECTORS.input);
      if (inputEl) {
        let parent = inputEl.parentElement;
        for (let i = 0; i < 5; i++) {
          if (!parent) break;
          const btns = Array.from(parent.querySelectorAll("button"));
          const sendBtn = btns.reverse().find(b => b.querySelector("svg") && !b.disabled);
          if (sendBtn) { btn = sendBtn; break; }
          parent = parent.parentElement;
        }
      }
    }
    if (!btn) return false;
    const clickTarget = btn.closest("button") || btn;
    if (clickTarget.disabled) return false;
    clickTarget.click();
    return true;
  }

  // ── Prompt Anchor: tìm text AI sau prompt ──

  /**
   * Tìm prompt trong body.innerText (dùng lastIndexOf vì prompt có thể
   * nằm ở cả ô input lẫn đoạn chat đã gửi — ta lấy cái cuối cùng).
   * Rồi lấy mọi thứ phía sau nó → đó là response + ít UI junk.
   */
  function extractResponseByPrompt(promptText) {
    const bodyText = document.body.innerText || "";
    // Dùng 60 ký tự đầu của prompt làm anchor (tránh dài quá bị lệch format)
    const anchor = promptText.substring(0, Math.min(60, promptText.length)).trim();
    if (!anchor) return "";

    const idx = bodyText.lastIndexOf(anchor);
    if (idx < 0) return "";

    // Lấy text sau cả prompt (skip hết prompt text)
    const afterAnchor = bodyText.slice(idx + anchor.length);

    // Tìm điểm bắt đầu thực sự (bỏ phần còn lại của prompt nếu dài hơn 60 ký tự)
    const remainingPrompt = promptText.slice(anchor.length).trim();
    let responseStart = afterAnchor;
    if (remainingPrompt) {
      const remIdx = responseStart.indexOf(remainingPrompt);
      if (remIdx >= 0 && remIdx < 100) {
        responseStart = responseStart.slice(remIdx + remainingPrompt.length);
      }
    }

    return responseStart.trim();
  }

  // ── Lifecycle ──

  function cleanupCurrentTask() {
    if (currentObserver) { currentObserver.disconnect(); currentObserver = null; }
    if (currentPollId) { clearInterval(currentPollId); currentPollId = null; }
    currentTaskId = null;
  }

  function sendToBackground(type, payload = {}) {
    try {
      chrome.runtime.sendMessage({ source: "grok-injector", provider: PROVIDER, type, ...payload });
    } catch { /* ignore */ }
  }

  // ── Main Injection Flow ──

  async function executeInject(taskId, prompt) {
    if (currentTaskId) cleanupCurrentTask();
    currentTaskId = taskId;

    try {
      // 1. Tìm ô nhập
      const inputEl = await waitForElement(SELECTORS.input, 10_000);
      if (currentTaskId !== taskId) return;

      // 2. Dán prompt
      setInputValue(inputEl, prompt);
      await new Promise(r => setTimeout(r, 500));
      if (currentTaskId !== taskId) return;

      // 3. Ghi nhớ body text length trước submit
      const bodyLenBefore = (document.body.innerText || "").length;

      // 4. Submit
      let submitted = clickSubmit();
      if (!submitted) {
        const enterEvent = new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true, composed: true,
        });
        inputEl.dispatchEvent(enterEvent);
      }
      sendToBackground("INJECT_SUBMITTED", { taskId });

      // 5. Polling: chờ text mới xuất hiện (AI response)
      let lastResponseText = "";
      let lastChangeTime = Date.now();
      let streamDone = false;
      let lastDeltaTime = 0;
      let waitingForFirstText = true;
      let firstTextTime = 0;

      const overallTimeout = setTimeout(() => {
        if (!streamDone && currentTaskId === taskId) {
          streamDone = true;
          const finalText = extractResponseByPrompt(prompt);
          sendToBackground("INJECT_DONE", { taskId, text: finalText || lastResponseText });
          cleanupCurrentTask();
        }
      }, INJECT_TIMEOUT_MS);

      function pollForResponse() {
        if (streamDone || currentTaskId !== taskId) return;

        const responseText = extractResponseByPrompt(prompt);

        // Bỏ qua nếu response trùng với prompt (chưa có AI trả lời)
        if (!responseText || responseText.length < 5) {
          // Chưa có response → kiểm tra xem trang có đang load không
          const bodyLenNow = (document.body.innerText || "").length;
          if (bodyLenNow > bodyLenBefore + 20 && waitingForFirstText) {
            // Trang có text mới nhưng extractResponse chưa bắt được
            // → có thể do Grok render dần dần, chờ thêm
          }
          return;
        }

        if (responseText !== lastResponseText) {
          // Có text mới!
          if (waitingForFirstText) {
            waitingForFirstText = false;
            firstTextTime = Date.now();
          }
          lastChangeTime = Date.now();

          const now = Date.now();
          if (now - lastDeltaTime >= MIN_DELTA_INTERVAL_MS) {
            const delta = responseText.length > lastResponseText.length
              ? responseText.slice(lastResponseText.length)
              : responseText;  // Fallback: gửi toàn bộ
            if (delta) {
              sendToBackground("INJECT_DELTA", { taskId, delta, fullText: responseText });
              lastDeltaTime = now;
            }
          }
          lastResponseText = responseText;
        } else if (!waitingForFirstText && lastResponseText.length > 0) {
          // Text không đổi → kiểm tra idle timeout
          const idleMs = Date.now() - lastChangeTime;
          if (idleMs >= IDLE_DONE_MS) {
            // Xong!
            streamDone = true;
            clearTimeout(overallTimeout);
            sendToBackground("INJECT_DONE", { taskId, text: lastResponseText });
            cleanupCurrentTask();
          }
        }
      }

      // Poll mỗi 300ms
      currentPollId = setInterval(pollForResponse, POLL_INTERVAL_MS);

      // MutationObserver để trigger nhanh hơn polling
      const observer = new MutationObserver(() => {
        if (streamDone || currentTaskId !== taskId) { observer.disconnect(); return; }
        pollForResponse();
      });
      currentObserver = observer;
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    } catch (error) {
      if (currentTaskId === taskId) {
        sendToBackground("INJECT_ERROR", { taskId, error: error?.message || "Inject failed" });
        cleanupCurrentTask();
      }
    }
  }

  // ── Chrome Message Handler ──

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = String(message?.type || "").trim();
    if (type === "INJECT_PING") {
      sendResponse({ ok: true, provider: PROVIDER, ready: !!querySelector(SELECTORS.input), url: window.location.href });
      return undefined;
    }
    if (type === "INJECT_PROMPT") {
      const taskId = String(message?.taskId || "");
      const prompt = String(message?.prompt || "").trim();
      if (!taskId || !prompt) { sendResponse({ ok: false, error: "Missing taskId or prompt" }); return undefined; }
      sendResponse({ ok: true, taskId, status: "injecting" });
      void executeInject(taskId, prompt);
      return undefined;
    }
    if (type === "INJECT_CANCEL") {
      const taskId = String(message?.taskId || "");
      if (taskId && currentTaskId === taskId) { cleanupCurrentTask(); sendResponse({ ok: true, cancelled: true }); }
      else sendResponse({ ok: true, cancelled: false });
      return undefined;
    }
    return undefined;
  });

  sendToBackground("INJECTOR_READY", { provider: PROVIDER, url: window.location.href });
})();
