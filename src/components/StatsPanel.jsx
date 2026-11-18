import { useMemo, useState } from "react";
import Icon from "./Icons.jsx";

function fmt(n) {
  return (n || 0).toLocaleString("de-DE");
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function Progress({ value, max, label }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" title={label}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
      <span className="progress-label">{max > 0 ? `${pct} %` : "kein Ziel"}</span>
    </div>
  );
}

function Sparkline({ series }) {
  const points = (series || []).map((d) => d.words);
  const valid = points.filter((v) => typeof v === "number");
  if (valid.length < 2) return <div className="muted small">Verlauf entsteht mit den nächsten Kompilierungen.</div>;
  const w = 240;
  const h = 56;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = Math.max(1, max - min);
  let last = null;
  const coords = points.map((v, i) => {
    if (typeof v === "number") last = v;
    const y = last === null ? null : h - 4 - ((last - min) / range) * (h - 8);
    return [4 + (i / (points.length - 1)) * (w - 8), y];
  });
  const path = coords
    .filter(([, y]) => y !== null)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const deltas = series.map((d) => d.delta || 0);
  const maxDelta = Math.max(1, ...deltas.map(Math.abs));
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h + 22}`} width="100%" preserveAspectRatio="none" aria-label="Wortverlauf der letzten 30 Tage">
      {deltas.map((d, i) => (
        <rect
          key={i}
          x={4 + (i / (points.length - 1)) * (w - 8) - 2}
          y={h + 20 - (Math.abs(d) / maxDelta) * 16}
          width={4}
          height={(Math.abs(d) / maxDelta) * 16}
          className={d >= 0 ? "bar-pos" : "bar-neg"}
        />
      ))}
      <path d={path} className="spark-line" />
    </svg>
  );
}

export default function StatsPanel({ stats, pages, onEditGoals, onGoto, topLevel }) {
  const [showFiles, setShowFiles] = useState(false);
  const total = stats?.total || {};
  const goals = stats?.goals || {};
  const pageCount = pages ?? stats?.pages ?? 0;
  const days = daysUntil(goals.deadline);
  const today = useMemo(() => {
    const s = stats?.daily || [];
    return s.length ? s[s.length - 1].delta || 0 : 0;
  }, [stats]);
  const remainingWords = Math.max(0, (goals.words || 0) - (total.words || 0));
  const perDay = days && days > 0 ? Math.ceil(remainingWords / days) : null;
  const chapters = stats?.chapters || [];
  const maxChapter = Math.max(1, ...chapters.map((c) => c.words));

  if (!stats) {
    return (
      <>
        <div className="panel-head">
          <span>Statistik</span>
        </div>
        <div className="tree-empty">Statistik erscheint nach dem ersten Kompilieren.</div>
      </>
    );
  }

  return (
    <>
      <div className="panel-head">
        <span>Statistik</span>
        <div className="panel-actions">
          <button className="icon-only" type="button" title="Ziele bearbeiten" onClick={onEditGoals}>
            <Icon name="target" size={15} />
          </button>
        </div>
      </div>
      <div className="panel-scroll stats">
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-value">{fmt(total.words)}</div>
            <div className="stat-label">Wörter{goals.words ? ` von ${fmt(goals.words)}` : ""}</div>
            <Progress value={total.words} max={goals.words} label="Fortschritt Wörter" />
          </div>
          <div className="stat-tile">
            <div className="stat-value">{pageCount || "–"}</div>
            <div className="stat-label">Seiten{goals.pages ? ` von ${goals.pages}` : ""}</div>
            <Progress value={pageCount} max={goals.pages} label="Fortschritt Seiten" />
          </div>
          <div className="stat-tile">
            <div className={`stat-value ${today > 0 ? "pos" : ""}`}>{today >= 0 ? `+${fmt(today)}` : fmt(today)}</div>
            <div className="stat-label">Wörter heute</div>
          </div>
          <div className="stat-tile">
            <div className={`stat-value ${days !== null && days < 7 ? "warn" : ""}`}>{days === null ? "–" : days}</div>
            <div className="stat-label">{days === null ? "kein Abgabedatum" : days < 0 ? "Tage überfällig" : "Tage bis Abgabe"}</div>
            {perDay !== null && perDay > 0 && <div className="muted small">≈ {fmt(perDay)} Wörter/Tag nötig</div>}
          </div>
        </div>

        <div className="panel-sub">Verlauf (30 Tage)</div>
        <Sparkline series={stats.daily} />

        <div className="panel-sub">{(topLevel || stats.topLevel) === "section" ? "Abschnitte (\\section)" : "Kapitel"}</div>
        {chapters.length === 0 && <div className="muted small">Noch keine Kapitelüberschriften.</div>}
        {chapters.map((c, i) => (
          <button key={i} type="button" className="chapter-row" onClick={() => onGoto?.(c.file)} title={c.file}>
            <span className="chapter-title">{c.title}</span>
            <span className="chapter-bar">
              <span style={{ width: `${Math.round((c.words / maxChapter) * 100)}%` }} />
            </span>
            <span className="chapter-words">{fmt(c.words)}</span>
          </button>
        ))}

        <div className="panel-sub">Elemente</div>
        <div className="kv">
          <span>Abbildungen</span>
          <b>{fmt(total.figures)}</b>
          <span>Tabellen</span>
          <b>{fmt(total.tables)}</b>
          <span>Gleichungen</span>
          <b>{fmt(total.mathDisplay)}</b>
          <span>Listings</span>
          <b>{fmt(total.listings)}</b>
          <span>Zitate (Stellen)</span>
          <b>{fmt(total.citations)}</b>
          <span>Quellen zitiert</span>
          <b>{fmt(total.uniqueCitations)}</b>
          <span>Verweise</span>
          <b>{fmt(total.refs)}</b>
          <span>Fußnoten</span>
          <b>{fmt(total.footnotes)}</b>
          <span>Überschriften</span>
          <b>{fmt(total.headers)}</b>
          <span>Offene Todos</span>
          <b>{fmt(total.todos)}</b>
          <span>Zeichen (ohne Leerz.)</span>
          <b>{fmt(total.characters)}</b>
        </div>

        <button type="button" className="link-btn" onClick={() => setShowFiles((v) => !v)}>
          {showFiles ? "Dateien ausblenden" : `Wörter je Datei (${(stats.files || []).length})`}
        </button>
        {showFiles && (
          <div className="kv files">
            {(stats.files || []).map((f) => (
              <button key={f.file} type="button" className="kv-row" onClick={() => onGoto?.(f.file)}>
                <span>{f.file}</span>
                <b>{fmt(f.words)}</b>
              </button>
            ))}
          </div>
        )}
        <div className="muted small" style={{ marginTop: 10 }}>
          Zählung ähnlich texcount: Fließtext inkl. Fußnoten, ohne Befehle, Mathematik, Listings und Beschriftungen.
        </div>
      </div>
    </>
  );
}
