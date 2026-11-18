import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { api, openExternal } from "../api.js";
import { resolveTheme } from "../settings.js";

marked.setOptions({ gfm: true, breaks: false });

let mermaidPromise = null;
function loadMermaid() {
  if (!mermaidPromise) mermaidPromise = import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

function dirOf(p) {
  const parts = String(p || "").replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

function resolveRel(base, rel) {
  if (/^([a-z]+:)?\/\//i.test(rel) || rel.startsWith("data:") || rel.startsWith("#")) return rel;
  const parts = base ? base.split("/") : [];
  for (const seg of rel.replace(/\\/g, "/").split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Rendert Markdown (Notizen, README, Arbeitsprotokoll, von Claude erzeugte Dokumente) sicher als HTML – inkl. Mermaid-Diagrammen. */
export default function MarkdownPreview({ source, path, onOpenFile, theme }) {
  const ref = useRef(null);
  const html = useMemo(() => {
    try {
      const raw = marked.parse(source || "");
      return DOMPurify.sanitize(raw, { ADD_ATTR: ["target"], FORBID_TAGS: ["style", "script"] });
    } catch (err) {
      return `<pre>${String(err.message)}</pre>`;
    }
  }, [source]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const base = dirOf(path);
    for (const img of el.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      if (!/^([a-z]+:)?\/\//i.test(src) && !src.startsWith("data:")) {
        img.src = api.rawUrl(resolveRel(base, src), Date.now());
      }
    }
    for (const a of el.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          openExternal(href);
        });
      } else if (!href.startsWith("#")) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          onOpenFile?.(resolveRel(base, href));
        });
      }
    }
    // Mermaid-Blöcke (```mermaid) rendern
    const blocks = [...el.querySelectorAll("pre > code.language-mermaid")];
    if (blocks.length) {
      let cancelled = false;
      loadMermaid()
        .then(async (mermaid) => {
          if (cancelled) return;
          mermaid.initialize({ startOnLoad: false, theme: resolveTheme(theme) === "dark" ? "dark" : "default", securityLevel: "strict" });
          for (let i = 0; i < blocks.length; i += 1) {
            const code = blocks[i];
            const pre = code.parentElement;
            try {
              const { svg } = await mermaid.render(`tl-mermaid-${Date.now()}-${i}`, code.textContent || "");
              if (cancelled) return;
              const wrap = document.createElement("div");
              wrap.className = "mermaid-wrap";
              wrap.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["foreignObject"], ADD_ATTR: ["dominant-baseline"] });
              pre.replaceWith(wrap);
            } catch (err) {
              pre.classList.add("mermaid-error");
              pre.title = String(err.message || err);
            }
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [html, path, onOpenFile, theme]);

  return <div ref={ref} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
