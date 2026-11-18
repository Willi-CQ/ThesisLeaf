import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { toolPath, detectLatex } from "./latex.js";
import { normalizeFile } from "./logparser.js";
import { stripComment } from "./files.js";

const execFileAsync = promisify(execFile);

/** Standardmäßig unterdrückte chktex-Warnungen (zu geschwätzig für Fließtext). */
const DEFAULT_SUPPRESS = [1, 3, 13, 24, 26, 36, 44, 46];

const EXPLAIN = {
  2: "Nicht abbrechende Leerzeichen (~) vor Verweisen verwenden",
  8: "Gedankenstrich: -- für Bereiche, --- als Gedankenstrich",
  9: "Klammer nicht geschlossen",
  10: "Klammer ohne Öffnung",
  11: "Ellipse: \\dots statt ... verwenden",
  12: "Zwischenraum: nach Abkürzung \\ (Backslash + Leerzeichen)",
  17: "Anführungszeichen: \\enquote{…} oder „…“ verwenden",
  18: "Anführungszeichen: `` und '' statt \" verwenden",
  19: "Zeichen könnte durch ein Satzzeichen ersetzt werden",
  21: "Doppelte Leerzeichen",
  29: "Zahlen: \\, als Tausendertrennzeichen",
  32: "Falsche Anführungszeichen (Apostroph statt Backtick)",
  38: "Zitat nach Satzzeichen platzieren",
  39: "Doppeltes Leerzeichen",
  45: "Leerzeile in Mathematikumgebung",
};

export async function runChktex(root, files, { suppress = DEFAULT_SUPPRESS, mainDir = null } = {}) {
  const tools = detectLatex();
  if (!tools.chktex) return { available: false, items: [] };
  const list = (files || []).filter((f) => {
    try {
      return fs.existsSync(path.resolve(root, f));
    } catch {
      return false;
    }
  });
  if (!list.length) return { available: true, items: [] };
  const args = ["-q", "-f", "%f:%l:%c:%n:%m\n", ...suppress.map((n) => `-n${n}`), ...list];
  let stdout = "";
  try {
    const res = await execFileAsync(toolPath("chktex"), args, {
      cwd: root,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30000,
      env: { ...process.env, CHKTEXRC: process.env.CHKTEXRC || "" },
    });
    stdout = res.stdout || "";
  } catch (err) {
    stdout = err.stdout || "";
    if (!stdout && err.code === "ENOENT") return { available: false, items: [] };
  }
  const items = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(.+?):(\d+):(\d+):(\d+):(.*)$/);
    if (!m) continue;
    const code = Number(m[4]);
    items.push({
      severity: "hint",
      kind: "chktex",
      code,
      file: normalizeFile(m[1], root),
      line: Number(m[2]),
      column: Number(m[3]),
      message: EXPLAIN[code] ? `${EXPLAIN[code]} (chktex ${code})` : `${m[5].trim()} (chktex ${code})`,
      original: m[5].trim(),
    });
  }
  return { available: true, items };
}

const FILLERS_DE = /\b(sehr|extrem|unglaublich|natürlich|offensichtlich|selbstverständlich|eigentlich|irgendwie|ziemlich|relativ|quasi)\b/i;
const FILLERS_EN = /\b(very|really|quite|extremely|obviously|clearly|of course|basically|actually|literally|incredibly|somewhat|pretty much)\b/i;
const CONTRACTIONS_EN = /\b(don't|doesn't|didn't|can't|cannot't|won't|isn't|aren't|wasn't|weren't|it's|that's|there's|we're|they're|i'm|you're|hasn't|haven't|shouldn't|wouldn't|couldn't|let's)\b/i;
const ABBREV_DE = /\b(?:Abb|Tab|Kap|Abschn|Gl|S|Nr|z\.B|bzw|vgl|ca|u\.a|etc|d\.h|sog|evtl|ggf|max|min)\.\s+\S/;
const ABBREV_EN = /\b(?:e\.g|i\.e|cf|Fig|Tab|Sec|Eq|et al|vs|approx)\.\s+[a-z]/;

/**
 * Eigene, schnelle Prüfungen ohne externes Werkzeug – sprachabhängig (de/en) und mit
 * Projektwissen (Labels, Literaturschlüssel, Abkürzungen) aus `meta`.
 */
export function quickChecks(root, files, { meta = null, doc = null } = {}) {
  const items = [];
  const lang = doc?.language || "de";
  const cleveref = Boolean(doc?.cleveref);
  const labelKeys = new Set((meta?.labels || []).map((l) => l.key));
  const labelCount = new Map();
  for (const l of meta?.labels || []) labelCount.set(l.key, (labelCount.get(l.key) || 0) + 1);
  const refKeys = new Set((meta?.refs || []).map((r) => r.key));
  const citeKeys = new Set((meta?.citations || []).map((c) => c.key));
  const acKeys = new Set((meta?.acronyms || []).map((a) => a.key));
  const acFiles = new Set((meta?.acronyms || []).map((a) => a.file));
  const rawAcronymRe = acKeys.size
    ? new RegExp(`(^|[^\\w\\\\{])(${[...acKeys].filter((k) => k.length >= 3 && /^[A-Z][A-Za-z0-9]*$/.test(k)).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\w}])`, "g")
    : null;

  for (const rel of files || []) {
    let text;
    try {
      text = fs.readFileSync(path.resolve(root, rel), "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    const isPreamble = /\\documentclass|\\usepackage/.test(text) && !/\\begin\{document\}/.test(text) && !/\\(chapter|section)\{/.test(text);
    const isDeclaration = /erkl(ae|ä)rung|declaration|front\.tex/i.test(rel) || /Eidesstattliche|Eigenständigkeitserklärung|Declaration of/i.test(text);
    const isAcronymFile = acFiles.has(rel);
    if (isPreamble) continue;

    lines.forEach((raw, i) => {
      const line = stripComment(raw);
      if (!line.trim()) return;
      const n = i + 1;
      const push = (message, kind = "style", severity = "hint", extra = {}) => items.push({ severity, kind, file: rel, line: n, message, ...extra });

      // ---------- Struktur & Verweise (Projektwissen) ----------
      for (const m of line.matchAll(/\\(?:ref|eqref|cref|Cref|autoref|nameref|pageref|vref)\*?\s*\{([^}]+)\}/g)) {
        for (const k of m[1].split(",")) {
          const key = k.trim();
          if (key && labelKeys.size && !labelKeys.has(key)) push(`Verweis auf unbekanntes Label „${key}“`, "undefined-ref", "warning", { column: m.index + 1, key });
        }
      }
      for (const m of line.matchAll(/\\(?:cite\w*|parencite|textcite|autocite|footcite|fullcite)\*?\s*(?:\[[^\]]*\]\s*)*\{([^}]+)\}/g)) {
        for (const k of m[1].split(",")) {
          const key = k.trim();
          if (key && !citeKeys.has(key)) push(`Literaturschlüssel „${key}“ fehlt in der .bib-Datei`, "undefined-cite", "warning", { column: m.index + 1, key });
        }
      }
      for (const m of line.matchAll(/\\label\s*\{([^}]+)\}/g)) {
        const key = m[1].trim();
        if ((labelCount.get(key) || 0) > 1) push(`Label „${key}“ ist mehrfach definiert`, "multiply-defined", "warning", { column: m.index + 1, key });
        else if (/^(fig|tab|lst|eq|alg|sec|cha|chap):/i.test(key) && refKeys.size && !refKeys.has(key)) {
          push(`Label „${key}“ wird nirgends referenziert`, "unreferenced", "info", { column: m.index + 1, key });
        }
      }
      if (acKeys.size && !isAcronymFile) {
        for (const m of line.matchAll(/\\(?:ac|acs|acl|acf|acp|acsp|aclp|acfp|Ac|Acp)\*?\s*\{([^}]+)\}/g)) {
          const key = m[1].trim();
          if (!acKeys.has(key)) push(`Abkürzung „${key}“ ist nicht in der Abkürzungsliste definiert`, "undefined-acro", "warning", { column: m.index + 1, key });
        }
        if (rawAcronymRe && !/\\(?:ac|acs|acl|acf|acp|Ac)\*?\s*\{/.test(line) && !/\\label|\\ref|\\cite|\\cref|\\input|\\section|\\chapter|\\subsection/.test(line)) {
          rawAcronymRe.lastIndex = 0;
          let mm;
          while ((mm = rawAcronymRe.exec(line))) {
            push(`„${mm[2]}“ ohne \\ac{${mm[2]}} geschrieben – die Abkürzung wird beim ersten Vorkommen nicht ausgeschrieben`, "raw-acronym", "hint", { column: mm.index + mm[1].length + 1, key: mm[2] });
          }
        }
      }

      if (isDeclaration) return;

      // ---------- Stil ----------
      if (lang === "de") {
        if (ABBREV_DE.test(line) && !/\\\s|~|\\,/.test(line)) push("Nach einer Abkürzung mit Punkt geschütztes Leerzeichen (~ oder \\ ) setzen, sonst entsteht ein Satzendeabstand");
        if (/(Abbildung|Tabelle|Kapitel|Abschnitt|Gleichung|Listing)\s+\\(?:auto)?ref\{/.test(line)) push("Zwischen „Abbildung“ und \\ref ein ~ setzen (Abbildung~\\ref{…}), damit kein Zeilenumbruch entsteht");
        if (/\b(Abbildung|Tabelle|Kapitel|Abschnitt|Listing)\s+\d+(\.\d+)?\b/.test(line)) push("Manuelle Nummer statt Verweis – \\ref{…} verwenden, damit die Nummer bei Änderungen stimmt", "structure");
        if (/\b(ich|wir|unser\w*|mein\w*)\b/i.test(line)) push("Ich-/Wir-Form gefunden – in der Arbeit meist unpersönlich formulieren (je nach Vorgabe der Hochschule)");
        if (FILLERS_DE.test(line)) push("Füllwort/Verstärker – wissenschaftlich neutraler formulieren");
        if (/"[^"\\]+"/.test(line) && !/\\enquote|\\"|literate|\\verb|lstinline/.test(line)) push("Gerade Anführungszeichen gefunden – \\enquote{…} (csquotes) verwenden");
      } else {
        if (ABBREV_EN.test(line) && !/\\\s|~|\\,/.test(line)) push("After an abbreviation ending in a period use a non-breaking or normal space (e.g.\\ or e.g.,) to avoid sentence spacing");
        if (/\b(Figure|Table|Section|Chapter|Equation|Listing|Algorithm)~?\s*\\(?:auto)?ref\{/.test(line)) {
          push(cleveref ? "Mit cleveref reicht \\cref{…} – das Wort „Figure/Table“ wird automatisch eingefügt" : "Between “Figure” and \\ref use ~ (Figure~\\ref{…}) to prevent a line break");
        }
        if (/\b(Figure|Table|Section|Chapter|Listing)\s+\d+(\.\d+)?\b/.test(line)) push("Manual number instead of a reference – use \\cref/\\ref so numbers stay correct", "structure");
        if (CONTRACTIONS_EN.test(line)) push("Contraction found – write the full form in academic prose (do not, it is …)");
        if (FILLERS_EN.test(line)) push("Filler/intensifier – phrase more neutrally");
        if (/(^|\s)"[^"\\]+"/.test(line) && !/\\enquote|literate|\\verb|lstinline/.test(line)) push("Straight quotes – use ``…'' or \\enquote{…}");
        if (/\bI\s+(have|will|show|present|use|propose|argue|implement|evaluate|conclude)\b/.test(line)) push("First person singular – many advisors prefer “we” or impersonal phrasing (check the guidelines)");
        if (/\b(a lot of|lots of|kind of|sort of|thing|things|stuff)\b/i.test(line)) push("Colloquial phrase – prefer precise academic wording");
      }
      if (/\\\\\s*$/.test(line) && /^\s*\\\\/.test(lines[i + 1] || "")) push("Doppelter Zeilenumbruch mit \\\\ – besser Absatz durch Leerzeile");
      if (/\\(?:section|subsection|chapter)\*?\{[^}]*\}\s*$/.test(line)) {
        let j = i + 1;
        while (j < lines.length && (/^\s*$/.test(lines[j]) || /^\s*\\label\{/.test(lines[j]) || /^\s*%/.test(lines[j]))) j += 1;
        if (/^\s*\\(?:section|subsection|subsubsection|chapter)\*?\{/.test(lines[j] || "")) push("Zwei Überschriften direkt hintereinander – ein einleitender Satz zwischen den Ebenen wird empfohlen", "structure");
      }
      if (/\\(?:section|subsection|chapter)\*?\{[^}]*\}\s*$/.test(line) && !/^\s*\\label\{/.test(lines[i + 1] || "") && !/\\label/.test(line) && !/\*\{/.test(line)) {
        push("Überschrift ohne \\label – für Verweise ein Label direkt darunter setzen", "structure", "info");
      }
    });
  }
  return items;
}
