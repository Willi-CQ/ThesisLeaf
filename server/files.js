import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEMPLATE_DIR =
  process.env.THESISLEAF_TEMPLATE_DIR || path.resolve(__dirname, "..", "template", "bachelorarbeit");

/** Ordner, die nie im Dateibaum erscheinen (interne Verwaltung). */
export const ALWAYS_HIDDEN_DIRS = new Set([
  ".git", ".local-overleaf", "node_modules", ".thesisleaf", "__pycache__", ".venv", "venv", ".ruff_cache", ".mypy_cache",
  ".pytest_cache", ".idea", ".vs", ".tox", ".eggs", ".gradle", ".next", ".nuxt", ".parcel-cache", ".turbo",
]);
export const ALWAYS_HIDDEN_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** LaTeX-Hilfsdateien: standardmäßig ausgeblendet, per Schalter sichtbar. */
export const BUILD_EXTS = new Set([
  ".aux", ".log", ".out", ".toc", ".lof", ".lot", ".fls", ".fdb_latexmk", ".synctex.gz", ".synctex", ".bbl", ".blg",
  ".run.xml", ".bcf", ".nav", ".snm", ".vrb", ".idx", ".ilg", ".ind", ".glo", ".gls", ".glg", ".acn", ".acr", ".alg",
  ".ist", ".lol", ".loa", ".fdb", ".xdv", ".dvi", ".thm", ".tdo", ".bak", ".swp", ".tmp", ".pyc", ".pyo",
]);

/** Bekannte Textformate → Monaco-Sprache. */
export const TEXT_LANGUAGES = {
  ".tex": "latex", ".ltx": "latex", ".sty": "latex", ".cls": "latex", ".clo": "latex", ".dtx": "latex", ".ins": "latex",
  ".bib": "bibtex", ".bst": "plaintext", ".bbx": "latex", ".cbx": "latex", ".lbx": "latex",
  ".md": "markdown", ".markdown": "markdown", ".mdx": "markdown", ".rmd": "markdown", ".qmd": "markdown",
  ".txt": "plaintext", ".text": "plaintext", ".log": "plaintext", ".csv": "plaintext", ".tsv": "plaintext",
  ".json": "json", ".jsonc": "json", ".json5": "json", ".ipynb": "json",
  ".yaml": "yaml", ".yml": "yaml", ".toml": "ini", ".ini": "ini", ".cfg": "ini", ".conf": "ini", ".env": "ini",
  ".xml": "xml", ".svg": "xml", ".plist": "xml", ".xsl": "xml", ".xsd": "xml",
  ".html": "html", ".htm": "html", ".vue": "html", ".svelte": "html",
  ".css": "css", ".scss": "scss", ".sass": "scss", ".less": "less",
  ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
  ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "typescript",
  ".py": "python", ".pyi": "python", ".pyw": "python",
  ".java": "java", ".kt": "kotlin", ".kts": "kotlin", ".scala": "scala", ".groovy": "java",
  ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp", ".hxx": "cpp",
  ".cs": "csharp", ".fs": "fsharp", ".vb": "vb",
  ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php", ".pl": "perl", ".pm": "perl", ".lua": "lua",
  ".swift": "swift", ".m": "objective-c", ".mm": "objective-c", ".dart": "dart", ".r": "r", ".jl": "julia",
  ".sh": "shell", ".bash": "shell", ".zsh": "shell", ".fish": "shell", ".ps1": "powershell", ".psm1": "powershell",
  ".bat": "bat", ".cmd": "bat", ".sql": "sql", ".graphql": "graphql", ".gql": "graphql", ".proto": "protobuf",
  ".dockerfile": "dockerfile", ".gitignore": "plaintext", ".gitattributes": "plaintext", ".editorconfig": "ini",
  ".latexmkrc": "perl", ".chktexrc": "plaintext", ".lock": "plaintext", ".diff": "plaintext", ".patch": "plaintext",
  ".asm": "plaintext", ".s": "plaintext", ".clj": "clojure", ".ex": "elixir", ".exs": "elixir", ".hs": "plaintext",
  ".ml": "plaintext", ".erl": "plaintext", ".nim": "plaintext", ".zig": "plaintext", ".v": "plaintext",
  ".tikz": "latex", ".pgf": "latex", ".gnuplot": "plaintext", ".plt": "plaintext", ".m4": "plaintext",
};

const SPECIAL_TEXT_NAMES = {
  dockerfile: "dockerfile", makefile: "plaintext", "cmakelists.txt": "plaintext", license: "plaintext",
  readme: "markdown", ".latexmkrc": "perl", latexmkrc: "perl", ".gitignore": "plaintext", ".npmrc": "ini",
  ".prettierrc": "json", ".eslintrc": "json", "claude.md": "markdown", "agents.md": "markdown",
};

export const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".tif", ".tiff"]);

export const BINARY_EXTS = new Set([
  ".pdf", ".zip", ".7z", ".rar", ".gz", ".tgz", ".tar", ".bz2", ".xz", ".exe", ".dll", ".so", ".dylib", ".msi",
  ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".ods", ".odp", ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ".mp3", ".mp4", ".mov", ".avi", ".wav", ".flac", ".ogg", ".webm", ".mkv", ".class", ".jar", ".war", ".o", ".obj",
  ".bin", ".dat", ".db", ".sqlite", ".sqlite3", ".iso", ".dmg", ".pkg", ".deb", ".rpm", ".psd", ".ai", ".eps", ".pfb",
  ".pfm", ".tfm", ".vf", ".pyc", ".wasm", ".npy", ".npz", ".pkl", ".pickle", ".h5", ".hdf5", ".parquet",
]);

const MAIN_CANDIDATES = ["main.tex", "thesis.tex", "bachelorarbeit.tex", "bachelor.tex", "arbeit.tex", "dokument.tex", "paper.tex"];

/* ------------------------------------------------------------------ */
/* Pfade                                                               */
/* ------------------------------------------------------------------ */

export function safeResolve(root, rel = "") {
  const base = path.resolve(root);
  const resolved = path.resolve(base, rel || ".");
  const baseNorm = base.toLowerCase();
  const resolvedNorm = resolved.toLowerCase();
  if (resolvedNorm !== baseNorm && !resolvedNorm.startsWith(baseNorm + path.sep.toLowerCase())) {
    throw new Error("Ungültiger Pfad");
  }
  return resolved;
}

export function toPosix(p) {
  return p.split(path.sep).join("/");
}

/**
 * Ein Locator kennt den Projektordner und alle verknüpften Ordner ("Mounts").
 * Virtuelle Pfade verknüpfter Ordner beginnen mit "@name/".
 */
export function makeLocator(root, mounts = []) {
  const list = (mounts || []).filter((m) => m && m.name && m.path);
  function split(rel = "") {
    const norm = String(rel).replace(/\\/g, "/").replace(/^\/+/, "");
    const m = norm.match(/^@([^/]+)(?:\/(.*))?$/);
    if (m) {
      const mount = list.find((x) => x.name === m[1]);
      if (!mount) throw new Error(`Verknüpfter Ordner "${m[1]}" nicht gefunden`);
      return { base: mount.path, sub: m[2] || "", prefix: `@${mount.name}`, mount };
    }
    return { base: root, sub: norm, prefix: "", mount: null };
  }
  return {
    root,
    mounts: list,
    split,
    resolve(rel) {
      const { base, sub } = split(rel);
      return safeResolve(base, sub);
    },
    isMounted(rel) {
      return Boolean(split(rel).mount);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dateiarten                                                          */
/* ------------------------------------------------------------------ */

function extOf(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".synctex.gz")) return ".synctex.gz";
  if (lower.endsWith(".run.xml")) return ".run.xml";
  if (lower.endsWith(".fdb_latexmk")) return ".fdb_latexmk";
  return path.extname(lower);
}

export function languageFor(name) {
  const lower = path.basename(name).toLowerCase();
  if (SPECIAL_TEXT_NAMES[lower]) return SPECIAL_TEXT_NAMES[lower];
  const ext = extOf(lower);
  if (TEXT_LANGUAGES[ext]) return TEXT_LANGUAGES[ext];
  return null;
}

export function fileKind(name) {
  const ext = extOf(name);
  if (ext === ".tex" || ext === ".ltx") return "tex";
  if (ext === ".bib") return "bib";
  if (ext === ".md" || ext === ".markdown" || ext === ".mdx" || ext === ".rmd" || ext === ".qmd") return "markdown";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (BINARY_EXTS.has(ext)) return "binary";
  const lang = languageFor(name);
  if (lang === "plaintext" || lang === "ini") return "text";
  if (lang) return "code";
  return "unknown";
}

function isBuildArtifact(name) {
  const lower = name.toLowerCase();
  if (BUILD_EXTS.has(extOf(lower))) return true;
  if (lower === ".gitkeep") return true;
  return false;
}

/** Heuristik: Datei ist Text, wenn die ersten 8 KB keine Nullbytes enthalten. */
export function sniffIsText(absPath) {
  let fd;
  try {
    fd = fs.openSync(absPath, "r");
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, 8192, 0);
    if (n === 0) return true;
    let suspicious = 0;
    for (let i = 0; i < n; i += 1) {
      const b = buf[i];
      if (b === 0) return false;
      if (b < 7 || (b > 14 && b < 32 && b !== 27)) suspicious += 1;
    }
    return suspicious / n < 0.1;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function isTextFile(absPath) {
  const name = path.basename(absPath);
  const kind = fileKind(name);
  if (kind === "image" || kind === "pdf" || kind === "binary") return false;
  if (kind === "tex" || kind === "bib" || kind === "markdown" || kind === "code" || kind === "text") return true;
  return sniffIsText(absPath);
}

/* ------------------------------------------------------------------ */
/* Dateibaum                                                           */
/* ------------------------------------------------------------------ */

function shouldSkip(entry, showHidden) {
  const name = entry.name;
  if (entry.isDirectory()) return ALWAYS_HIDDEN_DIRS.has(name);
  if (ALWAYS_HIDDEN_FILES.has(name)) return true;
  if (!showHidden && isBuildArtifact(name)) return true;
  return false;
}

/** Mehr als so viele Einträge je Ordner werden im Baum abgeschnitten (Ergebnisordner mit tausenden Dateien). */
export const MAX_DIR_ENTRIES = 400;
const MAX_TREE_NODES = 9000;

export function isExcluded(rel, exclude = []) {
  if (!exclude || !exclude.length) return false;
  const norm = String(rel).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return exclude.some((p) => {
    const e = String(p).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return e && (norm === e || norm.startsWith(`${e}/`));
  });
}

export function buildTree(base, rel = "", opts = {}, prefix = "") {
  const { showHidden = false, depth = 0, exclude = [], budget = null } = opts;
  let abs;
  try {
    abs = safeResolve(base, rel);
  } catch {
    return [];
  }
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  entries = entries.filter((e) => !shouldSkip(e, showHidden));
  let truncatedCount = 0;
  if (entries.length > MAX_DIR_ENTRIES) {
    entries.sort((a, b) => {
      const da = a.isDirectory() ? 0 : 1;
      const db = b.isDirectory() ? 0 : 1;
      return da - db || a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" });
    });
    truncatedCount = entries.length - MAX_DIR_ENTRIES;
    entries = entries.slice(0, MAX_DIR_ENTRIES);
  }
  const nodes = [];
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const vpath = prefix ? `${prefix}/${toPosix(childRel)}` : toPosix(childRel);
    if (!prefix && isExcluded(toPosix(childRel), exclude)) {
      if (entry.isDirectory()) nodes.push({ name: entry.name, path: vpath, type: "dir", excluded: true, children: [] });
      continue;
    }
    if (budget) budget.left -= 1;
    if (entry.isDirectory()) {
      if (depth > 12) continue;
      const exhausted = budget && budget.left <= 0;
      nodes.push({
        name: entry.name,
        path: vpath,
        type: "dir",
        truncated: exhausted || undefined,
        children: exhausted ? [] : buildTree(base, childRel, { ...opts, depth: depth + 1 }, prefix),
      });
    } else if (entry.isFile()) {
      let size = 0;
      let mtime = 0;
      try {
        const st = fs.statSync(path.join(abs, entry.name));
        size = st.size;
        mtime = st.mtimeMs;
      } catch {
        /* ignore */
      }
      nodes.push({
        name: entry.name,
        path: vpath,
        type: "file",
        ext: extOf(entry.name),
        kind: fileKind(entry.name),
        language: languageFor(entry.name),
        artifact: isBuildArtifact(entry.name),
        size,
        mtime,
      });
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" });
  });
  if (truncatedCount > 0) {
    nodes.push({ name: `… ${truncatedCount} weitere Einträge`, path: `${prefix ? `${prefix}/` : ""}${toPosix(rel)}/…`, type: "more", count: truncatedCount });
  }
  return nodes;
}

export function buildProjectTree(locator, opts = {}) {
  const budget = { left: MAX_TREE_NODES };
  const nodes = buildTree(locator.root, "", { ...opts, budget });
  for (const mount of locator.mounts) {
    const exists = fs.existsSync(mount.path);
    nodes.push({
      name: mount.name,
      path: `@${mount.name}`,
      type: "dir",
      mount: true,
      realPath: mount.path,
      missing: !exists,
      children: exists ? buildTree(mount.path, "", { ...opts, exclude: [], budget }, `@${mount.name}`) : [],
    });
  }
  return nodes;
}

/* ------------------------------------------------------------------ */
/* Lazy-Baum: eine Ebene je Anfrage                                    */
/* ------------------------------------------------------------------ */

const MAX_LIST_ENTRIES = 3000;

function fileNode(abs, name, vpath) {
  let size = 0;
  let mtime = 0;
  try {
    const st = fs.statSync(abs);
    size = st.size;
    mtime = st.mtimeMs;
  } catch {
    /* ignore */
  }
  return { name, path: vpath, type: "file", ext: extOf(name), kind: fileKind(name), language: languageFor(name), artifact: isBuildArtifact(name), size, mtime };
}

/**
 * Listet genau eine Ordnerebene (Projekt oder verknüpfter Ordner). Unterordner
 * werden erst beim Aufklappen geladen – so bleiben auch riesige Repositories flüssig.
 */
export function listDir(locator, rel = "", { showHidden = false, exclude = [], heavy = [] } = {}) {
  const { base, sub, prefix, mount } = locator.split(rel);
  const abs = safeResolve(base, sub);
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => !shouldSkip(e, showHidden));
  } catch (err) {
    throw new Error(`Ordner nicht lesbar: ${err.message}`);
  }
  const total = entries.length;
  entries.sort((a, b) => {
    const da = a.isDirectory() ? 0 : 1;
    const db = b.isDirectory() ? 0 : 1;
    return da - db || a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" });
  });
  if (entries.length > MAX_LIST_ENTRIES) entries = entries.slice(0, MAX_LIST_ENTRIES);
  const nodes = [];
  for (const entry of entries) {
    const childRel = sub ? `${sub}/${entry.name}` : entry.name;
    const vpath = prefix ? `${prefix}/${toPosix(childRel)}` : toPosix(childRel);
    if (entry.isDirectory()) {
      const node = { name: entry.name, path: vpath, type: "dir", lazy: true };
      if (!mount) {
        // Etikett nur am obersten betroffenen Ordner, nicht an jedem Unterordner
        const norm = vpath.replace(/^\/+|\/+$/g, "");
        if (exclude.some((e) => String(e).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") === norm)) node.excluded = true;
        if (heavy.some((e) => String(e).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") === norm)) node.heavy = true;
      }
      nodes.push(node);
    } else if (entry.isFile()) {
      nodes.push(fileNode(path.join(abs, entry.name), entry.name, vpath));
    }
  }
  if (total > MAX_LIST_ENTRIES) {
    nodes.push({ name: `… ${total - MAX_LIST_ENTRIES} weitere Einträge (Ordner im Explorer öffnen)`, path: `${rel}/…`, type: "more", count: total - MAX_LIST_ENTRIES });
  }
  return { path: rel, nodes, total };
}

/** Wurzel des Baums: Projektordner (eine Ebene) plus verknüpfte Ordner als lazy Knoten. */
export function buildRootListing(locator, opts = {}) {
  const nodes = listDir(locator, "", opts).nodes;
  for (const mount of locator.mounts) {
    const exists = fs.existsSync(mount.path);
    nodes.push({ name: mount.name, path: `@${mount.name}`, type: "dir", mount: true, lazy: true, realPath: mount.path, missing: !exists });
  }
  return nodes;
}

/**
 * Findet „schwere“ Ordner (viele Einträge oder sehr viele Dateien im Teilbaum), z. B.
 * Ergebnis- und Artefaktordner. Sie bleiben sichtbar, werden aber nicht beobachtet,
 * durchsucht, versioniert oder gesichert. Liefert die obersten schweren Pfade.
 */
export function detectHeavyDirs(root, { maxEntries = 400, maxFiles = 2000, exclude = [] } = {}) {
  const heavy = [];
  function count(rel, depth) {
    // liefert Dateianzahl im Teilbaum (bricht ab, sobald maxFiles überschritten)
    const abs = path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return 0;
    }
    let files = 0;
    for (const e of entries) {
      if (e.isFile()) files += 1;
    }
    for (const e of entries) {
      if (!e.isDirectory() || ALWAYS_HIDDEN_DIRS.has(e.name)) continue;
      if (depth > 10) continue;
      files += count(rel ? `${rel}/${e.name}` : e.name, depth + 1);
      if (files > maxFiles) return files;
    }
    return files;
  }
  // Ein Ordner gilt als schwer, wenn er selbst sehr viele Einträge hat oder sein Teilbaum
  // sehr viele Dateien enthält, ohne dass ein einzelner Unterordner die Masse trägt
  // (dann wird dort weitergesucht – so bleibt z. B. results/reports frei, results/artifacts schwer).
  function visit(rel, depth) {
    const abs = path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || ALWAYS_HIDDEN_DIRS.has(e.name)) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (isExcluded(childRel, exclude)) continue;
      let direct;
      try {
        direct = fs.readdirSync(path.join(root, childRel), { withFileTypes: true });
      } catch {
        continue;
      }
      if (direct.length > maxEntries) {
        heavy.push(childRel);
        continue;
      }
      const total = count(childRel, 0);
      if (total > maxFiles) {
        const bigChild = direct.some((d) => d.isDirectory() && !ALWAYS_HIDDEN_DIRS.has(d.name) && count(`${childRel}/${d.name}`, 0) > maxFiles);
        if (bigChild && depth < 8) visit(childRel, depth + 1);
        else heavy.push(childRel);
        continue;
      }
      if (depth < 6) visit(childRel, depth + 1);
    }
  }
  visit("", 0);
  return heavy;
}

/** Flacher Dateiindex (für Quick Open, Navigation, Abbildungsordner) – ohne ausgeschlossene/schwere Ordner. */
export function fileIndex(locator, { exclude = [], limit = 20000 } = {}) {
  const out = [];
  const dirs = new Set();
  function walk(base, rel, prefix, depth, ex) {
    if (out.length >= limit || depth > 14) return;
    let abs;
    try {
      abs = safeResolve(base, rel);
    } catch {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (shouldSkip(entry, false)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const vpath = prefix ? `${prefix}/${toPosix(childRel)}` : toPosix(childRel);
      if (entry.isDirectory()) {
        if (!prefix && isExcluded(toPosix(childRel), ex)) continue;
        dirs.add(vpath);
        walk(base, childRel, prefix, depth + 1, ex);
      } else if (entry.isFile()) {
        out.push({ path: vpath, name: entry.name, kind: fileKind(entry.name), ext: extOf(entry.name) });
        if (out.length >= limit) return;
      }
    }
  }
  walk(locator.root, "", "", 0, exclude);
  for (const m of locator.mounts) {
    if (fs.existsSync(m.path)) walk(m.path, "", `@${m.name}`, 0, []);
  }
  return { files: out, dirs: [...dirs], truncated: out.length >= limit };
}

export function copyEntry(locator, fromRel, toRel) {
  const from = locator.resolve(fromRel);
  const to = locator.resolve(toRel);
  if (!fs.existsSync(from)) throw new Error("Quelle nicht gefunden");
  if (fs.existsSync(to)) throw new Error("Ziel existiert bereits");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

/**
 * Eigenschaften des Dokuments aus Hauptdatei + Präambel-Includes: Klasse, Sprache,
 * cleveref, todonotes, Literaturstil – steuern Vorschläge und Prüfungen.
 */
export function analyzeDocument(root, mainFile) {
  const out = { documentClass: null, language: "de", babel: null, cleveref: false, todonotes: false, customTodo: false, bibStyle: null, bibBackend: null, topLevel: "chapter", graphicsPath: [], acronymPackage: false };
  if (!mainFile) return out;
  let text = "";
  try {
    text = fs.readFileSync(safeResolve(root, mainFile), "utf8");
  } catch {
    return out;
  }
  const dir = path.posix.dirname(mainFile.replace(/\\/g, "/"));
  const preambleEnd = text.indexOf("\\begin{document}");
  const preamble = preambleEnd > 0 ? text.slice(0, preambleEnd) : text;
  let combined = preamble.split(/\r?\n/).map(stripComment).join("\n");
  for (const m of combined.matchAll(/\\input\{([^}]+)\}/g)) {
    const target = m[1].replace(/\\/g, "/");
    for (const cand of [target, `${target}.tex`, path.posix.join(dir, target), path.posix.join(dir, `${target}.tex`)]) {
      try {
        const abs = safeResolve(root, cand);
        if (fs.existsSync(abs)) {
          combined += "\n" + fs.readFileSync(abs, "utf8").split(/\r?\n/).map(stripComment).join("\n").slice(0, 20000);
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }
  const cls = combined.match(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/);
  out.documentClass = cls ? cls[1].trim() : null;
  out.topLevel = /\\chapter\b/.test(text) || /^(scrreprt|scrbook|report|book|memoir|thesis)$/i.test(out.documentClass || "") ? "chapter" : "section";
  const babel = combined.match(/\\usepackage\s*\[([^\]]*)\]\s*\{babel\}/);
  if (babel) {
    out.babel = babel[1];
    const main = babel[1].match(/main\s*=\s*([a-zA-Z]+)/);
    const opts = babel[1].split(",").map((s) => s.trim()).filter((s) => s && !s.includes("="));
    const name = main ? main[1] : opts[opts.length - 1];
    out.language = /english|british|american|usenglish|ukenglish|canadian|australian/i.test(name || "") ? "en" : "de";
  } else if (/\\usepackage\s*\[([^\]]*)\]\s*\{polyglossia\}|\\setmainlanguage\s*(?:\[[^\]]*\])?\s*\{english\}/i.test(combined)) {
    out.language = "en";
  }
  out.cleveref = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{cleveref\}/.test(combined);
  out.todonotes = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{todonotes\}/.test(combined);
  out.customTodo = /\\(?:new|renew|provide)command\s*\{?\\todo\b/.test(combined);
  out.acronymPackage = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{(acronym|acro|glossaries)\}/.test(combined);
  const bib = combined.match(/\\usepackage\s*\[([^\]]*)\]\s*\{biblatex\}/);
  if (bib) {
    out.bibStyle = (bib[1].match(/style\s*=\s*([\w-]+)/) || [])[1] || "numeric";
    out.bibBackend = (bib[1].match(/backend\s*=\s*([\w-]+)/) || [])[1] || "biber";
  } else if (/\\bibliographystyle\{([^}]+)\}/.test(combined)) {
    out.bibStyle = combined.match(/\\bibliographystyle\{([^}]+)\}/)[1];
    out.bibBackend = "bibtex";
  }
  for (const m of combined.matchAll(/\\graphicspath\s*\{((?:\{[^}]*\})+)\}/g)) {
    for (const p of m[1].matchAll(/\{([^}]*)\}/g)) out.graphicsPath.push(p[1]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lesen / Schreiben                                                   */
/* ------------------------------------------------------------------ */

export function readFileUtf8(locator, rel) {
  return fs.readFileSync(locator.resolve(rel), "utf8");
}

export function statFile(locator, rel) {
  const st = fs.statSync(locator.resolve(rel));
  return { size: st.size, mtime: st.mtimeMs };
}

export function writeFileUtf8(locator, rel, content) {
  const abs = locator.resolve(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, abs);
  const st = fs.statSync(abs);
  return { size: st.size, mtime: st.mtimeMs };
}

export function writeFileBuffer(locator, rel, buffer) {
  const abs = locator.resolve(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
}

export function createEntry(locator, rel, type, content = "") {
  const abs = locator.resolve(rel);
  if (fs.existsSync(abs)) throw new Error("Existiert bereits");
  if (type === "dir") fs.mkdirSync(abs, { recursive: true });
  else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
}

export function renameEntry(locator, fromRel, toRel) {
  const from = locator.resolve(fromRel);
  const to = locator.resolve(toRel);
  if (!fs.existsSync(from)) throw new Error("Quelle nicht gefunden");
  if (fs.existsSync(to) && from.toLowerCase() !== to.toLowerCase()) throw new Error("Ziel existiert bereits");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}

export function deleteEntry(locator, rel) {
  const abs = locator.resolve(rel);
  if (abs.toLowerCase() === path.resolve(locator.root).toLowerCase()) throw new Error("Projektordner kann nicht gelöscht werden");
  if (!fs.existsSync(abs)) return;
  fs.rmSync(abs, { recursive: true, force: true });
}

export function duplicateEntry(locator, rel) {
  const abs = locator.resolve(rel);
  if (!fs.existsSync(abs)) throw new Error("Quelle nicht gefunden");
  const dir = path.dirname(abs);
  const ext = path.extname(abs);
  const base = path.basename(abs, ext);
  let n = 1;
  let target = path.join(dir, `${base}-kopie${ext}`);
  while (fs.existsSync(target)) {
    n += 1;
    target = path.join(dir, `${base}-kopie${n}${ext}`);
  }
  fs.cpSync(abs, target, { recursive: true });
  const relDir = path.posix.dirname(String(rel).replace(/\\/g, "/"));
  return relDir === "." ? path.basename(target) : `${relDir}/${path.basename(target)}`;
}

/* ------------------------------------------------------------------ */
/* Konfiguration                                                       */
/* ------------------------------------------------------------------ */

export function configPath(root) {
  return path.join(root, ".local-overleaf", "config.json");
}

export function readConfig(root) {
  try {
    return JSON.parse(fs.readFileSync(configPath(root), "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(root, cfg) {
  const p = configPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
}

/* ------------------------------------------------------------------ */
/* LaTeX-Dateien & Metadaten                                           */
/* ------------------------------------------------------------------ */

function walkFiles(base, rel, acc, filter, depth = 0, exclude = []) {
  let abs;
  try {
    abs = safeResolve(base, rel);
  } catch {
    return acc;
  }
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (shouldSkip(entry, false)) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (exclude.length && isExcluded(toPosix(childRel), exclude)) continue;
      if (depth < 12) walkFiles(base, childRel, acc, filter, depth + 1, exclude);
    } else if (entry.isFile() && filter(entry.name)) {
      acc.push(toPosix(childRel));
    }
  }
  return acc;
}

export function listTexFiles(root, exclude = []) {
  return walkFiles(root, "", [], (n) => /\.(tex|ltx)$/i.test(n), 0, exclude);
}

export function listBibFiles(root, exclude = []) {
  return walkFiles(root, "", [], (n) => /\.bib$/i.test(n), 0, exclude);
}

export function listImageFiles(root, exclude = []) {
  return walkFiles(root, "", [], (n) => IMAGE_EXTS.has(extOf(n)) || /\.pdf$/i.test(n), 0, exclude);
}

export function listCsvFiles(root, exclude = []) {
  return walkFiles(root, "", [], (n) => /\.(csv|tsv)$/i.test(n), 0, exclude);
}

export function detectMainFile(root, exclude = []) {
  const cfg = readConfig(root);
  if (cfg.mainFile) {
    try {
      if (fs.existsSync(safeResolve(root, cfg.mainFile))) return cfg.mainFile;
    } catch {
      /* ignore */
    }
  }
  for (const name of MAIN_CANDIDATES) {
    if (fs.existsSync(path.join(root, name))) return name;
  }
  const texFiles = listTexFiles(root, exclude);
  const withClass = [];
  for (const rel of texFiles) {
    try {
      const text = fs.readFileSync(safeResolve(root, rel), "utf8");
      if (/^\s*\\documentclass\b/m.test(text)) withClass.push(rel);
    } catch {
      /* skip */
    }
  }
  if (withClass.length === 1) return withClass[0];
  const preferred = withClass.find((f) => /(main|thesis|bachelor|arbeit)/i.test(f));
  return preferred || withClass[0] || texFiles[0] || null;
}

export function stripComment(line) {
  let out = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\") {
      out += ch + (line[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (ch === "%") break;
    out += ch;
  }
  return out;
}

/** Liest einen {…}-Block mit verschachtelten Klammern ab Position `start` (zeigt auf "{"). */
export function readBraced(text, start) {
  if (text[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { content: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

/** Sammelt \input/\include-Abhängigkeiten ab der Hauptdatei (Reihenfolge des Dokuments). */
export function includeOrder(root, mainFile) {
  const order = [];
  const seen = new Set();
  function visit(rel) {
    const norm = rel.replace(/\\/g, "/");
    if (seen.has(norm)) return;
    seen.add(norm);
    let text;
    try {
      text = fs.readFileSync(safeResolve(root, norm), "utf8");
    } catch {
      return;
    }
    order.push(norm);
    const dir = path.posix.dirname(norm);
    const clean = text.split(/\r?\n/).map(stripComment).join("\n");
    for (const m of clean.matchAll(/\\(?:input|include|subfile|import)\s*\{([^}]+)\}/g)) {
      let target = m[1].trim().replace(/\\/g, "/");
      if (!/\.tex$/i.test(target)) target += ".tex";
      const candidates = [target, path.posix.join(dir, target)];
      for (const c of candidates) {
        const cleanPath = c.replace(/^\.\//, "");
        try {
          if (fs.existsSync(safeResolve(root, cleanPath))) {
            visit(cleanPath);
            break;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (mainFile) visit(mainFile);
  return order;
}

const SECTION_RE = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{/g;

function cleanTitle(s) {
  return s.replace(/\\[a-zA-Z@]+\s*/g, "").replace(/[{}]/g, "").replace(/~/g, " ").trim();
}

/** Labels, Gliederung, Zitate, Aufgaben, Abkürzungen, Gleitobjekte – alles mit Datei und Zeile. */
export function extractMeta(root, mainFile = null, exclude = []) {
  const labels = [];
  const citations = [];
  const sections = [];
  const todos = [];
  const acronyms = [];
  const floats = [];
  const refs = [];
  const cites = [];
  const acUsed = [];
  const cited = new Set();
  const texFiles = listTexFiles(root, exclude);
  const bibFiles = listBibFiles(root, exclude);
  const ordered = mainFile ? includeOrder(root, mainFile) : [];
  const orderIndex = new Map(ordered.map((f, i) => [f, i]));
  const sortedTex = [...texFiles].sort((a, b) => {
    const ia = orderIndex.has(a) ? orderIndex.get(a) : 1e6;
    const ib = orderIndex.has(b) ? orderIndex.get(b) : 1e6;
    return ia - ib || a.localeCompare(b);
  });

  for (const rel of sortedTex) {
    let text;
    try {
      text = fs.readFileSync(safeResolve(root, rel), "utf8");
    } catch {
      continue;
    }
    const inDocument = orderIndex.has(rel);
    const rawLines = text.split(/\r?\n/);
    const clean = rawLines.map(stripComment).join("\n");

    for (const m of clean.matchAll(/\\label\s*\{([^}]+)\}/g)) {
      labels.push({ key: m[1].trim(), file: rel, line: lineOf(clean, m.index), inDocument });
    }
    // Listings vergeben Labels als Option: \lstinputlisting[label={lst:x}]{…}, \begin{lstlisting}[label=lst:x]
    for (const m of clean.matchAll(/\\(?:begin\{lstlisting\}|lstinputlisting)\s*\[([^\]]*)\]/g)) {
      const lab = m[1].match(/(?:^|,)\s*label\s*=\s*(?:\{([^}]*)\}|([^,]+))/);
      const key = (lab?.[1] ?? lab?.[2] ?? "").trim();
      if (key) labels.push({ key, file: rel, line: lineOf(clean, m.index), inDocument });
    }
    for (const m of clean.matchAll(/\\(?:cite\w*|parencite|textcite|autocite|footcite|fullcite|nocite)\*?\s*(?:\[[^\]]*\]\s*)*\{([^}]+)\}/g)) {
      const line = lineOf(clean, m.index);
      for (const k of m[1].split(",")) {
        if (k.trim()) {
          cited.add(k.trim());
          cites.push({ key: k.trim(), file: rel, line });
        }
      }
    }
    for (const m of clean.matchAll(/\\(?:ref|eqref|cref|Cref|autoref|nameref|pageref|vref|fref|Fref)\*?\s*\{([^}]+)\}/g)) {
      const line = lineOf(clean, m.index);
      for (const k of m[1].split(",")) if (k.trim()) refs.push({ key: k.trim(), file: rel, line });
    }
    for (const m of clean.matchAll(/\\(?:ac|acs|acl|acf|acp|acsp|aclp|acfp|Ac|Acp|acsu|aclu|gls|Gls|glspl|Glspl)\*?\s*\{([^}]+)\}/g)) {
      acUsed.push({ key: m[1].trim(), file: rel, line: lineOf(clean, m.index) });
    }
    for (const m of clean.matchAll(SECTION_RE)) {
      const braced = readBraced(clean, m.index + m[0].length - 1);
      if (!braced) continue;
      sections.push({
        level: m[1],
        title: cleanTitle(braced.content),
        file: rel,
        line: lineOf(clean, m.index),
        starred: m[0].includes("*"),
        inDocument,
      });
    }
    for (const m of clean.matchAll(/\\begin\{(figure|table|listing|lstlisting|algorithm)\*?\}/g)) {
      const after = clean.slice(m.index, m.index + 2500);
      const cap = after.match(/\\caption\s*(?:\[[^\]]*\])?\s*\{/);
      let caption = "";
      if (cap) {
        const braced = readBraced(after, cap.index + cap[0].length - 1);
        caption = braced ? cleanTitle(braced.content) : "";
      }
      const lab = after.match(/\\label\s*\{([^}]+)\}/);
      floats.push({ kind: m[1], caption, label: lab ? lab[1] : "", file: rel, line: lineOf(clean, m.index) });
    }
    for (const m of clean.matchAll(/\\acro\s*\{([^}]+)\}\s*(?:\[[^\]]*\])?\s*\{/g)) {
      const braced = readBraced(clean, m.index + m[0].length - 1);
      acronyms.push({ key: m[1].trim(), long: braced ? braced.content.trim() : "", file: rel, line: lineOf(clean, m.index) });
    }
    for (const m of clean.matchAll(/\\newacronym\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}\s*\{([^}]+)\}\s*\{/g)) {
      const braced = readBraced(clean, m.index + m[0].length - 1);
      acronyms.push({ key: m[1].trim(), short: m[2].trim(), long: braced ? braced.content.trim() : "", file: rel, line: lineOf(clean, m.index) });
    }

    rawLines.forEach((raw, i) => {
      const line = i + 1;
      const code = stripComment(raw);
      const todoCmd = code.match(/\\(todo|missingfigure|fixme)\s*(\[[^\]]*\])?\s*\{/);
      if (todoCmd) {
        const braced = readBraced(code, todoCmd.index + todoCmd[0].length - 1);
        const textPart = braced ? braced.content : code.slice(todoCmd.index + todoCmd[0].length);
        todos.push({ kind: todoCmd[1] === "missingfigure" ? "figure" : "todo", text: textPart.trim(), file: rel, line });
      }
      const comment = raw.match(/%\s*(TODO|FIXME|XXX|HACK|NOTE|FRAGE|OFFEN)\b[:\s-]*(.*)$/i);
      if (comment) {
        todos.push({ kind: comment[1].toLowerCase() === "note" ? "note" : "todo", text: comment[2].trim() || comment[1], file: rel, line });
      }
      if (/\\(lipsum|blindtext|Blindtext|blinddocument)\b/.test(stripComment(raw))) {
        todos.push({ kind: "placeholder", text: "Blindtext ersetzen", file: rel, line });
      }
    });
  }

  for (const rel of bibFiles) {
    let text;
    try {
      text = fs.readFileSync(safeResolve(root, rel), "utf8");
    } catch {
      continue;
    }
    for (const entry of parseBibEntries(text)) {
      citations.push({ ...entry, file: rel });
    }
  }

  return { labels, citations, sections, todos, acronyms, floats, refs, cites, acUsed, includeOrder: ordered, citedKeys: [...cited] };
}

/** Kompakter BibTeX-Parser (Schlüssel, Typ, Felder, Zeile, Rohtext). */
export function parseBibEntries(text) {
  const entries = [];
  const re = /@(\w+)\s*[{(]\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const type = m[1].toLowerCase();
    if (type === "comment" || type === "preamble" || type === "string") continue;
    const start = m.index;
    let depth = 0;
    let end = text.length;
    for (let i = m.index + m[0].length; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        if (depth === 0) {
          end = i + 1;
          break;
        }
        depth -= 1;
      }
    }
    const body = text.slice(start + m[0].length, end - 1);
    const fields = {};
    const fieldRe = /(\w[\w-]*)\s*=\s*/g;
    let f;
    while ((f = fieldRe.exec(body))) {
      const name = f[1].toLowerCase();
      const i = f.index + f[0].length;
      let value = "";
      if (body[i] === "{") {
        const braced = readBraced(body, i);
        if (!braced) break;
        value = braced.content;
        fieldRe.lastIndex = braced.end;
      } else if (body[i] === '"') {
        let j = i + 1;
        let depthQ = 0;
        while (j < body.length) {
          if (body[j] === "{") depthQ += 1;
          else if (body[j] === "}") depthQ -= 1;
          else if (body[j] === '"' && depthQ === 0) break;
          j += 1;
        }
        value = body.slice(i + 1, j);
        fieldRe.lastIndex = j + 1;
      } else {
        const rest = body.slice(i).match(/^[^,\n]*/);
        value = (rest ? rest[0] : "").trim();
        fieldRe.lastIndex = i + Math.max(1, value.length);
      }
      fields[name] = value.replace(/\s+/g, " ").trim();
    }
    const authors = fields.author || fields.editor || "";
    entries.push({
      key: m[2],
      type,
      title: (fields.title || "").replace(/[{}]/g, ""),
      author: authors.replace(/[{}]/g, ""),
      year: fields.year || (fields.date ? String(fields.date).slice(0, 4) : ""),
      journal: fields.journal || fields.journaltitle || fields.booktitle || fields.publisher || "",
      doi: fields.doi || "",
      url: fields.url || "",
      fields,
      line: lineOf(text, start),
      raw: text.slice(start, end),
    });
    re.lastIndex = end;
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Projektweite Suche                                                  */
/* ------------------------------------------------------------------ */

export function searchProject(locator, { query, regex = false, caseSensitive = false, includeMounts = true, limit = 400, excludePaths = [] }) {
  if (!query) return { results: [], truncated: false, files: 0 };
  let re;
  try {
    re = regex
      ? new RegExp(query, caseSensitive ? "g" : "gi")
      : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
  } catch (err) {
    throw new Error(`Ungültiger regulärer Ausdruck: ${err.message}`);
  }
  const results = [];
  let truncated = false;
  let filesScanned = 0;
  const roots = [{ base: locator.root, prefix: "" }];
  if (includeMounts) for (const m of locator.mounts) roots.push({ base: m.path, prefix: `@${m.name}` });

  outer: for (const { base, prefix } of roots) {
    if (!fs.existsSync(base)) continue;
    const files = walkFiles(base, "", [], () => true, 0, prefix ? [] : excludePaths);
    for (const rel of files) {
      const abs = path.join(base, rel);
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (st.size > 2 * 1024 * 1024) continue;
      if (!isTextFile(abs)) continue;
      filesScanned += 1;
      let text;
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      const vpath = prefix ? `${prefix}/${rel}` : rel;
      for (let i = 0; i < lines.length; i += 1) {
        re.lastIndex = 0;
        const line = lines[i];
        let mm;
        while ((mm = re.exec(line))) {
          results.push({ file: vpath, line: i + 1, column: mm.index + 1, text: line.slice(0, 300), match: mm[0] });
          if (results.length >= limit) {
            truncated = true;
            break outer;
          }
          if (mm[0].length === 0) re.lastIndex += 1;
        }
      }
    }
  }
  return { results, truncated, files: filesScanned };
}

/* ------------------------------------------------------------------ */
/* Zuletzt geöffnet / Vorlage                                          */
/* ------------------------------------------------------------------ */

export function userDir() {
  return path.join(os.homedir(), ".thesisleaf");
}

export function recentsPath() {
  return path.join(userDir(), "recents.json");
}

export function readRecents() {
  try {
    const list = JSON.parse(fs.readFileSync(recentsPath(), "utf8"));
    return list.filter((p) => typeof p === "string" && fs.existsSync(p));
  } catch {
    return [];
  }
}

export function pushRecent(projectPath) {
  const abs = path.resolve(projectPath);
  const list = readRecents().filter((p) => p.toLowerCase() !== abs.toLowerCase());
  list.unshift(abs);
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(recentsPath(), JSON.stringify(list.slice(0, 12), null, 2));
}

export function removeRecent(projectPath) {
  const abs = path.resolve(projectPath);
  const list = readRecents().filter((p) => p.toLowerCase() !== abs.toLowerCase());
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(recentsPath(), JSON.stringify(list, null, 2));
  return list;
}

/** Felder des Dialogs "Neue Bachelorarbeit" – Platzhalter {{KEY}} in der Vorlage. */
export const TEMPLATE_FIELDS = [
  { key: "TITEL", label: "Titel der Arbeit", default: "Titel der Bachelorarbeit" },
  { key: "UNTERTITEL", label: "Untertitel (optional)", default: "" },
  { key: "AUTOR", label: "Vor- und Nachname", default: "Vorname Nachname" },
  { key: "MATRIKEL", label: "Matrikelnummer", default: "1234567" },
  { key: "STUDIENGANG", label: "Studiengang", default: "Informatik (B.Sc.)" },
  { key: "HOCHSCHULE", label: "Hochschule / Universität", default: "Hochschule Musterstadt" },
  { key: "FAKULTAET", label: "Fakultät / Fachbereich", default: "Fakultät für Informatik" },
  { key: "ERSTPRUEFER", label: "Erstprüfer:in", default: "Prof. Dr. Beispiel" },
  { key: "ZWEITPRUEFER", label: "Zweitprüfer:in", default: "Prof. Dr. Muster" },
  { key: "ORT", label: "Ort", default: "Musterstadt" },
  { key: "ABGABE", label: "Abgabedatum (leer = heute)", default: "" },
  { key: "SPRACHE", label: "Sprache", default: "ngerman", options: [["ngerman", "Deutsch"], ["english", "Englisch"]] },
  {
    key: "ZITIERSTIL",
    label: "Zitierstil",
    default: "numeric",
    options: [
      ["numeric", "Numerisch [1]"],
      ["ieee", "IEEE"],
      ["authoryear", "Autor-Jahr (Harvard)"],
      ["apa", "APA 7"],
      ["alphabetic", "Alphabetisch [Mus21]"],
    ],
  },
];

function latexEscape(value) {
  return String(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

export function copyTemplate(targetDir, vars = {}) {
  // Ein bereits als Projekt geöffneter, sonst leerer Ordner enthält nur .local-overleaf
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).some((n) => n !== ".local-overleaf" && !ALWAYS_HIDDEN_FILES.has(n))) {
    throw new Error("Zielordner ist nicht leer");
  }
  fs.cpSync(TEMPLATE_DIR, targetDir, {
    recursive: true,
    filter: (src) => !src.replace(/\\/g, "/").includes("/.local-overleaf"),
  });
  const values = {};
  for (const f of TEMPLATE_FIELDS) {
    const raw = vars[f.key] !== undefined && vars[f.key] !== null && String(vars[f.key]).trim() !== "" ? String(vars[f.key]) : f.default;
    values[f.key] = f.options ? raw : latexEscape(raw);
  }
  if (!values.ABGABE) values.ABGABE = "\\today";
  const files = walkFiles(targetDir, "", [], (n) => /\.(tex|bib|md|txt)$/i.test(n));
  for (const rel of files) {
    const abs = path.join(targetDir, rel);
    let text = fs.readFileSync(abs, "utf8");
    let changed = false;
    text = text.replace(/\{\{([A-Z_]+)\}\}/g, (all, key) => {
      if (values[key] === undefined) return all;
      changed = true;
      return values[key];
    });
    if (changed) fs.writeFileSync(abs, text, "utf8");
  }
  return values;
}

export function ensureLocalIgnore(root) {
  const gitignore = path.join(root, ".gitignore");
  const line = ".local-overleaf/";
  if (fs.existsSync(path.join(root, ".git"))) {
    let current = "";
    if (fs.existsSync(gitignore)) current = fs.readFileSync(gitignore, "utf8");
    if (!current.split(/\r?\n/).some((l) => l.trim() === line)) {
      const prefix = current && !current.endsWith("\n") ? "\n" : "";
      fs.writeFileSync(gitignore, `${current}${prefix}${line}\n`, "utf8");
    }
  }
}

export function revealInExplorer(absPath) {
  const isDir = fs.existsSync(absPath) && fs.statSync(absPath).isDirectory();
  let child;
  if (process.platform === "win32") {
    child = spawn("explorer.exe", isDir ? [absPath] : [`/select,${absPath}`], { detached: true, stdio: "ignore" });
  } else if (process.platform === "darwin") {
    child = spawn("open", isDir ? [absPath] : ["-R", absPath], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [isDir ? absPath : path.dirname(absPath)], { detached: true, stdio: "ignore" });
  }
  child.unref();
}
