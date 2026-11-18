import path from "path";

const FILE_TOKEN = /^([^\s()]+)/;
const FILE_LIKE = /\.(tex|ltx|sty|cls|clo|def|cfg|fd|bbx|cbx|lbx|dfu|ldf|bib|aux|toc|out|bbl|lof|lot|enc|map|tfm|vf|pfb|otf|ttf|lua|tex\d*)$/i;

function joinWrappedLines(raw) {
  const lines = raw.split(/\r?\n/);
  const out = [];
  let buf = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    buf += line;
    const next = lines[i + 1];
    if (line.length === 79 && next !== undefined && !/^(!|l\.\d+|\s*$)/.test(next)) continue;
    out.push(buf);
    buf = "";
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Log-Pfad → projektrelativer Posix-Pfad. Relative Pfade beziehen sich auf das
 * Arbeitsverzeichnis der Engine (`cwdRel`, z. B. "thesis"), absolute auf den Projektordner.
 */
function normalizeFile(file, root, cwdRel = "") {
  if (!file) return null;
  let f = String(file).replace(/\\/g, "/").replace(/^"+|"+$/g, "");
  const r = String(root || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const isAbsolute = /^([A-Za-z]:)?\//.test(f);
  if (r && f.toLowerCase().startsWith(r.toLowerCase())) {
    f = f.slice(r.length).replace(/^\/+/, "");
  } else if (!isAbsolute) {
    f = f.replace(/^\.\//, "");
    if (cwdRel) {
      const parts = `${cwdRel}/${f}`.split("/");
      const out = [];
      for (const p of parts) {
        if (p === "..") out.pop();
        else if (p && p !== ".") out.push(p);
      }
      f = out.join("/");
    }
  }
  return f.replace(/^\/+/, "");
}

/**
 * Wertet ein LaTeX-Log aus: Fehler, Warnungen, Boxen, Seiten und Signale
 * für erneute Läufe. Alle Positionen sind relativ zum Projektordner.
 */
export function parseLatexLog(rawLog, { root, mainFile, cwd } = {}) {
  const lines = joinWrappedLines(rawLog || "");
  const cwdRel = cwd ? path.relative(path.resolve(root || ""), path.resolve(cwd)).split(path.sep).join("/") : "";
  const norm = (file) => normalizeFile(file, root, cwdRel);
  const diagnostics = [];
  const stack = [];
  const seen = new Set();
  let pages = 0;
  let needsRerun = false;
  let needsBib = false;
  let pendingError = null;
  const undefinedRefs = new Set();
  const undefinedCites = new Set();
  const multiplyDefined = new Set();
  let overfull = 0;
  let underfull = 0;

  const currentTex = () => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i] && /\.(tex|ltx)$/i.test(stack[i])) return stack[i];
    }
    return mainFile ? String(mainFile).replace(/\\/g, "/") : null;
  };

  const push = (d) => {
    const key = `${d.severity}|${d.file}|${d.line}|${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(d);
  };

  const finishPending = () => {
    if (pendingError) {
      push(pendingError);
      pendingError = null;
    }
  };

  for (const line of lines) {
    // Dateistapel aktualisieren
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "(") {
        const m = line.slice(i + 1).match(FILE_TOKEN);
        if (m && (FILE_LIKE.test(m[1]) || /^(\.{1,2}\/|[A-Za-z]:\/)/.test(m[1]))) {
          stack.push(norm(m[1]));
          i += m[1].length;
        } else {
          stack.push(null);
        }
      } else if (ch === ")") {
        if (stack.length) stack.pop();
      }
    }

    // Fehler im Format Datei:Zeile: Meldung (-file-line-error)
    let m = line.match(/^(.+?):(\d+): (.+)$/);
    if (m && !/^\(/.test(m[3]) && !/warning/i.test(m[3]) && !/^\s*$/.test(m[3])) {
      finishPending();
      push({ severity: "error", kind: "error", file: norm(m[1]), line: Number(m[2]), message: m[3].trim() });
      continue;
    }

    // Klassische Fehler: "! ..." gefolgt von "l.NN"
    m = line.match(/^! (.+)$/);
    if (m) {
      finishPending();
      pendingError = { severity: "error", kind: "error", file: currentTex(), line: null, message: m[1].trim() };
      if (/Emergency stop/i.test(m[1]) || /==> Fatal error/i.test(m[1])) {
        pendingError.kind = "fatal";
      }
      continue;
    }
    if (pendingError) {
      const lm = line.match(/^l\.(\d+)\s?(.*)$/);
      if (lm) {
        pendingError.line = Number(lm[1]);
        if (lm[2] && lm[2].trim()) pendingError.context = lm[2].trim();
        finishPending();
        continue;
      }
      if (/^\s*$/.test(line)) {
        finishPending();
        continue;
      }
      if (/^(See the|Type  H|Type <return>|\s*\.\.\.)/.test(line) || /^[^\s].*$/.test(line) === false) continue;
    }

    m = line.match(/LaTeX Warning: Reference `([^']+)' on page \d+ undefined on input line (\d+)/);
    if (m) {
      undefinedRefs.add(m[1]);
      push({ severity: "warning", kind: "undefined-ref", key: m[1], file: currentTex(), line: Number(m[2]), message: `Verweis \\ref{${m[1]}} ist nicht definiert` });
      continue;
    }
    m = line.match(/LaTeX Warning: Citation `([^']+)' on page \d+ undefined on input line (\d+)/) || line.match(/Package biblatex Warning: Citation '([^']+)' on page \d+ undefined on input line (\d+)/);
    if (m) {
      undefinedCites.add(m[1]);
      needsBib = true;
      push({ severity: "warning", kind: "undefined-cite", key: m[1], file: currentTex(), line: Number(m[2]), message: `Literaturschlüssel „${m[1]}“ ist nicht definiert` });
      continue;
    }
    m = line.match(/LaTeX Warning: Label `([^']+)' multiply defined/);
    if (m) {
      multiplyDefined.add(m[1]);
      push({ severity: "warning", kind: "multiply-defined", key: m[1], file: currentTex(), line: null, message: `Label „${m[1]}“ ist mehrfach definiert` });
      continue;
    }
    if (/LaTeX Warning: There were undefined references/.test(line)) continue;
    if (/LaTeX Warning: There were multiply-defined labels/.test(line)) continue;
    if (/Label\(s\) may have changed\. Rerun/.test(line) || /Rerun to get (cross-references|outlines|the bars|citations)/i.test(line) || /rerun LaTeX/i.test(line)) {
      needsRerun = true;
      continue;
    }
    if (/Please \(re\)run (Biber|BibTeX)/i.test(line) || /run BibTeX on the file/i.test(line)) {
      needsBib = true;
      continue;
    }
    m = line.match(/^No file (.+?)\.(bbl|toc|aux|lof|lot|ind|gls)\.?$/);
    if (m) {
      if (m[2] === "bbl") needsBib = true;
      push({ severity: "info", kind: "missing-aux", file: null, line: null, message: `Hilfsdatei ${m[1]}.${m[2]} fehlt noch (erneuter Lauf)` });
      continue;
    }
    m = line.match(/^(Overfull|Underfull) \\([hv])box \((.+?)\) (?:in paragraph|in alignment|detected|has occurred)(?: at lines? (\d+)(?:--(\d+))?)?/);
    if (m) {
      if (m[1] === "Overfull") overfull += 1;
      else underfull += 1;
      push({
        severity: "info",
        kind: m[1] === "Overfull" ? "overfull" : "underfull",
        file: currentTex(),
        line: m[4] ? Number(m[4]) : null,
        endLine: m[5] ? Number(m[5]) : null,
        message: `${m[1]} \\${m[2]}box (${m[3]})`,
      });
      continue;
    }
    m = line.match(/^Package (\w+) Warning: (.+?)(?: on input line (\d+))?\.?$/);
    if (m) {
      push({ severity: "warning", kind: "package", package: m[1], file: currentTex(), line: m[3] ? Number(m[3]) : null, message: `${m[1]}: ${m[2].trim()}` });
      continue;
    }
    m = line.match(/^Class (\w+) Warning: (.+?)(?: on input line (\d+))?\.?$/);
    if (m) {
      push({ severity: "warning", kind: "class", file: currentTex(), line: m[3] ? Number(m[3]) : null, message: `${m[1]}: ${m[2].trim()}` });
      continue;
    }
    m = line.match(/^LaTeX Warning: (.+?)(?: on input line (\d+))?\.?$/);
    if (m) {
      push({ severity: "warning", kind: "latex", file: currentTex(), line: m[2] ? Number(m[2]) : null, message: m[1].trim() });
      continue;
    }
    m = line.match(/^LaTeX Font Warning: (.+?)(?: on input line (\d+))?\.?$/);
    if (m) {
      push({ severity: "info", kind: "font", file: currentTex(), line: m[2] ? Number(m[2]) : null, message: `Schrift: ${m[1].trim()}` });
      continue;
    }
    m = line.match(/Output written on .*?\((\d+) pages?/);
    if (m) {
      pages = Number(m[1]);
      continue;
    }
    if (/^No pages of output/.test(line)) {
      pages = 0;
    }
  }
  finishPending();

  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const infos = diagnostics.filter((d) => d.severity === "info");

  return {
    diagnostics,
    errors,
    warnings,
    infos,
    pages,
    needsRerun,
    needsBib,
    undefinedRefs: [...undefinedRefs],
    undefinedCites: [...undefinedCites],
    multiplyDefined: [...multiplyDefined],
    overfull,
    underfull,
  };
}

/** Warnungen aus Biber/BibTeX-Ausgaben (fehlende Einträge, Feldfehler). */
export function parseBibLog(raw) {
  const out = [];
  for (const line of (raw || "").split(/\r?\n/)) {
    let m = line.match(/WARN - (.+)$/);
    if (m) {
      out.push({ severity: "warning", kind: "bib", file: null, line: null, message: `Biber: ${m[1].trim()}` });
      continue;
    }
    m = line.match(/ERROR - (.+)$/);
    if (m) {
      out.push({ severity: "error", kind: "bib", file: null, line: null, message: `Biber: ${m[1].trim()}` });
      continue;
    }
    m = line.match(/^Warning--(.+)$/);
    if (m) {
      out.push({ severity: "warning", kind: "bib", file: null, line: null, message: `BibTeX: ${m[1].trim()}` });
      continue;
    }
    m = line.match(/^I couldn't open (database|style) file (.+)$/);
    if (m) {
      out.push({ severity: "error", kind: "bib", file: null, line: null, message: `BibTeX: ${m[1]}-Datei ${m[2]} nicht gefunden` });
    }
  }
  return out;
}

export function relativeToRoot(file, root) {
  return normalizeFile(file, root);
}

export { normalizeFile };
export const _internal = { joinWrappedLines, path };
