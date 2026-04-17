/* global chrome */

/**
 * Gemini Injector — Content Script
 * Inject vào tab gemini.google.com, nhận message INJECT_PROMPT từ background.js,
 * paste prompt → click submit → MutationObserver scrape DOM → stream text back.
 */

(() => {
  "use strict";

  const SELECTORS = {
    input: [
      ".ql-editor.textarea",
      ".ql-editor",
      "rich-textarea .ql-editor",
      "div[contenteditable='true'][aria-label]",
      "div[contenteditable='true']",
    ],
    submit: [
      "button.send-button",
      "button[aria-label='Send message']",
      "button[data-at='send-button']",
      ".send-button-container button",
      "mat-icon[data-mat-icon-name='send']",
    ],
    responseContainer: [
      ".response-container .markdown",
      ".model-response-text .markdown",
      "model-response .markdown",
      "message-content .markdown",
      ".response-container",
      ".model-response-text",
    ],
    stopButton: [
      "button[aria-label='Stop response']",
      "button[data-at='stop-button']",
      "mat-icon[data-mat-icon-name='stop']",
    ],
  };

  const PROVIDER = "gemini-web";
  const INJECT_TIMEOUT_MS = 120_000;
  const MUTATION_IDLE_MS = 3000;
  const MIN_DELTA_INTERVAL_MS = 50;

  let currentTaskId = null;
  let currentObserver = null;

  function querySelector(selectorList) {
    for (const selector of selectorList) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch { /* skip */ }
    }
    return null;
  }

  function querySelectorAll(selectorList) {
    for (const selector of selectorList) {
      try {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) return Array.from(els);
      } catch { /* skip */ }
    }
    return [];
  }

  function waitForElement(selectorList, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const existing = querySelector(selectorList);
      if (existing) { resolve(existing); return; }

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element not found: ${selectorList[0]}`));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const el = querySelector(selectorList);
        if (el) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  async function setInputValue(element, text) {
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )?.set;
      if (nativeSetter) nativeSetter.call(element, text);
      else element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (element.getAttribute("contenteditable") !== null) {
      element.focus();

      // Xóa nội dung hiện tại
      element.innerHTML = "";

      // Gom vào 1 node nhưng bón dần (chunking) để trình duyệt không đơ
      const p = document.createElement("p");
      element.appendChild(p);

      let offset = 0;
      const CHUNK_SIZE = 10000;
      while (offset < text.length) {
        let chunk = text.slice(offset, offset + CHUNK_SIZE);
        p.appendChild(document.createTextNode(chunk));
        offset += CHUNK_SIZE;
        // Nhường thread để browser không đơ cứng (nhưng chưa báo cho bộ não Gemini)
        await new Promise(r => setTimeout(r, 0));
      }

      // Khi dán hoàn tất 100% mới khều Gemini 1 cái duy nhất để nhận diễn
      element.dispatchEvent(new Event("input", { bubbles: true }));
      // Di chuyển cursor về cuối
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch { /* ignore */ }
    }
  }

  function clickSubmit() {
    const btn = querySelector(SELECTORS.submit);
    if (!btn) return false;
    const clickTarget = btn.closest("button") || btn;
    clickTarget.click();
    return true;
  }

  function countResponseContainers() {
    return querySelectorAll(SELECTORS.responseContainer).length;
  }

  function getLastResponseText() {
    const containers = querySelectorAll(SELECTORS.responseContainer);
    if (containers.length === 0) return "";
    const el = containers[containers.length - 1];

    // ── innerText giữ visual formatting (newlines, paragraphs) ──
    // .textContent sẽ strip hết <p>, <br>, <li> → thành 1 cục text liền
    // .innerText tôn trọng visual layout → giữ nguyên line breaks
    if (typeof el.innerText === "string") {
      return el.innerText;
    }

    // Fallback: walk DOM nodes, chèn \n cho block elements
    function extractWithNewlines(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      const tag = (node.tagName || "").toLowerCase();
      const blockTags = new Set(["p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "pre", "blockquote"]);
      let text = "";
      for (const child of node.childNodes) {
        text += extractWithNewlines(child);
      }
      if (blockTags.has(tag)) text += "\n";
      return text;
    }
    return extractWithNewlines(el).replace(/\n{3,}/g, "\n\n").trim();
  }

  function isStopButtonVisible() {
    return !!querySelector(SELECTORS.stopButton);
  }

  function cleanupCurrentTask() {
    if (currentObserver) {
      currentObserver.disconnect();
      currentObserver = null;
    }
    currentTaskId = null;
    submitLock = false; // Giải phóng lock cho task tiếp theo
  }

  function sendToBackground(type, payload = {}) {
    try {
      chrome.runtime.sendMessage({ source: "gemini-injector", provider: PROVIDER, type, ...payload });
    } catch { /* ignore */ }
  }

  // ── Lock chống submit nhiều lần ──
  let submitLock = false;

  async function executeInject(taskId, prompt) {
    if (currentTaskId) cleanupCurrentTask();
    if (submitLock) {
      console.warn("[GeminiInjector] Submit locked — skipping duplicate inject");
      return;
    }
    currentTaskId = taskId;
    submitLock = true;

    try {
      const inputEl = await waitForElement(SELECTORS.input, 10_000);
      if (currentTaskId !== taskId) return;

      await setInputValue(inputEl, prompt);
      if (currentTaskId !== taskId) return;

      const beforeCount = countResponseContainers();

      // ── SUBMIT ĐÚNG 1 LẦN DUY NHẤT ──
      let submitted = clickSubmit();
      if (!submitted) {
        inputEl.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, bubbles: true,
        }));
      }

      sendToBackground("INJECT_SUBMITTED", { taskId });

      // Chờ response container mới (bỏ timeout, chờ vô hạn đến khi Gemini thực sự sinh ra)
      while (true) {
        if (currentTaskId !== taskId) return;
        if (countResponseContainers() > beforeCount) {
          break; // Tìm thấy container mới thì chạy tiếp để đọc chữ
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      // MutationObserver + polling
      let lastText = "";
      let lastDeltaTime = 0;
      let idleTimer = null;
      let streamDone = false;

      const overallTimeout = setTimeout(() => {
        if (!streamDone && currentTaskId === taskId) {
          streamDone = true;
          sendToBackground("INJECT_DONE", { taskId, text: getLastResponseText() });
          cleanupCurrentTask();
        }
      }, INJECT_TIMEOUT_MS);

      function checkAndSendDelta() {
        const currentText = getLastResponseText();
        if (currentText !== lastText) {
          const now = Date.now();
          if (now - lastDeltaTime >= MIN_DELTA_INTERVAL_MS) {
            const delta = currentText.slice(lastText.length);
            if (delta) {
              sendToBackground("INJECT_DELTA", { taskId, delta, fullText: currentText });
              lastDeltaTime = now;
            }
            lastText = currentText;
          }
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            if (!isStopButtonVisible() && !streamDone && currentTaskId === taskId) {
              streamDone = true;
              clearTimeout(overallTimeout);
              sendToBackground("INJECT_DONE", { taskId, text: getLastResponseText() });
              cleanupCurrentTask();
            }
          }, MUTATION_IDLE_MS);
        }
      }

      const observer = new MutationObserver(() => {
        if (streamDone || currentTaskId !== taskId) { observer.disconnect(); return; }
        checkAndSendDelta();
      });
      currentObserver = observer;
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });

      const pollInterval = setInterval(() => {
        if (streamDone || currentTaskId !== taskId) { clearInterval(pollInterval); return; }
        checkAndSendDelta();
        if (!isStopButtonVisible() && lastText.length > 0) {
          setTimeout(() => {
            if (!streamDone && currentTaskId === taskId && !isStopButtonVisible()) {
              streamDone = true;
              clearTimeout(overallTimeout);
              clearInterval(pollInterval);
              observer.disconnect();
              sendToBackground("INJECT_DONE", { taskId, text: getLastResponseText() });
              cleanupCurrentTask();
            }
          }, 1000);
        }
      }, 500);

    } catch (error) {
      if (currentTaskId === taskId) {
        sendToBackground("INJECT_ERROR", { taskId, error: error?.message || "Inject failed" });
        cleanupCurrentTask();
      }
    }
  }

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
