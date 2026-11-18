import { useMemo } from "react";
import Icon from "./Icons.jsx";

const KIND = {
  todo: { icon: "todo", label: "Todo" },
  figure: { icon: "figure", label: "Abbildung fehlt" },
  note: { icon: "info", label: "Notiz" },
  placeholder: { icon: "wand", label: "Platzhalter" },
};

export default function TodoPanel({ todos, onGoto, onInsertTodo }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of todos || []) {
      if (!map.has(t.file)) map.set(t.file, []);
      map.get(t.file).push(t);
    }
    return [...map.entries()];
  }, [todos]);

  return (
    <>
      <div className="panel-head">
        <span>Aufgaben</span>
        <div className="panel-actions">
          <span className="muted small">{todos?.length || 0} offen</span>
          <button className="icon-only" type="button" title="\\todo{…} an der Cursorposition einfügen" onClick={onInsertTodo}>
            <Icon name="plus" size={15} />
          </button>
        </div>
      </div>
      <div className="panel-scroll">
        {groups.length === 0 && (
          <div className="tree-empty">
            Keine offenen Aufgaben. Notizen im Text mit <code>\todo{"{…}"}</code> oder <code>% TODO …</code> erscheinen hier.
          </div>
        )}
        {groups.map(([file, list]) => (
          <div key={file}>
            <div className="panel-sub">{file}</div>
            {list.map((t, i) => {
              const k = KIND[t.kind] || KIND.todo;
              return (
                <button key={`${file}-${t.line}-${i}`} type="button" className={`todo-row ${t.kind}`} onClick={() => onGoto(file, t.line)} title={`${file}:${t.line} · ${k.label}`}>
                  <Icon name={k.icon} size={14} />
                  <span className="todo-text">{t.text || k.label}</span>
                  <span className="muted small">{t.line}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
