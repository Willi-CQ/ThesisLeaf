import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { api } from "../api.js";
import { dirName } from "../util.js";

export function FileIcon({ node }) {
  if (node.type === "dir") return <Icon name={node.mount ? "mount" : "folder"} size={15} className="tree-ico dir" />;
  const k = node.kind;
  if (k === "tex") return <span className="kind-chip tex">T</span>;
  if (k === "bib") return <span className="kind-chip bib">B</span>;
  if (k === "markdown") return <span className="kind-chip md">M</span>;
  if (k === "image") return <Icon name="image" size={15} className="tree-ico" />;
  if (k === "pdf") return <span className="kind-chip pdf">P</span>;
  if (k === "code") return <span className="kind-chip code">{"{}"}</span>;
  return <span className="kind-chip txt">≡</span>;
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function DirRow({ node, depth, opened, loading, onToggle, onContext, onDropFiles, dragOver, setDragOver }) {
  const isTarget = dragOver === node.path;
  const note = node.missing
    ? " (nicht gefunden)"
    : node.excluded
      ? " – ausgeschlossen: nicht beobachtet, durchsucht, versioniert oder gesichert"
      : node.heavy
        ? " – großer Ordner: sichtbar, aber nicht beobachtet, durchsucht, versioniert oder gesichert"
        : "";
  return (
    <button
      type="button"
      className={`tree-dir ${node.mount ? "mount" : ""} ${node.missing ? "missing" : ""} ${node.excluded ? "excluded" : ""} ${node.heavy ? "heavy" : ""} ${isTarget ? "drop-target" : ""}`}
      style={{ paddingLeft: 6 + depth * 12 }}
      onClick={() => onToggle(node.path)}
      onContextMenu={(e) => onContext(e, node)}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(node.path);
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(null);
        onDropFiles(node.path, e.dataTransfer.files);
      }}
      title={`${node.mount ? `Verknüpfter Ordner: ${node.realPath}` : node.path}${note}`}
    >
      {loading ? <span className="spinner tiny tree-caret" /> : <Icon name={opened ? "chevronDown" : "chevronRight"} size={12} className="tree-caret" />}
      <FileIcon node={node} />
      <span className="tree-name">{node.name}</span>
      {node.mount && <span className="tree-badge">verknüpft</span>}
      {node.excluded && <span className="tree-badge">ausgeschlossen</span>}
      {!node.excluded && node.heavy && <span className="tree-badge heavy">groß</span>}
    </button>
  );
}

function FileRow({ node, depth, active, isOpen, isMain, onOpen, onContext, showPath }) {
  return (
    <button
      type="button"
      className={`tree-item ${active === node.path ? "active" : ""} ${isOpen ? "open" : ""} ${node.artifact ? "artifact" : ""}`}
      style={{ paddingLeft: 20 + depth * 12 }}
      onClick={() => onOpen(node)}
      onContextMenu={(e) => onContext(e, node)}
      title={`${node.path}${node.size ? ` · ${(node.size / 1024).toFixed(1)} KB` : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/thesisleaf-path", node.path);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <FileIcon node={node} />
      <span className="tree-name">
        {node.name}
        {showPath && <span className="tree-path"> {dirName(node.path)}</span>}
      </span>
      {isMain && (
        <span className="tree-badge main" title="Hauptdatei">
          main
        </span>
      )}
    </button>
  );
}

/**
 * Dateibaum mit Nachladen je Ordnerebene: nur aufgeklappte Ordner werden vom Server
 * gelesen. Der Filter durchsucht den flachen Dateiindex des ganzen Projekts.
 */
export default function FileTree({
  tree,
  active,
  openFiles,
  mainFile,
  query,
  setQuery,
  onOpen,
  onNew,
  onAddMount,
  openDirs,
  toggleDir,
  setOpenDirs,
  onContext,
  showHidden,
  onToggleHidden,
  onUpload,
  onRefresh,
  version,
  changedPaths,
  ensureIndex,
  fileIndex,
}) {
  const [dragOver, setDragOver] = useState(null);
  const [children, setChildren] = useState({});
  const [loadingDirs, setLoadingDirs] = useState(() => new Set());
  const loadingRef = useRef(new Set());
  const childrenRef = useRef(children);
  childrenRef.current = children;

  const load = useCallback(async (dirPath, force = false) => {
    if (!force && childrenRef.current[dirPath]) return;
    if (loadingRef.current.has(dirPath)) return;
    loadingRef.current.add(dirPath);
    setLoadingDirs(new Set(loadingRef.current));
    try {
      const r = await api.list(dirPath);
      setChildren((c) => ({ ...c, [dirPath]: r.nodes }));
    } catch (err) {
      setChildren((c) => ({ ...c, [dirPath]: [{ name: err.message, path: `${dirPath}/…`, type: "more" }] }));
    } finally {
      loadingRef.current.delete(dirPath);
      setLoadingDirs(new Set(loadingRef.current));
    }
  }, []);

  // Aufgeklappte, noch nicht geladene Ordner nachladen
  useEffect(() => {
    for (const p of openDirs) if (!childrenRef.current[p]) load(p);
  }, [openDirs, load]);

  // Nach Änderungen im Projekt: geladene, aufgeklappte Ordner erneuern (gedrosselt)
  useEffect(() => {
    if (!version) return undefined;
    const t = setTimeout(() => {
      for (const p of Object.keys(childrenRef.current)) if (openDirs.has(p)) load(p, true);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Einzelne Dateiänderung: nur den betroffenen Ordner erneuern
  useEffect(() => {
    if (!changedPaths?.length) return;
    for (const p of changedPaths) {
      const dir = dirName(p);
      if (childrenRef.current[dir] !== undefined && openDirs.has(dir)) load(dir, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedPaths]);

  // Filter: flacher Index laden
  useEffect(() => {
    if (query.trim()) ensureIndex?.();
  }, [query, ensureIndex]);

  async function onDropFiles(dir, fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const payload = [];
    for (const f of files) {
      if (f.size > 60 * 1024 * 1024) continue;
      payload.push({ name: f.name, base64: await readAsBase64(f) });
    }
    onUpload?.(dir, payload);
  }

  function collapseAll() {
    setOpenDirs?.(new Set());
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const list = (fileIndex?.files || []).filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    list.sort((a, b) => {
      const an = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bn = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return an - bn || a.path.localeCompare(b.path);
    });
    return list.slice(0, 300);
  }, [query, fileIndex]);

  function renderNodes(nodes, depth) {
    return (nodes || []).map((node) => {
      if (node.type === "more") {
        return (
          <div key={node.path} className="tree-more" style={{ paddingLeft: 20 + depth * 12 }} title="Sehr große Ordner werden gekürzt angezeigt – im Explorer öffnen">
            {node.name}
          </div>
        );
      }
      if (node.type === "dir") {
        const opened = openDirs.has(node.path);
        const kids = children[node.path];
        return (
          <div key={node.path}>
            <DirRow node={node} depth={depth} opened={opened} loading={loadingDirs.has(node.path)} onToggle={toggleDir} onContext={onContext} onDropFiles={onDropFiles} dragOver={dragOver} setDragOver={setDragOver} />
            {opened && (
              <div className="tree-children">
                {kids === undefined && !loadingDirs.has(node.path) && <div className="tree-empty" style={{ paddingLeft: 18 + depth * 12 }}>…</div>}
                {kids && kids.length === 0 && <div className="tree-empty" style={{ paddingLeft: 18 + depth * 12 }}>leer</div>}
                {kids && renderNodes(kids, depth + 1)}
              </div>
            )}
          </div>
        );
      }
      return <FileRow key={node.path} node={node} depth={depth} active={active} isOpen={openFiles?.has(node.path)} isMain={mainFile === node.path} onOpen={onOpen} onContext={onContext} />;
    });
  }

  return (
    <>
      <div className="panel-head">
        <span>Dateien</span>
        <div className="panel-actions">
          <button className="icon-only" type="button" title="Neue Datei" onClick={() => onNew("file")}>
            <Icon name="file" size={15} />
          </button>
          <button className="icon-only" type="button" title="Neuer Ordner" onClick={() => onNew("dir")}>
            <Icon name="plus" size={15} />
          </button>
          <button className="icon-only" type="button" title="Externen Ordner verknüpfen (z. B. Quellcode-Projekt)" onClick={onAddMount}>
            <Icon name="mount" size={15} />
          </button>
          <button className={`icon-only ${showHidden ? "active" : ""}`} type="button" title={showHidden ? "Build-Dateien ausblenden" : "Build-Dateien (aux, log …) anzeigen"} onClick={onToggleHidden}>
            <Icon name={showHidden ? "eye" : "eyeOff"} size={15} />
          </button>
          <button className="icon-only" type="button" title="Alle Ordner einklappen" onClick={collapseAll}>
            <Icon name="arrowUp" size={15} />
          </button>
          <button className="icon-only" type="button" title="Aktualisieren" onClick={() => { setChildren({}); onRefresh?.(); }}>
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </div>
      <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Dateien im Projekt filtern …" />
      <div
        className={`tree ${dragOver === "" ? "drop-target" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver("");
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(null);
          onDropFiles("", e.dataTransfer.files);
        }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) onContext(e, null);
        }}
      >
        {filtered ? (
          <>
            {filtered.length === 0 && <div className="tree-empty">{fileIndex ? "Keine Datei passt zum Filter." : "Index wird geladen …"}</div>}
            {filtered.map((f) => (
              <FileRow key={f.path} node={f} depth={0} active={active} isOpen={openFiles?.has(f.path)} isMain={mainFile === f.path} onOpen={onOpen} onContext={onContext} showPath />
            ))}
            {fileIndex?.truncated && <div className="tree-hint">Index gekürzt – große Ordner sind ausgenommen.</div>}
          </>
        ) : (
          <>
            {renderNodes(tree, 0)}
            {(tree || []).length === 0 && <div className="tree-empty">Keine Dateien</div>}
            <div className="tree-hint">Dateien hierher ziehen, um sie hochzuladen (Bilder, PDFs, Code). Ordner werden beim Aufklappen geladen.</div>
          </>
        )}
      </div>
    </>
  );
}
