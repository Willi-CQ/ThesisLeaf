import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import Dialog from "./Dialog.jsx";
import { api } from "../api.js";
import { languageForPath } from "../util.js";
import { resolveTheme } from "../settings.js";
import { relTime } from "./HistoryPanel.jsx";

export default function DiffDialog({ id, path, item, ui, onClose, onRestoreFile }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .historyDiff(id, path)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, path]);

  const same = data && data.old === data.current;

  return (
    <Dialog
      title={`Vergleich: ${path}`}
      subtitle={item ? `Links: Version „${item.message}“ (${relTime(item.date)}) · Rechts: aktueller Stand auf der Festplatte` : `Links: Version ${id.slice(0, 7)} · Rechts: aktuell`}
      onClose={onClose}
      width={1100}
      className="diff-dialog"
      autoFocus={false}
      actions={
        <>
          {same && <span className="muted">Kein Unterschied.</span>}
          <div className="grow" />
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Schließen
          </button>
          <button className="btn btn-danger" type="button" disabled={!data || same || !data.existedBefore} onClick={() => onRestoreFile(id, path)}>
            Datei auf diesen Stand setzen
          </button>
        </>
      }
    >
      {error && <div className="error">{error}</div>}
      {!data && !error && <div className="muted">Lade …</div>}
      {data && (
        <div className="diff-wrap">
          <DiffEditor
            original={data.existedBefore ? data.old : ""}
            modified={data.existsNow ? data.current : ""}
            language={languageForPath(path)}
            theme={resolveTheme(ui.theme) === "dark" ? "thesisleaf-dark" : "thesisleaf-light"}
            options={{ readOnly: true, renderSideBySide: true, fontSize: ui.fontSize, minimap: { enabled: false }, wordWrap: "on", automaticLayout: true, scrollBeyondLastLine: false }}
          />
        </div>
      )}
    </Dialog>
  );
}
