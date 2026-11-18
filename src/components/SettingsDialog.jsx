import { useEffect, useState } from "react";
import Dialog from "./Dialog.jsx";
import Icon from "./Icons.jsx";
import { api, desktop } from "../api.js";

const TABS = [
  ["look", "Darstellung"],
  ["compile", "Kompilieren"],
  ["checks", "Prüfungen"],
  ["goals", "Ziele"],
  ["folders", "Ordner"],
  ["backup", "Sicherung"],
  ["keys", "Tastatur"],
];

const SHORTCUTS = [
  ["Strg+S", "Alle geänderten Dateien speichern"],
  ["Strg+Enter / F5", "Kompilieren"],
  ["Strg+P", "Datei per Namen öffnen"],
  ["Strg+Shift+F", "Im Projekt suchen"],
  ["Strg+Alt+J", "Cursorzeile im PDF zeigen (SyncTeX)"],
  ["Doppelklick im PDF", "Zur Quelltextstelle springen"],
  ["Strg+Klick auf \\ref/\\cite/\\input", "Zum Ziel springen"],
  ["Strg+B / Strg+I", "Fett / Hervorhebung"],
  ["Strg+Shift+C", "Zitat einfügen (Auswahl)"],
  ["Strg+. (Glühbirne)", "Schnellkorrektur für Rechtschreib-/Grammatikhinweis"],
  ["Strg+Shift+P", "Eintrag ins Arbeitsprotokoll"],
  ["Strg+Shift+M", "Fokusmodus (nur Editor)"],
  ["Strg+\\", "Seitenleiste ein/aus"],
  ["Strg+J", "Untere Leiste (Probleme/Log) ein/aus"],
  ["Strg+Shift+E / O / B / H", "Dateien / Gliederung / Literatur / Historie"],
  ["Strg+,", "Einstellungen"],
  ["F8", "Zum nächsten Problem"],
  ["Strg+W", "Tab schließen (Desktop-App)"],
  ["Strg+Mausrad im PDF", "Zoom"],
  ["Strg+V mit Bild", "Bild aus der Zwischenablage als Abbildung einfügen"],
  ["Strg+/ im Editor", "Zeile auskommentieren"],
  ["Strg+F / Strg+H im Editor", "Suchen / Ersetzen in Datei"],
];

export default function SettingsDialog({ ui, updateUi, project, onProjectSettings, onClose, initialTab = "look", onMountsChanged, onNotify }) {
  const [tab, setTab] = useState(initialTab);
  const s = project?.settings || {};
  const [goals, setGoals] = useState({ words: s.goals?.words ?? 9000, pages: s.goals?.pages ?? 40, deadline: s.goals?.deadline ?? "" });
  const [mountName, setMountName] = useState("");
  const [mountPath, setMountPath] = useState("");
  const [excludeText, setExcludeText] = useState((s.excludePaths || []).join("\n"));
  const [protocolFile, setProtocolFile] = useState(s.protocolFile || project?.doc?.protocolFile || "");
  const [backup, setBackup] = useState({ dir: s.backup?.dir || "", everyMinutes: s.backup?.everyMinutes || 60, keep: s.backup?.keep || 20 });
  const [backups, setBackups] = useState([]);
  const [ltUrl, setLtUrl] = useState(s.grammar?.url || "https://api.languagetool.org/v2/check");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latex = project?.latex || {};

  useEffect(() => {
    if (tab === "backup") api.backups().then((d) => setBackups(d.items || [])).catch(() => {});
  }, [tab]);

  function ps(patch) {
    return onProjectSettings(patch).catch((e) => setError(e.message));
  }

  async function browseMount() {
    try {
      const { path } = await api.pick("Ordner verknüpfen (z. B. Quellcode-Projekt)");
      if (path) {
        setMountPath(path);
        if (!mountName) setMountName(path.split(/[\\/]/).filter(Boolean).pop() || "code");
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function addMount() {
    setError("");
    try {
      await api.addMount(mountName.trim(), mountPath.trim());
      setMountName("");
      setMountPath("");
      onMountsChanged?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeMount(name) {
    setError("");
    try {
      await api.removeMount(name);
      onMountsChanged?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function browseBackup() {
    try {
      const { path } = await api.pick("Sicherungsordner wählen (außerhalb des Projekts, z. B. auf einem anderen Laufwerk)");
      if (path) setBackup((b) => ({ ...b, dir: path }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function backupNow() {
    setBusy(true);
    setError("");
    try {
      await ps({ backup });
      const r = await api.backupNow();
      onNotify?.(`Sicherung geschrieben: ${r.file}`);
      setBackups((await api.backups()).items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Einstellungen" onClose={onClose} width={760} className="settings" autoFocus={false}>
      <div className="settings-layout">
        <div className="settings-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="settings-body">
          {tab === "look" && (
            <div className="form-col">
              <label>
                <span>Farbschema</span>
                <div className="row">
                  {[
                    ["system", "System"],
                    ["light", "Hell"],
                    ["dark", "Dunkel"],
                  ].map(([v, l]) => (
                    <button key={v} type="button" className={`chip ${ui.theme === v ? "on" : ""}`} onClick={() => updateUi({ theme: v })}>
                      {l}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                <span>Schriftgröße im Editor</span>
                <input type="number" min={10} max={24} value={ui.fontSize} onChange={(e) => updateUi({ fontSize: Math.min(24, Math.max(10, Number(e.target.value) || 14)) })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={ui.wordWrap} onChange={(e) => updateUi({ wordWrap: e.target.checked })} /> Zeilen umbrechen
              </label>
              <label className="check">
                <input type="checkbox" checked={ui.lineNumbers} onChange={(e) => updateUi({ lineNumbers: e.target.checked })} /> Zeilennummern
              </label>
              <label className="check">
                <input type="checkbox" checked={ui.minimap} onChange={(e) => updateUi({ minimap: e.target.checked })} /> Minimap
              </label>
              <label>
                <span>Automatisch speichern nach (ms)</span>
                <input type="number" min={200} max={5000} step={100} value={ui.autosaveDelay} onChange={(e) => updateUi({ autosaveDelay: Math.min(5000, Math.max(200, Number(e.target.value) || 600)) })} />
              </label>
              <label>
                <span>Markdown-Dateien öffnen als</span>
                <select value={ui.markdownView} onChange={(e) => updateUi({ markdownView: e.target.value })}>
                  <option value="split">Editor + Vorschau</option>
                  <option value="preview">Nur Vorschau</option>
                  <option value="editor">Nur Editor</option>
                </select>
              </label>
              <label>
                <span>PDF-Ansicht</span>
                <select value={ui.pdfViewer || "pdfjs"} onChange={(e) => updateUi({ pdfViewer: e.target.value })}>
                  <option value="pdfjs">ThesisLeaf-Viewer (SyncTeX, Position bleibt erhalten)</option>
                  <option value="chromium">Browser-Viewer (Textsuche, Markieren, Drucken)</option>
                </select>
              </label>
              <label>
                <span>Pomodoro-Länge (Minuten) für Schreibsitzungen</span>
                <input type="number" min={5} max={120} value={ui.pomodoro || 25} onChange={(e) => updateUi({ pomodoro: Math.min(120, Math.max(5, Number(e.target.value) || 25)) })} />
              </label>
            </div>
          )}

          {tab === "compile" && (
            <div className="form-col">
              <div className="hint-box">
                {latex.bin ? `${latex.distribution || "LaTeX"} · ${latex.version || ""} · ${latex.bin}` : "Kein LaTeX gefunden – MiKTeX oder TeX Live installieren."}
                {project?.doc && (
                  <div style={{ marginTop: 6 }}>
                    Dokument: {project.doc.documentClass || "?"} · Sprache {project.doc.language === "en" ? "Englisch" : "Deutsch"} · {project.doc.cleveref ? "cleveref" : "kein cleveref"} · Literatur {project.doc.bibStyle || "?"} ({project.doc.bibBackend || "?"})
                    {project.doc.mainDir ? ` · Hauptdatei-Ordner: ${project.doc.mainDir}/` : ""}
                  </div>
                )}
              </div>
              <label>
                <span>Engine</span>
                <select value={s.engine || "auto"} onChange={(e) => ps({ engine: e.target.value })}>
                  <option value="auto">Automatisch (Magic-Comment / Präambel){project?.resolved ? ` – aktuell ${project.resolved.engine}` : ""}</option>
                  <option value="pdflatex" disabled={!latex.pdflatex}>pdflatex</option>
                  <option value="xelatex" disabled={!latex.xelatex}>xelatex (Systemschriften, fontspec)</option>
                  <option value="lualatex" disabled={!latex.lualatex}>lualatex</option>
                </select>
              </label>
              <label>
                <span>Literaturwerkzeug</span>
                <select value={s.bibTool || "auto"} onChange={(e) => ps({ bibTool: e.target.value })}>
                  <option value="auto">Automatisch{project?.resolved ? ` – aktuell ${project.resolved.bibTool}` : ""}</option>
                  <option value="biber" disabled={!latex.biber}>biber (biblatex)</option>
                  <option value="bibtex" disabled={!latex.bibtex}>bibtex</option>
                  <option value="none">keins</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={s.autoCompile !== false} onChange={(e) => ps({ autoCompile: e.target.checked })} /> Automatisch kompilieren, wenn sich Dateien ändern
              </label>
              <label>
                <span>Verzögerung nach der letzten Änderung (ms)</span>
                <input type="number" min={300} max={10000} step={100} value={s.compileDelay ?? 900} onChange={(e) => ps({ compileDelay: Number(e.target.value) || 900 })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={Boolean(s.showHidden)} onChange={(e) => ps({ showHidden: e.target.checked })} /> Build-Dateien (.aux, .log …) im Dateibaum anzeigen
              </label>
            </div>
          )}

          {tab === "checks" && (
            <div className="form-col">
              <label className="check">
                <input type="checkbox" checked={s.lint !== false} onChange={(e) => ps({ lint: e.target.checked })} /> Stil- und Strukturprüfung (chktex, fehlende Labels/Zitate, Abkürzungen ohne \ac, Füllwörter …)
              </label>
              <label className="check">
                <input type="checkbox" checked={s.spell?.enabled !== false} onChange={(e) => ps({ spell: { enabled: e.target.checked } })} /> Rechtschreibprüfung (offline, Hunspell-Wörterbücher Deutsch + Englisch)
              </label>
              <label>
                <span>Sprache der Rechtschreibprüfung</span>
                <select value={s.spell?.language || "auto"} onChange={(e) => ps({ spell: { language: e.target.value } })}>
                  <option value="auto">Automatisch aus babel{project?.doc ? ` (${project.doc.language === "en" ? "Englisch" : "Deutsch"})` : ""} – otherlanguage-Blöcke werden erkannt</option>
                  <option value="de">Deutsch</option>
                  <option value="en">Englisch</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={Boolean(s.spell?.markdown)} onChange={(e) => ps({ spell: { markdown: e.target.checked } })} /> Auch Markdown-Dateien prüfen
              </label>
              <div className="hint-box">
                Unbekannte Wörter lassen sich per Glühbirne (Strg+.) ins Projekt- oder persönliche Wörterbuch aufnehmen. Abkürzungen aus der Abkürzungsliste und Literaturschlüssel werden nie gemeldet.
              </div>
              <label className="check">
                <input type="checkbox" checked={Boolean(s.grammar?.enabled)} onChange={(e) => ps({ grammar: { enabled: e.target.checked } })} /> Grammatikprüfung über LanguageTool anbieten (Knopf „Grammatik“, sendet den Text der aktiven Datei an den Server)
              </label>
              <label>
                <span>LanguageTool-Server (URL der Prüf-API)</span>
                <div className="row">
                  <input value={ltUrl} onChange={(e) => setLtUrl(e.target.value)} placeholder="https://api.languagetool.org/v2/check" />
                  <button className="btn btn-ghost compact" type="button" onClick={() => ps({ grammar: { url: ltUrl } })}>
                    Übernehmen
                  </button>
                </div>
              </label>
              <div className="muted small">
                Öffentliche API: max. 20 KB pro Anfrage und 20 Anfragen pro Minute, Text wird an languagetool.org übertragen. Lokal ohne Datenabfluss: LanguageTool-Server (Java) oder Docker-Image „erikvl87/languagetool“ starten und hier http://localhost:8010/v2/check eintragen.
              </div>
            </div>
          )}

          {tab === "goals" && (
            <div className="form-col">
              <p className="muted">Ziele steuern die Fortschrittsanzeige in der Statistik. Typisch für eine Bachelorarbeit: 8 000–12 000 Wörter bzw. 40–60 Seiten.</p>
              <label>
                <span>Ziel: Wörter</span>
                <input type="number" min={0} step={500} value={goals.words} onChange={(e) => setGoals({ ...goals, words: Number(e.target.value) })} />
              </label>
              <label>
                <span>Ziel: Seiten</span>
                <input type="number" min={0} value={goals.pages} onChange={(e) => setGoals({ ...goals, pages: Number(e.target.value) })} />
              </label>
              <label>
                <span>Abgabedatum</span>
                <input type="date" value={goals.deadline} onChange={(e) => setGoals({ ...goals, deadline: e.target.value })} />
              </label>
              <div className="row">
                <button className="btn btn-primary" type="button" onClick={() => ps({ goals })}>
                  Ziele speichern
                </button>
              </div>
            </div>
          )}

          {tab === "folders" && (
            <div className="form-col">
              <label>
                <span>Ausgeschlossene Ordner (ein Pfad je Zeile, relativ zum Projekt)</span>
                <textarea rows={4} value={excludeText} onChange={(e) => setExcludeText(e.target.value)} placeholder={"results/artifacts\n.venv\ndata/raw"} />
              </label>
              <div className="muted small">Ausgeschlossene Ordner bleiben im Baum sichtbar und aufklappbar, werden aber nicht durchsucht, nicht beobachtet, nicht versioniert, nicht gesichert und nicht ins ZIP gepackt.</div>
              <label className="check">
                <input type="checkbox" checked={s.autoExcludeHeavy !== false} onChange={(e) => ps({ autoExcludeHeavy: e.target.checked })} /> Große Ordner automatisch ausnehmen (über 400 Einträge oder über 2000 Dateien im Teilbaum)
              </label>
              {(project?.heavyDirs || []).length > 0 && (
                <div className="hint-box">
                  Automatisch erkannt: {project.heavyDirs.join(", ")}
                  {s.autoExcludeHeavy === false ? " – Automatik ist aus, diese Ordner werden vollständig beobachtet (kann die Reaktion verlangsamen)." : " – sichtbar, aber nicht beobachtet/durchsucht/versioniert."}
                </div>
              )}
              <label>
                <span>Arbeitsprotokoll (Markdown-Datei für Strg+Shift+P)</span>
                <input value={protocolFile} onChange={(e) => setProtocolFile(e.target.value)} placeholder={project?.doc?.protocolFile || "Arbeitsprotokoll.md"} />
              </label>
              <div className="row">
                <button className="btn btn-primary" type="button" onClick={() => ps({ excludePaths: excludeText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), protocolFile })}>
                  Speichern
                </button>
              </div>
              <div className="panel-sub" style={{ marginTop: 12 }}>Verknüpfte Ordner</div>
              <p className="muted small">
                Erscheinen im Dateibaum als <b>@name</b> – praktisch, um den Quellcode des eigenen Projekts neben der Arbeit zu lesen. Sie werden nicht kompiliert und nicht versioniert.
              </p>
              {(s.mounts || []).length === 0 && <div className="hint-box">Noch kein Ordner verknüpft.</div>}
              {(s.mounts || []).map((m) => (
                <div key={m.name} className="mount-row">
                  <Icon name="mount" />
                  <div>
                    <b>@{m.name}</b>
                    <div className="muted small">{m.path}</div>
                  </div>
                  <div className="grow" />
                  <button className="icon-only" type="button" title="Verknüpfung entfernen" onClick={() => removeMount(m.name)}>
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
              <div className="form-grid">
                <label>
                  <span>Name</span>
                  <input value={mountName} onChange={(e) => setMountName(e.target.value)} placeholder="code" />
                </label>
                <label>
                  <span>Pfad</span>
                  <div className="row">
                    <input value={mountPath} onChange={(e) => setMountPath(e.target.value)} placeholder="C:\Projekte\meine-app" />
                    <button className="btn btn-ghost" type="button" onClick={browseMount}>
                      <Icon name="folder" />
                    </button>
                  </div>
                </label>
              </div>
              <div className="row">
                <button className="btn btn-primary" type="button" disabled={!mountName.trim() || !mountPath.trim()} onClick={addMount}>
                  Ordner verknüpfen
                </button>
              </div>
            </div>
          )}

          {tab === "backup" && (
            <div className="form-col">
              <p className="muted">Automatische ZIP-Sicherung der Quellen (ohne Build-Dateien, mit aktuellem PDF) in einen Ordner deiner Wahl – zusätzlich zur Historie im Projekt. Empfehlung: anderes Laufwerk oder ein synchronisierter Ordner.</p>
              <label>
                <span>Sicherungsordner</span>
                <div className="row">
                  <input value={backup.dir} onChange={(e) => setBackup({ ...backup, dir: e.target.value })} placeholder="D:\Backups\Bachelorarbeit" />
                  <button className="btn btn-ghost" type="button" onClick={browseBackup}>
                    <Icon name="folder" />
                  </button>
                </div>
              </label>
              <div className="form-grid">
                <label>
                  <span>Alle … Minuten (bei Änderungen)</span>
                  <input type="number" min={5} max={1440} value={backup.everyMinutes} onChange={(e) => setBackup({ ...backup, everyMinutes: Number(e.target.value) || 60 })} />
                </label>
                <label>
                  <span>Aufbewahren (Anzahl)</span>
                  <input type="number" min={1} max={200} value={backup.keep} onChange={(e) => setBackup({ ...backup, keep: Number(e.target.value) || 20 })} />
                </label>
              </div>
              <div className="row">
                <button className="btn btn-primary" type="button" onClick={() => ps({ backup }).then(() => onNotify?.("Sicherungseinstellungen gespeichert."))}>
                  Speichern
                </button>
                <button className="btn btn-ghost" type="button" disabled={busy || !backup.dir} onClick={backupNow}>
                  Jetzt sichern
                </button>
              </div>
              {backups.length > 0 && (
                <>
                  <div className="panel-sub">Vorhandene Sicherungen</div>
                  {backups.slice(0, 10).map((b) => (
                    <div key={b.file} className="mount-row">
                      <Icon name="save" />
                      <div>
                        <b>{b.name}</b>
                        <div className="muted small">{(b.bytes / 1024).toFixed(0)} KB · {new Date(b.mtime).toLocaleString("de-DE")}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "keys" && (
            <table className="keys">
              <tbody>
                {SHORTCUTS.map(([k, d]) => (
                  <tr key={k}>
                    <td>
                      <kbd>{k}</kbd>
                    </td>
                    <td>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
      <div className="dialog-foot muted small">
        {desktop ? `ThesisLeaf Desktop ${desktop.version || ""}` : "ThesisLeaf im Browser"} · Darstellung gilt für dieses Gerät, Projekt-Einstellungen liegen in .local-overleaf/config.json
      </div>
    </Dialog>
  );
}
