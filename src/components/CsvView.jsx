import { useEffect, useMemo, useState } from "react";
import Icon from "./Icons.jsx";
import { api } from "../api.js";
import { baseName } from "../util.js";

function escapeLatex(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function isNumeric(v) {
  return /^-?\d+([.,]\d+)?(e-?\d+)?$/i.test(String(v).trim());
}

/** Baut aus Kopf + Zeilen eine booktabs-Tabelle (optional als tabularx). */
export function csvToLatex({ header, rows, columns, caption, label, decimals, decimalComma, maxRows, wide }) {
  const cols = columns.filter((c) => c.on);
  const idx = cols.map((c) => header.indexOf(c.name));
  const align = cols.map((c) => (c.numeric ? "r" : "l")).join("");
  const fmt = (v, numeric) => {
    if (numeric && isNumeric(v)) {
      let n = Number(String(v).replace(",", "."));
      let s = decimals === "" || decimals === null ? String(v).trim() : n.toFixed(Number(decimals));
      if (decimalComma) s = s.replace(".", "{,}");
      return s;
    }
    return escapeLatex(v);
  };
  const body = rows
    .slice(0, maxRows || rows.length)
    .map((r) => idx.map((i, k) => fmt(r[i] ?? "", cols[k].numeric)).join(" & ") + " \\\\")
    .join("\n    ");
  const head = cols.map((c) => `\\textbf{${escapeLatex(c.label || c.name)}}`).join(" & ");
  const env = wide ? `tabularx}{\\textwidth}{${cols.map((c) => (c.numeric ? "r" : "X")).join("")}` : `tabular}{${align}`;
  const envEnd = wide ? "tabularx" : "tabular";
  return [
    "\\begin{table}[htbp]",
    "  \\centering",
    `  \\caption{${caption || "Beschriftung"}}`,
    `  \\label{tab:${label || "kurzname"}}`,
    `  \\begin{${env}}`,
    "    \\toprule",
    `    ${head} \\\\`,
    "    \\midrule",
    `    ${body}`,
    "    \\bottomrule",
    `  \\end{${envEnd}}`,
    "\\end{table}",
    "",
  ].join("\n");
}

export default function CsvView({ path, onInsert, canInsert }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState(null);
  const [columns, setColumns] = useState([]);
  const [caption, setCaption] = useState("");
  const [label, setLabel] = useState("");
  const [decimals, setDecimals] = useState("");
  const [decimalComma, setDecimalComma] = useState(false);
  const [maxRows, setMaxRows] = useState(30);
  const [wide, setWide] = useState(false);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    api
      .csv(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setColumns(
          d.header.map((name, i) => ({
            name,
            label: name,
            on: true,
            numeric: d.rows.slice(0, 50).filter((r) => r[i] !== undefined && r[i] !== "").every((r) => isNumeric(r[i])) && d.rows.some((r) => r[i] !== ""),
          })),
        );
        setLabel(baseName(path).replace(/\.(csv|tsv)$/i, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase());
        setCaption(baseName(path).replace(/\.(csv|tsv)$/i, "").replace(/[_-]+/g, " "));
        setMaxRows(Math.min(30, d.rows.length));
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (!sort) return data.rows;
    const i = sort.index;
    const num = columns[i]?.numeric;
    return [...data.rows].sort((a, b) => {
      const x = a[i] ?? "";
      const y = b[i] ?? "";
      const cmp = num ? Number(String(x).replace(",", ".")) - Number(String(y).replace(",", ".")) : String(x).localeCompare(String(y), "de", { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, sort, columns]);

  if (error) return <div className="preview-file">{error}</div>;
  if (!data) return <div className="preview-file muted">Lade Tabelle …</div>;

  const latex = () => csvToLatex({ header: data.header, rows, columns, caption, label, decimals, decimalComma, maxRows, wide });

  return (
    <div className="csv-view">
      <div className="csv-bar">
        <span className="muted small">
          {data.total.toLocaleString("de-DE")} Zeilen · {data.header.length} Spalten · Trennzeichen „{data.separator === "\t" ? "Tab" : data.separator}“{data.truncated ? " · Anzeige gekürzt" : ""}
        </span>
        <div className="grow" />
        <button className={`btn btn-ghost compact ${showExport ? "active" : ""}`} type="button" onClick={() => setShowExport((v) => !v)}>
          <Icon name="table" size={14} /> Als LaTeX-Tabelle
        </button>
      </div>
      {showExport && (
        <div className="csv-export">
          <div className="form-grid">
            <label>
              <span>Beschriftung (caption)</span>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
            <label>
              <span>Label (tab:…)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label>
              <span>Zeilen (max.)</span>
              <input type="number" min={1} max={rows.length} value={maxRows} onChange={(e) => setMaxRows(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label>
              <span>Nachkommastellen (leer = wie in der Datei)</span>
              <input type="number" min={0} max={6} value={decimals} onChange={(e) => setDecimals(e.target.value)} placeholder="z. B. 2" />
            </label>
            <label className="check">
              <input type="checkbox" checked={decimalComma} onChange={(e) => setDecimalComma(e.target.checked)} /> Dezimalkomma ({"{,}"})
            </label>
            <label className="check">
              <input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} /> Volle Textbreite (tabularx)
            </label>
          </div>
          <div className="csv-cols">
            {columns.map((c, i) => (
              <label key={c.name} className={`chip ${c.on ? "on" : ""}`} title="Spalte ein-/ausblenden">
                <input type="checkbox" checked={c.on} onChange={(e) => setColumns(columns.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} style={{ display: "none" }} />
                {c.name}
                {c.numeric ? " #" : ""}
              </label>
            ))}
          </div>
          <div className="row">
            <button className="btn btn-primary compact" type="button" disabled={!canInsert} title={canInsert ? "" : "Zuerst eine .tex-Datei im Editor öffnen"} onClick={() => onInsert(latex())}>
              In die aktive .tex-Datei einfügen
            </button>
            <button className="btn btn-ghost compact" type="button" onClick={() => navigator.clipboard?.writeText(latex())}>
              LaTeX kopieren
            </button>
          </div>
        </div>
      )}
      <div className="csv-scroll">
        <table className="csv-table">
          <thead>
            <tr>
              <th className="rownum">#</th>
              {data.header.map((h, i) => (
                <th key={i} onClick={() => setSort((s) => (s && s.index === i ? (s.dir === "asc" ? { index: i, dir: "desc" } : null) : { index: i, dir: "asc" }))} className={columns[i]?.numeric ? "num" : ""}>
                  {h} {sort?.index === i ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 2000).map((r, ri) => (
              <tr key={ri}>
                <td className="rownum">{ri + 1}</td>
                {data.header.map((_, ci) => (
                  <td key={ci} className={columns[ci]?.numeric ? "num" : ""}>
                    {r[ci]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 2000 && <div className="muted small" style={{ padding: 8 }}>Nur die ersten 2000 Zeilen werden angezeigt.</div>}
      </div>
    </div>
  );
}
