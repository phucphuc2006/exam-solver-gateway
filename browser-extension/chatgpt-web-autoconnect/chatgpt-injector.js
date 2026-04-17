/* global chrome */

/**
 * ChatGPT Injector — Content Script
 * Inject vào tab chatgpt.com, nhận message INJECT_PROMPT từ background.js,
 * paste prompt → click submit → MutationObserver scrape DOM → stream text back.
 */

(() => {
  "use strict";

  // ── Selector strategy: array of fallbacks (ChatGPT hay đổi UI) ──
  const SELECTORS = {
    input: [
      "#prompt-textarea",
      "div[contenteditable='true'][id='prompt-textarea']",
      "textarea[data-id='root']",
      "div[contenteditable='true']",
    ],
    submit: [
      "button[data-testid='send-button']",
      "button[aria-label='Send prompt']",
      "button.btn-primary svg[viewBox]",
      "form button[type='submit']",
    ],
    responseContainer: [
      "div[data-message-author-role='assistant']",
      "div.agent-turn .markdown",
      "div.markdown.prose",
    ],
    stopButton: [
      "button[data-testid='stop-button']",
      "button[aria-label='Stop generating']",
      "button[aria-label='Stop streaming']",
    ],
  };

  const PROVIDER = "chatgpt-web";
  const INJECT_TIMEOUT_MS = 120_000; // 2 phút timeout
  const MUTATION_IDLE_MS = 3000; // 3s không có mutation → coi là done
  const MIN_DELTA_INTERVAL_MS = 50; // Gửi delta tối đa mỗi 50ms

  let currentTaskId = null;
  let currentObserver = null;

  // ── Helper: tìm element bằng danh sách selector fallback ──
  function querySelector(selectorList) {
    for (const selector of selectorList) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch {
        // selector invalid → skip
      }
    }
    return null;
  }

  function querySelectorAll(selectorList) {
    for (const selector of selectorList) {
      try {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) return Array.from(els);
      } catch {
        // skip
      }
    }
    return [];
  }

  // ── Helper: chờ element xuất hiện ──
  function waitForElement(selectorList, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const existing = querySelector(selectorList);
      if (existing) {
        resolve(existing);
        return;
      }

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

  // ── Helper: đặt text vào contenteditable div hoặc textarea ──
  function setInputValue(element, text) {
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      // Native input/textarea
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )?.set;

      if (nativeSetter) {
        nativeSetter.call(element, text);
      } else {
        element.value = text;
      }

      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (element.getAttribute("contenteditable") !== null) {
      // ContentEditable div (ChatGPT dùng kiểu này)
      element.focus();

      // Clear existing content
      element.innerHTML = "";

      // Insert text using execCommand (triggers React's change detection)
      document.execCommand("insertText", false, text);

      // Fallback nếu execCommand không work
      if (!element.textContent.trim()) {
        element.textContent = text;
        element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      }
    }
  }

  // ── Helper: click submit button ──
  function clickSubmit() {
    const btn = querySelector(SELECTORS.submit);
    if (!btn) {
      // Fallback: tìm button gần input nhất
      const form = querySelector(["form"]);
      if (form) {
        const submitBtn = form.querySelector("button");
        if (submitBtn) {
          submitBtn.click();
          return true;
        }
      }
      return false;
    }

    // Nếu là SVG bên trong button, click parent button
    const clickTarget = btn.closest("button") || btn;
    clickTarget.click();
    return true;
  }

  // ── Helper: đếm response containers hiện tại ──
  function countResponseContainers() {
    return querySelectorAll(SELECTORS.responseContainer).length;
  }

  // ── Helper: lấy text từ response container cuối cùng ──
  function getLastResponseText() {
    const containers = querySelectorAll(SELECTORS.responseContainer);
    if (containers.length === 0) return "";

    const last = containers[containers.length - 1];
    return last.textContent || "";
  }

  // ── Helper: kiểm tra stream đã dừng chưa ──
  function isStopButtonVisible() {
    return !!querySelector(SELECTORS.stopButton);
  }

  // ── Core: cleanup task hiện tại ──
  function cleanupCurrentTask() {
    if (currentObserver) {
      currentObserver.disconnect();
      currentObserver = null;
    }
    currentTaskId = null;
  }

  // ── Core: gửi message về background ──
  function sendToBackground(type, payload = {}) {
    try {
      chrome.runtime.sendMessage({
        source: "chatgpt-injector",
        provider: PROVIDER,
        type,
        ...payload,
      });
    } catch {
      // Extension context bị invalidate → ignore
    }
  }

  // ── Core: thực hiện inject ──
  async function executeInject(taskId, prompt) {
    // Nếu đang có task → cancel
    if (currentTaskId) {
      cleanupCurrentTask();
    }

    currentTaskId = taskId;

    try {
      // 1. Tìm input element
      const inputEl = await waitForElement(SELECTORS.input, 10_000);
      if (currentTaskId !== taskId) return; // Task đã bị cancel

      // 2. Paste prompt
      setInputValue(inputEl, prompt);

      // Chờ UI cập nhật (React re-render)
      await new Promise((r) => setTimeout(r, 300));
      if (currentTaskId !== taskId) return;

      // 3. Đếm response containers trước khi submit
      const beforeCount = countResponseContainers();

      // 4. Click submit
      const submitted = clickSubmit();
      if (!submitted) {
        // Thử Enter key
        inputEl.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, bubbles: true,
        }));
      }

      sendToBackground("INJECT_SUBMITTED", { taskId });

      // 5. Chờ response container mới xuất hiện
      let newContainerFound = false;
      const waitStart = Date.now();

      while (Date.now() - waitStart < 30_000) {
        if (currentTaskId !== taskId) return;

        const currentCount = countResponseContainers();
        if (currentCount > beforeCount) {
          newContainerFound = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      if (!newContainerFound) {
        throw new Error("Không thấy response container mới từ ChatGPT sau 30s.");
      }

      // 6. MutationObserver theo dõi response
      let lastText = "";
      let lastDeltaTime = 0;
      let idleTimer = null;
      let streamDone = false;

      const overallTimeout = setTimeout(() => {
        if (!streamDone && currentTaskId === taskId) {
          streamDone = true;
          const finalText = getLastResponseText();
          sendToBackground("INJECT_DONE", { taskId, text: finalText });
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

          // Reset idle timer
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            // Kiểm tra thêm: stop button đã biến mất chưa?
            if (!isStopButtonVisible() && !streamDone && currentTaskId === taskId) {
              streamDone = true;
              clearTimeout(overallTimeout);
              const finalText = getLastResponseText();
              sendToBackground("INJECT_DONE", { taskId, text: finalText });
              cleanupCurrentTask();
            }
          }, MUTATION_IDLE_MS);
        }
      }

      // Observe toàn bộ body (vì container có thể rebuild)
      const observer = new MutationObserver(() => {
        if (streamDone || currentTaskId !== taskId) {
          observer.disconnect();
          return;
        }
        checkAndSendDelta();
      });

      currentObserver = observer;

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Polling backup (phòng trường hợp MutationObserver miss)
      const pollInterval = setInterval(() => {
        if (streamDone || currentTaskId !== taskId) {
          clearInterval(pollInterval);
          return;
        }
        checkAndSendDelta();

        // Nếu stop button biến mất → có thể đã done
        if (!isStopButtonVisible() && lastText.length > 0) {
          // Chờ thêm 1s để chắc chắn
          setTimeout(() => {
            if (!streamDone && currentTaskId === taskId && !isStopButtonVisible()) {
              streamDone = true;
              clearTimeout(overallTimeout);
              clearInterval(pollInterval);
              observer.disconnect();
              const finalText = getLastResponseText();
              sendToBackground("INJECT_DONE", { taskId, text: finalText });
              cleanupCurrentTask();
            }
          }, 1000);
        }
      }, 500);

    } catch (error) {
      if (currentTaskId === taskId) {
        sendToBackground("INJECT_ERROR", {
          taskId,
          error: error?.message || "Inject failed",
        });
        cleanupCurrentTask();
      }
    }
  }

  // ── Lắng nghe message từ background.js ──
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = String(message?.type || "").trim();

    if (type === "INJECT_PING") {
      sendResponse({
        ok: true,
        provider: PROVIDER,
        ready: !!querySelector(SELECTORS.input),
        url: window.location.href,
      });
      return undefined;
    }

    if (type === "INJECT_PROMPT") {
      const taskId = String(message?.taskId || "");
      const prompt = String(message?.prompt || "").trim();

      if (!taskId || !prompt) {
        sendResponse({ ok: false, error: "Missing taskId or prompt" });
        return undefined;
      }

      sendResponse({ ok: true, taskId, status: "injecting" });

      // Async execution
      void executeInject(taskId, prompt);
      return undefined;
    }

    if (type === "INJECT_CANCEL") {
      const taskId = String(message?.taskId || "");
      if (taskId && currentTaskId === taskId) {
        cleanupCurrentTask();
        sendResponse({ ok: true, cancelled: true });
      } else {
        sendResponse({ ok: true, cancelled: false });
      }
      return undefined;
    }

    return undefined;
  });

  // ── Thông báo content script đã load ──
  sendToBackground("INJECTOR_READY", { provider: PROVIDER, url: window.location.href });
})();
