/**
 * Rechtschreibprüfung (offline, Hunspell-Wörterbücher via nspell) und Grammatikprüfung
 * (LanguageTool-Server, standardmäßig die öffentliche API) für LaTeX- und Markdown-Dateien.
 * Der LaTeX-Quelltext wird positionsgetreu „maskiert“: Befehle, Mathematik, Kommentare
 * und Argumente wie \cite{…} werden durch Leerzeichen gleicher Länge ersetzt, damit
 * Zeilen- und Spaltenangaben unverändert bleiben.
 */
import fs from "fs";
import path from "path";
import os from "os";
import nspell from "nspell";

const spellers = new Map();

async function loadSpeller(lang) {
  const key = lang === "de" ? "de" : "en";
  if (spellers.has(key)) return spellers.get(key);
  const promise = (async () => {
    const mod = key === "de" ? await import("dictionary-de") : await import("dictionary-en");
    return nspell(mod.default);
  })();
  spellers.set(key, promise);
  return promise;
}

export function langCode(babelName) {
  const n = String(babelName || "").toLowerCase();
  if (/german|ngerman|austrian|swissgerman|deutsch/.test(n)) return "de";
  if (/english|british|american|usenglish|ukenglish|canadian|australian/.test(n)) return "en";
  return null;
}

/* ------------------------------------------------------------------ */
/* Maskierung                                                          */
/* ------------------------------------------------------------------ */

const DROP_ARG_COMMANDS =
  "cite|citep|citet|parencite|textcite|autocite|footcite|fullcite|nocite|citeauthor|citeyear|ref|eqref|cref|Cref|autoref|nameref|pageref|vref|label|includegraphics|input|include|subfile|usepackage|documentclass|bibliography|bibliographystyle|addbibresource|printbibliography|url|ac|acs|acl|acf|acp|acsp|aclp|acfp|Ac|acro|acrodef|newacronym|gls|Gls|glspl|lstinputlisting|lstset|graphicspath|setlength|vspace|hspace|hypersetup|geometry|pagestyle|thispagestyle|pagenumbering|addcontentsline|definecolor|color|textcolor|newcommand|renewcommand|providecommand|setcounter|selectlanguage|begin|end|includepdf|captionsetup|DeclareFieldFormat|DefineBibliographyStrings|AddToShipoutPicture|put|parbox|missingfigure|code|texttt|verb|lstinline|href|phantomsection|todo";
const DROP_RE = new RegExp(`\\\\(${DROP_ARG_COMMANDS})\\*?`, "g");
const KEEP_LAST = new Set(["href", "textcolor", "color", "todo", "parbox"]);

function blank(s) {
  return s.replace(/[^\n]/g, " ");
}

/** Füllzeichen, das Wörter über ersetzte Akzentbefehle hinweg zusammenhält (Länge bleibt erhalten). */
export const FILL = "";
const ACCENTS = {
  '"': { a: "ä", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü", e: "ë", i: "ï", y: "ÿ" },
  "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", c: "ć", n: "ń", y: "ý" },
  "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È" },
  "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê" },
  "~": { a: "ã", n: "ñ", o: "õ", A: "Ã", N: "Ñ" },
  c: { c: "ç", C: "Ç" },
  v: { c: "č", s: "š", z: "ž", C: "Č", S: "Š", Z: "Ž", e: "ě", r: "ř" },
  "=": { a: "ā", e: "ē", o: "ō" },
  ".": { z: "ż" },
  u: { a: "ă", g: "ğ" },
  H: { o: "ő", u: "ű" },
  k: { a: "ą", e: "ę" },
};

/** \"a → ä + Füllzeichen, \ss → ß + Füllzeichen; Länge bleibt gleich. */
function replaceAccents(line) {
  return line
    .replace(/\\(["'`^~=.]|[cvuHk](?=[{ ]))\s*\{?([A-Za-z])\}?/g, (m, cmd, letter) => {
      const ch = ACCENTS[cmd]?.[letter];
      if (!ch) return " ".repeat(m.length);
      return ch + FILL.repeat(m.length - 1);
    })
    .replace(/\\(ss|ae|oe|AE|OE|o|O|l|L|aa|AA)(\{\})?(?![A-Za-z])/g, (m, cmd) => {
      const map = { ss: "ß", ae: "æ", oe: "œ", AE: "Æ", OE: "Œ", o: "ø", O: "Ø", l: "ł", L: "Ł", aa: "å", AA: "Å" };
      return map[cmd] + FILL.repeat(m.length - 1);
    });
}

/** Maskiert eine Zeile (ohne Zustand über Zeilen hinweg). */
export function maskLine(raw, state) {
  let line = raw;
  // Verbatim-/Listing-Umgebungen und Auskommentiertes komplett überspringen
  if (state.verbatim) {
    if (/\\end\{(verbatim|lstlisting|minted|Verbatim|comment|tikzpicture|filecontents)\*?\}/.test(line)) state.verbatim = false;
    return blank(line);
  }
  if (/\\begin\{(verbatim|lstlisting|minted|Verbatim|comment|tikzpicture|filecontents)\*?\}/.test(line)) {
    state.verbatim = !/\\end\{(verbatim|lstlisting|minted|Verbatim|comment|tikzpicture|filecontents)\*?\}/.test(line);
    return blank(line);
  }
  // Kommentar
  let out = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      out += ch + line[i + 1];
      i += 1;
      continue;
    }
    if (ch === "%") {
      out += " ".repeat(line.length - i);
      break;
    }
    out += ch;
  }
  line = out;

  // Mehrzeilige Mathematik
  if (state.math) {
    const end = line.search(/\\\]|\$\$|\\end\{(equation|align|gather|multline|eqnarray|flalign|alignat|displaymath)\*?\}/);
    if (end === -1) return blank(line);
    const m = line.slice(end).match(/^(\\\]|\$\$|\\end\{[^}]*\})/);
    const len = m ? m[0].length : 2;
    state.math = false;
    line = " ".repeat(end + len) + line.slice(end + len);
  }
  line = line.replace(/\\begin\{(equation|align|gather|multline|eqnarray|flalign|alignat|displaymath)\*?\}[\s\S]*?\\end\{\1\*?\}/g, (m) => " ".repeat(m.length));
  line = line.replace(/\\\[[\s\S]*?\\\]/g, (m) => " ".repeat(m.length));
  line = line.replace(/\$\$[\s\S]*?\$\$/g, (m) => " ".repeat(m.length));
  const startMath = line.search(/\\\[|\$\$|\\begin\{(equation|align|gather|multline|eqnarray|flalign|alignat|displaymath)\*?\}/);
  if (startMath !== -1) {
    state.math = true;
    line = line.slice(0, startMath) + " ".repeat(line.length - startMath);
  }
  // Inline-Mathematik
  line = line.replace(/\\\([\s\S]*?\\\)/g, (m) => " ".repeat(m.length));
  line = line.replace(/(^|[^\\])\$([^$]|\\\$)*?\$/g, (m, pre) => pre + " ".repeat(m.length - pre.length));

  // Befehle mit zu ignorierenden Argumenten
  let result = "";
  let i = 0;
  DROP_RE.lastIndex = 0;
  let mm;
  let last = 0;
  while ((mm = DROP_RE.exec(line))) {
    const name = mm[1];
    result += line.slice(last, mm.index) + " ".repeat(mm[0].length);
    i = mm.index + mm[0].length;
    const args = [];
    for (;;) {
      while (line[i] === " ") i += 1;
      if (line[i] === "[") {
        const close = line.indexOf("]", i);
        if (close === -1) break;
        i = close + 1;
        continue;
      }
      if (line[i] === "{") {
        let depth = 0;
        let j = i;
        for (; j < line.length; j += 1) {
          if (line[j] === "\\") {
            j += 1;
            continue;
          }
          if (line[j] === "{") depth += 1;
          else if (line[j] === "}") {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        if (j >= line.length) break;
        args.push({ start: i + 1, end: j });
        i = j + 1;
        continue;
      }
      break;
    }
    if (args.length && KEEP_LAST.has(name)) {
      const keep = args[args.length - 1];
      let seg = "";
      let pos = mm.index + mm[0].length;
      seg += " ".repeat(keep.start - pos);
      seg += line.slice(keep.start, keep.end);
      seg += " ".repeat(i - keep.end);
      result += seg;
    } else {
      result += " ".repeat(i - (mm.index + mm[0].length));
    }
    last = i;
    DROP_RE.lastIndex = i;
  }
  result += line.slice(last);
  line = result;

  // Paketoptionen über mehrere Zeilen (maxbibnames=99, style=alphabetic, …)
  if (/^\s*[a-zA-Z]+\s*=\s*[^\s,]+\s*,?\s*$/.test(line)) return blank(line);

  // Akzentbefehle in Buchstaben umwandeln, damit Wörter wie Universit\"at ganz bleiben
  line = replaceAccents(line);

  // Restliche Befehle, Klammern, Sonderzeichen
  line = line.replace(/\\[a-zA-Z@]+\*?/g, (m) => " ".repeat(m.length));
  line = line.replace(/\\[^a-zA-Z\s]/g, "  ");
  line = line.replace(/[{}[\]~]/g, " ");
  line = line.replace(/---?/g, (m) => " ".repeat(m.length));
  line = line.replace(/https?:\/\/\S+/g, (m) => " ".repeat(m.length));
  return line;
}

/** Maskiert Markdown (Code, Links, URLs, Inline-Code). */
export function maskMarkdownLine(raw, state) {
  let line = raw;
  if (state.verbatim) {
    if (/^\s*```/.test(line)) state.verbatim = false;
    return blank(line);
  }
  if (/^\s*```/.test(line)) {
    state.verbatim = true;
    return blank(line);
  }
  line = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
  line = line.replace(/!\[[^\]]*\]\([^)]*\)/g, (m) => " ".repeat(m.length));
  line = line.replace(/\]\([^)]*\)/g, (m) => " ".repeat(m.length));
  line = line.replace(/https?:\/\/\S+/g, (m) => " ".repeat(m.length));
  line = line.replace(/^\s*[#>*+-]+\s/, (m) => " ".repeat(m.length));
  line = line.replace(/[|*_>#]/g, " ");
  return line;
}

/**
 * Maskiert einen ganzen Text zeilenweise und liefert je Zeile die Sprache
 * (otherlanguage-/selectlanguage-Wechsel werden berücksichtigt).
 */
export function maskDocument(text, { kind = "latex", language = "de" } = {}) {
  const lines = text.split(/\r?\n/);
  const state = { verbatim: false, math: false };
  let current = language;
  const langStack = [];
  const masked = [];
  const langs = [];
  // Präambel (vor \begin{document}) nicht prüfen – dort stehen Paketoptionen, keine Prosa
  let preambleUntil = -1;
  if (kind === "latex") {
    const idx = lines.findIndex((l) => /\\begin\{document\}/.test(l));
    if (idx > 0) preambleUntil = idx;
  }
  for (let li = 0; li < lines.length; li += 1) {
    const raw = lines[li];
    let lineLang = current;
    if (li <= preambleUntil) {
      masked.push(blank(raw));
      langs.push(lineLang);
      continue;
    }
    if (kind === "latex") {
      const begin = raw.match(/\\begin\{otherlanguage\*?\}\{([^}]+)\}/);
      const end = /\\end\{otherlanguage\*?\}/.test(raw);
      const sel = raw.match(/\\selectlanguage\{([^}]+)\}/);
      if (begin) {
        langStack.push(current);
        current = langCode(begin[1]) || current;
        lineLang = current;
      }
      if (sel) {
        current = langCode(sel[1]) || current;
        lineLang = current;
      }
      masked.push(maskLine(raw, state));
      if (end) current = langStack.pop() || language;
    } else {
      masked.push(maskMarkdownLine(raw, state));
    }
    langs.push(lineLang);
  }
  return { masked, langs };
}

/* ------------------------------------------------------------------ */
/* Wörterbücher                                                        */
/* ------------------------------------------------------------------ */

export function userDictionaryPath() {
  return path.join(os.homedir(), ".thesisleaf", "woerterbuch.txt");
}

export function projectDictionaryPath(root) {
  return path.join(root, ".local-overleaf", "woerterbuch.txt");
}

function readWords(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter((w) => w && !w.startsWith("#"));
  } catch {
    return [];
  }
}

export function addToDictionary(root, word, scope = "project") {
  const file = scope === "user" ? userDictionaryPath() : projectDictionaryPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const words = new Set(readWords(file));
  words.add(String(word).trim());
  fs.writeFileSync(file, [...words].sort((a, b) => a.localeCompare(b, "de")).join("\n") + "\n", "utf8");
  return [...words];
}

export function ignoredWords(root) {
  return new Set([...readWords(userDictionaryPath()), ...readWords(projectDictionaryPath(root))]);
}

/* ------------------------------------------------------------------ */
/* Prüfung                                                             */
/* ------------------------------------------------------------------ */

const WORD_RE = /\p{L}[\p{L}'’]*(?:-\p{L}[\p{L}'’]*)*/gu;

function looksTechnical(word) {
  if (word.length < 3) return true;
  if (/\d/.test(word)) return true;
  if (word === word.toUpperCase()) return true; // Abkürzungen
  if (/^[\p{Lu}]/u.test(word) && /[\p{Lu}]/u.test(word.slice(1))) return true; // InfluxDB, OpenAPI
  if (/^[a-z]+[\p{Lu}]/u.test(word)) return true; // camelCase
  if (/_/.test(word)) return true;
  return false;
}

async function isCorrect(sp, word, lang) {
  if (sp.correct(word)) return true;
  const lower = word.toLowerCase();
  if (lower !== word && sp.correct(lower)) return true;
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  if (cap !== word && sp.correct(cap)) return true;
  if (word.includes("-")) {
    const parts = word.split("-").filter(Boolean);
    if (parts.length > 1 && parts.every((p) => p.length < 2 || sp.correct(p) || sp.correct(p.toLowerCase()) || sp.correct(p.charAt(0).toUpperCase() + p.slice(1)))) return true;
  }
  if (word.endsWith("'s") || word.endsWith("’s")) {
    const stem = word.slice(0, -2);
    if (sp.correct(stem)) return true;
  }
  // Deutsche Komposita (bis zu drei Teile, Fugen-s/-n/-en erlaubt)
  if (lang === "de" && word.length >= 7) return compoundOk(sp, word, 3);
  return false;
}

function partOk(sp, part) {
  if (part.length < 3) return false;
  const cap = part.charAt(0).toUpperCase() + part.slice(1);
  if (sp.correct(part) || sp.correct(cap)) return true;
  for (const fuge of ["s", "n", "en", "es", "e"]) {
    if (part.endsWith(fuge) && part.length - fuge.length >= 3) {
      const stem = part.slice(0, -fuge.length);
      const stemCap = stem.charAt(0).toUpperCase() + stem.slice(1);
      if (sp.correct(stem) || sp.correct(stemCap)) return true;
    }
  }
  return false;
}

function compoundOk(sp, word, depth) {
  if (depth <= 0) return false;
  for (let i = 3; i <= word.length - 3; i += 1) {
    const a = word.slice(0, i);
    const b = word.slice(i);
    if (partOk(sp, a) && (partOk(sp, b) || compoundOk(sp, b, depth - 1))) return true;
  }
  return false;
}

/**
 * Prüft einen Text und liefert Fundstellen mit Vorschlägen.
 * `extraIgnore`: Wörter, die nie gemeldet werden (Abkürzungsschlüssel, Literaturschlüssel …).
 */
export async function checkSpelling(text, { kind = "latex", language = "de", ignore = new Set(), maxItems = 400, maxSuggest = 120 } = {}) {
  const { masked, langs } = maskDocument(text, { kind, language });
  const items = [];
  const seen = new Map();
  const spellersByLang = {};
  for (let i = 0; i < masked.length && items.length < maxItems; i += 1) {
    const lang = langs[i] || language;
    if (!spellersByLang[lang]) spellersByLang[lang] = await loadSpeller(lang);
    const sp = spellersByLang[lang];
    WORD_RE.lastIndex = 0;
    let m;
    while ((m = WORD_RE.exec(masked[i]))) {
      const rawLen = m[0].length;
      const word = m[0].replace(//g, "").replace(/^['’]+|['’]+$/g, "");
      if (!word || looksTechnical(word)) continue;
      if (ignore.has(word) || ignore.has(word.toLowerCase())) continue;
      const cacheKey = `${lang}:${word}`;
      let ok = seen.get(cacheKey);
      if (ok === undefined) {
        ok = await isCorrect(sp, word, lang);
        // Deutsche Eigennamen/Wörter mit Umlauten im englischen Text (Universität, Erklärung) nicht melden
        if (!ok && lang === "en" && /[äöüßÄÖÜ]/.test(word)) {
          if (!spellersByLang.de) spellersByLang.de = await loadSpeller("de");
          ok = await isCorrect(spellersByLang.de, word, "de");
        }
        seen.set(cacheKey, ok);
      }
      if (ok) continue;
      items.push({
        severity: "hint",
        kind: "spelling",
        lang,
        word,
        line: i + 1,
        column: m.index + 1,
        length: rawLen,
        message: `Rechtschreibung (${lang === "de" ? "Deutsch" : "Englisch"}): „${word}“`,
        suggestions: items.length < maxSuggest ? sp.suggest(word).slice(0, 5) : [],
      });
      if (items.length >= maxItems) break;
    }
  }
  return items;
}

/**
 * Grammatik- und Stilprüfung über einen LanguageTool-Server (HTTP-API v2).
 * Standard: öffentliche API (Limits: ~20 KB pro Anfrage, 20 Anfragen/Minute).
 */
export async function checkGrammar(text, { kind = "latex", language = "de", url = "https://api.languagetool.org/v2/check", maxItems = 300 } = {}) {
  const { masked, langs } = maskDocument(text, { kind, language });
  const mainLang = language;
  // Zeilen anderer Sprache leeren, LanguageTool prüft je Anfrage genau eine Sprache
  const lines = masked.map((l, i) => (langs[i] === mainLang ? l : blank(l)));
  const joined = lines.join("\n");
  const offsets = [];
  let acc = 0;
  for (const l of lines) {
    offsets.push(acc);
    acc += l.length + 1;
  }
  const chunks = [];
  let start = 0;
  const LIMIT = 18000;
  while (start < joined.length) {
    let end = Math.min(joined.length, start + LIMIT);
    if (end < joined.length) {
      const nl = joined.lastIndexOf("\n", end);
      if (nl > start + 1000) end = nl;
    }
    chunks.push({ start, text: joined.slice(start, end) });
    start = end;
  }
  const items = [];
  const langParam = mainLang === "de" ? "de-DE" : "en-US";
  for (const chunk of chunks.slice(0, 8)) {
    if (!chunk.text.trim()) continue;
    const body = new URLSearchParams({
      text: chunk.text,
      language: langParam,
      disabledRules: "WHITESPACE_RULE,COMMA_PARENTHESIS_WHITESPACE,DOUBLE_PUNCTUATION,UPPERCASE_SENTENCE_START,PUNCTUATION_PARAGRAPH_END,EN_QUOTES,GERMAN_QUOTES,SENTENCE_WHITESPACE,UNPAIRED_BRACKETS",
      level: "picky",
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let res;
    try {
      res = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`LanguageTool antwortet mit HTTP ${res.status}${t ? `: ${t.slice(0, 160)}` : ""}`);
    }
    const data = await res.json();
    for (const mt of data.matches || []) {
      const abs = chunk.start + mt.offset;
      let lineIdx = 0;
      let lo = 0;
      let hi = offsets.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid] <= abs) {
          lineIdx = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      const col = abs - offsets[lineIdx] + 1;
      if (mt.rule?.issueType === "misspelling") continue; // Rechtschreibung macht nspell offline
      items.push({
        severity: "hint",
        kind: "grammar",
        line: lineIdx + 1,
        column: col,
        length: mt.length,
        message: `${mt.message}${mt.rule?.category?.name ? ` (${mt.rule.category.name})` : ""}`,
        short: mt.shortMessage || "",
        suggestions: (mt.replacements || []).slice(0, 5).map((r) => r.value),
        ruleId: mt.rule?.id,
      });
      if (items.length >= maxItems) break;
    }
    if (items.length >= maxItems) break;
  }
  return { items, chunks: chunks.length, truncated: chunks.length > 8 };
}
