"use client";

// ── ChatGPT Web Page — Markdown Renderer & TestOutputPreview ──

import React from "react";

export function renderInlineMarkdown(text, keyPrefix = "md-inline") {
  const source = String(text || "");
  if (!source) {
    return null;
  }

  const nodes = [];
  const tokenPattern = /(`[^`]+`|\*\*[\s\S]+?\*\*|\*[\s\S]+?\*)/;
  let remaining = source;
  let tokenIndex = 0;

  while (remaining) {
    const match = remaining.match(tokenPattern);
    if (!match || match.index === undefined) {
      nodes.push(remaining);
      break;
    }

    const before = remaining.slice(0, match.index);
    if (before) {
      nodes.push(before);
    }

    const token = match[0];
    const inner = token.slice(token.startsWith("**") ? 2 : 1, token.endsWith("**") ? -2 : -1);
    const key = `${keyPrefix}-${tokenIndex}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/10"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key} className="font-semibold">{renderInlineMarkdown(inner, `${key}-strong`)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key} className="italic">{renderInlineMarkdown(inner, `${key}-em`)}</em>);
    } else {
      nodes.push(token);
    }

    remaining = remaining.slice(match.index + token.length);
    tokenIndex += 1;
  }

  return nodes;
}

export function renderInlineMarkdownWithBreaks(text, keyPrefix = "md-line") {
  return String(text || "")
    .split("\n")
    .flatMap((line, index, array) => {
      const nodes = [];
      if (line) {
        nodes.push(...[].concat(renderInlineMarkdown(line, `${keyPrefix}-${index}`) || []));
      }
      if (index < array.length - 1) {
        nodes.push(<br key={`${keyPrefix}-br-${index}`} />);
      }
      return nodes;
    });
}

export function renderMarkdownBlocks(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length && lines[index].trim().startsWith("```")) {
        index += 1;
      }
      blocks.push(
        <pre
          key={`block-code-${blockIndex}`}
          className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/10 p-3 font-mono text-xs leading-6 dark:bg-white/10"
          style={{ overflowWrap: "anywhere" }}
        >
          {language ? <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-text-muted">{language}</div> : null}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      blockIndex += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`block-ul-${blockIndex}`} className="list-disc space-y-2 break-words pl-5" style={{ overflowWrap: "anywhere" }}>
          {items.map((item, itemIndex) => (
            <li key={`block-ul-${blockIndex}-${itemIndex}`}>
              {renderInlineMarkdownWithBreaks(item, `block-ul-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      blockIndex += 1;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`block-ol-${blockIndex}`} className="list-decimal space-y-2 break-words pl-5" style={{ overflowWrap: "anywhere" }}>
          {items.map((item, itemIndex) => (
            <li key={`block-ol-${blockIndex}-${itemIndex}`}>
              {renderInlineMarkdownWithBreaks(item, `block-ol-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      blockIndex += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`block-quote-${blockIndex}`}
          className="break-words border-l-2 border-primary/30 pl-4 text-text-muted"
          style={{ overflowWrap: "anywhere" }}
        >
          {renderInlineMarkdownWithBreaks(quoteLines.join("\n"), `block-quote-${blockIndex}`)}
        </blockquote>,
      );
      blockIndex += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !lines[index].trim().startsWith("```")
      && !/^\s*[-*]\s+/.test(lines[index])
      && !/^\s*\d+\.\s+/.test(lines[index])
      && !/^\s*>\s?/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(
      <p
        key={`block-p-${blockIndex}`}
        className="whitespace-normal break-words"
        style={{ overflowWrap: "anywhere" }}
      >
        {renderInlineMarkdownWithBreaks(paragraphLines.join("\n"), `block-p-${blockIndex}`)}
      </p>,
    );
    blockIndex += 1;
  }

  return blocks;
}

export function TestOutputPreview({ content, emptyLabel }) {
  const value = String(content || "").trim();
  if (!value) {
    return <p className="text-sm text-text-muted">{emptyLabel}</p>;
  }

  return (
    <div
      className="min-w-0 space-y-3 text-sm leading-7 text-text-main break-words"
      style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
    >
      {renderMarkdownBlocks(value)}
    </div>
  );
}
