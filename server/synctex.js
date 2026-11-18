import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { toolPath, detectLatex } from "./latex.js";
import { pdfPathFor, mainDirFor } from "./compile.js";

const execFileAsync = promisify(execFile);

/** Zerlegt die synctex-Ausgabe in Blöcke; Schlüssel bleiben case-sensitiv (h ≠ H). */
function parseBlocks(stdout) {
  const blocks = [];
  let current = null;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^SyncTeX result begin/.test(line)) {
      current = {};
      continue;
    }
    if (/^SyncTeX result end/.test(line)) {
      if (current && Object.keys(current).length) blocks.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const m = line.match(/^([A-Za-z]+):(.*)$/);
    if (m) current[m[1]] = m[2].trim();
  }
  return blocks;
}

/** synctex-Eingabename → projektrelativer Pfad (relative Namen beziehen sich auf den Ordner der Hauptdatei). */
function normalizeInput(input, root, mainDir) {
  let f = String(input || "").replace(/\\/g, "/");
  const r = String(root).replace(/\\/g, "/").replace(/\/+$/, "");
  const isAbsolute = /^([A-Za-z]:)?\//.test(f);
  if (!isAbsolute) f = path.resolve(mainDir, f).replace(/\\/g, "/");
  if (f.toLowerCase().startsWith(r.toLowerCase())) f = f.slice(r.length);
  return f.replace(/^\.\//, "").replace(/^\/+/, "");
}

function toBox(b) {
  return {
    page: Number(b.Page),
    x: Number(b.h ?? b.x),
    y: Number(b.v ?? b.y),
    width: Number(b.W ?? 0),
    height: Number(b.H ?? 0) || 12,
  };
}

/** Quelltext → PDF-Position. Liefert die erste Box und bis zu 40 weitere. */
export async function forwardSync({ root, mainFile, file, line, column = 1 }) {
  if (!detectLatex().synctex) throw new Error("synctex nicht gefunden");
  const pdf = pdfPathFor(root, mainFile);
  if (!fs.existsSync(pdf)) throw new Error("Noch kein PDF vorhanden");
  const mainDir = mainDirFor(root, mainFile);
  const rel = String(file).replace(/\\/g, "/");
  const abs = path.resolve(root, rel).replace(/\\/g, "/");
  const relToMain = path.relative(mainDir, abs).replace(/\\/g, "/");
  const variants = [...new Set([abs, relToMain, `./${relToMain}`, rel, `./${rel}`])];
  let lastError = null;
  for (const name of variants) {
    try {
      const { stdout } = await execFileAsync(toolPath("synctex"), ["view", "-i", `${line}:${column}:${name}`, "-o", pdf], {
        cwd: mainDir,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 10000,
      });
      const boxes = parseBlocks(stdout)
        .map(toBox)
        .filter((b) => Number.isFinite(b.page) && b.page > 0);
      if (boxes.length) return { box: boxes[0], boxes: boxes.slice(0, 40) };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw new Error(`synctex: ${lastError.stderr || lastError.message}`);
  return null;
}

/** PDF-Position → Quelltext. Koordinaten in PDF-Punkten, Ursprung oben links. */
export async function inverseSync({ root, mainFile, page, x, y }) {
  if (!detectLatex().synctex) throw new Error("synctex nicht gefunden");
  const pdf = pdfPathFor(root, mainFile);
  if (!fs.existsSync(pdf)) throw new Error("Noch kein PDF vorhanden");
  const mainDir = mainDirFor(root, mainFile);
  const { stdout } = await execFileAsync(
    toolPath("synctex"),
    ["edit", "-o", `${page}:${Number(x).toFixed(2)}:${Number(y).toFixed(2)}:${pdf}`],
    { cwd: mainDir, windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 10000 },
  );
  const b = parseBlocks(stdout).find((blk) => blk.Input && blk.Line);
  if (!b) return null;
  return {
    file: normalizeInput(b.Input, root, mainDir),
    line: Number(b.Line),
    column: Math.max(1, Number(b.Column) || 1),
  };
}
