import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import http from "http";
import { spawn } from "child_process";
import { WebSocketServer } from "ws";
import chokidar from "chokidar";
import { fileURLToPath } from "url";
import { pickFolder as powershellPicker } from "./picker.js";
import { detectLatex } from "./latex.js";
import { compileProject, pdfPathFor, logPathFor, cleanBuild, resolveEngine, resolveBibTool, mainDirRel } from "./compile.js";
import { forwardSync, inverseSync } from "./synctex.js";
import { projectStats, recordDaily, dailySeries } from "./stats.js";
import { lookupReference, searchReferences, checkBib } from "./bib.js";
import { zipDirectory } from "./zip.js";
import { runChktex, quickChecks } from "./lint.js";
import { checkSpelling, checkGrammar, addToDictionary, ignoredWords } from "./spell.js";
import { writeBackup, listBackups, latestMtime } from "./backup.js";
import {
  makeLocator,
  buildRootListing,
  listDir,
  detectHeavyDirs,
  fileIndex,
  readFileUtf8,
  writeFileUtf8,
  writeFileBuffer,
  statFile,
  createEntry,
  renameEntry,
  deleteEntry,
  duplicateEntry,
  copyEntry,
  detectMainFile,
  listTexFiles,
  listBibFiles,
  listImageFiles,
  listCsvFiles,
  extractMeta,
  analyzeDocument,
  readConfig,
  writeConfig,
  readRecents,
  pushRecent,
  removeRecent,
  copyTemplate,
  ensureLocalIgnore,
  isTextFile,
  isExcluded,
  fileKind,
  languageFor,
  searchProject,
  revealInExplorer,
  TEMPLATE_FIELDS,
  TEMPLATE_DIR,
} from "./files.js";
import { initHistory, snapshot, listHistory, showFile, diffFile, changedFiles, restore, restoreFile, hasGit } from "./history.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_SETTINGS = {
  autoCompile: true,
  engine: "auto",
  bibTool: "auto",
  showHidden: false,
  lint: true,
  compileDelay: 900,
  goals: { words: 9000, pages: 40, deadline: "" },
  mounts: [],
  excludePaths: [],
  autoExcludeHeavy: true,
  spell: { enabled: true, language: "auto", markdown: false },
  grammar: { enabled: false, url: "https://api.languagetool.org/v2/check" },
  backup: { dir: "", everyMinutes: 60, keep: 20 },
  protocolFile: "",
  checklist: {},
};

/**
 * Baut die ThesisLeaf-Anwendung (Express + WebSocket). Wird vom CLI-Start
 * und von der Electron-Hülle gleichermaßen verwendet.
 */
export function createApp({ port = 3847, host = "127.0.0.1", picker = null, staticDir = null } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "80mb" }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  const state = {
    projectPath: null,
    locator: null,
    mainFile: null,
    settings: { ...DEFAULT_SETTINGS },
    watcher: null,
    compiling: false,
    pendingCompile: false,
    compileTimer: null,
    historyTimer: null,
    updateTimer: null,
    abort: null,
    lastCompile: null,
    lastStats: null,
    lastLint: { available: null, items: [] },
    lintTimer: null,
    lintRunning: false,
    lintQueue: new Set(),
    logBuffer: "",
    backupTimer: null,
    lastBackupAt: 0,
    docCache: null,
    heavyDirs: [],
    heavyScannedAt: 0,
    indexCache: null,
  };

  function broadcast(payload) {
    const raw = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(raw);
    }
  }

  function requireProject(res) {
    if (!state.projectPath) {
      res.status(400).json({ error: "Kein Projekt geöffnet" });
      return false;
    }
    return true;
  }

  function persistSettings() {
    if (!state.projectPath) return;
    const cfg = readConfig(state.projectPath);
    writeConfig(state.projectPath, { ...cfg, ...state.settings, mainFile: state.mainFile });
  }

  /** Wirksame Ausschlüsse für Beobachtung, Suche, Historie, Sicherung, Index: manuell + automatisch erkannte schwere Ordner. */
  const excludes = () => {
    const manual = state.settings.excludePaths || [];
    const heavy = state.settings.autoExcludeHeavy === false ? [] : state.heavyDirs || [];
    return [...new Set([...manual, ...heavy])];
  };

  function rescanHeavy(force = false) {
    if (!state.projectPath) return;
    if (!force && Date.now() - state.heavyScannedAt < 120000) return;
    try {
      state.heavyDirs = detectHeavyDirs(state.projectPath, { exclude: state.settings.excludePaths || [] });
    } catch {
      state.heavyDirs = [];
    }
    state.heavyScannedAt = Date.now();
  }

  function currentEngine() {
    if (!state.projectPath || !state.mainFile) return null;
    try {
      return {
        ...resolveEngine(state.projectPath, state.mainFile, state.settings.engine),
        bibTool: resolveBibTool(state.projectPath, state.mainFile, state.settings.bibTool),
      };
    } catch {
      return null;
    }
  }

  function docInfo() {
    if (!state.projectPath) return null;
    const doc = analyzeDocument(state.projectPath, state.mainFile);
    doc.mainDir = state.mainFile ? mainDirRel(state.projectPath, state.mainFile) : "";
    doc.protocolFile = protocolFile();
    state.docCache = doc;
    return doc;
  }

  function protocolFile() {
    if (state.settings.protocolFile) return state.settings.protocolFile;
    try {
      const names = fs.readdirSync(state.projectPath).filter((n) => /\.md$/i.test(n));
      const hit = names.find((n) => /arbeitsprotokoll|protokoll|worklog|logbuch|journal/i.test(n));
      return hit || "";
    } catch {
      return "";
    }
  }

  function projectInfo() {
    const root = state.projectPath;
    const ex = excludes();
    const meta = extractMeta(root, state.mainFile, ex);
    state.indexCache = null;
    return {
      path: root,
      name: path.basename(root),
      tree: buildRootListing(state.locator, { showHidden: state.settings.showHidden, exclude: state.settings.excludePaths || [], heavy: state.settings.autoExcludeHeavy === false ? [] : state.heavyDirs }),
      heavyDirs: state.heavyDirs,
      effectiveExcludes: ex,
      mainFile: state.mainFile,
      texFiles: listTexFiles(root, ex),
      bibFiles: listBibFiles(root, ex),
      imageFiles: listImageFiles(root, ex),
      csvFiles: listCsvFiles(root, ex),
      settings: state.settings,
      autoCompile: state.settings.autoCompile,
      resolved: currentEngine(),
      doc: docInfo(),
      latex: detectLatex(),
      meta,
      recents: readRecents(),
      hasPdf: state.mainFile ? fs.existsSync(pdfPathFor(root, state.mainFile)) : false,
      git: null,
    };
  }

  function vpathFor(absPath) {
    const norm = path.resolve(absPath);
    const root = path.resolve(state.projectPath);
    if (norm.toLowerCase().startsWith(root.toLowerCase() + path.sep) || norm.toLowerCase() === root.toLowerCase()) {
      return path.relative(root, norm).split(path.sep).join("/");
    }
    for (const m of state.locator.mounts) {
      const base = path.resolve(m.path);
      if (norm.toLowerCase().startsWith(base.toLowerCase() + path.sep)) {
        return `@${m.name}/${path.relative(base, norm).split(path.sep).join("/")}`;
      }
    }
    return null;
  }

  function scheduleUpdate() {
    clearTimeout(state.updateTimer);
    state.updateTimer = setTimeout(() => {
      if (!state.projectPath) return;
      try {
        rescanHeavy();
        broadcast({ type: "project:update", project: projectInfo() });
      } catch (err) {
        broadcast({ type: "error", message: err.message });
      }
    }, 250);
  }

  async function startWatcher() {
    if (state.watcher) {
      await state.watcher.close();
      state.watcher = null;
    }
    const root = state.projectPath;
    const ex = excludes();
    const paths = [root, ...state.locator.mounts.map((m) => m.path).filter((p) => fs.existsSync(p))];
    state.watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      ignored: (p) => {
        const n = p.replace(/\\/g, "/");
        if (/\/(\.git|\.local-overleaf|node_modules|__pycache__|\.venv|venv|\.ruff_cache|\.mypy_cache|\.pytest_cache)(\/|$)/.test(n)) return true;
        if (/\.tmp-\d+$/.test(n)) return true;
        if (ex.length) {
          const rootNorm = root.replace(/\\/g, "/");
          if (n.toLowerCase().startsWith(rootNorm.toLowerCase())) {
            const rel = n.slice(rootNorm.length).replace(/^\/+/, "");
            if (rel && isExcluded(rel, ex)) return true;
          }
        }
        return false;
      },
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 60 },
      depth: 14,
    });
    state.watcher.on("all", (event, absPath) => {
      if (!state.projectPath) return;
      const vpath = vpathFor(absPath);
      const inProject = vpath !== null && !vpath.startsWith("@");
      scheduleUpdate();
      if (vpath && ["add", "change", "unlink"].includes(event)) {
        broadcast({ type: "file:changed", path: vpath, event });
      }
      if (inProject) {
        scheduleHistory();
        const name = path.basename(absPath).toLowerCase();
        if (state.settings.autoCompile && ["change", "add", "unlink"].includes(event)) {
          if (/\.(tex|bib|sty|cls|png|jpg|jpeg|pdf|svg|csv|txt|ltx|def|cfg)$/.test(name)) scheduleCompile();
        }
        if (/\.(tex|md)$/i.test(name) && event !== "unlink") scheduleLint([vpath]);
      }
    });
  }

  async function openProject(projectPath) {
    const abs = path.resolve(projectPath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error("Ordner nicht gefunden");
    }
    await closeProject({ silent: true });
    state.projectPath = abs;
    fs.mkdirSync(path.join(abs, ".local-overleaf"), { recursive: true });
    ensureLocalIgnore(abs);
    const cfg = readConfig(abs);
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...Object.fromEntries(Object.entries(cfg).filter(([k]) => k in DEFAULT_SETTINGS)),
      goals: { ...DEFAULT_SETTINGS.goals, ...(cfg.goals || {}) },
      spell: { ...DEFAULT_SETTINGS.spell, ...(cfg.spell || {}) },
      grammar: { ...DEFAULT_SETTINGS.grammar, ...(cfg.grammar || {}) },
      backup: { ...DEFAULT_SETTINGS.backup, ...(cfg.backup || {}) },
      checklist: { ...(cfg.checklist || {}) },
      mounts: Array.isArray(cfg.mounts) ? cfg.mounts.filter((m) => m && m.name && m.path) : [],
      excludePaths: Array.isArray(cfg.excludePaths) ? cfg.excludePaths.filter((p) => typeof p === "string" && p.trim()) : [],
    };
    state.locator = makeLocator(abs, state.settings.mounts);
    rescanHeavy(true);
    state.mainFile = detectMainFile(abs, excludes());
    state.lastCompile = null;
    state.lastStats = null;
    state.lastLint = { available: null, items: [] };
    state.indexCache = null;
    writeConfig(abs, { ...cfg, ...state.settings, mainFile: state.mainFile });
    pushRecent(abs);
    await initHistory(abs, excludes());
    await startWatcher();
    try {
      await snapshot(abs, "Projekt geöffnet");
    } catch (err) {
      broadcast({ type: "history:error", message: err.message });
    }
    const info = projectInfo();
    info.git = await hasGit();
    refreshStats();
    scheduleLint();
    startBackupTimer();
    return info;
  }

  async function closeProject({ silent = false } = {}) {
    if (state.watcher) {
      await state.watcher.close();
      state.watcher = null;
    }
    clearTimeout(state.compileTimer);
    clearTimeout(state.historyTimer);
    clearTimeout(state.updateTimer);
    clearTimeout(state.lintTimer);
    clearInterval(state.backupTimer);
    if (state.abort) state.abort.abort();
    state.projectPath = null;
    state.locator = null;
    state.mainFile = null;
    state.docCache = null;
    if (!silent) broadcast({ type: "project:closed" });
  }

  function scheduleCompile(delay) {
    clearTimeout(state.compileTimer);
    state.compileTimer = setTimeout(() => runCompile("auto"), delay ?? state.settings.compileDelay ?? 900);
  }

  function scheduleHistory() {
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(async () => {
      if (!state.projectPath) return;
      try {
        const id = await snapshot(state.projectPath, "Automatisch gespeichert");
        if (id) broadcast({ type: "history:update", items: await listHistory(state.projectPath) });
      } catch (err) {
        broadcast({ type: "history:error", message: err.message });
      }
    }, 12000);
  }

  /* ---------------------------------------------------------------- */
  /* Prüfungen: chktex, Stil/Struktur, Rechtschreibung                */
  /* ---------------------------------------------------------------- */

  function scheduleLint(files) {
    if (!state.settings.lint && !state.settings.spell?.enabled) return;
    for (const f of files || []) state.lintQueue.add(f);
    clearTimeout(state.lintTimer);
    state.lintTimer = setTimeout(() => {
      const list = [...state.lintQueue];
      state.lintQueue.clear();
      runLint(list.length ? list : null);
    }, 1500);
  }

  function spellIgnoreSet(meta) {
    const set = ignoredWords(state.projectPath);
    for (const a of meta.acronyms || []) {
      set.add(a.key);
      for (const w of String(a.long || "").split(/\s+/)) if (w.length > 2) set.add(w.replace(/[^\p{L}]/gu, ""));
    }
    for (const c of meta.citations || []) set.add(c.key);
    return set;
  }

  async function runLint(files) {
    if (!state.projectPath) return;
    if (state.lintRunning) {
      for (const f of files || []) state.lintQueue.add(f);
      scheduleLint();
      return;
    }
    state.lintRunning = true;
    const root = state.projectPath;
    try {
      const meta = extractMeta(root, state.mainFile, excludes());
      const doc = state.docCache || docInfo();
      const included = meta.includeOrder.length ? meta.includeOrder : listTexFiles(root, excludes());
      let targets = files && files.length ? files.filter((f) => f && !f.startsWith("@")) : included;
      const texTargets = targets.filter((f) => /\.tex$/i.test(f));
      const mdTargets = targets.filter((f) => /\.md$/i.test(f));
      const items = [];
      if (state.settings.lint && texTargets.length) {
        const result = await runChktex(root, texTargets);
        state.lastLint.available = result.available;
        items.push(...result.items, ...quickChecks(root, texTargets, { meta, doc }));
      }
      if (state.settings.spell?.enabled) {
        const language = state.settings.spell.language && state.settings.spell.language !== "auto" ? state.settings.spell.language : doc?.language || "de";
        const ignore = spellIgnoreSet(meta);
        // Titelseiten/Erklärungen (Vorlagen-Boilerplate mit Eigennamen) nicht auf Rechtschreibung prüfen
        const isBoilerplate = (f) => /(^|\/)(front|title|titel|titelseite|erkl(ae|ä)rung|declaration|sperrvermerk)[^/]*\.tex$/i.test(f);
        const spellTargets = [...texTargets.filter((f) => !isBoilerplate(f)), ...(state.settings.spell.markdown ? mdTargets : [])];
        for (const rel of spellTargets) {
          let text;
          try {
            text = fs.readFileSync(path.resolve(root, rel), "utf8");
          } catch {
            continue;
          }
          if (text.length > 600000) continue;
          const kind = /\.md$/i.test(rel) ? "markdown" : "latex";
          const found = await checkSpelling(text, { kind, language, ignore });
          for (const it of found) items.push({ ...it, file: rel });
        }
      }
      const touched = new Set([...texTargets, ...mdTargets]);
      const others = (state.lastLint.items || []).filter((i) => !touched.has(i.file) && i.kind !== "grammar");
      const grammar = (state.lastLint.items || []).filter((i) => i.kind === "grammar" && !touched.has(i.file));
      state.lastLint = { available: state.lastLint.available, items: [...others, ...grammar, ...items] };
      broadcast({ type: "lint:update", ...state.lastLint });
    } catch (err) {
      broadcast({ type: "lint:update", available: state.lastLint.available, items: state.lastLint.items || [], error: err.message });
    } finally {
      state.lintRunning = false;
      if (state.lintQueue.size) scheduleLint();
    }
  }

  function refreshStats(pages) {
    if (!state.projectPath || !state.mainFile) return null;
    try {
      const stats = projectStats(state.projectPath, state.mainFile, { pages });
      recordDaily(state.projectPath, { words: stats.total.words, pages: stats.pages });
      state.lastStats = { ...stats, goals: state.settings.goals, daily: dailySeries(state.projectPath, 30) };
      broadcast({ type: "stats:update", stats: state.lastStats });
      return state.lastStats;
    } catch (err) {
      broadcast({ type: "error", message: `Statistik: ${err.message}` });
      return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sicherung                                                         */
  /* ---------------------------------------------------------------- */

  function startBackupTimer() {
    clearInterval(state.backupTimer);
    const cfg = state.settings.backup || {};
    if (!cfg.dir) return;
    const every = Math.max(5, Number(cfg.everyMinutes) || 60) * 60 * 1000;
    state.backupTimer = setInterval(() => runBackup({ onlyIfChanged: true }).catch(() => {}), every);
  }

  async function runBackup({ onlyIfChanged = false } = {}) {
    if (!state.projectPath) throw new Error("Kein Projekt geöffnet");
    const cfg = state.settings.backup || {};
    if (!cfg.dir) throw new Error("Kein Sicherungsordner konfiguriert (Einstellungen → Sicherung)");
    if (onlyIfChanged) {
      const changed = latestMtime(state.projectPath, { excludePaths: excludes() });
      if (changed <= state.lastBackupAt) return null;
    }
    const pdf = state.mainFile ? pdfPathFor(state.projectPath, state.mainFile) : null;
    const result = writeBackup(state.projectPath, { dir: cfg.dir, keep: cfg.keep || 20, includePdf: pdf, excludePaths: excludes() });
    state.lastBackupAt = Date.now();
    broadcast({ type: "backup:done", ...result, at: state.lastBackupAt });
    return result;
  }

  /* ---------------------------------------------------------------- */
  /* Kompilieren                                                       */
  /* ---------------------------------------------------------------- */

  async function runCompile(reason = "manual") {
    if (!state.projectPath || !state.mainFile) {
      broadcast({ type: "compile:error", message: "Keine Hauptdatei gefunden. Bitte eine .tex-Datei mit \\documentclass wählen." });
      return;
    }
    if (state.compiling) {
      state.pendingCompile = true;
      return;
    }
    state.compiling = true;
    state.pendingCompile = false;
    state.logBuffer = "";
    state.abort = new AbortController();
    const root = state.projectPath;
    const mainFile = state.mainFile;
    broadcast({ type: "compile:start", reason, mainFile, engine: currentEngine()?.engine });

    const result = await compileProject({
      root,
      mainFile,
      engine: state.settings.engine,
      bibTool: state.settings.bibTool,
      signal: state.abort.signal,
      onLog: (chunk) => {
        state.logBuffer += chunk;
        broadcast({ type: "compile:log", chunk });
      },
    });

    state.compiling = false;
    state.abort = null;
    if (state.projectPath !== root) return;
    state.lastCompile = { ...result, log: undefined, finishedAt: Date.now(), reason };
    broadcast({
      type: "compile:done",
      ok: result.ok,
      success: result.success,
      stale: result.stale,
      cancelled: result.cancelled,
      diagnostics: result.diagnostics,
      errors: result.errors,
      warnings: result.warnings,
      infos: result.infos,
      pages: result.pages,
      duration: result.duration,
      engine: result.engine,
      bibTool: result.bibTool,
      passes: result.passes,
      pdfRevision: Date.now(),
      hasPdf: result.ok,
    });
    if (!result.cancelled) refreshStats(result.pages);

    if (state.pendingCompile && state.settings.autoCompile) {
      state.pendingCompile = false;
      scheduleCompile(300);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Projekt                                                           */
  /* ---------------------------------------------------------------- */

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version: "2.1.1", latex: detectLatex(), recents: readRecents(), project: state.projectPath });
  });

  app.get("/api/recents", (_req, res) => res.json({ recents: readRecents(), latex: detectLatex() }));

  app.delete("/api/recents", (req, res) => {
    const p = String(req.query.path || "");
    res.json({ recents: p ? removeRecent(p) : readRecents() });
  });

  app.get("/api/template/fields", (_req, res) => {
    res.json({ fields: TEMPLATE_FIELDS, templateDir: TEMPLATE_DIR });
  });

  app.post("/api/project/pick", async (req, res) => {
    try {
      const title = req.body?.title || "Projektordner für ThesisLeaf auswählen";
      const fn = picker || powershellPicker;
      const selected = await fn(title, req.body || {});
      res.json({ path: selected });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/project/open", async (req, res) => {
    try {
      const project = await openProject(req.body.path);
      broadcast({ type: "project:opened", project });
      res.json(project);
      if (state.settings.autoCompile) scheduleCompile(200);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/project/create", async (req, res) => {
    try {
      const target = path.resolve(req.body.path);
      copyTemplate(target, req.body.vars || {});
      const project = await openProject(target);
      broadcast({ type: "project:opened", project });
      res.json(project);
      scheduleCompile(200);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/project/close", async (_req, res) => {
    await closeProject();
    res.json({ ok: true, recents: readRecents() });
  });

  app.get("/api/project", async (_req, res) => {
    if (!state.projectPath) return res.json({ project: null, latex: detectLatex(), recents: readRecents() });
    const info = projectInfo();
    info.git = await hasGit();
    res.json({ project: info, latex: detectLatex(), recents: readRecents(), lastCompile: state.lastCompile, stats: state.lastStats, lint: state.lastLint });
  });

  app.post("/api/project/main", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const mainFile = String(req.body.mainFile || "").replace(/\\/g, "/");
      if (!fs.existsSync(state.locator.resolve(mainFile))) return res.status(400).json({ error: "Datei nicht gefunden" });
      state.mainFile = mainFile;
      persistSettings();
      res.json(projectInfo());
      refreshStats();
      scheduleLint();
      if (state.settings.autoCompile) scheduleCompile(200);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/project/settings", async (req, res) => {
    if (!requireProject(res)) return;
    const body = req.body || {};
    const next = { ...state.settings };
    let restartWatcher = false;
    if (typeof body.autoCompile === "boolean") next.autoCompile = body.autoCompile;
    if (["auto", "pdflatex", "xelatex", "lualatex"].includes(body.engine)) next.engine = body.engine;
    if (["auto", "biber", "bibtex", "none"].includes(body.bibTool)) next.bibTool = body.bibTool;
    if (typeof body.showHidden === "boolean") next.showHidden = body.showHidden;
    if (typeof body.lint === "boolean") next.lint = body.lint;
    if (typeof body.compileDelay === "number") next.compileDelay = Math.min(10000, Math.max(300, body.compileDelay));
    if (typeof body.protocolFile === "string") next.protocolFile = body.protocolFile.replace(/\\/g, "/");
    if (body.goals && typeof body.goals === "object") {
      next.goals = {
        words: Math.max(0, Number(body.goals.words ?? next.goals.words) || 0),
        pages: Math.max(0, Number(body.goals.pages ?? next.goals.pages) || 0),
        deadline: typeof body.goals.deadline === "string" ? body.goals.deadline : next.goals.deadline,
      };
    }
    if (body.spell && typeof body.spell === "object") {
      next.spell = {
        enabled: typeof body.spell.enabled === "boolean" ? body.spell.enabled : next.spell.enabled,
        language: ["auto", "de", "en"].includes(body.spell.language) ? body.spell.language : next.spell.language,
        markdown: typeof body.spell.markdown === "boolean" ? body.spell.markdown : next.spell.markdown,
      };
    }
    if (body.grammar && typeof body.grammar === "object") {
      next.grammar = {
        enabled: typeof body.grammar.enabled === "boolean" ? body.grammar.enabled : next.grammar.enabled,
        url: typeof body.grammar.url === "string" && body.grammar.url.trim() ? body.grammar.url.trim() : next.grammar.url,
      };
    }
    if (body.backup && typeof body.backup === "object") {
      next.backup = {
        dir: typeof body.backup.dir === "string" ? body.backup.dir.trim() : next.backup.dir,
        everyMinutes: Math.max(5, Number(body.backup.everyMinutes ?? next.backup.everyMinutes) || 60),
        keep: Math.max(1, Number(body.backup.keep ?? next.backup.keep) || 20),
      };
    }
    if (Array.isArray(body.excludePaths)) {
      next.excludePaths = body.excludePaths.map((p) => String(p).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")).filter(Boolean);
      restartWatcher = true;
    }
    if (typeof body.autoExcludeHeavy === "boolean") {
      next.autoExcludeHeavy = body.autoExcludeHeavy;
      restartWatcher = true;
    }
    if (body.checklist && typeof body.checklist === "object") next.checklist = { ...next.checklist, ...body.checklist };
    state.settings = next;
    persistSettings();
    if (restartWatcher) {
      rescanHeavy(true);
      await initHistory(state.projectPath, excludes());
      await startWatcher();
    }
    res.json(projectInfo());
    if (body.lint === true || body.spell) scheduleLint();
    if (body.lint === false) {
      state.lastLint = { available: state.lastLint.available, items: (state.lastLint.items || []).filter((i) => i.kind === "spelling" || i.kind === "grammar") };
      broadcast({ type: "lint:update", ...state.lastLint });
    }
    if (body.spell && body.spell.enabled === false) {
      state.lastLint = { available: state.lastLint.available, items: (state.lastLint.items || []).filter((i) => i.kind !== "spelling") };
      broadcast({ type: "lint:update", ...state.lastLint });
    }
    if (body.goals) refreshStats();
    if (body.backup) startBackupTimer();
    if (state.settings.autoCompile && (body.engine || body.bibTool)) scheduleCompile(200);
  });

  app.post("/api/project/mounts", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      const name = String(req.body.name || "").trim().replace(/[\\/@\s]+/g, "-");
      const target = path.resolve(String(req.body.path || ""));
      if (!name) throw new Error("Name fehlt");
      if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error("Ordner nicht gefunden");
      if (target.toLowerCase() === state.projectPath.toLowerCase()) throw new Error("Das ist bereits der Projektordner");
      const mounts = state.settings.mounts.filter((m) => m.name !== name);
      mounts.push({ name, path: target });
      state.settings = { ...state.settings, mounts };
      state.locator = makeLocator(state.projectPath, mounts);
      persistSettings();
      await startWatcher();
      res.json(projectInfo());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/project/mounts", async (req, res) => {
    if (!requireProject(res)) return;
    const name = String(req.query.name || "");
    const mounts = state.settings.mounts.filter((m) => m.name !== name);
    state.settings = { ...state.settings, mounts };
    state.locator = makeLocator(state.projectPath, mounts);
    persistSettings();
    await startWatcher();
    res.json(projectInfo());
  });

  app.post("/api/project/reveal", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.body.path || "");
      revealInExplorer(rel ? state.locator.resolve(rel) : state.projectPath);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /** Datei mit dem Standardprogramm des Systems öffnen (PPTX, DOCX, große PDFs …). */
  app.post("/api/open", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const abs = state.locator.resolve(String(req.body.path || ""));
      if (!fs.existsSync(abs)) throw new Error("Datei nicht gefunden");
      if (process.platform === "win32") spawn("cmd", ["/c", "start", "", abs], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      else if (process.platform === "darwin") spawn("open", [abs], { detached: true, stdio: "ignore" }).unref();
      else spawn("xdg-open", [abs], { detached: true, stdio: "ignore" }).unref();
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ---------------------------------------------------------------- */
  /* Dateien                                                           */
  /* ---------------------------------------------------------------- */

  app.get("/api/files/read", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.query.path || "").replace(/\\/g, "/");
      const abs = state.locator.resolve(rel);
      if (!fs.existsSync(abs)) return res.status(404).json({ error: "Datei nicht gefunden" });
      const name = path.basename(rel);
      const kind = fileKind(name);
      const st = fs.statSync(abs);
      const base = { path: rel, name, size: st.size, mtime: st.mtimeMs, language: languageFor(name) };
      if (kind === "image") return res.json({ ...base, kind: "image", url: `/api/files/raw?path=${encodeURIComponent(rel)}&t=${Math.round(st.mtimeMs)}` });
      if (kind === "pdf") return res.json({ ...base, kind: "pdf", url: `/api/files/raw?path=${encodeURIComponent(rel)}&t=${Math.round(st.mtimeMs)}` });
      if (!isTextFile(abs)) return res.json({ ...base, kind: "binary", content: null });
      if (st.size > 8 * 1024 * 1024) return res.json({ ...base, kind: "binary", content: null, tooLarge: true });
      const resolvedKind = kind === "unknown" || kind === "binary" ? "text" : kind;
      res.json({ ...base, kind: /\.(csv|tsv)$/i.test(name) ? "csv" : resolvedKind, content: fs.readFileSync(abs, "utf8") });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/files/raw", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const abs = state.locator.resolve(String(req.query.path || ""));
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(abs);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/files/write", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.body.path || "").replace(/\\/g, "/");
      const info = writeFileUtf8(state.locator, rel, req.body.content ?? "");
      res.json({ ok: true, ...info });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/files/stat", (req, res) => {
    if (!requireProject(res)) return;
    try {
      res.json(statFile(state.locator, String(req.query.path || "")));
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  app.post("/api/files/create", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.body.path || "").replace(/\\/g, "/");
      createEntry(state.locator, rel, req.body.type === "dir" ? "dir" : "file", req.body.content || "");
      res.json(projectInfo());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/files/rename", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const from = String(req.body.from || "").replace(/\\/g, "/");
      const to = String(req.body.to || "").replace(/\\/g, "/");
      renameEntry(state.locator, from, to);
      if (state.mainFile === from) {
        state.mainFile = to;
        persistSettings();
      }
      res.json(projectInfo());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/files/duplicate", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const created = duplicateEntry(state.locator, String(req.body.path || ""));
      res.json({ ...projectInfo(), created });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/files/copy", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const from = String(req.body.from || "").replace(/\\/g, "/");
      const to = String(req.body.to || "").replace(/\\/g, "/");
      copyEntry(state.locator, from, to);
      res.json({ ...projectInfo(), created: to });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/files", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.query.path || req.body?.path || "").replace(/\\/g, "/");
      deleteEntry(state.locator, rel);
      if (state.mainFile === rel) {
        state.mainFile = detectMainFile(state.projectPath, excludes());
        persistSettings();
      }
      res.json(projectInfo());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/files/upload", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.body.path || "").replace(/\\/g, "/");
      const data = Buffer.from(String(req.body.base64 || ""), "base64");
      if (!rel) throw new Error("Pfad fehlt");
      if (!data.length) throw new Error("Leere Datei");
      writeFileBuffer(state.locator, rel, data);
      res.json({ ...projectInfo(), created: rel });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /** Eine Ordnerebene (lazy Baum). */
  app.get("/api/files/list", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.query.path || "").replace(/\\/g, "/");
      res.json(listDir(state.locator, rel, { showHidden: state.settings.showHidden, exclude: state.settings.excludePaths || [], heavy: state.settings.autoExcludeHeavy === false ? [] : state.heavyDirs }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /** Flacher Dateiindex für Schnellöffnen und Navigation (ohne schwere/ausgeschlossene Ordner). */
  app.get("/api/files/index", (_req, res) => {
    if (!requireProject(res)) return;
    try {
      if (!state.indexCache) state.indexCache = fileIndex(state.locator, { exclude: excludes() });
      res.json(state.indexCache);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /** CSV/TSV als Tabelle (Trennzeichen automatisch), begrenzt auf 5000 Zeilen. */
  app.get("/api/files/csv", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.query.path || "").replace(/\\/g, "/");
      const text = readFileUtf8(state.locator, rel);
      const lines = text.split(/\r?\n/).filter((l) => l.length);
      const head = lines[0] || "";
      const counts = { ",": (head.match(/,/g) || []).length, ";": (head.match(/;/g) || []).length, "\t": (head.match(/\t/g) || []).length };
      const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      const parseLine = (line) => {
        const cells = [];
        let cur = "";
        let inQ = false;
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          if (inQ) {
            if (ch === '"' && line[i + 1] === '"') {
              cur += '"';
              i += 1;
            } else if (ch === '"') inQ = false;
            else cur += ch;
          } else if (ch === '"') inQ = true;
          else if (ch === sep) {
            cells.push(cur);
            cur = "";
          } else cur += ch;
        }
        cells.push(cur);
        return cells;
      };
      const rows = lines.slice(0, 5001).map(parseLine);
      res.json({ path: rel, separator: sep, header: rows[0] || [], rows: rows.slice(1), total: lines.length - 1, truncated: lines.length > 5001 });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/search", (req, res) => {
    if (!requireProject(res)) return;
    try {
      res.json(
        searchProject(state.locator, {
          query: String(req.query.q || ""),
          regex: req.query.regex === "1",
          caseSensitive: req.query.case === "1",
          includeMounts: req.query.mounts !== "0",
          excludePaths: excludes(),
        }),
      );
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ---------------------------------------------------------------- */
  /* Kompilieren / PDF / SyncTeX                                       */
  /* ---------------------------------------------------------------- */

  app.post("/api/compile", (_req, res) => {
    if (!requireProject(res)) return;
    clearTimeout(state.compileTimer);
    res.json({ ok: true, queued: true });
    runCompile("manual");
  });

  app.post("/api/compile/cancel", (_req, res) => {
    if (state.abort) state.abort.abort();
    clearTimeout(state.compileTimer);
    state.pendingCompile = false;
    res.json({ ok: true });
  });

  app.post("/api/compile/clean", (_req, res) => {
    if (!requireProject(res)) return;
    const removed = cleanBuild(state.projectPath, { keepPdf: false });
    res.json({ ok: true, removed });
    if (state.settings.autoCompile) scheduleCompile(200);
  });

  app.get("/api/compile/status", (_req, res) => {
    res.json({ compiling: state.compiling, last: state.lastCompile, log: state.logBuffer });
  });

  app.get("/api/pdf", (_req, res) => {
    if (!state.projectPath || !state.mainFile) return res.status(404).end();
    const pdf = pdfPathFor(state.projectPath, state.mainFile);
    if (!fs.existsSync(pdf)) return res.status(404).end();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(pdf);
  });

  app.get("/api/log", (_req, res) => {
    if (!requireProject(res)) return;
    const file = state.mainFile ? logPathFor(state.projectPath, state.mainFile) : null;
    if (file && fs.existsSync(file)) return res.json({ log: fs.readFileSync(file, "latin1") });
    res.json({ log: state.logBuffer });
  });

  app.get("/api/synctex/forward", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      const result = await forwardSync({
        root: state.projectPath,
        mainFile: state.mainFile,
        file: String(req.query.file || state.mainFile),
        line: Number(req.query.line || 1),
        column: Number(req.query.column || 1),
      });
      res.json(result || { box: null, boxes: [] });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/synctex/inverse", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      const result = await inverseSync({
        root: state.projectPath,
        mainFile: state.mainFile,
        page: Number(req.query.page || 1),
        x: Number(req.query.x || 0),
        y: Number(req.query.y || 0),
      });
      res.json(result || { file: null });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ---------------------------------------------------------------- */
  /* Statistik, Prüfungen, Rechtschreibung, Grammatik, Literatur       */
  /* ---------------------------------------------------------------- */

  app.get("/api/stats", (_req, res) => {
    if (!requireProject(res)) return;
    const stats = refreshStats();
    res.json(stats || { error: "Keine Hauptdatei" });
  });

  app.get("/api/lint", async (req, res) => {
    if (!requireProject(res)) return;
    const file = req.query.path ? [String(req.query.path)] : null;
    await runLint(file);
    res.json(state.lastLint);
  });

  app.post("/api/spell/add", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const word = String(req.body.word || "").trim();
      if (!word) throw new Error("Kein Wort");
      const words = addToDictionary(state.projectPath, word, req.body.scope === "user" ? "user" : "project");
      state.lastLint = { ...state.lastLint, items: (state.lastLint.items || []).filter((i) => !(i.kind === "spelling" && i.word === word)) };
      broadcast({ type: "lint:update", ...state.lastLint });
      res.json({ ok: true, words });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/grammar", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      const rel = String(req.body.path || "").replace(/\\/g, "/");
      if (!rel || rel.startsWith("@")) throw new Error("Bitte eine Datei des Projekts wählen");
      const text = readFileUtf8(state.locator, rel);
      const doc = state.docCache || docInfo();
      const language = req.body.language && req.body.language !== "auto" ? req.body.language : state.settings.spell?.language && state.settings.spell.language !== "auto" ? state.settings.spell.language : doc?.language || "de";
      const kind = /\.md$/i.test(rel) ? "markdown" : "latex";
      const result = await checkGrammar(text, { kind, language, url: state.settings.grammar?.url || DEFAULT_SETTINGS.grammar.url });
      const items = result.items.map((i) => ({ ...i, file: rel }));
      state.lastLint = { ...state.lastLint, items: [...(state.lastLint.items || []).filter((i) => !(i.kind === "grammar" && i.file === rel)), ...items] };
      broadcast({ type: "lint:update", ...state.lastLint });
      res.json({ ok: true, count: items.length, chunks: result.chunks, truncated: result.truncated, language });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/bib", (_req, res) => {
    if (!requireProject(res)) return;
    const meta = extractMeta(state.projectPath, state.mainFile, excludes());
    const files = listBibFiles(state.projectPath, excludes());
    const issues = [];
    for (const f of files) {
      try {
        const text = readFileUtf8(state.locator, f);
        for (const issue of checkBib(text).issues) issues.push({ ...issue, file: f });
      } catch {
        /* skip */
      }
    }
    res.json({ entries: meta.citations, files, issues });
  });

  app.post("/api/bib/lookup", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      const meta = extractMeta(state.projectPath, state.mainFile, excludes());
      const result = await lookupReference(String(req.body.query || ""), meta.citations.map((c) => c.key));
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/bib/search", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      res.json({ results: await searchReferences(String(req.query.q || ""), Number(req.query.rows || 10)) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/bib/add", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const file = String(req.body.file || listBibFiles(state.projectPath, excludes())[0] || "literatur.bib").replace(/\\/g, "/");
      const text = String(req.body.bibtex || "").trim();
      if (!text.startsWith("@")) throw new Error("Kein BibTeX-Eintrag");
      let current = "";
      try {
        current = readFileUtf8(state.locator, file);
      } catch {
        current = "";
      }
      const sep = current && !current.endsWith("\n") ? "\n\n" : current ? "\n" : "";
      writeFileUtf8(state.locator, file, `${current}${sep}${text}\n`);
      res.json({ ok: true, file });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ---------------------------------------------------------------- */
  /* Notizen / Arbeitsprotokoll, Sicherung, Checkliste                  */
  /* ---------------------------------------------------------------- */

  /** Hängt einen zeitgestempelten Eintrag an das Arbeitsprotokoll an (## Datum / ### HH:MM · Text). */
  app.post("/api/notes/append", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const file = String(req.body.file || protocolFile() || "Arbeitsprotokoll.md").replace(/\\/g, "/");
      const text = String(req.body.text || "").trim();
      if (!text) throw new Error("Kein Text");
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      let current = "";
      try {
        current = readFileUtf8(state.locator, file);
      } catch {
        current = `# Arbeitsprotokoll\n\nZeitgestempelte Einträge (Ortszeit).\n`;
      }
      const [first, ...rest] = text.split(/\r?\n/);
      const body = rest.length ? `\n${rest.join("\n")}` : "";
      const entry = `### ${time} · ${first}${body}\n`;
      let next;
      const dayHeading = `## ${day}`;
      if (current.includes(`\n${dayHeading}`) || current.startsWith(dayHeading)) {
        next = `${current.replace(/\s*$/, "")}\n\n${entry}`;
      } else {
        next = `${current.replace(/\s*$/, "")}\n\n---\n\n${dayHeading}\n\n${entry}`;
      }
      writeFileUtf8(state.locator, file, next);
      if (!state.settings.protocolFile) {
        state.settings.protocolFile = file;
        persistSettings();
      }
      res.json({ ok: true, file, line: next.split("\n").length - 1 });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/backup", (_req, res) => {
    if (!requireProject(res)) return;
    res.json({ dir: state.settings.backup?.dir || "", items: listBackups(state.projectPath, state.settings.backup?.dir), lastBackupAt: state.lastBackupAt });
  });

  app.post("/api/backup", async (_req, res) => {
    if (!requireProject(res)) return;
    try {
      const result = await runBackup();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ---------------------------------------------------------------- */
  /* Historie                                                          */
  /* ---------------------------------------------------------------- */

  app.get("/api/history", async (_req, res) => {
    if (!requireProject(res)) return;
    try {
      res.json({ items: await listHistory(state.projectPath), git: await hasGit() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/history/file", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      res.json({ content: await showFile(state.projectPath, String(req.query.id), String(req.query.path)) });
    } catch {
      res.status(404).json({ error: "Datei in dieser Version nicht vorhanden" });
    }
  });

  app.get("/api/history/diff", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      res.json(await diffFile(state.projectPath, String(req.query.id), String(req.query.path)));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/history/changes", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      res.json({ files: await changedFiles(state.projectPath, String(req.query.id)) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/history/restore", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      await restore(state.projectPath, req.body.id);
      res.json(projectInfo());
      broadcast({ type: "history:update", items: await listHistory(state.projectPath) });
      if (state.settings.autoCompile) scheduleCompile(300);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/history/restore-file", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      await restoreFile(state.projectPath, req.body.id, req.body.path);
      res.json(projectInfo());
      broadcast({ type: "history:update", items: await listHistory(state.projectPath) });
      if (state.settings.autoCompile) scheduleCompile(300);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/history/snapshot", async (req, res) => {
    if (!requireProject(res)) return;
    try {
      const id = await snapshot(state.projectPath, req.body.message || "Manueller Snapshot");
      const items = await listHistory(state.projectPath);
      res.json({ id, items });
      broadcast({ type: "history:update", items });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ---------------------------------------------------------------- */
  /* Export                                                            */
  /* ---------------------------------------------------------------- */

  function exportName(ext) {
    const base = path.basename(state.projectPath).replace(/[^\w.-]+/g, "_") || "arbeit";
    return `${base}.${ext}`;
  }

  app.get("/api/export/pdf", (_req, res) => {
    if (!requireProject(res)) return;
    const pdf = state.mainFile ? pdfPathFor(state.projectPath, state.mainFile) : null;
    if (!pdf || !fs.existsSync(pdf)) return res.status(404).json({ error: "Noch kein PDF" });
    res.download(pdf, exportName("pdf"));
  });

  app.post("/api/export/pdf", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const pdf = state.mainFile ? pdfPathFor(state.projectPath, state.mainFile) : null;
      if (!pdf || !fs.existsSync(pdf)) throw new Error("Noch kein PDF");
      const to = path.resolve(String(req.body.to || ""));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(pdf, to);
      res.json({ ok: true, to });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/export/zip", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const buf = zipDirectory(state.projectPath, { includeArtifacts: req.query.build === "1", excludePaths: excludes() });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${exportName("zip")}"`);
      res.send(buf);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/export/zip", (req, res) => {
    if (!requireProject(res)) return;
    try {
      const to = path.resolve(String(req.body.to || ""));
      const extra = [];
      const pdf = state.mainFile ? pdfPathFor(state.projectPath, state.mainFile) : null;
      if (req.body.includePdf && pdf && fs.existsSync(pdf)) extra.push({ name: exportName("pdf"), path: pdf });
      const buf = zipDirectory(state.projectPath, { includeArtifacts: Boolean(req.body.includeBuild), extraFiles: extra, excludePaths: excludes() });
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, buf);
      res.json({ ok: true, to, bytes: buf.length });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ---------------------------------------------------------------- */
  /* Statische Auslieferung (Produktion) & WebSocket                   */
  /* ---------------------------------------------------------------- */

  const dist = staticDir || path.join(ROOT, "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: "index.html", maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message || "Serverfehler" });
  });

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        type: "hello",
        project: state.projectPath ? projectInfo() : null,
        latex: detectLatex(),
        compiling: state.compiling,
        lastCompile: state.lastCompile,
        stats: state.lastStats,
        lint: state.lastLint,
      }),
    );
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === 1) client.ping();
    }
  }, 25000);

  function start() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve({ port, host, url: `http://${host}:${port}` });
      });
    });
  }

  async function stop() {
    clearInterval(heartbeat);
    await closeProject({ silent: true });
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => server.close(resolve));
  }

  return { app, server, wss, state, start, stop, broadcast, openProject, closeProject, projectInfo, runCompile };
}
