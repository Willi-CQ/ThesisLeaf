import { useMemo, useState } from "react";
import Icon from "./Icons.jsx";

const ORDER = { error: 0, warning: 1, info: 2, hint: 3 };
const ICON = { error: "error", warning: "warning", info: "info", hint: "hint" };

export default function ProblemsPanel({ diagnostics, lint, lintAvailable, activeFile, onGoto, compileMeta }) {
  const [filters, setFilters] = useState({ error: true, warning: true, info: false, hint: true });
  const [onlyActive, setOnlyActive] = useState(false);
  const [query, setQuery] = useState("");

  const all = useMemo(() => [...(diagnostics || []), ...(lint || [])], [diagnostics, lint]);
  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0, hint: 0 };
    for (const d of all) c[d.severity] = (c[d.severity] || 0) + 1;
    return c;
  }, [all]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((d) => filters[d.severity])
      .filter((d) => !onlyActive || !activeFile || d.file === activeFile)
      .filter((d) => !q || `${d.message} ${d.file || ""}`.toLowerCase().includes(q))
      .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.file || "").localeCompare(b.file || "") || (a.line || 0) - (b.line || 0));
  }, [all, filters, onlyActive, activeFile, query]);

  const toggle = (k) => setFilters((f) => ({ ...f, [k]: !f[k] }));

  return (
    <div className="problems">
      <div className="problems-bar">
        {["error", "warning", "info", "hint"].map((k) => (
          <button key={k} type="button" className={`chip ${k} ${filters[k] ? "on" : ""}`} onClick={() => toggle(k)} title={{ error: "Fehler", warning: "Warnungen", info: "Hinweise (Boxen, Schriften)", hint: "Stil & chktex" }[k]}>
            <Icon name={ICON[k]} size={13} /> {counts[k]}
          </button>
        ))}
        <button type="button" className={`chip ${onlyActive ? "on" : ""}`} onClick={() => setOnlyActive((v) => !v)}>
          nur aktive Datei
        </button>
        <input className="search compact" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="filtern …" />
        <div className="grow" />
        {compileMeta && (
          <span className="muted small">
            {compileMeta.engine}
            {compileMeta.bibTool && compileMeta.bibTool !== "none" ? ` + ${compileMeta.bibTool}` : ""} · {compileMeta.passes?.length || 0} Läufe · {(compileMeta.duration / 1000).toFixed(1)} s
          </span>
        )}
      </div>
      <div className="problems-list">
        {list.length === 0 && (
          <div className="tree-empty">
            {all.length === 0 ? "Keine Probleme – sauber kompiliert." : "Keine Einträge für die aktuelle Auswahl."}
            {lintAvailable === false && <div className="muted small">chktex nicht gefunden – Stilprüfung eingeschränkt.</div>}
          </div>
        )}
        {list.map((d, i) => (
          <button key={i} type="button" className={`problem-row ${d.severity}`} onClick={() => d.file && onGoto(d.file, d.line || 1, d.column || 1)} disabled={!d.file}>
            <Icon name={ICON[d.severity]} size={14} />
            <span className="problem-msg">{d.message}</span>
            {d.context && <span className="problem-ctx">{d.context}</span>}
            <span className="problem-loc">{d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : d.kind === "bib" ? "Literatur" : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
