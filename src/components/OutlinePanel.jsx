import { useMemo, useState } from "react";
import Icon from "./Icons.jsx";

const LEVEL = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };

/** Überschriften einer Markdown-Datei (z. B. Arbeitsprotokoll) mit Zeilennummern. */
export function markdownHeadings(text) {
  const out = [];
  let inCode = false;
  (text || "").split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (inCode) return;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) out.push({ level: m[1].length, title: m[2].replace(/[*_`]/g, ""), line: i + 1 });
  });
  return out;
}

export default function OutlinePanel({ sections, floats, activeFile, cursorLine, onGoto, markdown, topLevel }) {
  const [query, setQuery] = useState("");
  const [showFloats, setShowFloats] = useState(true);
  const isMarkdown = Boolean(markdown);

  const current = useMemo(() => {
    if (!activeFile) return null;
    let best = null;
    const list = isMarkdown ? markdown.headings : sections || [];
    for (const s of list) {
      if ((isMarkdown || s.file === activeFile) && s.line <= (cursorLine || 1)) best = s;
    }
    return best;
  }, [sections, activeFile, cursorLine, isMarkdown, markdown]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const src = isMarkdown ? markdown.headings : sections || [];
    return src.filter((s) => !q || s.title.toLowerCase().includes(q));
  }, [sections, query, isMarkdown, markdown]);

  const floatList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (floats || []).filter((f) => !q || f.caption.toLowerCase().includes(q) || f.label.toLowerCase().includes(q));
  }, [floats, query]);

  return (
    <>
      <div className="panel-head">
        <span>{isMarkdown ? "Gliederung (Markdown)" : "Gliederung"}</span>
        <div className="panel-actions">
          {!isMarkdown && (
            <button className={`icon-only ${showFloats ? "active" : ""}`} type="button" title="Abbildungen & Tabellen anzeigen" onClick={() => setShowFloats((v) => !v)}>
              <Icon name="figure" size={15} />
            </button>
          )}
        </div>
      </div>
      <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Überschrift suchen …" />
      <div className="panel-scroll outline">
        {list.length === 0 && (
          <div className="tree-empty">{isMarkdown ? "Keine Überschriften in dieser Markdown-Datei." : "Noch keine Überschriften. Kapitel beginnen mit \\chapter{…} oder \\section{…}."}</div>
        )}
        {isMarkdown &&
          list.map((h, i) => (
            <button key={`${h.line}-${i}`} type="button" className={`outline-item lvl-${Math.min(5, h.level)} ${current === h ? "current" : ""}`} style={{ paddingLeft: 8 + Math.max(0, h.level - 1) * 14 }} onClick={() => onGoto(activeFile, h.line)} title={`Zeile ${h.line}`}>
              <span className="outline-title">{h.title}</span>
              <span className="outline-file">{h.line}</span>
            </button>
          ))}
        {!isMarkdown &&
          list.map((s, i) => {
            const lvl = topLevel === "section" ? Math.max(1, (LEVEL[s.level] ?? 2) - 1) : (LEVEL[s.level] ?? 2);
            const isCurrent = current === s;
            return (
              <button
                key={`${s.file}-${s.line}-${i}`}
                type="button"
                className={`outline-item lvl-${lvl} ${isCurrent ? "current" : ""} ${s.inDocument === false ? "orphan" : ""}`}
                style={{ paddingLeft: 8 + Math.max(0, lvl - 1) * 14 }}
                onClick={() => onGoto(s.file, s.line)}
                title={`${s.file}:${s.line}${s.inDocument === false ? " – nicht über \\input eingebunden" : ""}`}
              >
                <span className="outline-title">{s.starred ? `${s.title} *` : s.title}</span>
                <span className="outline-file">{s.file.split("/").pop()}</span>
              </button>
            );
          })}
        {!isMarkdown && showFloats && floatList.length > 0 && (
          <>
            <div className="panel-sub">Abbildungen, Tabellen, Listings</div>
            {floatList.map((f, i) => (
              <button key={`${f.file}-${f.line}-${i}`} type="button" className="outline-item lvl-3 float" onClick={() => onGoto(f.file, f.line)} title={`${f.file}:${f.line}`}>
                <Icon name={f.kind === "table" ? "table" : f.kind === "figure" ? "figure" : "code"} size={13} />
                <span className="outline-title">{f.caption || f.label || "(ohne Beschriftung)"}</span>
                {f.label && <span className="outline-file">{f.label}</span>}
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}
