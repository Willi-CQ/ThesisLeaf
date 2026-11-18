import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { api } from "../api.js";

function Highlight({ text, match, column }) {
  if (!match) return <span>{text}</span>;
  const start = Math.max(0, column - 1);
  const before = text.slice(Math.max(0, start - 60), start);
  const after = text.slice(start + match.length, start + match.length + 100);
  return (
    <span>
      {start > 60 ? "…" : ""}
      {before}
      <mark>{text.slice(start, start + match.length)}</mark>
      {after}
    </span>
  );
}

export default function SearchPanel({ onGoto, initialQuery, focusNonce, hasMounts }) {
  const [query, setQuery] = useState(initialQuery || "");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [mounts, setMounts] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusNonce]);

  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== null) setQuery(initialQuery);
  }, [initialQuery, focusNonce]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!query.trim()) {
      setResult(null);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const r = await api.search({ q: query, regex: regex ? 1 : 0, case: caseSensitive ? 1 : 0, mounts: mounts ? 1 : 0 });
        setResult(r);
      } catch (e) {
        setError(e.message);
        setResult(null);
      } finally {
        setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer.current);
  }, [query, regex, caseSensitive, mounts]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const r of result?.results || []) {
      if (!map.has(r.file)) map.set(r.file, []);
      map.get(r.file).push(r);
    }
    return [...map.entries()];
  }, [result]);

  return (
    <>
      <div className="panel-head">
        <span>Suchen</span>
        <div className="panel-actions">
          {result && (
            <span className="muted small">
              {result.results.length}
              {result.truncated ? "+" : ""} in {groups.length} Dateien
            </span>
          )}
        </div>
      </div>
      <div className="search-box">
        <input ref={inputRef} className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Im Projekt suchen …" />
        <div className="row wrap">
          <button type="button" className={`chip ${regex ? "on" : ""}`} onClick={() => setRegex((v) => !v)} title="Regulärer Ausdruck">
            .*
          </button>
          <button type="button" className={`chip ${caseSensitive ? "on" : ""}`} onClick={() => setCaseSensitive((v) => !v)} title="Groß-/Kleinschreibung beachten">
            Aa
          </button>
          {hasMounts && (
            <button type="button" className={`chip ${mounts ? "on" : ""}`} onClick={() => setMounts((v) => !v)} title="Verknüpfte Ordner einbeziehen">
              <Icon name="mount" size={12} /> verknüpft
            </button>
          )}
          {busy && <span className="spinner tiny" />}
        </div>
        {error && <div className="error small">{error}</div>}
      </div>
      <div className="panel-scroll">
        {query && result && groups.length === 0 && !busy && <div className="tree-empty">Keine Treffer.</div>}
        {groups.map(([file, hits]) => (
          <div key={file}>
            <div className="panel-sub">
              {file} <span className="muted">({hits.length})</span>
            </div>
            {hits.map((h, i) => (
              <button key={`${file}-${h.line}-${h.column}-${i}`} type="button" className="search-hit" onClick={() => onGoto(file, h.line, h.column)}>
                <span className="muted small">{h.line}</span>
                <span className="search-text">
                  <Highlight text={h.text} match={h.match} column={h.column} />
                </span>
              </button>
            ))}
          </div>
        ))}
        {result?.truncated && <div className="muted small" style={{ padding: 8 }}>Nur die ersten {result.results.length} Treffer werden angezeigt – Suche eingrenzen.</div>}
      </div>
    </>
  );
}
