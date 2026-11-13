// markdown.js: a light text format for notes (UX review #15, Romain 2026-11-13).
//
//   # Title, ## Subtitle, ### Small title
//   - item  (or * item), 1. item
//   **bold**, *italic*
//   https://… (clickable), [text](https://…)
//   an empty line = a new paragraph
//
// Safe by design: the text is escaped first, so nothing typed can become real
// HTML; only https links are made clickable.

import { escapeHtml } from "./html.js";

function inline(text) {
  let html = escapeHtml(text);
  // Links are set aside while bold / italic are applied, so a "*" inside an
  // address can never break it.
  const links = [];
  const keep = (a) => `\u0000${links.push(a) - 1}\u0000`;
  // [text](https://…)
  html = html.replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g,
    (_, label, url) => keep(`<a href="${url}" target="_blank" rel="noopener">${label}</a>`));
  // bare https://…
  html = html.replace(/(^|[\s(])(https:\/\/[^\s<)]+[^\s<).,;:!?])/g,
    (_, before, url) => before + keep(`<a href="${url}" target="_blank" rel="noopener">${shorten(url)}</a>`));
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, "$1<em>$2</em>");
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

// A long address shows as its site + the start of the path.
function shorten(url) {
  try {
    const u = new URL(url.replaceAll("&amp;", "&"));
    const rest = (u.pathname + u.search).replace(/\/$/, "");
    const label = u.host.replace(/^www\./, "") + (rest.length > 24 ? rest.slice(0, 24) + "…" : rest);
    return escapeHtml(label);
  } catch {
    return url;
  }
}

export function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let list = null;      // "ul" | "ol" while inside a list
  let paragraph = [];   // lines of the paragraph being built

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length + 2; // # -> h3, ## -> h4, ### -> h5
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet || numbered)[1])}</li>`);
    } else if (!line.trim()) {
      flushParagraph();
      closeList();
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  closeList();
  return out.join("");
}
