import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { ensureLatexPath, detectLatex, toolPath } from "./latex.js";
import { parseLatexLog, parseBibLog } from "./logparser.js";

const COMPILE_TIMEOUT_MS = 6 * 60 * 1000;

export function buildDir(root) {
  return path.join(root, ".local-overleaf", "build");
}

/** Ordner der Hauptdatei (Arbeitsverzeichnis der Engine). */
export function mainDirFor(root, mainFile) {
  return path.dirname(path.resolve(root, mainFile));
}

/** Pfad der Hauptdatei-Ordners relativ zum Projekt, posix ("" wenn identisch). */
export function mainDirRel(root, mainFile) {
  const rel = path.relative(path.resolve(root), mainDirFor(root, mainFile));
  return rel.split(path.sep).join("/");
}

export function pdfPathFor(root, mainFile) {
  const base = path.basename(mainFile, path.extname(mainFile));
  return path.join(buildDir(root), `${base}.pdf`);
}

export function logPathFor(root, mainFile) {
  const base = path.basename(mainFile, path.extname(mainFile));
  return path.join(buildDir(root), `${base}.log`);
}

function readHead(file, bytes = 4000) {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    fs.closeSync(fd);
    return buf.toString("utf8", 0, n);
  } catch {
    return "";
  }
}

/** Engine aus Magic-Comment, Konfiguration oder Präambel ableiten. */
export function resolveEngine(root, mainFile, configured = "auto") {
  const head = readHead(path.resolve(root, mainFile));
  const magic = head.match(/^%\s*!\s*TeX\s+(?:TS-)?program\s*=\s*(\w+)/im);
  if (magic) {
    const e = magic[1].toLowerCase();
    if (["pdflatex", "xelatex", "lualatex"].includes(e)) return { engine: e, source: "magic" };
  }
  if (configured && configured !== "auto") return { engine: configured, source: "config" };
  if (/\\usepackage(\[[^\]]*\])?\{(fontspec|polyglossia|unicode-math)\}/.test(head)) return { engine: "xelatex", source: "preamble" };
  if (/\\usepackage(\[[^\]]*\])?\{(luacode|luatextra|luacolor)\}/.test(head)) return { engine: "lualatex", source: "preamble" };
  return { engine: "pdflatex", source: "default" };
}

export function resolveBibTool(root, mainFile, configured = "auto") {
  const head = readHead(path.resolve(root, mainFile), 12000);
  const magic = head.match(/^%\s*!\s*BIB\s+(?:TS-)?program\s*=\s*(\w+)/im);
  if (magic) {
    const b = magic[1].toLowerCase();
    if (["biber", "bibtex", "none"].includes(b)) return b;
  }
  if (configured && configured !== "auto") return configured;
  let text = head;
  const preambleInputs = [...head.matchAll(/\\input\{([^}]+)\}/g)].map((m) => m[1]);
  for (const inc of preambleInputs.slice(0, 4)) {
    const p = path.resolve(root, /\.tex$/i.test(inc) ? inc : `${inc}.tex`);
    text += "\n" + readHead(p, 12000);
  }
  if (/backend\s*=\s*bibtex/.test(text)) return "bibtex";
  if (/\\usepackage(\[[^\]]*\])?\{biblatex\}/.test(text) || /\\addbibresource/.test(text)) return "biber";
  if (/\\bibliography\{/.test(text) || /\\bibliographystyle\{/.test(text)) return "bibtex";
  return "none";
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }
}

function run(cmd, args, { cwd, env, onLog, signal, timeout = COMPILE_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    let log = "";
    let done = false;
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, MIKTEX_AUTOINSTALL: "1", ...(env || {}) },
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      log += `\n[ThesisLeaf] Abbruch: ${cmd} hat länger als ${Math.round(timeout / 1000)} s gebraucht.\n`;
      killTree(child);
    }, timeout);
    const onAbort = () => {
      log += `\n[ThesisLeaf] Kompilierung abgebrochen.\n`;
      killTree(child);
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve({ code, log });
    };
    child.stdout.on("data", (buf) => {
      const chunk = buf.toString("utf8");
      log += chunk;
      onLog?.(chunk);
    });
    child.stderr.on("data", (buf) => {
      const chunk = buf.toString("utf8");
      log += chunk;
      onLog?.(chunk);
    });
    child.on("error", (err) => {
      log += `\n${err.message}\n`;
      onLog?.(`\n${err.message}\n`);
      finish(1);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
}

/**
 * Kompiliert das Projekt: Engine-Lauf → (Biber/BibTeX) → weitere Läufe, bis
 * Querverweise stabil sind. Liefert Diagnosen, Seitenzahl und Log.
 */
export async function compileProject({ root, mainFile, engine = "auto", bibTool = "auto", onLog, signal }) {
  ensureLatexPath();
  const tools = detectLatex();
  const started = Date.now();
  const resolved = resolveEngine(root, mainFile, engine);
  const engineName = resolved.engine;
  const bib = resolveBibTool(root, mainFile, bibTool);

  if (!tools[engineName]) {
    const message = tools.pdflatex
      ? `${engineName} ist nicht installiert.`
      : "Kein LaTeX gefunden. Bitte MiKTeX (https://miktex.org) oder TeX Live installieren.";
    return {
      ok: false,
      success: false,
      log: message,
      diagnostics: [{ severity: "error", kind: "toolchain", file: null, line: null, message }],
      errors: [{ severity: "error", kind: "toolchain", file: null, line: null, message }],
      warnings: [],
      infos: [],
      pages: 0,
      pdf: null,
      duration: 0,
      engine: engineName,
      bibTool: bib,
      passes: [],
      cancelled: false,
    };
  }

  const outDir = buildDir(root);
  fs.mkdirSync(outDir, { recursive: true });
  const outDirArg = outDir.replace(/\\/g, "/");
  // Die Engine läuft im Ordner der Hauptdatei: \input{chapters/…} und \addbibresource{refs.bib}
  // sind relativ dazu (wie in Overleaf und LaTeX Workshop) – wichtig, wenn die Arbeit in einem Unterordner liegt.
  const mainDir = mainDirFor(root, mainFile);
  const mainName = path.basename(mainFile);
  const base = path.basename(mainFile, path.extname(mainFile));
  const pdfPath = path.join(outDir, `${base}.pdf`);
  const bcfPath = path.join(outDir, `${base}.bcf`);
  const bblPath = path.join(outDir, `${base}.bbl`);
  const auxPath = path.join(outDir, `${base}.aux`);
  const passes = [];
  let fullLog = "";
  let lastEngineLog = "";
  let bibLog = "";

  const engineArgs = ["-interaction=nonstopmode", "-file-line-error", "-synctex=1", `-output-directory=${outDirArg}`, mainName];
  const parseOpts = { root, mainFile, cwd: mainDir };

  async function runEngine(label) {
    const header = `\n=== ${engineName} (${label}) ===\n`;
    onLog?.(header);
    fullLog += header;
    const result = await run(toolPath(engineName), engineArgs, { cwd: mainDir, onLog, signal });
    fullLog += result.log;
    lastEngineLog = result.log;
    passes.push({ tool: engineName, label, code: result.code });
    return result;
  }

  async function runBib() {
    if (bib === "none") return false;
    if (bib === "biber") {
      if (!tools.biber) {
        fullLog += "\n[ThesisLeaf] Biber fehlt – Literaturverzeichnis kann nicht erzeugt werden.\n";
        return false;
      }
      if (!fs.existsSync(bcfPath)) return false;
      const header = "\n=== biber ===\n";
      onLog?.(header);
      fullLog += header;
      const result = await run(toolPath("biber"), ["--output-directory", outDirArg, base], { cwd: mainDir, onLog, signal });
      fullLog += result.log;
      bibLog += result.log;
      passes.push({ tool: "biber", code: result.code });
      return true;
    }
    if (bib === "bibtex") {
      if (!tools.bibtex) {
        fullLog += "\n[ThesisLeaf] BibTeX fehlt – Literaturverzeichnis kann nicht erzeugt werden.\n";
        return false;
      }
      if (!fs.existsSync(auxPath)) return false;
      const header = "\n=== bibtex ===\n";
      onLog?.(header);
      fullLog += header;
      const sep = path.delimiter;
      const result = await run(toolPath("bibtex"), [base], {
        cwd: outDir,
        onLog,
        signal,
        env: {
          BIBINPUTS: `${mainDir}${sep}${root}${sep}${outDir}${sep}`,
          BSTINPUTS: `${mainDir}${sep}${root}${sep}`,
          TEXMFOUTPUT: outDir,
          openout_any: "a",
        },
      });
      fullLog += result.log;
      bibLog += result.log;
      passes.push({ tool: "bibtex", code: result.code });
      return true;
    }
    return false;
  }

  // Die .bcf/.aux werden bei jedem Lauf neu geschrieben – Zeitstempel taugen daher nicht.
  // Stattdessen: Hash der zitierten Schlüssel (+ .bib-Zeitstempel) mit dem Stand des letzten Biber/BibTeX-Laufs vergleichen.
  const hashPath = path.join(outDir, ".bib-hash");
  function bibSourcesStamp() {
    const dirs = mainDir.toLowerCase() === path.resolve(root).toLowerCase() ? [root] : [mainDir, root];
    const parts = [];
    for (const dir of dirs) {
      try {
        for (const n of fs.readdirSync(dir)) {
          if (/\.bib$/i.test(n)) parts.push(`${n}:${Math.round(fs.statSync(path.join(dir, n)).mtimeMs)}`);
        }
      } catch {
        /* ignore */
      }
    }
    return parts.join("|");
  }
  function bibInputHash() {
    try {
      if (bib === "biber") {
        const bcf = fs.readFileSync(bcfPath, "utf8");
        const keys = [...bcf.matchAll(/<bcf:citekey[^>]*>([^<]+)</g)].map((m) => m[1]).sort().join(",");
        return `${keys}#${bibSourcesStamp()}`;
      }
      const aux = fs.readFileSync(auxPath, "utf8");
      const lines = aux
        .split(/\r?\n/)
        .filter((l) => /^\\(citation|bibdata|bibstyle)\{/.test(l))
        .sort()
        .join("\n");
      return `${lines}#${bibSourcesStamp()}`;
    } catch {
      return "";
    }
  }
  function readHash() {
    try {
      return fs.readFileSync(hashPath, "utf8");
    } catch {
      return null;
    }
  }
  function writeHash() {
    try {
      fs.writeFileSync(hashPath, bibInputHash(), "utf8");
    } catch {
      /* ignore */
    }
  }

  function bibNeeded(parsed) {
    if (bib === "none") return false;
    if (signal?.aborted) return false;
    if (parsed.needsBib || parsed.undefinedCites.length) return true;
    if (bib === "biber") {
      if (!fs.existsSync(bcfPath)) return false;
      if (!fs.existsSync(bblPath)) return true;
      return readHash() !== bibInputHash();
    }
    if (bib === "bibtex") {
      if (!fs.existsSync(auxPath)) return false;
      const aux = fs.readFileSync(auxPath, "utf8");
      if (!/\\citation\{/.test(aux) && !/\\bibdata\{/.test(aux)) return false;
      if (!fs.existsSync(bblPath)) return true;
      return readHash() !== bibInputHash();
    }
    return false;
  }

  let result = await runEngine("1. Lauf");
  let parsed = parseLatexLog(lastEngineLog, parseOpts);
  let bibRan = false;

  if (!signal?.aborted && bibNeeded(parsed)) {
    bibRan = await runBib();
    if (bibRan) writeHash();
    if (bibRan && !signal?.aborted) {
      result = await runEngine("nach Literatur");
      parsed = parseLatexLog(lastEngineLog, parseOpts);
    }
  }

  let extra = 0;
  while (!signal?.aborted && (parsed.needsRerun || (bibRan && extra === 0)) && extra < 3 && parsed.errors.length === 0) {
    extra += 1;
    result = await runEngine(`Querverweise ${extra}`);
    parsed = parseLatexLog(lastEngineLog, parseOpts);
  }

  const duration = Date.now() - started;
  const pdfExists = fs.existsSync(pdfPath);
  const bibDiagnostics = bibRan ? parseBibLog(bibLog) : [];
  const diagnostics = [...parsed.diagnostics, ...bibDiagnostics];
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const infos = diagnostics.filter((d) => d.severity === "info");
  const cancelled = Boolean(signal?.aborted);

  let pdfMtime = 0;
  try {
    pdfMtime = fs.statSync(pdfPath).mtimeMs;
  } catch {
    /* ignore */
  }
  const pdfFresh = pdfExists && pdfMtime >= started - 1000;

  return {
    ok: pdfExists,
    success: pdfFresh && errors.length === 0 && !cancelled,
    stale: pdfExists && !pdfFresh,
    cancelled,
    log: fullLog,
    diagnostics,
    errors,
    warnings,
    infos,
    pages: parsed.pages,
    pdf: pdfExists ? pdfPath : null,
    duration,
    engine: engineName,
    engineSource: resolved.source,
    bibTool: bib,
    bibRan,
    passes,
    overfull: parsed.overfull,
    underfull: parsed.underfull,
    exitCode: result?.code ?? 1,
  };
}

/** Entfernt alle Hilfsdateien des Builds (behält das PDF). */
export function cleanBuild(root, { keepPdf = true } = {}) {
  const dir = buildDir(root);
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (keepPdf && /\.pdf$/i.test(name)) continue;
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return removed;
}
