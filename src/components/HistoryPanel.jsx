import { useEffect, useState } from "react";
import Icon from "./Icons.jsx";
import { api } from "../api.js";

export function relTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 20) return "gerade eben";
  if (diff < 60) return `vor ${Math.floor(diff)} s`;
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  if (diff < 7 * 86400) return `vor ${Math.floor(diff / 86400)} Tagen`;
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function dayKey(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "long" });
}

export default function HistoryPanel({ items, gitAvailable, activeFile, onDiff, onRestore, onRestoreFile, onSnapshot, onOpenFile }) {
  const [selected, setSelected] = useState(null);
  const [changes, setChanges] = useState([]);
  const [message, setMessage] = useState("");
  const [onlyManual, setOnlyManual] = useState(false);

  useEffect(() => {
    if (!selected) {
      setChanges([]);
      return;
    }
    let cancelled = false;
    api
      .historyChanges(selected)
      .then((d) => !cancelled && setChanges(d.files || []))
      .catch(() => !cancelled && setChanges([]));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (gitAvailable === false) {
    return (
      <>
        <div className="panel-head">
          <span>Historie</span>
        </div>
        <div className="tree-empty">
          Git wurde nicht gefunden. Die automatische Versionierung braucht Git (<code>git-scm.com</code>). Bearbeiten und Kompilieren funktionieren trotzdem.
        </div>
      </>
    );
  }

  const list = (items || []).filter((i) => !onlyManual || i.manual);
  let lastDay = "";

  return (
    <>
      <div className="panel-head">
        <span>Historie</span>
        <div className="panel-actions">
          <span className="muted small">{items?.length || 0} Versionen</span>
          <button className={`icon-only ${onlyManual ? "active" : ""}`} type="button" title="Nur benannte Snapshots" onClick={() => setOnlyManual((v) => !v)}>
            <Icon name="flag" size={15} />
          </button>
        </div>
      </div>
      <div className="snapshot-row">
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Meilenstein benennen, z. B. „Kapitel 3 fertig“" onKeyDown={(e) => e.key === "Enter" && (onSnapshot(message || "Manueller Snapshot"), setMessage(""))} />
        <button className="btn btn-primary compact" type="button" onClick={() => { onSnapshot(message || "Manueller Snapshot"); setMessage(""); }} title="Aktuellen Stand als Version sichern">
          Sichern
        </button>
      </div>
      <div className="panel-scroll">
        {list.length === 0 && <div className="tree-empty">Noch keine Versionen. Änderungen werden automatisch etwa alle 12 Sekunden gesichert.</div>}
        {list.map((item) => {
          const day = dayKey(item.date);
          const showDay = day !== lastDay;
          lastDay = day;
          const isSel = selected === item.id;
          return (
            <div key={item.id}>
              {showDay && <div className="panel-sub">{day}</div>}
              <button type="button" className={`hist-item ${isSel ? "active" : ""} ${item.manual ? "manual" : ""}`} onClick={() => setSelected(isSel ? null : item.id)}>
                <div className="hist-line1">
                  {item.manual && <Icon name="flag" size={12} />}
                  <b>{item.message}</b>
                </div>
                <div className="hist-line2 muted small">
                  {relTime(item.date)}
                  {item.files ? ` · ${item.files} Datei${item.files === 1 ? "" : "en"}` : ""}
                  {item.insertions || item.deletions ? (
                    <span>
                      {" "}
                      <span className="ins">+{item.insertions}</span> <span className="del">−{item.deletions}</span>
                    </span>
                  ) : null}
                </div>
              </button>
              {isSel && (
                <div className="hist-detail">
                  {changes.length === 0 && <div className="muted small">Keine Dateiänderungen in dieser Version.</div>}
                  {changes.map((c) => (
                    <div key={c.path} className="hist-file">
                      <span className={`hist-status s-${c.status}`}>{c.status}</span>
                      <button type="button" className="link-btn" onClick={() => onDiff(item.id, c.path)} title="Unterschied zur aktuellen Datei anzeigen">
                        {c.path}
                      </button>
                      <button className="icon-only" type="button" title="Nur diese Datei auf diesen Stand zurücksetzen" onClick={() => onRestoreFile(item.id, c.path)}>
                        <Icon name="history" size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="row" style={{ marginTop: 8 }}>
                    {activeFile && (
                      <button className="btn btn-ghost compact" type="button" onClick={() => onDiff(item.id, activeFile)}>
                        Diff: aktive Datei
                      </button>
                    )}
                    <div className="grow" />
                    <button className="btn btn-danger compact" type="button" onClick={() => onRestore(item.id)} title="Alle Dateien auf diesen Stand zurücksetzen (der aktuelle Stand wird vorher gesichert)">
                      Alles wiederherstellen
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
