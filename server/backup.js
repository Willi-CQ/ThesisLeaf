import fs from "fs";
import path from "path";
import { zipDirectory } from "./zip.js";

function stamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Neueste Änderung im Projekt (ohne interne/ausgeschlossene Ordner) – für „nur sichern, wenn sich etwas geändert hat“. */
export function latestMtime(root, { excludePaths = [] } = {}) {
  let latest = 0;
  const skip = new Set([".git", ".local-overleaf", "node_modules", ".venv", "venv", "__pycache__"]);
  function walk(rel, depth) {
    if (depth > 10) return;
    const abs = path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (skip.has(e.name) || excludePaths.some((p) => childRel === p || childRel.startsWith(`${p}/`))) continue;
        walk(childRel, depth + 1);
      } else if (e.isFile()) {
        try {
          const m = fs.statSync(path.join(abs, e.name)).mtimeMs;
          if (m > latest) latest = m;
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk("", 0);
  return latest;
}

/**
 * Schreibt ein ZIP des Projekts (Quellen ohne Build-Dateien) in den Sicherungsordner und
 * behält nur die letzten `keep` Sicherungen.
 */
export function writeBackup(root, { dir, keep = 20, includePdf = null, excludePaths = [] } = {}) {
  if (!dir) throw new Error("Kein Sicherungsordner konfiguriert");
  fs.mkdirSync(dir, { recursive: true });
  const name = path.basename(root).replace(/[^\w.-]+/g, "_") || "projekt";
  const file = path.join(dir, `${name}-${stamp()}.zip`);
  const extra = [];
  if (includePdf && fs.existsSync(includePdf)) extra.push({ name: `${name}.pdf`, path: includePdf });
  const buf = zipDirectory(root, { extraFiles: extra, excludePaths });
  fs.writeFileSync(file, buf);
  const old = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(`${name}-`) && n.endsWith(".zip"))
    .sort();
  while (old.length > keep) {
    const victim = old.shift();
    try {
      fs.rmSync(path.join(dir, victim));
    } catch {
      /* ignore */
    }
  }
  return { file, bytes: buf.length, kept: Math.min(old.length, keep) };
}

export function listBackups(root, dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const name = path.basename(root).replace(/[^\w.-]+/g, "_") || "projekt";
  return fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(`${name}-`) && n.endsWith(".zip"))
    .sort()
    .reverse()
    .map((n) => {
      const st = fs.statSync(path.join(dir, n));
      return { file: path.join(dir, n), name: n, bytes: st.size, mtime: st.mtimeMs };
    });
}
