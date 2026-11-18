import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, desktop, openExternal } from "../api.js";
import { setEditorContext, SNIPPETS } from "../latexLanguage.js";
import { baseName, dirName, joinPath, stripExt, formatDuration, isTexPath } from "../util.js";
import Icon, { Leaf } from "./Icons.jsx";
import FileTree from "./FileTree.jsx";
import OutlinePanel, { markdownHeadings } from "./OutlinePanel.jsx";
import BibPanel from "./BibPanel.jsx";
import CsvView from "./CsvView.jsx";
import ChecklistPanel from "./ChecklistPanel.jsx";
import TodoPanel from "./TodoPanel.jsx";
import ProblemsPanel from "./ProblemsPanel.jsx";
import StatsPanel from "./StatsPanel.jsx";
import HistoryPanel from "./HistoryPanel.jsx";
import SearchPanel from "./SearchPanel.jsx";
import EditorPane from "./EditorPane.jsx";
import MarkdownPreview from "./MarkdownPreview.jsx";
import PdfPane from "./PdfPane.jsx";
import LogPanel from "./LogPanel.jsx";
import PopupMenu from "./PopupMenu.jsx";
import Dialog from "./Dialog.jsx";
import SettingsDialog from "./SettingsDialog.jsx";
import DiffDialog from "./DiffDialog.jsx";
import { NewProjectDialog } from "./WelcomeScreen.jsx";

const PANELS = [
  ["files", "files", "Dateien", "Strg+Shift+E"],
  ["outline", "outline", "Gliederung", "Strg+Shift+O"],
  ["bib", "book", "Literatur", "Strg+Shift+B"],
  ["todos", "check", "Aufgaben", ""],
  ["stats", "chart", "Statistik", ""],
  ["history", "history", "Historie", "Strg+Shift+H"],
  ["search", "search", "Suchen", "Strg+Shift+F"],
  ["checklist", "flag", "Abgabe & Formulierungen", ""],
];

const EMPTY_META = { labels: [], citations: [], sections: [], todos: [], acronyms: [], floats: [], includeOrder: [], citedKeys: [], refs: [], cites: [], acUsed: [] };

/** Pfad relativ zum Ordner der Hauptdatei (für \includegraphics, \input, \lstinputlisting). */
function relToDir(fromDir, target) {
  const from = (fromDir || "").split("/").filter(Boolean);
  const to = target.split("/").filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i += 1;
  return [...from.slice(i).map(() => ".."), ...to.slice(i)].join("/");
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Workspace({ initialProject, initialExtras, ui, updateUi, onClose, onOpenOther, onCreateOther }) {
  const [project, setProject] = useState(initialProject);
  const [openFiles, setOpenFiles] = useState([]);
  const [activePath, setActivePath] = useState(null);
  const [contents, setContents] = useState({});
  const [saved, setSaved] = useState({});
  const [dirty, setDirty] = useState({});
  const [external, setExternal] = useState({});
  const [missing, setMissing] = useState({});
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [openDirs, setOpenDirs] = useState(() => new Set());
  const [compile, setCompile] = useState(() => ({
    busy: false,
    diagnostics: initialExtras?.lastCompile?.diagnostics || [],
    errors: initialExtras?.lastCompile?.errors || [],
    warnings: initialExtras?.lastCompile?.warnings || [],
    infos: initialExtras?.lastCompile?.infos || [],
    pages: initialExtras?.lastCompile?.pages || 0,
    duration: initialExtras?.lastCompile?.duration || 0,
    engine: initialExtras?.lastCompile?.engine || null,
    bibTool: initialExtras?.lastCompile?.bibTool || null,
    passes: initialExtras?.lastCompile?.passes || [],
    success: initialExtras?.lastCompile?.success ?? null,
    log: "",
    revision: Date.now(),
    hasPdf: initialProject.hasPdf,
    status: "",
  }));
  const [stats, setStats] = useState(initialExtras?.stats || null);
  const [lint, setLint] = useState(initialExtras?.lint || { available: null, items: [] });
  const [history, setHistory] = useState([]);
  const [gitAvailable, setGitAvailable] = useState(initialProject.git ?? null);
  const [bibIssues, setBibIssues] = useState([]);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [goto, setGoto] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [popup, setPopup] = useState(null);
  const [context, setContext] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchReq, setSearchReq] = useState({ query: "", nonce: 0 });
  const [mdView, setMdView] = useState(ui.markdownView || "split");
  const [connected, setConnected] = useState(true);
  const [session, setSession] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [fileIndexState, setFileIndexState] = useState(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [changedPaths, setChangedPaths] = useState([]);
  const indexRef = useRef(null);
  const indexPromise = useRef(null);

  /** Flacher Dateiindex (ohne große Ordner) – lazy geladen, bei Projektänderungen verworfen. */
  const ensureIndex = useCallback(async () => {
    if (indexRef.current) return indexRef.current;
    if (!indexPromise.current) {
      indexPromise.current = api
        .index()
        .then((d) => {
          indexRef.current = d;
          setFileIndexState(d);
          return d;
        })
        .finally(() => {
          indexPromise.current = null;
        });
    }
    return indexPromise.current;
  }, []);

  const editorApi = useRef(null);
  const contentsRef = useRef(contents);
  const savedRef = useRef(saved);
  const dirtyRef = useRef(dirty);
  const openFilesRef = useRef(openFiles);
  const activeRef = useRef(activePath);
  const saveTimers = useRef(new Map());
  const logRef = useRef("");
  const logFlush = useRef(null);
  const toastTimer = useRef(null);
  const menuRef = useRef(null);
  const mainRef = useRef(null);
  const compileRef = useRef(null);
  const headingRef = useRef(null);
  const listRef = useRef(null);
  const citeRef = useRef(null);
  const refRef = useRef(null);
  const snippetRef = useRef(null);
  const wsRef = useRef(null);
  const externalContent = useRef({});
  contentsRef.current = contents;
  savedRef.current = saved;
  dirtyRef.current = dirty;
  openFilesRef.current = openFiles;
  activeRef.current = activePath;

  const activeFile = openFiles.find((f) => f.path === activePath) || null;
  const meta = project?.meta || EMPTY_META;
  const settings = project?.settings || {};
  const doc = project?.doc || {};
  const mainDir = doc.mainDir || "";
  const usedKeys = useMemo(() => new Set(meta.citedKeys || []), [meta.citedKeys]);
  const isTexActive = activeFile ? isTexPath(activeFile.path) : false;
  const isProseActive = activeFile ? isTexPath(activeFile.path) || /\.md$/i.test(activeFile.path) : false;
  const hasMounts = (settings.mounts || []).length > 0;

  useEffect(() => {
    setEditorContext({ meta, imageFiles: project?.imageFiles || [], texFiles: project?.texFiles || [], activeFile: activePath, doc });
  }, [meta, project?.imageFiles, project?.texFiles, activePath, doc]);

  useEffect(() => {
    if (!session) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  /* ---------------------------------------------------------------- */
  /* Hilfsfunktionen                                                   */
  /* ---------------------------------------------------------------- */

  const notify = useCallback((message, kind = "info", ms = 3800) => {
    clearTimeout(toastTimer.current);
    setToast({ message, kind, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const savePath = useCallback(async (path) => {
    const value = contentsRef.current[path];
    if (value === undefined) return;
    setSaving(true);
    try {
      await api.write(path, value);
      setSaved((s) => ({ ...s, [path]: value }));
      if (contentsRef.current[path] === value) setDirty((d) => ({ ...d, [path]: false }));
      setMissing((m) => (m[path] ? { ...m, [path]: false } : m));
    } catch (err) {
      notify(`Speichern fehlgeschlagen: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  }, [notify]);

  const flushSave = useCallback(async () => {
    const paths = Object.keys(dirtyRef.current).filter((p) => dirtyRef.current[p]);
    for (const p of paths) clearTimeout(saveTimers.current.get(p));
    await Promise.all(paths.map((p) => savePath(p)));
  }, [savePath]);

  const updateContent = useCallback(
    (path, value) => {
      setContents((c) => ({ ...c, [path]: value }));
      setDirty((d) => (d[path] ? d : { ...d, [path]: true }));
      clearTimeout(saveTimers.current.get(path));
      saveTimers.current.set(path, setTimeout(() => savePath(path), ui.autosaveDelay || 600));
    },
    [savePath, ui.autosaveDelay],
  );

  const openFile = useCallback(
    async (target, opts = {}) => {
      const path = typeof target === "string" ? target : target?.path;
      if (!path) return;
      const node = typeof target === "object" ? target : null;
      if (node?.type === "dir") return;
      try {
        const existing = openFilesRef.current.find((f) => f.path === path);
        if (!existing || existing.kind === "text" || existing.kind === "tex" || existing.kind === "bib" || existing.kind === "markdown" || existing.kind === "code") {
          const data = existing && contentsRef.current[path] !== undefined ? null : await api.read(path);
          if (data) {
            const file = { path, name: data.name || baseName(path), kind: data.kind, language: data.language || node?.language || "plaintext", url: data.url, size: data.size, tooLarge: data.tooLarge };
            setOpenFiles((files) => (files.some((f) => f.path === path) ? files.map((f) => (f.path === path ? { ...f, ...file } : f)) : [...files, file]));
            if (data.kind !== "image" && data.kind !== "pdf" && data.kind !== "binary" && data.content !== null && data.content !== undefined) {
              setContents((c) => ({ ...c, [path]: data.content }));
              setSaved((s) => ({ ...s, [path]: data.content }));
              setDirty((d) => ({ ...d, [path]: false }));
            }
          }
        }
        setActivePath(path);
        if (opts.line) setGoto({ path, line: opts.line, column: opts.column || 1, nonce: Date.now() });
        if (opts.panelStay !== true && path.startsWith("@")) {
          /* Dateien aus verknüpften Ordnern: nur lesen/bearbeiten, kein Kompilieren */
        }
      } catch (err) {
        notify(`Datei konnte nicht geöffnet werden: ${err.message}`, "error");
      }
    },
    [notify],
  );

  const gotoLocation = useCallback(
    (file, line, column) => {
      if (!file) return;
      openFile(file, { line: line || 1, column: column || 1 });
    },
    [openFile],
  );

  const closeTab = useCallback(
    (path) => {
      if (dirtyRef.current[path]) savePath(path);
      setOpenFiles((files) => {
        const idx = files.findIndex((f) => f.path === path);
        const rest = files.filter((f) => f.path !== path);
        if (activeRef.current === path) {
          const next = rest[Math.min(idx, rest.length - 1)] || null;
          setActivePath(next ? next.path : null);
        }
        return rest;
      });
    },
    [savePath],
  );

  const reloadOpenFiles = useCallback(async () => {
    for (const f of openFilesRef.current) {
      if (["image", "pdf", "binary"].includes(f.kind)) continue;
      try {
        const data = await api.read(f.path);
        if (data.content !== null && data.content !== undefined) {
          setContents((c) => ({ ...c, [f.path]: data.content }));
          setSaved((s) => ({ ...s, [f.path]: data.content }));
          setDirty((d) => ({ ...d, [f.path]: false }));
          setExternal((e) => ({ ...e, [f.path]: false }));
        }
      } catch {
        /* Datei existiert vielleicht nicht mehr */
      }
    }
  }, []);

  const handleExternalChange = useCallback(
    async (path, event) => {
      const open = openFilesRef.current.find((f) => f.path === path);
      if (!open) return;
      if (event === "unlink") {
        setMissing((m) => ({ ...m, [path]: true }));
        return;
      }
      if (["image", "pdf", "binary"].includes(open.kind)) {
        setOpenFiles((files) => files.map((f) => (f.path === path ? { ...f, url: api.rawUrl(path, Date.now()) } : f)));
        return;
      }
      try {
        const data = await api.read(path);
        if (data.content === null || data.content === undefined) return;
        setMissing((m) => (m[path] ? { ...m, [path]: false } : m));
        if (data.content === savedRef.current[path]) return;
        if (!dirtyRef.current[path]) {
          setContents((c) => ({ ...c, [path]: data.content }));
          setSaved((s) => ({ ...s, [path]: data.content }));
          notify(`${baseName(path)} wurde außerhalb geändert und neu geladen.`);
        } else {
          externalContent.current[path] = data.content;
          setExternal((e) => ({ ...e, [path]: true }));
        }
      } catch {
        /* ignore */
      }
    },
    [notify],
  );

  /* ---------------------------------------------------------------- */
  /* WebSocket                                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let closed = false;
    let socket;
    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = socket;
      socket.onopen = () => setConnected(true);
      socket.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "hello":
            if (msg.project) setProject(msg.project);
            if (msg.stats) setStats(msg.stats);
            if (msg.lint) setLint(msg.lint);
            if (msg.compiling) setCompile((c) => ({ ...c, busy: true }));
            break;
          case "project:update":
          case "project:opened":
            setProject(msg.project);
            indexRef.current = null;
            setTreeVersion((v) => v + 1);
            break;
          case "project:closed":
            onClose?.();
            break;
          case "file:changed":
            handleExternalChange(msg.path, msg.event);
            setChangedPaths([msg.path, String(Date.now())]);
            break;
          case "compile:start":
            logRef.current = "";
            setCompile((c) => ({ ...c, busy: true, log: "", status: msg.engine ? `${msg.engine} läuft` : "läuft", engine: msg.engine || c.engine }));
            break;
          case "compile:log": {
            logRef.current += msg.chunk;
            const m = msg.chunk.match(/=== (.+?) ===/);
            if (!logFlush.current) {
              logFlush.current = requestAnimationFrame(() => {
                logFlush.current = null;
                setCompile((c) => ({ ...c, log: logRef.current, status: m ? m[1] : c.status }));
              });
            }
            break;
          }
          case "compile:done":
            setCompile((c) => ({
              ...c,
              busy: false,
              diagnostics: msg.diagnostics || [],
              errors: msg.errors || [],
              warnings: msg.warnings || [],
              infos: msg.infos || [],
              pages: msg.pages || 0,
              duration: msg.duration || 0,
              engine: msg.engine,
              bibTool: msg.bibTool,
              passes: msg.passes || [],
              success: msg.success,
              cancelled: msg.cancelled,
              log: logRef.current || c.log,
              revision: msg.hasPdf && !msg.cancelled ? msg.pdfRevision || Date.now() : c.revision,
              hasPdf: msg.hasPdf || c.hasPdf,
              status: "",
            }));
            if ((msg.errors || []).length && !ui.bottom) updateUi({ bottom: "problems" });
            break;
          case "compile:error":
            notify(msg.message, "error");
            break;
          case "history:update":
            setHistory(msg.items || []);
            break;
          case "history:error":
            setGitAvailable(false);
            break;
          case "stats:update":
            setStats(msg.stats);
            break;
          case "lint:update":
            setLint({ available: msg.available, items: msg.items || [] });
            if (msg.error) notify(`Prüfung: ${msg.error}`, "error");
            break;
          case "backup:done":
            notify(`Sicherung geschrieben: ${baseName(msg.file)}`);
            break;
          case "error":
            notify(msg.message, "error");
            break;
          default:
            break;
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(connect, 1500);
      };
      socket.onerror = () => socket.close();
    }
    connect();
    return () => {
      closed = true;
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /* Initialisierung                                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    api
      .history()
      .then((d) => {
        setHistory(d.items || []);
        if (typeof d.git === "boolean") setGitAvailable(d.git);
      })
      .catch(() => {});
    api.bib().then((d) => setBibIssues(d.issues || [])).catch(() => {});
    // Nur den Pfad zur Hauptdatei aufklappen (Ordner werden beim Aufklappen nachgeladen)
    const dirs = new Set();
    if (initialProject.mainFile) {
      const parts = initialProject.mainFile.split("/");
      parts.pop();
      let acc = "";
      for (const p of parts) {
        acc = acc ? `${acc}/${p}` : p;
        dirs.add(acc);
      }
      if (parts.length) dirs.add(`${parts.join("/")}/chapters`);
    } else {
      for (const n of (initialProject.tree || []).slice(0, 8)) if (n.type === "dir" && !n.mount && !n.heavy && !n.excluded) dirs.add(n.path);
    }
    setOpenDirs(dirs);
    if (initialProject.mainFile) openFile(initialProject.mainFile);
    if (!stats) api.stats().then(setStats).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.bib().then((d) => setBibIssues(d.issues || [])).catch(() => {});
  }, [project?.bibFiles, meta.citations?.length]);

  useEffect(() => {
    return () => {
      for (const t of saveTimers.current.values()) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (Object.values(dirtyRef.current).some(Boolean)) {
        flushSave();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flushSave]);

  /* ---------------------------------------------------------------- */
  /* Aktionen                                                          */
  /* ---------------------------------------------------------------- */

  const runCompile = useCallback(async () => {
    await flushSave();
    api.compile().catch((e) => notify(e.message, "error"));
  }, [flushSave, notify]);

  const forwardSync = useCallback(
    async (line, column) => {
      if (!activeRef.current || !isTexPath(activeRef.current)) {
        notify("SyncTeX funktioniert nur in .tex-Dateien.");
        return;
      }
      try {
        const r = await api.forwardSync(activeRef.current, line || cursor.line, column || cursor.column);
        if (r?.box) {
          if (!ui.showPdf) updateUi({ showPdf: true });
          setHighlight({ ...r.box, nonce: Date.now() });
        } else notify("Keine PDF-Position für diese Zeile gefunden (Datei erst kompilieren?).");
      } catch (err) {
        notify(err.message, "error");
      }
    },
    [cursor, notify, ui.showPdf, updateUi],
  );

  const inverseSync = useCallback(
    async (page, x, y) => {
      try {
        const r = await api.inverseSync(page, x, y);
        if (r?.file) gotoLocation(r.file, r.line, r.column);
        else notify("Keine Quelltextstelle gefunden.");
      } catch (err) {
        notify(err.message, "error");
      }
    },
    [gotoLocation, notify],
  );

  const navigate = useCallback(
    (hit) => {
      const { cmd, key } = hit;
      if (/cite/.test(cmd)) {
        const c = meta.citations.find((x) => x.key === key);
        if (c) gotoLocation(c.file, c.line);
        else notify(`Literaturschlüssel „${key}“ nicht gefunden.`);
      } else if (/ref/.test(cmd)) {
        const l = meta.labels.find((x) => x.key === key);
        if (l) gotoLocation(l.file, l.line);
        else notify(`Label „${key}“ nicht gefunden.`);
      } else if (/^ac/.test(cmd)) {
        const a = meta.acronyms.find((x) => x.key === key);
        if (a) gotoLocation(a.file, a.line);
      } else {
        const base = key.replace(/\\/g, "/");
        const dir = activeRef.current ? dirName(activeRef.current) : "";
        ensureIndex().then((idx) => {
          const all = new Set((idx?.files || []).map((n) => n.path));
          const candidates = [];
          for (const p of [base, joinPath(dir, base), joinPath(mainDir, base)]) {
            const clean = p.replace(/^\.\//, "").split("/").filter((s) => s !== ".").join("/");
            candidates.push(clean);
            if (cmd === "includegraphics") for (const ext of ["png", "jpg", "jpeg", "pdf", "svg", "eps"]) candidates.push(`${clean}.${ext}`);
            else candidates.push(`${clean}.tex`);
          }
          const found = candidates.find((c) => all.has(c));
          if (found) openFile(found);
          else notify(`Datei „${key}“ nicht gefunden.`);
        });
      }
    },
    [meta, gotoLocation, notify, openFile, ensureIndex, mainDir],
  );

  const insertText = useCallback(
    (text) => {
      if (!editorApi.current || !activeFile || ["image", "pdf", "binary"].includes(activeFile.kind)) {
        notify("Zuerst eine Textdatei im Editor öffnen.");
        return;
      }
      editorApi.current.insertText(text);
    },
    [activeFile, notify],
  );

  const insertSnippet = useCallback(
    (body) => {
      if (!editorApi.current || !activeFile || ["image", "pdf", "binary"].includes(activeFile.kind)) {
        notify("Zuerst eine .tex-Datei im Editor öffnen.");
        return;
      }
      editorApi.current.insertSnippet(body);
    },
    [activeFile, notify],
  );

  const wrap = useCallback((before, after, placeholder) => editorApi.current?.wrapSelection(before, after, placeholder), []);

  useEffect(() => {
    setEditorContext({
      addWord: async (word, scope) => {
        try {
          await api.spellAdd(word, scope);
          notify(`„${word}“ ins ${scope === "user" ? "persönliche" : "Projekt-"}Wörterbuch aufgenommen.`);
        } catch (e) {
          notify(e.message, "error");
        }
      },
    });
  }, [notify]);

  /** Ordner für hochgeladene/eingefügte Bilder: fig/ oder abbildungen/ neben der Hauptdatei. */
  function figureDir() {
    const dirs = new Set(indexRef.current?.dirs || []);
    for (const cand of ["fig", "figures", "abbildungen", "images", "img", "bilder"]) {
      const p = mainDir ? `${mainDir}/${cand}` : cand;
      if (dirs.has(p)) return p;
    }
    return mainDir ? `${mainDir}/fig` : "abbildungen";
  }

  useEffect(() => {
    // Index früh laden, damit figureDir()/Navigation sofort Daten haben
    ensureIndex().catch(() => {});
  }, [ensureIndex, treeVersion]);

  function figureSnippet(relPath, name) {
    const short = (name || baseName(relPath)).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    return `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=\${1:0.8}\\textwidth]{${stripExt(relPath)}}\n  \\caption{\${2:${doc.language === "en" ? "Caption" : "Beschriftung"}}}\n  \\label{fig:\${3:${short}}}\n\\end{figure}\n$0`;
  }

  /** Bilder aus Zwischenablage/Explorer in den Abbildungsordner laden und als figure einfügen. */
  async function pasteImages(files) {
    const dir = figureDir();
    for (const f of files) {
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
      const ext = (f.name && /\.[a-z0-9]+$/i.test(f.name) ? f.name.match(/\.[a-z0-9]+$/i)[0] : `.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`).toLowerCase();
      const base = f.name && !/^image\.(png|jpe?g)$/i.test(f.name) ? f.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-") : `bild-${stamp}`;
      const target = joinPath(dir, `${base}${ext}`);
      try {
        const next = await api.upload(target, await readAsBase64(f));
        setProject(next);
        if (isTexActive && /\.(png|jpe?g|pdf|svg|eps)$/i.test(ext)) insertSnippet(figureSnippet(relToDir(mainDir, target), base));
        notify(`${baseName(target)} nach ${dir}/ übernommen.`);
      } catch (e) {
        notify(`${f.name || "Bild"}: ${e.message}`, "error");
      }
    }
  }

  async function toggleSession() {
    if (session) {
      const words = stats?.total?.words ?? session.startWords;
      notify(`Schreibsitzung beendet: ${words - session.startWords >= 0 ? "+" : ""}${words - session.startWords} Wörter in ${Math.round((Date.now() - session.startedAt) / 60000)} Minuten.`, "info", 6000);
      setSession(null);
      return;
    }
    let startWords = stats?.total?.words ?? 0;
    try {
      const s = await api.stats();
      if (s?.total) startWords = s.total.words;
    } catch {
      /* ignore */
    }
    setSession({ startedAt: Date.now(), startWords, pomodoroNotified: false });
    notify(`Schreibsitzung gestartet – ${ui.pomodoro || 25} Minuten Fokus. Los geht's.`);
  }

  useEffect(() => {
    if (!session || session.pomodoroNotified) return;
    const minutes = (now - session.startedAt) / 60000;
    if (minutes >= (ui.pomodoro || 25)) {
      setSession((s) => (s ? { ...s, pomodoroNotified: true } : s));
      notify(`${ui.pomodoro || 25} Minuten geschafft – kurze Pause? Bisher ${(stats?.total?.words ?? session.startWords) - session.startWords >= 0 ? "+" : ""}${(stats?.total?.words ?? session.startWords) - session.startWords} Wörter.`, "info", 8000);
    }
  }, [now, session, ui.pomodoro, stats, notify]);

  async function checkGrammar() {
    if (!activeFile || !isProseActive || activeFile.path.startsWith("@")) {
      notify("Grammatikprüfung: zuerst eine .tex- oder .md-Datei des Projekts öffnen.");
      return;
    }
    if (!settings.grammar?.enabled) {
      setDialog({
        type: "confirm",
        title: "Grammatikprüfung aktivieren?",
        text: `Der Text der aktiven Datei wird an ${settings.grammar?.url || "https://api.languagetool.org/v2/check"} gesendet (LanguageTool). Ein lokaler Server lässt sich in den Einstellungen eintragen.`,
        okLabel: "Aktivieren und prüfen",
        action: async () => {
          await projectSettings({ grammar: { enabled: true } });
          await runGrammar();
        },
      });
      return;
    }
    await runGrammar();
  }

  async function runGrammar() {
    await flushSave();
    notify("Grammatik wird geprüft …", "info", 2500);
    try {
      const r = await api.grammar(activeRef.current);
      notify(r.count ? `${r.count} Grammatik-/Stilhinweise (${r.language === "en" ? "Englisch" : "Deutsch"}) – siehe Probleme.` : "Keine Grammatikhinweise gefunden.", "info", 5000);
      if (r.count && !ui.bottom) updateUi({ bottom: "problems" });
    } catch (e) {
      notify(`Grammatikprüfung: ${e.message}`, "error", 7000);
    }
  }

  function askProtocol() {
    setDialog({ type: "protocol", text: "", file: settings.protocolFile || doc.protocolFile || "" });
  }

  async function submitProtocol() {
    if (!dialog || dialog.type !== "protocol" || !dialog.text.trim()) return;
    try {
      const r = await api.notesAppend(dialog.text.trim(), dialog.file || undefined);
      setDialog(null);
      notify(`Eintrag in ${r.file} gespeichert.`);
      if (openFilesRef.current.some((f) => f.path === r.file)) handleExternalChange(r.file, "change");
    } catch (e) {
      notify(e.message, "error");
    }
  }

  async function setMain(mainFile) {
    try {
      setProject(await api.setMain(mainFile));
    } catch (e) {
      notify(e.message, "error");
    }
  }

  const projectSettings = useCallback(async (patch) => {
    const next = await api.settings(patch);
    setProject(next);
    return next;
  }, []);

  function askNew(type, dir) {
    const targetDir = dir ?? (activeFile && !activeFile.path.startsWith("@") ? dirName(activeFile.path) : "");
    setPopup(null);
    setContext(null);
    setDialog({ type: "create", kind: type, value: type === "dir" ? "neuer-ordner" : "neu.tex", dir: targetDir });
  }

  function contextMenu(e, node) {
    e.preventDefault();
    setPopup(null);
    setContext({ node, x: e.clientX, y: e.clientY });
  }

  function togglePopup(id) {
    setContext(null);
    setPopup((cur) => (cur === id ? null : id));
  }

  async function submitDialog() {
    if (!dialog) return;
    try {
      if (dialog.type === "create") {
        const p = joinPath(dialog.dir, dialog.value.trim());
        let content = "";
        if (dialog.kind === "file" && /\.tex$/i.test(p)) {
          const title = baseName(p).replace(/\.tex$/i, "").replace(/^\d+[-_]?/, "").replace(/[-_]/g, " ");
          content = `\\chapter{${title.charAt(0).toUpperCase() + title.slice(1)}}\n\\label{cha:${baseName(p).replace(/\.tex$/i, "").replace(/^\d+[-_]?/, "")}}\n\n`;
        }
        const next = await api.createFile(p, dialog.kind, content);
        setProject(next);
        if (dialog.kind === "file") await openFile(p);
        else setOpenDirs((s) => new Set(s).add(p));
      }
      if (dialog.type === "rename") {
        const to = joinPath(dirName(dialog.node.path), dialog.value.trim());
        const next = await api.rename(dialog.node.path, to);
        setProject(next);
        setOpenFiles((files) => files.map((f) => (f.path === dialog.node.path ? { ...f, path: to, name: baseName(to) } : f)));
        setContents((c) => {
          if (!(dialog.node.path in c)) return c;
          const n = { ...c, [to]: c[dialog.node.path] };
          delete n[dialog.node.path];
          return n;
        });
        if (activePath === dialog.node.path) setActivePath(to);
      }
      if (dialog.type === "delete") {
        const next = await api.remove(dialog.node.path);
        setProject(next);
        setOpenFiles((files) => files.filter((f) => f.path !== dialog.node.path && !f.path.startsWith(`${dialog.node.path}/`)));
        if (activePath === dialog.node.path) setActivePath(openFiles.find((f) => f.path !== dialog.node.path)?.path || null);
      }
      if (dialog.type === "confirm") await dialog.action();
      if (dialog.type === "mount") {
        const next = await api.addMount(dialog.name.trim(), dialog.path.trim());
        setProject(next);
        setOpenDirs((s) => new Set(s).add(`@${dialog.name.trim().replace(/[\\/@\s]+/g, "-")}`));
      }
      setDialog(null);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function restoreVersion(id) {
    await flushSave();
    const next = await api.restore(id);
    setProject(next);
    await reloadOpenFiles();
    notify("Projekt wiederhergestellt. Der vorherige Stand bleibt in der Historie.");
  }

  async function restoreOneFile(id, path) {
    await flushSave();
    const next = await api.restoreFile(id, path);
    setProject(next);
    await reloadOpenFiles();
    setDialog(null);
    notify(`${baseName(path)} wiederhergestellt.`);
  }

  async function snapshot(message) {
    await flushSave();
    try {
      const d = await api.snapshot(message);
      setHistory(d.items || []);
      notify(d.id ? "Version gesichert." : "Keine Änderungen seit der letzten Version.");
    } catch (e) {
      notify(e.message, "error");
    }
  }

  async function uploadFiles(dir, files) {
    let count = 0;
    for (const f of files) {
      try {
        const target = joinPath(dir, f.name);
        const next = await api.upload(target, f.base64);
        setProject(next);
        count += 1;
      } catch (e) {
        notify(`${f.name}: ${e.message}`, "error");
      }
    }
    if (count) notify(`${count} Datei${count === 1 ? "" : "en"} hochgeladen.`);
  }

  async function copyToFigures(node) {
    const dir = figureDir();
    const target = joinPath(dir, node.name);
    try {
      const next = await api.copy(node.path, target);
      setProject(next);
      insertSnippet(figureSnippet(relToDir(mainDir, target), node.name));
      notify(`${node.name} nach ${dir}/ kopiert und eingefügt.`);
    } catch (e) {
      if (/existiert/i.test(e.message)) insertSnippet(figureSnippet(relToDir(mainDir, target), node.name));
      else notify(e.message, "error");
    }
  }

  function insertNode(node) {
    const rel = node.path.startsWith("@") ? null : relToDir(mainDir, node.path);
    if (node.kind === "image" || (node.kind === "pdf" && /\.pdf$/i.test(node.name) && node.path.startsWith(`${figureDir()}/`))) {
      if (!rel) {
        notify("Bild liegt in einem verknüpften Ordner – erst mit „Nach fig/ kopieren“ ins Projekt übernehmen.");
        return;
      }
      insertSnippet(figureSnippet(rel, node.name));
    } else if (node.kind === "tex") {
      insertText(`\\input{${stripExt(rel || node.path)}}\n`);
    } else if (node.kind === "csv") {
      openFile(node);
      notify("Tabelle geöffnet – oben rechts „Als LaTeX-Tabelle“ wählen.");
    } else if (node.kind === "code" || node.kind === "text") {
      const ext = node.ext?.replace(".", "") || "";
      const langMap = { py: "Python", js: "JavaScript", ts: "TypeScript", java: "Java", c: "C", cpp: "C++", cs: "[Sharp]C", sh: "bash", sql: "SQL", html: "HTML", css: "CSS", json: "JSON", xml: "XML", r: "R", go: "Go", rs: "Rust", kt: "Kotlin", php: "PHP", rb: "Ruby", m: "Matlab" };
      const lang = langMap[ext] || "";
      if (!rel) {
        insertSnippet(`\\begin{lstlisting}[language=${lang || "\${1:Sprache}"}, caption={\${2:${node.name}}}, label={lst:\${3:${node.name.replace(/[^a-zA-Z0-9]+/g, "-")}}}]\n\${4:% Code aus ${node.path} hier einfügen}\n\\end{lstlisting}\n$0`);
        notify("Dateien aus verknüpften Ordnern liegen außerhalb des Projekts – Listing als Kopie einfügen oder die Datei ins Projekt kopieren.");
      } else {
        insertSnippet(`\\lstinputlisting[language=${lang || "\${1:Sprache}"}, caption={\${2:${node.name}}}, label={lst:\${3:${node.name.replace(/[^a-zA-Z0-9]+/g, "-")}}}]{${rel}}\n$0`);
      }
    } else if (node.kind === "pdf") {
      insertSnippet(`\\includepdf[pages=-]{${stripExt(rel || node.path)}}\n$0`);
    }
  }

  async function dropPath(p) {
    const idx = await ensureIndex().catch(() => null);
    const entry = idx?.files?.find((f) => f.path === p) || { path: p, name: baseName(p), kind: /\.(png|jpe?g|gif|svg|bmp|webp)$/i.test(p) ? "image" : /\.tex$/i.test(p) ? "tex" : /\.csv$/i.test(p) ? "csv" : /\.pdf$/i.test(p) ? "pdf" : "code", ext: `.${p.split(".").pop()}` };
    const node = { ...entry, type: "file" };
    if (!isTexActive) {
      openFile(node);
      return;
    }
    insertNode(node);
  }

  function openSearch(initial) {
    updateUi({ showSidebar: true, panel: "search" });
    setSearchReq({ query: initial ?? "", nonce: Date.now() });
  }

  function nextProblem() {
    const list = [...compile.diagnostics, ...(lint.items || [])].filter((d) => d.file && d.line);
    if (!list.length) return;
    const idx = list.findIndex((d) => d.file === activePath && d.line > cursor.line);
    const target = idx >= 0 ? list[idx] : list.find((d) => d.file !== activePath) || list[0];
    gotoLocation(target.file, target.line, target.column);
  }

  /* ---------------------------------------------------------------- */
  /* Tastatur & Desktop-Menü                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    function onKey(e) {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (mod && key === "p" && !e.shiftKey) {
        e.preventDefault();
        setPopup("quickopen");
        return;
      }
      if (mod && e.shiftKey && key === "f") {
        e.preventDefault();
        openSearch(editorApi.current?.getSelection() || "");
        return;
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        updateUi((u) => ({ showSidebar: !u.showSidebar }));
        return;
      }
      if (mod && key === "j" && !e.altKey) {
        e.preventDefault();
        updateUi((u) => ({ bottom: u.bottom ? null : "problems" }));
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        setDialog({ type: "settings" });
        return;
      }
      if ((mod && e.key === "Enter") || e.key === "F5") {
        e.preventDefault();
        runCompile();
        return;
      }
      if (mod && key === "s" && !e.shiftKey) {
        e.preventDefault();
        flushSave().then(() => notify("Gespeichert.", "info", 1200));
        return;
      }
      if (mod && e.shiftKey && key === "e") {
        e.preventDefault();
        updateUi({ showSidebar: true, panel: "files" });
        return;
      }
      if (mod && e.shiftKey && key === "o") {
        e.preventDefault();
        updateUi({ showSidebar: true, panel: "outline" });
        return;
      }
      if (mod && e.shiftKey && key === "b") {
        e.preventDefault();
        updateUi({ showSidebar: true, panel: "bib" });
        return;
      }
      if (mod && e.shiftKey && key === "h") {
        e.preventDefault();
        updateUi({ showSidebar: true, panel: "history" });
        return;
      }
      if (mod && e.shiftKey && key === "l") {
        e.preventDefault();
        updateUi((u) => ({ bottom: u.bottom === "log" ? null : "log" }));
        return;
      }
      if (mod && e.shiftKey && key === "p") {
        e.preventDefault();
        askProtocol();
        return;
      }
      if (mod && e.shiftKey && key === "m") {
        e.preventDefault();
        updateUi((u) => ({ focus: !u.focus }));
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        nextProblem();
        return;
      }
      if (mod && key === "w" && desktop) {
        e.preventDefault();
        if (activeRef.current) closeTab(activeRef.current);
        return;
      }
      if (mod && e.key === "Tab" && !inInput) {
        e.preventDefault();
        const files = openFilesRef.current;
        if (files.length < 2) return;
        const idx = files.findIndex((f) => f.path === activeRef.current);
        const next = files[(idx + (e.shiftKey ? -1 : 1) + files.length) % files.length];
        setActivePath(next.path);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runCompile, flushSave, closeTab, compile.diagnostics, lint.items, activePath, cursor]);

  useEffect(() => {
    if (!desktop?.onMenu) return undefined;
    return desktop.onMenu(async (action, payload) => {
      switch (action) {
        case "open-project": {
          const { path } = await api.pick("Projektordner öffnen");
          if (path) {
            await flushSave();
            onOpenOther(path).catch((e) => notify(e.message, "error"));
          }
          break;
        }
        case "new-project":
          setDialog({ type: "newProject" });
          break;
        case "close-project":
          await flushSave();
          onClose();
          break;
        case "save":
          flushSave().then(() => notify("Gespeichert.", "info", 1200));
          break;
        case "compile":
          runCompile();
          break;
        case "cancel-compile":
          api.cancelCompile();
          break;
        case "settings":
          setDialog({ type: "settings" });
          break;
        case "settings-keys":
          setDialog({ type: "settings", tab: "keys" });
          break;
        case "notify":
          if (payload?.message) notify(payload.message, payload.kind || "info");
          break;
        case "toggle-sidebar":
          updateUi((u) => ({ showSidebar: !u.showSidebar }));
          break;
        case "toggle-pdf":
          updateUi((u) => ({ showPdf: !u.showPdf }));
          break;
        case "toggle-bottom":
          updateUi((u) => ({ bottom: u.bottom ? null : "problems" }));
          break;
        case "toggle-theme":
          updateUi((u) => ({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }));
          break;
        case "quick-open":
          setPopup("quickopen");
          break;
        case "search":
          openSearch("");
          break;
        case "forward-sync":
          forwardSync();
          break;
        case "snapshot":
          snapshot("Manueller Snapshot");
          break;
        case "protocol":
          askProtocol();
          break;
        case "backup":
          api.backupNow().then((r) => notify(`Sicherung geschrieben: ${r.file}`)).catch((e) => notify(e.message, "error", 7000));
          break;
        case "focus":
          updateUi((u) => ({ focus: !u.focus }));
          break;
        case "grammar":
          checkGrammar();
          break;
        case "session":
          toggleSession();
          break;
        case "export-pdf":
          if (payload?.to) api.exportPdfTo(payload.to).then(() => notify(`PDF gespeichert: ${payload.to}`)).catch((e) => notify(e.message, "error"));
          break;
        case "export-zip":
          if (payload?.to) api.exportZipTo(payload.to, { includePdf: true }).then(() => notify(`ZIP gespeichert: ${payload.to}`)).catch((e) => notify(e.message, "error"));
          break;
        case "reveal":
          api.reveal("");
          break;
        case "panel":
          updateUi({ showSidebar: true, panel: payload });
          break;
        case "font-size":
          updateUi((u) => ({ fontSize: Math.min(24, Math.max(10, u.fontSize + (payload || 0))) }));
          break;
        default:
          break;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushSave, runCompile, forwardSync]);

  /* ---------------------------------------------------------------- */
  /* Layout-Griffe                                                     */
  /* ---------------------------------------------------------------- */

  function startDrag(which, e) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startSide = ui.sidebarW;
    const startPdf = ui.pdfW;
    const startBottom = ui.bottomH;
    function move(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (which === "side") updateUi({ sidebarW: Math.min(560, Math.max(200, startSide + dx)) });
      else if (which === "pdf") updateUi({ pdfW: Math.min(1400, Math.max(320, startPdf - dx)) });
      else if (which === "bottom") updateUi({ bottomH: Math.min(600, Math.max(100, startBottom - dy)) });
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("dragging");
    }
    document.body.classList.add("dragging");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  /* ---------------------------------------------------------------- */
  /* Abgeleitete Daten                                                 */
  /* ---------------------------------------------------------------- */

  const activeDiagnostics = useMemo(() => {
    if (!activePath) return [];
    return [...compile.diagnostics, ...(lint.items || [])].filter((d) => d.file === activePath);
  }, [compile.diagnostics, lint.items, activePath]);

  const firstError = compile.errors[0] || null;
  const dirtyCount = Object.values(dirty).filter(Boolean).length;
  const hintCount = (lint.items || []).length;
  const todayWords = stats?.daily?.length ? stats.daily[stats.daily.length - 1].delta || 0 : 0;
  const quickFiles = fileIndexState?.files || [];
  useEffect(() => {
    if (popup === "quickopen") ensureIndex().catch(() => {});
  }, [popup, ensureIndex]);
  const contextDir = context?.node ? (context.node.type === "dir" ? context.node.path : dirName(context.node.path)) : "";
  const contextInMount = context?.node ? context.node.path.startsWith("@") : false;

  const activeMarkdown = activeFile?.kind === "markdown" ? { headings: markdownHeadings(contents[activePath] || "") } : null;
  const checklistAuto = useMemo(() => {
    const lintItems = lint.items || [];
    return {
      errors: compile.errors.length,
      undefinedRefs: [...compile.diagnostics, ...lintItems].filter((d) => ["undefined-ref", "undefined-cite"].includes(d.kind)).length,
      todos: meta.todos?.length || 0,
      unreferenced: lintItems.filter((d) => d.kind === "unreferenced").length,
      uncited: meta.citations.filter((c) => !usedKeys.has(c.key)).length,
      spelling: lintItems.filter((d) => d.kind === "spelling").length,
      words: stats?.total?.words || 0,
      wordGoal: settings.goals?.words || 0,
      wordsOk: !settings.goals?.words || (stats?.total?.words || 0) >= settings.goals.words,
    };
  }, [compile.errors, compile.diagnostics, lint.items, meta.todos, meta.citations, usedKeys, stats, settings.goals]);

  const panelContent = (() => {
    switch (ui.panel) {
      case "outline":
        return <OutlinePanel sections={meta.sections} floats={meta.floats} activeFile={activePath} cursorLine={cursor.line} onGoto={gotoLocation} markdown={activeMarkdown} topLevel={doc.topLevel} />;
      case "checklist":
        return (
          <ChecklistPanel
            checklist={settings.checklist || {}}
            onToggle={(id, on) => projectSettings({ checklist: { [id]: on } })}
            auto={checklistAuto}
            language={doc.language}
            onInsert={(text) => insertText(text)}
            onGoto={(target) => {
              if (target === "problems") updateUi({ bottom: "problems" });
              else updateUi({ showSidebar: true, panel: target });
            }}
          />
        );
      case "bib":
        return (
          <BibPanel
            entries={meta.citations}
            files={project.bibFiles}
            issues={bibIssues}
            usedKeys={usedKeys}
            onInsertCite={(key) => insertText(`\\cite{${key}}`)}
            onGoto={gotoLocation}
            onChanged={() => notify("Literatureintrag gespeichert.")}
          />
        );
      case "todos":
        return <TodoPanel todos={meta.todos} onGoto={gotoLocation} onInsertTodo={() => insertSnippet("\\todo{${1:Was fehlt noch?}}$0")} />;
      case "stats":
        return <StatsPanel stats={stats} pages={compile.pages || stats?.pages} topLevel={doc.topLevel} onEditGoals={() => setDialog({ type: "settings", tab: "goals" })} onGoto={(f) => openFile(f)} />;
      case "history":
        return (
          <HistoryPanel
            items={history}
            gitAvailable={gitAvailable}
            activeFile={activePath && !activePath.startsWith("@") ? activePath : null}
            onDiff={(id, path) => setDialog({ type: "diff", id, path, item: history.find((h) => h.id === id) })}
            onRestore={(id) => setDialog({ type: "confirm", title: "Alles wiederherstellen?", text: "Alle Dateien werden auf diesen Stand zurückgesetzt. Der aktuelle Stand wird vorher als Version gesichert.", danger: true, action: () => restoreVersion(id) })}
            onRestoreFile={(id, path) => setDialog({ type: "confirm", title: `${baseName(path)} wiederherstellen?`, text: "Nur diese Datei wird auf den gewählten Stand gesetzt.", danger: true, action: () => restoreOneFile(id, path) })}
            onSnapshot={snapshot}
          />
        );
      case "search":
        return <SearchPanel onGoto={gotoLocation} initialQuery={searchReq.query} focusNonce={searchReq.nonce} hasMounts={hasMounts} />;
      case "files":
      default:
        return (
          <FileTree
            tree={project.tree}
            active={activePath}
            openFiles={new Set(openFiles.map((f) => f.path))}
            mainFile={project.mainFile}
            query={query}
            setQuery={setQuery}
            onOpen={openFile}
            onNew={askNew}
            onAddMount={() => setDialog({ type: "mount", name: "", path: "" })}
            openDirs={openDirs}
            toggleDir={(p) =>
              setOpenDirs((set) => {
                const next = new Set(set);
                if (next.has(p)) next.delete(p);
                else next.add(p);
                return next;
              })
            }
            setOpenDirs={setOpenDirs}
            onContext={contextMenu}
            showHidden={Boolean(settings.showHidden)}
            onToggleHidden={() => projectSettings({ showHidden: !settings.showHidden })}
            onUpload={uploadFiles}
            onRefresh={() => api.project().then((d) => d.project && setProject(d.project)).then(() => setTreeVersion((v) => v + 1))}
            version={treeVersion}
            changedPaths={changedPaths}
            ensureIndex={ensureIndex}
            fileIndex={fileIndexState}
          />
        );
    }
  })();

  const statusText = compile.busy
    ? `Kompiliert … ${compile.status || ""}`
    : compile.cancelled
      ? "Abgebrochen"
      : compile.errors.length
        ? `${compile.errors.length} Fehler`
        : compile.success
          ? "Erfolgreich kompiliert"
          : compile.duration
            ? "Kompiliert"
            : "Bereit";
  const statusClass = compile.busy ? "warn" : compile.errors.length ? "bad" : "ok";

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const sessionWords = session ? (stats?.total?.words ?? session.startWords) - session.startWords : 0;
  const sessionMinutes = session ? Math.floor((now - session.startedAt) / 60000) : 0;
  const sessionSeconds = session ? Math.floor(((now - session.startedAt) % 60000) / 1000) : 0;

  return (
    <div className={`workspace ${ui.toolbarCompact ? "compact" : ""} ${ui.focus ? "focus" : ""}`}>
      <header className="toolbar">
        <button ref={menuRef} className={`brand-btn ${popup === "menu" ? "active" : ""}`} type="button" onClick={() => togglePopup("menu")} title="Projektmenü">
          <Leaf size={20} />
          <span className="project-name">{project.name}</span>
          <Icon name="chevronDown" size={12} />
        </button>
        <button ref={mainRef} className={`icon-btn ${popup === "main" ? "active" : ""}`} type="button" onClick={() => togglePopup("main")} title="Hauptdatei wählen">
          <Icon name="pdf" size={14} /> {project.mainFile || "Hauptdatei"} <Icon name="chevronDown" size={12} />
        </button>

        <div className="tb-sep" />

        <div className={`fmt-group ${isTexActive ? "" : "disabled"}`}>
          <button className="icon-only" type="button" title="Fett (Strg+B)" onClick={() => wrap("\\textbf{", "}")}>
            <Icon name="bold" />
          </button>
          <button className="icon-only" type="button" title="Hervorhebung (Strg+I)" onClick={() => wrap("\\emph{", "}")}>
            <Icon name="italic" />
          </button>
          <button ref={headingRef} className={`icon-only ${popup === "heading" ? "active" : ""}`} type="button" title="Überschrift" onClick={() => togglePopup("heading")}>
            <Icon name="heading" />
          </button>
          <button ref={listRef} className={`icon-only ${popup === "list" ? "active" : ""}`} type="button" title="Liste" onClick={() => togglePopup("list")}>
            <Icon name="list" />
          </button>
          <button ref={citeRef} className={`icon-only ${popup === "cite" ? "active" : ""}`} type="button" title="Zitat einfügen (Strg+Shift+C)" onClick={() => togglePopup("cite")}>
            <Icon name="cite" />
          </button>
          <button ref={refRef} className={`icon-only ${popup === "ref" ? "active" : ""}`} type="button" title="Verweis einfügen" onClick={() => togglePopup("ref")}>
            <Icon name="ref" />
          </button>
          <button className="icon-only" type="button" title="Abbildung" onClick={() => insertSnippet(SNIPPETS.find((s) => s.id === "figure").body)}>
            <Icon name="figure" />
          </button>
          <button className="icon-only" type="button" title="Tabelle" onClick={() => insertSnippet(SNIPPETS.find((s) => s.id === "table").body)}>
            <Icon name="table" />
          </button>
          <button className="icon-only" type="button" title="Gleichung" onClick={() => insertSnippet(SNIPPETS.find((s) => s.id === "equation").body)}>
            <Icon name="math" />
          </button>
          <button className="icon-only" type="button" title="Quellcode-Listing" onClick={() => insertSnippet(SNIPPETS.find((s) => s.id === "listing").body)}>
            <Icon name="code" />
          </button>
          <button className="icon-only" type="button" title="Fußnote" onClick={() => wrap("\\footnote{", "}")}>
            <Icon name="footnote" />
          </button>
          <button className="icon-only" type="button" title="Todo-Notiz" onClick={() => insertSnippet("\\todo{${1:Was fehlt noch?}}$0")}>
            <Icon name="todo" />
          </button>
          <button ref={snippetRef} className={`icon-only ${popup === "snippets" ? "active" : ""}`} type="button" title="Weitere Bausteine" onClick={() => togglePopup("snippets")}>
            <Icon name="wand" />
          </button>
        </div>

        <div className="spacer" />

        <button className="icon-only" type="button" title="Eintrag ins Arbeitsprotokoll (Strg+Shift+P)" onClick={askProtocol}>
          <Icon name="clock" />
        </button>
        <button className="icon-only" type="button" title="Grammatik der aktiven Datei prüfen (LanguageTool)" onClick={checkGrammar} disabled={!isProseActive}>
          <Icon name="spell" />
        </button>
        <button className={`icon-only ${ui.focus ? "active" : ""}`} type="button" title="Fokusmodus – nur Editor (Strg+Shift+M)" onClick={() => updateUi({ focus: !ui.focus })}>
          <Icon name="target" />
        </button>
        <button className="icon-btn" type="button" title="Cursorzeile im PDF zeigen (Strg+Alt+J)" onClick={() => forwardSync()} disabled={!isTexActive || !compile.hasPdf}>
          <Icon name="sync" size={14} /> Im PDF
        </button>
        <div className="compile-group">
          <button className={`compile-btn ${compile.busy ? "busy" : ""}`} type="button" onClick={() => (compile.busy ? api.cancelCompile() : runCompile())} title={compile.busy ? "Abbrechen" : "Kompilieren (Strg+Enter)"}>
            {compile.busy ? <span className="spinner tiny light" /> : <Icon name="play" size={14} />}
            {compile.busy ? "Abbrechen" : "Kompilieren"}
          </button>
          <button ref={compileRef} className={`compile-caret ${popup === "compile" ? "active" : ""}`} type="button" aria-label="Kompilieren-Menü" onClick={() => togglePopup("compile")}>
            <Icon name="chevronDown" size={12} />
          </button>
        </div>
        <button className={`icon-only ${ui.showPdf ? "active" : ""}`} type="button" title="PDF-Vorschau ein/aus" onClick={() => updateUi({ showPdf: !ui.showPdf })}>
          <Icon name="columns" />
        </button>
        <button className="icon-only" type="button" title="Hell/Dunkel" onClick={() => updateUi({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" })}>
          <Icon name={document.documentElement.dataset.theme === "dark" ? "sun" : "moon"} />
        </button>
        <button className="icon-only" type="button" title="Einstellungen (Strg+,)" onClick={() => setDialog({ type: "settings" })}>
          <Icon name="settings" />
        </button>
      </header>

      <div className="body">
        <nav className="activity">
          {PANELS.map(([id, icon, label, key]) => (
            <button
              key={id}
              type="button"
              className={ui.showSidebar && ui.panel === id ? "active" : ""}
              title={`${label}${key ? ` (${key})` : ""}`}
              onClick={() => updateUi((u) => (u.showSidebar && u.panel === id ? { showSidebar: false } : { showSidebar: true, panel: id }))}
            >
              <Icon name={icon} size={20} />
              {id === "todos" && meta.todos?.length > 0 && <span className="badge">{meta.todos.length}</span>}
              {id === "bib" && bibIssues.length > 0 && <span className="badge warn">{bibIssues.length}</span>}
            </button>
          ))}
          <div className="grow" />
          <button type="button" className={ui.bottom ? "active" : ""} title="Probleme & Log (Strg+J)" onClick={() => updateUi((u) => ({ bottom: u.bottom ? null : "problems" }))}>
            <Icon name="alert" size={20} />
            {compile.errors.length > 0 && <span className="badge err">{compile.errors.length}</span>}
          </button>
        </nav>

        {ui.showSidebar && (
          <>
            <aside className="sidebar" style={{ width: ui.sidebarW }}>
              {panelContent}
            </aside>
            <div className="gutter" onMouseDown={(e) => startDrag("side", e)} />
          </>
        )}

        <section className="center">
          <div className="tabs" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
            {openFiles.map((f) => (
              <div
                key={f.path}
                className={`tab ${f.path === activePath ? "active" : ""} ${dirty[f.path] ? "dirty" : ""} ${missing[f.path] ? "missing" : ""}`}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(f.path);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContext({ tab: f, x: e.clientX, y: e.clientY });
                }}
                title={f.path}
              >
                <button type="button" className="tab-main" onClick={() => setActivePath(f.path)}>
                  <span className={`tab-dot kind-${f.kind}`} />
                  {f.name}
                  {f.path.startsWith("@") && <span className="tab-mount">@</span>}
                </button>
                <button className="x" type="button" onClick={() => closeTab(f.path)} title="Schließen">
                  {dirty[f.path] ? "●" : <Icon name="close" size={12} />}
                </button>
              </div>
            ))}
            {activeFile?.kind === "markdown" && (
              <div className="tab-tools">
                {[
                  ["editor", "Editor"],
                  ["split", "Beides"],
                  ["preview", "Vorschau"],
                ].map(([v, l]) => (
                  <button key={v} type="button" className={`chip ${mdView === v ? "on" : ""}`} onClick={() => setMdView(v)}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeFile && external[activeFile.path] && (
            <div className="banner warn">
              <Icon name="warning" size={14} />
              <span>
                <b>{activeFile.name}</b> wurde außerhalb des Editors geändert (z. B. durch ein anderes Programm). Deine ungespeicherten Änderungen würden überschrieben.
              </span>
              <button
                className="btn btn-ghost compact"
                type="button"
                onClick={() => {
                  const p = activeFile.path;
                  const text = externalContent.current[p];
                  setContents((c) => ({ ...c, [p]: text }));
                  setSaved((s) => ({ ...s, [p]: text }));
                  setDirty((d) => ({ ...d, [p]: false }));
                  setExternal((e) => ({ ...e, [p]: false }));
                }}
              >
                Von Festplatte laden
              </button>
              <button
                className="btn btn-primary compact"
                type="button"
                onClick={() => {
                  const p = activeFile.path;
                  setExternal((e) => ({ ...e, [p]: false }));
                  savePath(p);
                }}
              >
                Meine Version behalten
              </button>
            </div>
          )}
          {activeFile && missing[activeFile.path] && (
            <div className="banner bad">
              <Icon name="error" size={14} />
              <span>
                <b>{activeFile.name}</b> existiert nicht mehr auf der Festplatte. Beim nächsten Speichern wird sie neu angelegt.
              </span>
              <button className="btn btn-ghost compact" type="button" onClick={() => closeTab(activeFile.path)}>
                Tab schließen
              </button>
            </div>
          )}

          <div className={`editor-area ${activeFile?.kind === "markdown" ? `md-${mdView}` : ""}`}>
            {activeFile && activeFile.kind === "image" && (
              <div className="preview-file">
                <img src={activeFile.url || api.rawUrl(activeFile.path)} alt={activeFile.name} />
                <div className="preview-actions">
                  <button className="btn btn-ghost compact" type="button" onClick={() => insertNode(activeFile)}>
                    Als Abbildung einfügen
                  </button>
                  <button className="btn btn-ghost compact" type="button" onClick={() => api.reveal(activeFile.path)}>
                    Im Explorer zeigen
                  </button>
                </div>
              </div>
            )}
            {activeFile && activeFile.kind === "pdf" && <iframe className="pdf-frame" title={activeFile.name} src={activeFile.url || api.rawUrl(activeFile.path)} />}
            {activeFile && activeFile.kind === "binary" && (
              <div className="preview-file">
                <p>{activeFile.tooLarge ? "Diese Datei ist zu groß für den Editor." : `${activeFile.name} – Binärdatei, wird nicht im Editor angezeigt.`}</p>
                <div className="preview-actions">
                  <button className="btn btn-primary compact" type="button" onClick={() => api.openExternal(activeFile.path).catch((e) => notify(e.message, "error"))}>
                    Mit Standardprogramm öffnen
                  </button>
                  <button className="btn btn-ghost compact" type="button" onClick={() => api.reveal(activeFile.path)}>
                    Im Explorer zeigen
                  </button>
                </div>
              </div>
            )}
            {activeFile && activeFile.kind === "csv" && (
              <CsvView
                path={activeFile.path}
                canInsert={openFiles.some((f) => isTexPath(f.path))}
                onInsert={(latex) => {
                  const tex = openFiles.find((f) => f.path === activePath && isTexPath(f.path)) || openFiles.filter((f) => isTexPath(f.path)).at(-1);
                  if (!tex) return;
                  setActivePath(tex.path);
                  setTimeout(() => insertText(latex), 120);
                }}
              />
            )}
            {(!activeFile || !["image", "pdf", "binary", "csv"].includes(activeFile.kind)) && (mdView !== "preview" || activeFile?.kind !== "markdown") && (
              <EditorPane
                file={activeFile}
                value={contents[activePath] ?? ""}
                language={activeFile?.language}
                onChange={(v) => updateContent(activePath, v)}
                diagnostics={activeDiagnostics}
                goto={goto && goto.path === activePath ? goto : null}
                ui={ui}
                onReady={(apiObj) => {
                  editorApi.current = apiObj;
                }}
                onCursor={setCursor}
                onNavigate={navigate}
                onForwardSync={forwardSync}
                onSave={() => flushSave().then(() => notify("Gespeichert.", "info", 1200))}
                onCompile={runCompile}
                onCitePicker={() => setPopup("cite")}
                onPasteFiles={pasteImages}
                onDropPath={dropPath}
              />
            )}
            {activeFile?.kind === "markdown" && mdView !== "editor" && (
              <div className="md-preview-wrap">
                <MarkdownPreview source={contents[activePath] ?? ""} path={activePath} onOpenFile={(p) => openFile(p)} theme={ui.theme} />
              </div>
            )}
          </div>

          {ui.bottom && (
            <>
              <div className="gutter-h" onMouseDown={(e) => startDrag("bottom", e)} />
              <div className="bottom" style={{ height: ui.bottomH }}>
                <div className="bottom-tabs">
                  <button type="button" className={ui.bottom === "problems" ? "active" : ""} onClick={() => updateUi({ bottom: "problems" })}>
                    Probleme {compile.errors.length + compile.warnings.length + hintCount > 0 && <span className="count">{compile.errors.length + compile.warnings.length + hintCount}</span>}
                  </button>
                  <button type="button" className={ui.bottom === "log" ? "active" : ""} onClick={() => updateUi({ bottom: "log" })}>
                    Log
                  </button>
                  <div className="grow" />
                  <button className="icon-only" type="button" title="Schließen" onClick={() => updateUi({ bottom: null })}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
                {ui.bottom === "problems" ? (
                  <ProblemsPanel diagnostics={compile.diagnostics} lint={lint.items} lintAvailable={lint.available} activeFile={activePath} onGoto={gotoLocation} compileMeta={compile.duration ? compile : null} />
                ) : (
                  <LogPanel log={compile.log} busy={compile.busy} onGoto={gotoLocation} />
                )}
              </div>
            </>
          )}
        </section>

        {ui.showPdf && (
          <>
            <div className="gutter" onMouseDown={(e) => startDrag("pdf", e)} />
            <div className="pdf-wrap" style={{ width: ui.pdfW }}>
              <PdfPane
                revision={compile.revision}
                hasPdf={compile.hasPdf}
                compiling={compile.busy}
                status={compile.status}
                firstError={firstError}
                ui={ui}
                updateUi={updateUi}
                highlight={highlight}
                onInverseSync={inverseSync}
                onCompile={runCompile}
              />
            </div>
          </>
        )}
      </div>

      <footer className="status">
        <button type="button" className={`status-item ${statusClass}`} onClick={() => updateUi((u) => ({ bottom: u.bottom === "problems" ? null : "problems" }))} title="Probleme anzeigen">
          <span className="dot" /> {statusText}
        </button>
        {compile.duration > 0 && !compile.busy && <span className="status-item muted">{formatDuration(compile.duration)}</span>}
        {(compile.pages || stats?.pages) > 0 && <span className="status-item">{compile.pages || stats?.pages} Seiten</span>}
        {compile.warnings.length > 0 && (
          <button type="button" className="status-item warn" onClick={() => updateUi({ bottom: "problems" })}>
            {compile.warnings.length} Warnungen
          </button>
        )}
        {hintCount > 0 && (
          <button type="button" className="status-item muted" onClick={() => updateUi({ bottom: "problems" })}>
            {hintCount} Hinweise
          </button>
        )}
        {stats && (
          <button type="button" className="status-item" onClick={() => updateUi({ showSidebar: true, panel: "stats" })} title="Statistik">
            {stats.total.words.toLocaleString("de-DE")} Wörter
            {todayWords ? <span className={todayWords > 0 ? "pos" : ""}> ({todayWords > 0 ? "+" : ""}{todayWords} heute)</span> : null}
          </button>
        )}
        <button type="button" className={`status-item ${session ? "ok" : "muted"}`} onClick={toggleSession} title={session ? "Schreibsitzung beenden" : "Schreibsitzung starten (Pomodoro-Timer, Wörter dieser Sitzung)"}>
          <Icon name="clock" size={12} />
          {session ? ` ${sessionMinutes}:${String(sessionSeconds).padStart(2, "0")} · ${sessionWords >= 0 ? "+" : ""}${sessionWords} Wörter` : " Sitzung"}
        </button>
        <div className="spacer" />
        {!connected && <span className="status-item bad">Verbindung getrennt …</span>}
        <span className="status-item muted">{saving ? "speichert …" : dirtyCount ? `${dirtyCount} ungespeichert` : "gespeichert"}</span>
        {activeFile && (
          <span className="status-item muted">
            {activeFile.language || activeFile.kind} · {cursor.line}:{cursor.column}
          </span>
        )}
        <button type="button" className={`status-item ${settings.autoCompile ? "ok" : "muted"}`} onClick={() => projectSettings({ autoCompile: !settings.autoCompile })} title="Auto-Kompilierung umschalten">
          Auto {settings.autoCompile ? "an" : "aus"}
        </button>
        <span className="status-item muted" title={project.latex?.bin || ""}>
          {project.resolved?.engine || "pdflatex"}
          {project.resolved?.bibTool && project.resolved.bibTool !== "none" ? ` + ${project.resolved.bibTool}` : ""} · {project.latex?.distribution || "kein LaTeX"}
        </span>
        <span className={`status-item ${gitAvailable === false ? "warn" : "muted"}`} title="Automatische Versionierung">
          <Icon name="history" size={12} /> {gitAvailable === false ? "Historie aus" : `${history.length} Versionen`}
        </span>
      </footer>

      {/* ---------- Popups ---------- */}
      <PopupMenu
        open={popup === "menu"}
        onClose={() => setPopup(null)}
        anchorRef={menuRef}
        width={300}
        title="Projekt"
        items={[
          { id: "open", label: "Anderes Projekt öffnen …", onSelect: async () => { const { path } = await api.pick("Projektordner öffnen"); if (path) { await flushSave(); onOpenOther(path).catch((e) => notify(e.message, "error")); } } },
          { id: "new", label: "Neue Bachelorarbeit …", onSelect: () => setDialog({ type: "newProject" }) },
          ...(project.recents || []).filter((p) => p !== project.path).slice(0, 5).map((p) => ({ id: p, label: baseName(p), hint: p, onSelect: async () => { await flushSave(); onOpenOther(p).catch((e) => notify(e.message, "error")); } })),
          { type: "separator" },
          { id: "reveal", label: "Projektordner im Explorer", onSelect: () => api.reveal("") },
          { id: "snapshot", label: "Version sichern …", hint: "Meilenstein in der Historie", onSelect: () => updateUi({ showSidebar: true, panel: "history" }) },
          { type: "separator" },
          {
            id: "pdf",
            label: "PDF exportieren …",
            hint: compile.hasPdf ? "Kompiliertes PDF speichern" : "Noch kein PDF",
            disabled: !compile.hasPdf,
            onSelect: () => (desktop?.savePdf ? desktop.savePdf() : window.open(api.exportPdfUrl(), "_blank")),
          },
          {
            id: "zip",
            label: "Projekt als ZIP …",
            hint: "Quellen für Abgabe/Overleaf, ohne Build-Dateien",
            onSelect: () => (desktop?.saveZip ? desktop.saveZip() : window.open(api.exportZipUrl(false), "_blank")),
          },
          { type: "separator" },
          { id: "settings", label: "Einstellungen", shortcut: "Strg+,", onSelect: () => setDialog({ type: "settings" }) },
          { id: "keys", label: "Tastaturkürzel", onSelect: () => setDialog({ type: "settings", tab: "keys" }) },
          { type: "separator" },
          { id: "close", label: "Projekt schließen", onSelect: async () => { await flushSave(); onClose(); } },
        ]}
      />

      <PopupMenu
        open={popup === "main"}
        onClose={() => setPopup(null)}
        anchorRef={mainRef}
        width={340}
        title="Hauptdatei (wird kompiliert)"
        searchable
        searchPlaceholder="Datei suchen …"
        items={(project.texFiles || []).map((f) => ({ id: f, label: baseName(f), hint: f, checked: project.mainFile === f, onSelect: () => setMain(f) }))}
      />

      <PopupMenu
        open={popup === "compile"}
        onClose={() => setPopup(null)}
        anchorRef={compileRef}
        align="right"
        width={300}
        title="Kompilieren"
        items={[
          { id: "now", label: "Jetzt kompilieren", shortcut: "Strg+Enter", onSelect: runCompile },
          { id: "cancel", label: "Abbrechen", disabled: !compile.busy, onSelect: () => api.cancelCompile() },
          { id: "auto", label: "Auto-Kompilierung", hint: "bei jeder Änderung", checked: settings.autoCompile, keepOpen: true, onSelect: () => projectSettings({ autoCompile: !settings.autoCompile }) },
          { type: "separator" },
          { type: "header", label: `Engine · aktuell ${project.resolved?.engine || "pdflatex"}` },
          ...["auto", "pdflatex", "xelatex", "lualatex"].map((e) => ({ id: `eng-${e}`, label: e === "auto" ? "Automatisch" : e, checked: (settings.engine || "auto") === e, disabled: e !== "auto" && !project.latex?.[e], onSelect: () => projectSettings({ engine: e }) })),
          { type: "separator" },
          { id: "clean", label: "Hilfsdateien löschen & neu kompilieren", hint: "bei hartnäckigen Fehlern", onSelect: () => api.cleanBuild().then(() => notify("Build-Ordner geleert.")) },
          { id: "log", label: "Log anzeigen", shortcut: "Strg+Shift+L", checked: ui.bottom === "log", onSelect: () => updateUi({ bottom: ui.bottom === "log" ? null : "log" }) },
        ]}
      />

      <PopupMenu
        open={popup === "heading"}
        onClose={() => setPopup(null)}
        anchorRef={headingRef}
        width={260}
        title="Überschrift"
        items={[
          ["chapter", "Kapitel", "\\chapter{…}"],
          ["section", "Abschnitt", "\\section{…}"],
          ["subsection", "Unterabschnitt", "\\subsection{…}"],
          ["subsubsection", "Unter-Unterabschnitt", "\\subsubsection{…}"],
          ["paragraph", "Absatzüberschrift", "\\paragraph{…}"],
        ].map(([cmd, label, hint]) => ({ id: cmd, label, hint, onSelect: () => insertSnippet(`\\${cmd}{\${1:${label}}}\n\\label{${cmd === "chapter" ? "cha" : "sec"}:\${2:kurz}}\n\n$0`) }))}
      />

      <PopupMenu
        open={popup === "list"}
        onClose={() => setPopup(null)}
        anchorRef={listRef}
        width={240}
        title="Liste"
        items={["itemize", "enumerate", "description"].map((id) => {
          const s = SNIPPETS.find((x) => x.id === id);
          return { id, label: s.label, hint: s.detail, onSelect: () => insertSnippet(s.body) };
        })}
      />

      <PopupMenu
        open={popup === "cite"}
        onClose={() => setPopup(null)}
        anchorRef={citeRef}
        width={420}
        title="Zitat einfügen"
        searchable
        searchPlaceholder="Autor, Titel, Schlüssel …"
        emptyText="Keine Literatur – im Literatur-Panel per DOI/ISBN importieren."
        items={meta.citations.map((c) => ({ id: c.key, label: `${c.key}${usedKeys.has(c.key) ? "" : " · neu"}`, hint: `${c.author || ""} ${c.year ? `(${c.year})` : ""} ${c.title || ""}`.trim(), onSelect: () => insertText(`\\cite{${c.key}}`) }))}
      />

      <PopupMenu
        open={popup === "ref"}
        onClose={() => setPopup(null)}
        anchorRef={refRef}
        width={420}
        title="Verweis einfügen"
        searchable
        searchPlaceholder="Label suchen …"
        emptyText="Keine Labels – \\label{…} an Kapiteln, Abbildungen, Tabellen setzen."
        items={meta.labels.map((l) => {
          const fl = meta.floats.find((f) => f.label === l.key);
          const sec = meta.sections.filter((s) => s.file === l.file && s.line <= l.line).pop();
          const words = doc.language === "en"
            ? { fig: "Figure~", tab: "Table~", cha: "Chapter~", sec: "Section~", eq: "Equation~", lst: "Listing~" }
            : { fig: "Abbildung~", tab: "Tabelle~", cha: "Kapitel~", sec: "Abschnitt~", eq: "Gleichung~", lst: "Listing~" };
          const kind = (l.key.match(/^(fig|tab|cha|chap|sec|eq|lst):/) || [])[1];
          const prefix = doc.cleveref ? "" : words[kind === "chap" ? "cha" : kind] || "";
          const cmd = doc.cleveref ? "cref" : "ref";
          return { id: l.key, label: l.key, hint: fl ? `${fl.kind}: ${fl.caption}` : sec ? sec.title : l.file, onSelect: () => insertText(`${prefix}\\${cmd}{${l.key}}`) };
        })}
      />

      <PopupMenu
        open={popup === "snippets"}
        onClose={() => setPopup(null)}
        anchorRef={snippetRef}
        width={340}
        title="Bausteine"
        searchable
        items={SNIPPETS.map((s) => ({ id: s.id, label: s.label, hint: s.detail, onSelect: () => insertSnippet(s.body) }))}
      />

      <PopupMenu
        open={popup === "quickopen"}
        onClose={() => setPopup(null)}
        x={Math.max(8, window.innerWidth / 2 - 260)}
        y={80}
        width={520}
        title="Datei öffnen"
        searchable
        searchPlaceholder="Dateiname eingeben …"
        items={quickFiles.map((n) => ({ id: n.path, label: n.name, hint: n.path, onSelect: () => openFile(n) }))}
      />

      <PopupMenu
        open={Boolean(context)}
        onClose={() => setContext(null)}
        x={context?.x}
        y={context?.y}
        width={280}
        title={context?.node?.name || context?.tab?.name || "Projekt"}
        items={
          context?.tab
            ? [
                { id: "close", label: "Tab schließen", shortcut: "Strg+W", onSelect: () => closeTab(context.tab.path) },
                { id: "closeOthers", label: "Andere Tabs schließen", onSelect: () => { for (const f of openFiles) if (f.path !== context.tab.path) closeTab(f.path); } },
                { id: "closeAll", label: "Alle Tabs schließen", onSelect: () => { for (const f of openFiles) closeTab(f.path); } },
                { type: "separator" },
                { id: "reveal", label: "Im Explorer anzeigen", onSelect: () => api.reveal(context.tab.path) },
                { id: "copy", label: "Pfad kopieren", onSelect: () => navigator.clipboard?.writeText(context.tab.path) },
              ]
            : context?.node
              ? [
                  ...(context.node.type === "dir"
                    ? []
                    : [
                        { id: "open", label: "Öffnen", onSelect: () => openFile(context.node) },
                        ...(["image", "tex", "code", "text", "pdf", "csv"].includes(context.node.kind) && isTexActive
                          ? [{ id: "insert", label: context.node.kind === "image" ? "Als Abbildung einfügen" : context.node.kind === "tex" ? "Als \\input einfügen" : context.node.kind === "pdf" ? "Als PDF-Seiten einfügen" : context.node.kind === "csv" ? "Als LaTeX-Tabelle …" : "Als Listing einfügen", hint: context.node.kind === "csv" ? "Tabellenansicht mit Export" : "an der Cursorposition", onSelect: () => insertNode(context.node) }]
                          : []),
                        ...((context.node.kind === "image" || (context.node.kind === "pdf" && !context.node.path.startsWith(`${figureDir()}/`))) && isTexActive && !context.node.path.startsWith(`${figureDir()}/`)
                          ? [{ id: "copyfig", label: `Nach ${figureDir()}/ kopieren & einfügen`, hint: "Kopie im Abbildungsordner der Arbeit", onSelect: () => copyToFigures(context.node) }]
                          : []),
                        { id: "openext", label: "Mit Standardprogramm öffnen", onSelect: () => api.openExternal(context.node.path).catch((e) => notify(e.message, "error")) },
                        ...(context.node.kind === "tex" && !contextInMount ? [{ id: "main", label: "Als Hauptdatei festlegen", checked: project.mainFile === context.node.path, onSelect: () => setMain(context.node.path) }] : []),
                      ]),
                  ...(context.node.type === "dir" && !contextInMount && !context.node.mount
                    ? [
                        context.node.excluded
                          ? { id: "include", label: "Ausschluss aufheben", hint: "Ordner wieder anzeigen und durchsuchen", onSelect: () => projectSettings({ excludePaths: (settings.excludePaths || []).filter((p) => p !== context.node.path) }) }
                          : { id: "exclude", label: "Ordner ausschließen", hint: "nicht anzeigen, durchsuchen, sichern (große Ergebnisordner)", onSelect: () => projectSettings({ excludePaths: [...(settings.excludePaths || []), context.node.path] }) },
                      ]
                    : []),
                  ...(contextInMount && context.node.mount
                    ? [{ id: "unmount", label: "Verknüpfung entfernen", hint: context.node.realPath, onSelect: () => api.removeMount(context.node.name).then(setProject) }]
                    : []),
                  { type: "separator" },
                  { id: "file", label: "Neue Datei hier", onSelect: () => askNew("file", contextDir) },
                  { id: "dir", label: "Neuer Ordner hier", onSelect: () => askNew("dir", contextDir) },
                  { type: "separator" },
                  { id: "reveal", label: "Im Explorer anzeigen", onSelect: () => api.reveal(context.node.path) },
                  { id: "copy", label: "Pfad kopieren", onSelect: () => navigator.clipboard?.writeText(context.node.path) },
                  ...(context.node.mount
                    ? []
                    : [
                        { id: "dup", label: "Duplizieren", onSelect: () => api.duplicate(context.node.path).then(setProject).catch((e) => notify(e.message, "error")) },
                        { id: "rename", label: "Umbenennen", onSelect: () => setDialog({ type: "rename", node: context.node, value: context.node.name }) },
                        { id: "delete", label: "Löschen", danger: true, onSelect: () => setDialog({ type: "delete", node: context.node }) },
                      ]),
                ]
              : [
                  { id: "file", label: "Neue Datei", onSelect: () => askNew("file", "") },
                  { id: "dir", label: "Neuer Ordner", onSelect: () => askNew("dir", "") },
                  { id: "mount", label: "Ordner verknüpfen …", onSelect: () => setDialog({ type: "mount", name: "", path: "" }) },
                  { type: "separator" },
                  { id: "reveal", label: "Projektordner im Explorer", onSelect: () => api.reveal("") },
                ]
        }
      />

      {/* ---------- Dialoge ---------- */}
      {dialog?.type === "create" && (
        <Dialog
          title={dialog.kind === "dir" ? "Neuer Ordner" : "Neue Datei"}
          subtitle={dialog.dir ? `in ${dialog.dir}` : "im Projektordner"}
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
          actions={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>Abbrechen</button>
              <button className="btn btn-primary" type="button" onClick={submitDialog}>Anlegen</button>
            </>
          }
        >
          <input className="path-input" value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} />
          {dialog.kind === "file" && <p className="muted small">Tipp: Kapitel als <code>kapitel/07-name.tex</code> anlegen und in main.tex mit <code>\input{"{kapitel/07-name}"}</code> einbinden.</p>}
        </Dialog>
      )}
      {dialog?.type === "rename" && (
        <Dialog
          title="Umbenennen"
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
          actions={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>Abbrechen</button>
              <button className="btn btn-primary" type="button" onClick={submitDialog}>Speichern</button>
            </>
          }
        >
          <input className="path-input" value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} />
        </Dialog>
      )}
      {dialog?.type === "delete" && (
        <Dialog
          title="Löschen?"
          onClose={() => setDialog(null)}
          actions={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>Abbrechen</button>
              <button className="btn btn-danger" type="button" onClick={submitDialog}>Löschen</button>
            </>
          }
        >
          <p>
            <b>{dialog.node.path}</b> wird gelöscht. Über die Historie lässt sich die Datei wiederherstellen.
          </p>
        </Dialog>
      )}
      {dialog?.type === "confirm" && (
        <Dialog
          title={dialog.title}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>Abbrechen</button>
              <button className={`btn ${dialog.danger ? "btn-danger" : "btn-primary"}`} type="button" onClick={submitDialog}>{dialog.okLabel || "Ja, ausführen"}</button>
            </>
          }
        >
          <p>{dialog.text}</p>
        </Dialog>
      )}
      {dialog?.type === "mount" && (
        <Dialog
          title="Ordner verknüpfen"
          subtitle="Der Ordner erscheint als @name im Dateibaum – ideal für den Quellcode deines Projekts."
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
          actions={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>Abbrechen</button>
              <button className="btn btn-primary" type="button" disabled={!dialog.name?.trim() || !dialog.path?.trim()} onClick={submitDialog}>Verknüpfen</button>
            </>
          }
        >
          <div className="form-col">
            <label>
              <span>Pfad</span>
              <div className="row">
                <input className="path-input" value={dialog.path} onChange={(e) => setDialog({ ...dialog, path: e.target.value })} placeholder="C:\Projekte\meine-app" />
                <button className="btn btn-ghost" type="button" onClick={async () => { const { path } = await api.pick("Ordner verknüpfen"); if (path) setDialog((d) => ({ ...d, path, name: d.name || baseName(path) })); }}>
                  <Icon name="folder" />
                </button>
              </div>
            </label>
            <label>
              <span>Name</span>
              <input value={dialog.name} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} placeholder="code" />
            </label>
          </div>
        </Dialog>
      )}
      {dialog?.type === "settings" && (
        <SettingsDialog
          ui={ui}
          updateUi={updateUi}
          project={project}
          onProjectSettings={projectSettings}
          onClose={() => setDialog(null)}
          initialTab={dialog.tab || "look"}
          onMountsChanged={() => api.project().then((d) => d.project && setProject(d.project))}
          onNotify={(m) => notify(m)}
        />
      )}
      {dialog?.type === "protocol" && (
        <Dialog
          title="Eintrag ins Arbeitsprotokoll"
          subtitle={`Wird mit Datum und Uhrzeit an ${dialog.file || doc.protocolFile || "Arbeitsprotokoll.md"} angehängt (erste Zeile = Überschrift des Eintrags).`}
          onClose={() => setDialog(null)}
          width={560}
          actions={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>Abbrechen</button>
              <button className="btn btn-primary" type="button" disabled={!dialog.text.trim()} onClick={submitProtocol}>Eintragen</button>
            </>
          }
        >
          <div className="form-col">
            <textarea
              rows={6}
              value={dialog.text}
              autoFocus
              onChange={(e) => setDialog({ ...dialog, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitProtocol();
              }}
              placeholder={"Was wurde gemacht, warum, Befund, offene Punkte …\nStrg+Enter = eintragen"}
            />
            <label>
              <span>Datei</span>
              <input value={dialog.file} onChange={(e) => setDialog({ ...dialog, file: e.target.value })} placeholder={doc.protocolFile || "Arbeitsprotokoll.md"} />
            </label>
          </div>
        </Dialog>
      )}
      {dialog?.type === "diff" && (
        <DiffDialog
          id={dialog.id}
          path={dialog.path}
          item={dialog.item}
          ui={ui}
          onClose={() => setDialog(null)}
          onRestoreFile={(id, path) => setDialog({ type: "confirm", title: `${baseName(path)} wiederherstellen?`, text: "Die Datei wird auf den gewählten Stand gesetzt. Der aktuelle Stand bleibt in der Historie.", danger: true, action: () => restoreOneFile(id, path) })}
        />
      )}
      {dialog?.type === "newProject" && (
        <NewProjectDialog
          onClose={() => setDialog(null)}
          onCreate={async (path, vars) => {
            await flushSave();
            await onCreateOther(path, vars);
          }}
          initialParent={project.path.replace(/[\\/][^\\/]+$/, "")}
        />
      )}

      {toast && (
        <div className={`toast ${toast.kind}`} key={toast.id} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
