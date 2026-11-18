import { useEffect, useMemo, useState } from "react";
import Icon from "./Icons.jsx";
import { api, openExternal } from "../api.js";

const MANUAL_TEMPLATES = {
  article: "@article{schluessel,\n  author  = {Nachname, Vorname and Nachname, Vorname},\n  title   = {Titel des Artikels},\n  journal = {Zeitschrift},\n  year    = {2024},\n  volume  = {1},\n  number  = {1},\n  pages   = {1--10},\n  doi     = {}\n}\n",
  book: "@book{schluessel,\n  author    = {Nachname, Vorname},\n  title     = {Buchtitel},\n  publisher = {Verlag},\n  address   = {Ort},\n  year      = {2024},\n  edition   = {1},\n  isbn      = {}\n}\n",
  inproceedings: "@inproceedings{schluessel,\n  author    = {Nachname, Vorname},\n  title     = {Beitragstitel},\n  booktitle = {Proceedings of …},\n  year      = {2024},\n  pages     = {1--10},\n  publisher = {Verlag},\n  doi       = {}\n}\n",
  online: "@online{schluessel,\n  author  = {Organisation oder Autor},\n  title   = {Titel der Webseite},\n  url     = {https://},\n  urldate = {2026-01-01},\n  year    = {2026}\n}\n",
  thesis: "@thesis{schluessel,\n  author      = {Nachname, Vorname},\n  title       = {Titel der Arbeit},\n  type        = {Bachelorarbeit},\n  institution = {Hochschule},\n  year        = {2024}\n}\n",
};

export default function BibPanel({ entries, files, issues, usedKeys, onInsertCite, onGoto, onChanged }) {
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState("");
  const [result, setResult] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState(files?.[0] || "literatur.bib");
  const [showManual, setShowManual] = useState(false);
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [candidates, setCandidates] = useState(null);

  const isIdentifier = (q) => /10\.\d{4,9}\//.test(q) || /^https?:\/\//i.test(q) || /^(isbn:?)?[\d -]{10,17}[\dxX]$/.test(q.replace(/\s/g, "")) || /arxiv|^\d{4}\.\d{4,5}(v\d+)?$/i.test(q);

  useEffect(() => {
    if (files?.length && !files.includes(target)) setTarget(files[0]);
  }, [files, target]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries || [])
      .filter((e) => !onlyUnused || !usedKeys?.has(e.key))
      .filter((e) => !q || `${e.key} ${e.author} ${e.title} ${e.year} ${e.journal}`.toLowerCase().includes(q))
      .sort((a, b) => (a.author || a.key).localeCompare(b.author || b.key, "de"));
  }, [entries, query, onlyUnused, usedKeys]);

  async function doLookup(queryOverride) {
    const q = (queryOverride ?? lookup).trim();
    if (!q) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (queryOverride === undefined && !isIdentifier(q)) {
        const r = await api.bibSearch(q, 10);
        setCandidates(r.results || []);
        if (!(r.results || []).length) setError("Keine Treffer bei CrossRef – Titel genauer eingeben oder DOI verwenden.");
        return;
      }
      const r = await api.bibLookup(q);
      setCandidates(null);
      setResult(r);
      setDraft(r.bibtex);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addEntry(text) {
    setBusy(true);
    setError("");
    try {
      await api.bibAdd(target, text);
      setResult(null);
      setDraft("");
      setLookup("");
      setShowManual(false);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-head">
        <span>Literatur</span>
        <div className="panel-actions">
          <span className="muted small">{entries?.length || 0} Einträge</span>
          <button className={`icon-only ${onlyUnused ? "active" : ""}`} type="button" title="Nur noch nicht zitierte Einträge" onClick={() => setOnlyUnused((v) => !v)}>
            <Icon name="filter" size={15} />
          </button>
          <button className={`icon-only ${showManual ? "active" : ""}`} type="button" title="Eintrag manuell anlegen" onClick={() => setShowManual((v) => !v)}>
            <Icon name="plus" size={15} />
          </button>
        </div>
      </div>

      <div className="bib-import">
        <div className="row">
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doLookup()}
            placeholder="Titel/Stichwörter, DOI, ISBN, arXiv-ID oder URL …"
            title="Freitext sucht bei CrossRef. Beispiele: 10.1145/3290605.3300233 · 978-3-16-148410-0 · arXiv:2103.00020 · https://…"
          />
          <button className="btn btn-primary compact" type="button" disabled={busy || !lookup.trim()} onClick={() => doLookup()}>
            {busy ? "…" : "Suchen"}
          </button>
        </div>
        {error && <div className="error small">{error}</div>}
        {candidates && candidates.length > 0 && !result && (
          <div className="bib-candidates">
            <div className="muted small">CrossRef-Treffer – zum Importieren anklicken:</div>
            {candidates.map((c) => (
              <button key={c.doi} type="button" className="bib-candidate" onClick={() => doLookup(c.doi)} title={c.doi}>
                <div className="bib-title">{c.title || c.doi}</div>
                <div className="muted small">
                  {c.authors.join("; ") || "–"} · {c.year || "o. J."} · {c.venue || c.type}
                  {c.cited ? ` · ${c.cited}× zitiert` : ""}
                </div>
              </button>
            ))}
            <button type="button" className="link-btn" onClick={() => setCandidates(null)}>
              Treffer ausblenden
            </button>
          </div>
        )}
        {(result || showManual) && (
          <div className="bib-preview">
            {showManual && !result && (
              <div className="row wrap">
                {Object.keys(MANUAL_TEMPLATES).map((t) => (
                  <button key={t} className="chip" type="button" onClick={() => setDraft(MANUAL_TEMPLATES[t])}>
                    @{t}
                  </button>
                ))}
              </div>
            )}
            {result && (
              <div className="muted small">
                Gefunden via {result.source} · Schlüssel <b>{result.key}</b>
              </div>
            )}
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={9} spellCheck={false} />
            <div className="row">
              {files?.length > 1 && (
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {files.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              )}
              <div className="grow" />
              <button className="btn btn-ghost compact" type="button" onClick={() => { setResult(null); setDraft(""); setShowManual(false); }}>
                Verwerfen
              </button>
              <button className="btn btn-primary compact" type="button" disabled={busy || !draft.trim()} onClick={() => addEntry(draft)}>
                In {target.split("/").pop()} speichern
              </button>
            </div>
          </div>
        )}
      </div>

      <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Autor, Titel, Schlüssel …" />
      <div className="panel-scroll">
        {list.length === 0 && <div className="tree-empty">{entries?.length ? "Keine Treffer" : "Noch keine Literatur. Oben DOI/ISBN einfügen oder + für einen manuellen Eintrag."}</div>}
        {list.map((e) => {
          const used = usedKeys?.has(e.key);
          return (
            <div key={`${e.file}-${e.key}`} className={`bib-item ${used ? "" : "unused"}`}>
              <button type="button" className="bib-main" onClick={() => onInsertCite(e.key)} title={`\\cite{${e.key}} an der Cursorposition einfügen`}>
                <div className="bib-line1">
                  <b>{e.key}</b>
                  <span className="muted">{e.year}</span>
                  {!used && <span className="tree-badge">unzitiert</span>}
                </div>
                <div className="bib-title">{e.title || <i>ohne Titel</i>}</div>
                <div className="bib-author muted">{e.author || e.journal}</div>
              </button>
              <div className="bib-actions">
                <button className="icon-only" type="button" title="Im .bib öffnen" onClick={() => onGoto(e.file, e.line)}>
                  <Icon name="edit" size={14} />
                </button>
                {(e.doi || e.url) && (
                  <button className="icon-only" type="button" title={e.doi ? `https://doi.org/${e.doi}` : e.url} onClick={() => openExternal(e.doi ? `https://doi.org/${e.doi}` : e.url)}>
                    <Icon name="external" size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {issues?.length > 0 && (
          <>
            <div className="panel-sub">Hinweise zur .bib-Datei</div>
            {issues.map((i, idx) => (
              <button key={idx} type="button" className={`problem-row ${i.severity}`} onClick={() => onGoto(i.file, i.line)}>
                <Icon name={i.severity === "warning" ? "warning" : "info"} size={13} />
                <span>{i.message}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}
