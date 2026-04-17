"use client";

import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "./config";

let translationMap = {};
let currentLocale = DEFAULT_LOCALE;
let reloadCallbacks = [];
let runtimeObserver = null;

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"];
const SKIP_TAGS = new Set([
  "script",
  "style",
  "code",
  "pre",
  "colgroup",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "select",
  "datalist",
  "optgroup",
]);

// Read locale from cookie
function getLocaleFromCookie() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : DEFAULT_LOCALE;
  return normalizeLocale(value);
}

// Load translation map
async function loadTranslations(locale) {
  if (locale === "en") {
    translationMap = {};
    return;
  }
  
  try {
    const response = await fetch(`/i18n/literals/${locale}.json`, {
      cache: "no-store",
    });
    translationMap = await response.json();
  } catch (err) {
    console.error("Failed to load translations:", err);
    translationMap = {};
  }
}

function preserveWhitespaceTranslate(text) {
  if (!text || typeof text !== "string") return text;
  const trimmed = text.trim();
  if (!trimmed) return text;

  const translated = translationMap[trimmed];
  if (!translated) return text;

  const leadingWhitespace = text.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = text.match(/\s*$/)?.[0] ?? "";
  return `${leadingWhitespace}${translated}${trailingWhitespace}`;
}

// Translate text - exported for use in components
export function translate(text) {
  if (!text || typeof text !== "string") return text;
  if (currentLocale === "en") return text;
  return preserveWhitespaceTranslate(text);
}

// Get current locale - exported for use in components
export function getCurrentLocale() {
  return currentLocale;
}

// Register callback for locale changes
export function onLocaleChange(callback) {
  reloadCallbacks.push(callback);
  return () => {
    reloadCallbacks = reloadCallbacks.filter((cb) => cb !== callback);
  };
}

function shouldSkipElement(element) {
  let current = element;
  while (current) {
    if (current.hasAttribute && current.hasAttribute("data-i18n-skip")) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function getElementStore(element) {
  if (!element._i18nOriginalAttributes) {
    element._i18nOriginalAttributes = {};
  }

  return element._i18nOriginalAttributes;
}

function processAttribute(element, attributeName) {
  if (!element?.getAttribute || !TRANSLATABLE_ATTRIBUTES.includes(attributeName)) {
    return;
  }

  if (shouldSkipElement(element)) {
    return;
  }

  const value = element.getAttribute(attributeName);
  if (!value || !value.trim()) {
    return;
  }

  const store = getElementStore(element);
  const previousOriginal = store[attributeName];
  const previousTranslated = previousOriginal ? translate(previousOriginal) : null;

  if (
    !previousOriginal ||
    (value !== previousOriginal && value !== previousTranslated)
  ) {
    store[attributeName] = value;
  }

  const translated = translate(store[attributeName]);
  if (translated !== value) {
    element.setAttribute(attributeName, translated);
  }
}

function processElementAttributes(element) {
  TRANSLATABLE_ATTRIBUTES.forEach((attributeName) => {
    if (element.hasAttribute(attributeName)) {
      processAttribute(element, attributeName);
    }
  });
}

function syncOriginalText(node, currentValue) {
  const previousOriginal = node._originalText;
  const previousTranslated = previousOriginal ? translate(previousOriginal) : null;

  if (
    !previousOriginal ||
    (currentValue !== previousOriginal && currentValue !== previousTranslated)
  ) {
    node._originalText = currentValue;
  }
}

// Process text node
function processTextNode(node) {
  if (!node?.nodeValue || !node.nodeValue.trim()) return;

  const parent = node.parentElement;
  if (!parent) return;

  if (shouldSkipElement(parent)) {
    return;
  }

  const tagName = parent.tagName?.toLowerCase();
  if (SKIP_TAGS.has(tagName)) return;

  syncOriginalText(node, node.nodeValue);

  const translated = translate(node._originalText);
  if (translated !== node.nodeValue) {
    node.nodeValue = translated;
  }
}

function processElement(element) {
  if (!element) return;

  if (element.nodeType === Node.TEXT_NODE) {
    processTextNode(element);
    return;
  }

  if (element.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const queue = [element];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    if (shouldSkipElement(current)) {
      continue;
    }

    processElementAttributes(current);

    current.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        processTextNode(child);
        return;
      }

      if (child.nodeType === Node.ELEMENT_NODE) {
        queue.push(child);
      }
    });
  }
}

function createRuntimeObserver() {
  return new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          processElement(node);
        });
        return;
      }

      if (mutation.type === "characterData") {
        processTextNode(mutation.target);
        return;
      }

      if (mutation.type === "attributes") {
        processAttribute(mutation.target, mutation.attributeName);
      }
    });
  });
}

// Initialize runtime i18n
export async function initRuntimeI18n() {
  if (typeof window === "undefined") return;
  
  currentLocale = getLocaleFromCookie();
  await loadTranslations(currentLocale);
  reloadCallbacks.forEach((callback) => callback(currentLocale));

  processElement(document.body);

  runtimeObserver?.disconnect();
  runtimeObserver = createRuntimeObserver();
  runtimeObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRIBUTES,
  });
}

// Reload translations when locale changes
export async function reloadTranslations() {
  currentLocale = getLocaleFromCookie();
  await loadTranslations(currentLocale);
  
  // Notify all registered callbacks
  reloadCallbacks.forEach((callback) => callback(currentLocale));
  processElement(document.body);
}
