import { useEffect, useState } from "react";
import { api, desktop, openExternal } from "../api.js";
import Icon, { Leaf } from "./Icons.jsx";
import Dialog from "./Dialog.jsx";

function joinPath(parent, name) {
  const sep = parent.includes("/") && !parent.includes("\\") ? "/" : "\\";
  return `${parent.replace(/[\\/]+$/, "")}${sep}${name}`;
}

export function NewProjectDialog({ onClose, onCreate, initialParent = "" }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [parent, setParent] = useState(initialParent);
  const [folder, setFolder] = useState("Bachelorarbeit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .templateFields()
      .then((d) => {
        setFields(d.fields || []);
        setValues(Object.fromEntries((d.fields || []).map((f) => [f.key, f.default || ""])));
      })
      .catch((e) => setError(e.message));
  }, []);

  async function browse() {
    try {
      const { path } = await api.pick("Übergeordneten Ordner wählen (darin wird der Projektordner angelegt)");
      if (path) setParent(path);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit() {
    if (!parent || !folder.trim()) {
      setError("Bitte Zielordner und Ordnernamen angeben");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate(joinPath(parent, folder.trim()), values);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const target = parent ? joinPath(parent, folder.trim() || "…") : "";

  return (
    <Dialog
      title="Neue Bachelorarbeit anlegen"
      subtitle="Die Angaben landen in meta.tex und lassen sich später jederzeit ändern."
      onClose={onClose}
      onSubmit={submit}
      width={720}
      actions={
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={submit}>
            {busy ? "Wird angelegt …" : "Projekt anlegen"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="span-2">
          <span>Speicherort</span>
          <div className="row">
            <input className="path-input" value={parent} onChange={(e) => setParent(e.target.value)} placeholder="C:\Users\…\Dokumente" />
            <button className="btn btn-ghost" type="button" onClick={browse} title="Ordner wählen">
              <Icon name="folder" />
            </button>
          </div>
        </label>
        <label>
          <span>Ordnername</span>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} />
        </label>
        <div className="hint-box">{target ? `Wird angelegt in: ${target}` : "Ordner wählen, in dem das Projekt liegen soll"}</div>
        {fields.map((f) => (
          <label key={f.key} className={["TITEL", "HOCHSCHULE", "FAKULTAET"].includes(f.key) ? "span-2" : ""}>
            <span>{f.label}</span>
            {f.options ? (
              <select value={values[f.key] ?? f.default} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.default} />
            )}
          </label>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
    </Dialog>
  );
}

export default function WelcomeScreen({ latex, recents, error, bootError, onError, onOpen, onCreate, onRecentsChange, ui, updateUi }) {
  const [openPath, setOpenPath] = useState(recents?.[0] || "");
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const ok = Boolean(latex?.pdflatex);

  async function browse() {
    try {
      const { path } = await api.pick("Projektordner öffnen");
      if (path) {
        setOpenPath(path);
        await handleOpen(path);
      }
    } catch (err) {
      onError(err.message);
    }
  }

  async function handleOpen(path) {
    if (!path) return;
    setBusy(true);
    try {
      await onOpen(path);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function forget(p) {
    try {
      const data = await api.removeRecent(p);
      onRecentsChange?.(data.recents || []);
    } catch (err) {
      onError(err.message);
    }
  }

  const tools = latex ? ["pdflatex", "xelatex", "lualatex", "biber", "bibtex", "synctex", "chktex"].filter((t) => latex[t]) : [];

  return (
    <div className="welcome">
      <div className="welcome-topbar">
        <button className="icon-only" type="button" title="Hell/Dunkel" onClick={() => updateUi((u) => ({ theme: (u.theme === "dark" || (u.theme === "system" && document.documentElement.dataset.theme === "dark")) ? "light" : "dark" }))}>
          <Icon name={document.documentElement.dataset.theme === "dark" ? "sun" : "moon"} />
        </button>
      </div>
      <div className="welcome-card">
        <div className="brand">
          <Leaf size={40} />
          <div>
            <h1>ThesisLeaf</h1>
            <p className="brand-sub">Lokale LaTeX-Schreibwerkstatt für deine Bachelorarbeit – ohne Cloud, mit Historie, PDF-Sync und Literaturimport.</p>
          </div>
        </div>

        <div className={`latex-pill ${ok ? "" : "off"}`}>
          <span className={ok ? "dot" : "dot off"} />
          {ok ? (
            <span>
              {latex.distribution || "LaTeX"} bereit{latex.version ? ` · ${latex.version}` : ""} · {tools.join(" · ")}
            </span>
          ) : (
            <span>
              Kein LaTeX gefunden – bitte{" "}
              <a href="https://miktex.org/download" onClick={(e) => { e.preventDefault(); openExternal("https://miktex.org/download"); }}>
                MiKTeX
              </a>{" "}
              installieren (Kompilieren ist bis dahin nicht möglich, Bearbeiten schon).
            </span>
          )}
        </div>

        <div className="grid-2">
          <section className="action">
            <h2>
              <Icon name="folderOpen" /> Projekt öffnen
            </h2>
            <p>Bestehenden Ordner verbinden – auch mit Code-Dateien, Markdown-Notizen und Unterordnern.</p>
            <div className="row">
              <input className="path-input" value={openPath} onChange={(e) => setOpenPath(e.target.value)} placeholder="C:\Users\…\Bachelorarbeit" onKeyDown={(e) => e.key === "Enter" && handleOpen(openPath)} />
              <button className="btn btn-ghost" type="button" onClick={browse} title="Ordner wählen">
                <Icon name="folder" />
              </button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" type="button" disabled={busy || !openPath} onClick={() => handleOpen(openPath)}>
                Ordner öffnen
              </button>
            </div>
          </section>

          <section className="action">
            <h2>
              <Icon name="wand" /> Neue Bachelorarbeit
            </h2>
            <p>Vorlage mit Titelseite, Kapiteln, Verzeichnissen, Abkürzungen, Literatur (biblatex) und eidesstattlicher Erklärung.</p>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => setShowNew(true)}>
                Vorlage einrichten …
              </button>
            </div>
          </section>
        </div>

        {recents?.length > 0 && (
          <div className="recents">
            <h3>Zuletzt geöffnet</h3>
            {recents.map((p) => (
              <div key={p} className="recent-row">
                <button className="recent" type="button" onClick={() => handleOpen(p)}>
                  <b>{p.split(/[\\/]/).filter(Boolean).at(-1)}</b>
                  <small>{p}</small>
                </button>
                <button className="icon-only" type="button" title="Aus der Liste entfernen" onClick={() => forget(p)}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {(error || bootError) && <div className="error">{error || bootError}</div>}

        <div className="welcome-foot">
          <span>{desktop ? `Desktop-App${desktop.version ? ` ${desktop.version}` : ""}` : "Browser-Modus"}</span>
          <span>Strg+P Datei suchen · Strg+Enter kompilieren · Strg+Alt+J im PDF zeigen</span>
        </div>
      </div>
      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} onCreate={onCreate} initialParent={openPath ? openPath.replace(/[\\/][^\\/]+$/, "") : ""} />}
    </div>
  );
}
