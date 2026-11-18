import fs from "fs";
import path from "path";
import zlib from "zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = Math.max(1980, d.getFullYear());
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const day = (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, day };
}

/**
 * Erstellt ein ZIP-Archiv (Deflate) aus Einträgen {name, data, mtime}.
 * Kein externes Paket nötig – ausreichend für Projektexporte.
 */
export function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "");
    const crc = crc32(data);
    let method = 8;
    let payload = zlib.deflateRawSync(data, { level: 6 });
    if (payload.length >= data.length) {
      method = 0;
      payload = data;
    }
    const { time, day } = dosDateTime(entry.mtime || new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + payload.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

const SKIP_DIRS = new Set([".git", ".local-overleaf", "node_modules", ".thesisleaf", "__pycache__", ".venv", "venv"]);
const ARTIFACT_RE = /\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|bbl|blg|bcf|nav|snm|vrb|idx|ilg|ind|glo|gls|acn|acr|alg|ist|lol|xdv|dvi|tdo)$|\.synctex(\.gz)?$|\.run\.xml$/i;

/** Packt einen Projektordner (Quellen, ohne Build-Dateien) in ein ZIP. */
export function zipDirectory(root, { includeArtifacts = false, extraFiles = [], prefix = "", excludePaths = [] } = {}) {
  const entries = [];
  const excluded = (rel) => excludePaths.some((p) => rel === p || rel.startsWith(`${p}/`));
  function walk(rel) {
    const abs = path.join(root, rel);
    let list;
    try {
      list = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of list) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || excluded(childRel)) continue;
        walk(childRel);
      } else if (entry.isFile()) {
        if (!includeArtifacts && ARTIFACT_RE.test(entry.name)) continue;
        if (entry.name === "Thumbs.db" || entry.name === ".DS_Store") continue;
        const file = path.join(abs, entry.name);
        try {
          const st = fs.statSync(file);
          if (st.size > 200 * 1024 * 1024) continue;
          entries.push({ name: prefix ? `${prefix}/${childRel}` : childRel, data: fs.readFileSync(file), mtime: st.mtime });
        } catch {
          /* skip */
        }
      }
    }
  }
  walk("");
  for (const extra of extraFiles) {
    if (extra && fs.existsSync(extra.path)) {
      entries.push({ name: prefix ? `${prefix}/${extra.name}` : extra.name, data: fs.readFileSync(extra.path), mtime: fs.statSync(extra.path).mtime });
    }
  }
  return createZip(entries);
}
