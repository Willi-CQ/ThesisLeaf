import { useEffect, useMemo, useRef, useState } from "react";

function classify(line) {
  if (/^=== /.test(line)) return "sec";
  if (/^!|:\d+: /.test(line) && !/warning/i.test(line)) return "err";
  if (/warning/i.test(line) || /^(Overfull|Underfull)/.test(line)) return "warn";
  if (/^\[ThesisLeaf\]/.test(line)) return "sys";
  if (/^Output written on/.test(line)) return "ok";
  return "";
}

export default function LogPanel({ log, busy, onGoto }) {
  const ref = useRef(null);
  const [follow, setFollow] = useState(true);
  const [onlyImportant, setOnlyImportant] = useState(false);

  const lines = useMemo(() => {
    const all = (log || "").split(/\r?\n/);
    const tail = all.length > 6000 ? all.slice(-6000) : all;
    return tail.map((text, i) => ({ text, cls: classify(text), i }));
  }, [log]);

  const shown = onlyImportant ? lines.filter((l) => l.cls === "err" || l.cls === "warn" || l.cls === "sec" || l.cls === "sys" || l.cls === "ok") : lines;

  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log, follow, onlyImportant]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setFollow(atBottom);
  }

  function click(line) {
    const m = line.match(/^(.+?):(\d+): /);
    if (m && onGoto) onGoto(m[1].replace(/^\.\//, ""), Number(m[2]));
  }

  return (
    <div className="log-wrap">
      <div className="problems-bar">
        <button type="button" className={`chip ${onlyImportant ? "on" : ""}`} onClick={() => setOnlyImportant((v) => !v)}>
          nur Wichtiges
        </button>
        <button type="button" className={`chip ${follow ? "on" : ""}`} onClick={() => setFollow((v) => !v)}>
          mitscrollen
        </button>
        <div className="grow" />
        <span className="muted small">{busy ? "läuft …" : `${lines.length} Zeilen`}</span>
      </div>
      <pre className="log-panel" ref={ref} onScroll={onScroll}>
        {shown.length === 0 && <span className="muted">Noch kein Log. Kompilieren mit Strg+Enter.</span>}
        {shown.map((l) => (
          <div key={l.i} className={`log-line ${l.cls}`} onClick={() => click(l.text)}>
            {l.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
