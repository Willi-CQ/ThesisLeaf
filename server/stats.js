import fs from "fs";
import path from "path";
import { safeResolve, stripComment, readBraced, includeOrder } from "./files.js";
import { logPathFor } from "./compile.js";

const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

const VERBATIM_ENVS = ["verbatim", "Verbatim", "lstlisting", "minted", "listing", "tikzpicture", "pgfpicture", "filecontents", "filecontents*", "comment", "algorithmic", "algorithm2e"];
const MATH_ENVS = ["equation", "align", "gather", "multline", "eqnarray", "displaymath", "flalign", "alignat", "math", "subequations", "split", "cases", "matrix", "pmatrix", "bmatrix"];
const DROP_WITH_ARGS = [
  "cite", "citep", "citet", "citeauthor", "citeyear", "parencite", "textcite", "autocite", "footcite", "fullcite", "nocite", "supercite",
  "ref", "eqref", "cref", "Cref", "autoref", "nameref", "pageref", "vref", "label", "includegraphics", "input", "include", "subfile",
  "usepackage", "documentclass", "bibliography", "bibliographystyle", "addbibresource", "printbibliography", "newcommand", "renewcommand",
  "providecommand", "setlength", "vspace", "hspace", "geometry", "hypersetup", "pagestyle", "thispagestyle", "pagenumbering",
  "addcontentsline", "url", "todo", "ac", "acs", "acl", "acf", "acp", "acsp", "aclp", "acfp", "Ac", "gls", "Gls", "glspl", "Glspl",
  "lstinputlisting", "lstset", "graphicspath", "acro", "acrodef", "newacronym", "index", "glossary", "setcounter", "addtocounter",
  "definecolor", "color", "textcolor", "missingfigure", "listoftodos", "captionsetup", "DeclareAcronym", "newglossaryentry",
  "makeatletter", "makeatother", "bibitem", "PassOptionsToPackage", "RequirePackage", "selectlanguage", "foreignlanguage", "date",
  "titlehead", "subject", "publishers", "dedication", "KOMAoptions", "setkomafont", "addtokomafont", "ifpdf", "pdfbookmark",
];
const KEEP_LAST_ARG = ["href", "texorpdfstring", "hyperref"];

function removeEnv(text, env, counter) {
  const esc = env.replace(/[*]/g, "\\*");
  const re = new RegExp(`\\\\begin\\{${esc}\\}[\\s\\S]*?\\\\end\\{${esc}\\}`, "g");
  return text.replace(re, () => {
    counter.n += 1;
    return " ";
  });
}

function removeCommandWithArgs(text, name, keepLast) {
  let out = "";
  let i = 0;
  const re = new RegExp(`\\\\${name}\\*?(?![A-Za-z@])`, "g");
  let m;
  let last = 0;
  while ((m = re.exec(text))) {
    out += text.slice(last, m.index);
    i = m.index + m[0].length;
    const args = [];
    // optionale und obligatorische Argumente einlesen
    for (;;) {
      while (text[i] === " " || text[i] === "\t") i += 1;
      if (text[i] === "[") {
        const close = text.indexOf("]", i);
        if (close === -1) break;
        i = close + 1;
        continue;
      }
      if (text[i] === "{") {
        const braced = readBraced(text, i);
        if (!braced) break;
        args.push(braced.content);
        i = braced.end;
        continue;
      }
      break;
    }
    if (keepLast && args.length) out += ` ${args[args.length - 1]} `;
    else out += " ";
    last = i;
    re.lastIndex = i;
  }
  out += text.slice(last);
  return out;
}

function extractCommandArgs(text, name, sink) {
  return removeCommandWithArgsCollect(text, name, sink);
}

function removeCommandWithArgsCollect(text, name, sink) {
  let out = "";
  const re = new RegExp(`\\\\${name}\\*?(?![A-Za-z@])`, "g");
  let m;
  let last = 0;
  while ((m = re.exec(text))) {
    out += text.slice(last, m.index);
    let i = m.index + m[0].length;
    let arg = null;
    for (;;) {
      while (text[i] === " " || text[i] === "\t") i += 1;
      if (text[i] === "[") {
        const close = text.indexOf("]", i);
        if (close === -1) break;
        i = close + 1;
        continue;
      }
      if (text[i] === "{") {
        const braced = readBraced(text, i);
        if (!braced) break;
        arg = braced.content;
        i = braced.end;
        break;
      }
      break;
    }
    if (arg !== null) sink.push(arg);
    out += " ";
    last = i;
    re.lastIndex = i;
  }
  out += text.slice(last);
  return out;
}

function countWords(text) {
  const m = text.match(WORD_RE);
  return m ? m.length : 0;
}

/** Zählt Wörter eines LaTeX-Textes (angelehnt an texcount). */
export function countTex(source) {
  const counters = { mathDisplay: { n: 0 }, mathInline: { n: 0 }, verbatim: { n: 0 } };
  let text = source.split(/\r?\n/).map(stripComment).join("\n");

  const figures = (text.match(/\\begin\{figure\*?\}/g) || []).length;
  const tables = (text.match(/\\begin\{table\*?\}/g) || []).length;
  const listings = (text.match(/\\begin\{(lstlisting|minted|listing|verbatim|Verbatim)\*?\}/g) || []).length + (text.match(/\\lstinputlisting/g) || []).length;
  const equations = (text.match(/\\begin\{(equation|align|gather|multline|eqnarray|flalign|alignat)\*?\}/g) || []).length;
  const citeCommands = (text.match(/\\(?:cite\w*|parencite|textcite|autocite|footcite|fullcite)\*?\s*(?:\[[^\]]*\]\s*)*\{/g) || []).length;
  const refCommands = (text.match(/\\(?:c|C|auto|eq|name|page|v)?ref\s*\{/g) || []).length;
  const footnotesCount = (text.match(/\\footnote\s*\{/g) || []).length;
  const todos = (text.match(/\\todo\s*(\[[^\]]*\])?\s*\{/g) || []).length + (text.match(/\\missingfigure/g) || []).length;

  for (const env of VERBATIM_ENVS) text = removeEnv(text, env, counters.verbatim);
  for (const env of MATH_ENVS) {
    text = removeEnv(text, env, counters.mathDisplay);
    text = removeEnv(text, `${env}*`, counters.mathDisplay);
  }
  text = text.replace(/\\\[[\s\S]*?\\\]/g, () => {
    counters.mathDisplay.n += 1;
    return " ";
  });
  text = text.replace(/\$\$[\s\S]*?\$\$/g, () => {
    counters.mathDisplay.n += 1;
    return " ";
  });
  text = text.replace(/\\\([\s\S]*?\\\)/g, () => {
    counters.mathInline.n += 1;
    return " ";
  });
  text = text.replace(/(^|[^\\])\$([^$\n]|\\\$)+?\$/g, (all, pre) => {
    counters.mathInline.n += 1;
    return `${pre} `;
  });

  const captions = [];
  text = extractCommandArgs(text, "caption", captions);
  text = extractCommandArgs(text, "subcaption", captions);
  const headers = [];
  for (const h of ["part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph"]) {
    text = extractCommandArgs(text, h, headers);
  }
  const footnotes = [];
  text = extractCommandArgs(text, "footnote", footnotes);

  for (const name of KEEP_LAST_ARG) text = removeCommandWithArgs(text, name, true);
  for (const name of DROP_WITH_ARGS) text = removeCommandWithArgs(text, name, false);

  text = text
    .replace(/\\(begin|end)\s*\{[^}]*\}(\[[^\]]*\])?/g, " ")
    .replace(/\\item\s*(\[[^\]]*\])?/g, " ")
    .replace(/\\[a-zA-Z@]+\*?\s*(\[[^\]]*\])?/g, " ")
    .replace(/\\[^a-zA-Z]/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/~/g, " ")
    .replace(/---?/g, " ");

  const cleanHeaders = headers.map((h) => h.replace(/\\[a-zA-Z@]+\s*/g, "").replace(/[{}]/g, ""));
  const cleanCaptions = captions.map((h) => h.replace(/\\[a-zA-Z@]+\s*/g, "").replace(/[{}]/g, ""));
  const cleanFootnotes = footnotes.map((h) => h.replace(/\\[a-zA-Z@]+\s*(\{[^}]*\})?/g, " ").replace(/[{}]/g, ""));

  const words = countWords(text);
  const footnoteWords = cleanFootnotes.reduce((n, f) => n + countWords(f), 0);
  return {
    words: words + footnoteWords,
    bodyWords: words,
    headerWords: cleanHeaders.reduce((n, h) => n + countWords(h), 0),
    captionWords: cleanCaptions.reduce((n, c) => n + countWords(c), 0),
    footnoteWords,
    headers: headers.length,
    footnotes: footnotesCount,
    mathInline: counters.mathInline.n,
    mathDisplay: counters.mathDisplay.n + equations,
    figures,
    tables,
    listings,
    citations: citeCommands,
    refs: refCommands,
    todos,
    characters: text.replace(/\s+/g, "").length,
  };
}

export function readPagesFromLog(root, mainFile) {
  if (!mainFile) return 0;
  try {
    const log = fs.readFileSync(logPathFor(root, mainFile), "latin1");
    const m = log.match(/Output written on [\s\S]*?\((\d+) pages?/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function chapterSplit(text, level = "chapter") {
  // Liefert [{title|null, text}] – Text vor der ersten Überschrift gehört zum laufenden Kapitel.
  // `level` ist \chapter (report/book) oder \section (article-Klasse, z. B. TU-Berlin-Template).
  // Sternvarianten (\section*{Abstract} …) beginnen kein neues Kapitel – ihr Text zählt zum laufenden Abschnitt.
  const parts = [];
  const re = new RegExp(`\\\\${level}\\s*(?:\\[[^\\]]*\\])?\\s*\\{`, "g");
  let last = 0;
  let m;
  let pendingTitle = null;
  while ((m = re.exec(text))) {
    parts.push({ title: pendingTitle, text: text.slice(last, m.index) });
    const braced = readBraced(text, m.index + m[0].length - 1);
    pendingTitle = braced ? braced.content.replace(/\\[a-zA-Z@]+\s*/g, "").replace(/[{}]/g, "").trim() : "Kapitel";
    last = braced ? braced.end : m.index + m[0].length;
    re.lastIndex = last;
  }
  parts.push({ title: pendingTitle, text: text.slice(last) });
  return parts;
}

/** Statistik für das gesamte Projekt (Dateien in Dokumentreihenfolge, Kapitel, Summen). */
export function projectStats(root, mainFile, { pages } = {}) {
  const order = mainFile ? includeOrder(root, mainFile) : [];
  const files = [];
  const chapters = [];
  const total = {
    words: 0, bodyWords: 0, headerWords: 0, captionWords: 0, footnoteWords: 0, headers: 0, footnotes: 0, mathInline: 0,
    mathDisplay: 0, figures: 0, tables: 0, listings: 0, citations: 0, refs: 0, todos: 0, characters: 0,
  };
  let currentChapter = null;
  const uniqueCites = new Set();
  const texts = new Map();
  for (const rel of order) {
    try {
      texts.set(rel, fs.readFileSync(safeResolve(root, rel), "utf8"));
    } catch {
      /* skip */
    }
  }
  const topLevel = [...texts.values()].some((t) => /\\chapter\*?\s*(?:\[[^\]]*\])?\s*\{/.test(t.split(/\r?\n/).map(stripComment).join("\n"))) ? "chapter" : "section";

  for (const rel of order) {
    const text = texts.get(rel);
    if (text === undefined) continue;
    const stats = countTex(text);
    files.push({ file: rel, ...stats });
    for (const k of Object.keys(total)) total[k] += stats[k] || 0;
    for (const m of text.matchAll(/\\(?:cite\w*|parencite|textcite|autocite|footcite|fullcite)\*?\s*(?:\[[^\]]*\]\s*)*\{([^}]+)\}/g)) {
      for (const key of m[1].split(",")) uniqueCites.add(key.trim());
    }
    for (const part of chapterSplit(text, topLevel)) {
      if (part.title) {
        currentChapter = { title: part.title, file: rel, words: 0 };
        chapters.push(currentChapter);
      }
      const w = countTex(part.text).words;
      if (currentChapter) currentChapter.words += w;
      else if (w > 0) {
        const pre = chapters.find((c) => c.title === "Vor dem ersten Kapitel");
        if (pre) pre.words += w;
        else chapters.unshift({ title: "Vor dem ersten Kapitel", file: rel, words: w });
      }
    }
  }
  const pageCount = typeof pages === "number" ? pages : readPagesFromLog(root, mainFile);
  return {
    files,
    chapters,
    total: { ...total, uniqueCitations: uniqueCites.size },
    pages: pageCount,
    topLevel,
    mainFile,
    generatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Tagesverlauf                                                        */
/* ------------------------------------------------------------------ */

function statsPath(root) {
  return path.join(root, ".local-overleaf", "stats.json");
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function readDaily(root) {
  try {
    return JSON.parse(fs.readFileSync(statsPath(root), "utf8"));
  } catch {
    return { days: {} };
  }
}

export function recordDaily(root, { words, pages }) {
  const data = readDaily(root);
  if (!data.days) data.days = {};
  const key = today();
  const day = data.days[key] || { first: words, last: words, pages, updated: Date.now() };
  day.last = words;
  day.pages = pages ?? day.pages;
  day.updated = Date.now();
  if (typeof day.first !== "number") day.first = words;
  data.days[key] = day;
  const keys = Object.keys(data.days).sort();
  while (keys.length > 120) delete data.days[keys.shift()];
  try {
    fs.mkdirSync(path.dirname(statsPath(root)), { recursive: true });
    fs.writeFileSync(statsPath(root), JSON.stringify(data, null, 2));
  } catch {
    /* ignore */
  }
  return data;
}

export function dailySeries(root, days = 30) {
  const data = readDaily(root);
  const out = [];
  const now = new Date();
  let prevLast = null;
  const keys = Object.keys(data.days || {}).sort();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const pad = (n) => String(n).padStart(2, "0");
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const entry = data.days?.[key];
    if (entry) {
      const before = keys.filter((k) => k < key).pop();
      const base = before ? data.days[before].last : entry.first;
      out.push({ date: key, words: entry.last, pages: entry.pages || 0, delta: entry.last - (typeof base === "number" ? base : entry.first) });
      prevLast = entry.last;
    } else {
      out.push({ date: key, words: prevLast, pages: null, delta: 0 });
    }
  }
  return out;
}
