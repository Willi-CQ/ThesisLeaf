import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const TOOLS = ["pdflatex", "xelatex", "lualatex", "latexmk", "biber", "bibtex", "synctex", "chktex", "makeindex", "texcount", "kpsewhich"];

function texliveDirs() {
  const out = [];
  const years = [];
  for (let y = 2028; y >= 2021; y -= 1) years.push(String(y));
  for (const y of years) {
    out.push(`C:\\texlive\\${y}\\bin\\windows`);
    out.push(`C:\\texlive\\${y}\\bin\\win64`);
    out.push(`/usr/local/texlive/${y}/bin/x86_64-linux`);
    out.push(`/usr/local/texlive/${y}/bin/universal-darwin`);
    out.push(`/usr/local/texlive/${y}/bin/aarch64-linux`);
  }
  return out;
}

const BIN_CANDIDATES = () => [
  process.env.THESISLEAF_LATEX_BIN || "",
  path.join(process.env.LOCALAPPDATA || "", "Programs", "MiKTeX", "miktex", "bin", "x64"),
  path.join(process.env.ProgramFiles || "", "MiKTeX", "miktex", "bin", "x64"),
  path.join(process.env["ProgramFiles(x86)"] || "", "MiKTeX", "miktex", "bin", "x64"),
  path.join(process.env.APPDATA || "", "MiKTeX", "miktex", "bin", "x64"),
  ...texliveDirs(),
  "/Library/TeX/texbin",
  "/usr/bin",
  "/usr/local/bin",
];

function exeExists(dir, name) {
  if (!dir) return false;
  return fs.existsSync(path.join(dir, `${name}.exe`)) || fs.existsSync(path.join(dir, name));
}

let cachedBin;
let cachedAt = 0;

function whereOnPath(cmd) {
  try {
    const tool = process.platform === "win32" ? "where.exe" : "which";
    const out = execFileSync(tool, [cmd], { windowsHide: true, encoding: "utf8", timeout: 4000 });
    const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    return first ? path.dirname(first) : null;
  } catch {
    return null;
  }
}

export function findLatexBin() {
  const now = Date.now();
  if (cachedBin !== undefined && now - cachedAt < 30000) return cachedBin;
  let found = null;
  for (const dir of BIN_CANDIDATES()) {
    if (dir && exeExists(dir, "pdflatex")) {
      found = dir;
      break;
    }
  }
  if (!found) found = whereOnPath("pdflatex");
  cachedBin = found;
  cachedAt = now;
  return found;
}

export function ensureLatexPath() {
  const bin = findLatexBin();
  if (bin && !(process.env.PATH || "").toLowerCase().includes(bin.toLowerCase())) {
    process.env.PATH = `${bin}${path.delimiter}${process.env.PATH || ""}`;
  }
  process.env.MIKTEX_AUTOINSTALL = process.env.MIKTEX_AUTOINSTALL || "1";
  return bin;
}

let versionCache = null;

function readVersion(bin) {
  if (versionCache && versionCache.bin === bin) return versionCache.text;
  let text = "";
  try {
    const exe = path.join(bin, process.platform === "win32" ? "pdflatex.exe" : "pdflatex");
    const out = execFileSync(exe, ["--version"], { windowsHide: true, encoding: "utf8", timeout: 6000, stdio: ["ignore", "pipe", "ignore"] });
    text = out.split(/\r?\n/).find((l) => /pdfTeX|MiKTeX|TeX Live/i.test(l)) || out.split(/\r?\n/)[0] || "";
  } catch {
    text = "";
  }
  versionCache = { bin, text };
  return text;
}

export function detectLatex() {
  const bin = ensureLatexPath();
  const tools = {};
  for (const t of TOOLS) tools[t] = exeExists(bin, t);
  const distribution = bin
    ? /miktex/i.test(bin) || /MiKTeX/i.test(readVersion(bin))
      ? "MiKTeX"
      : /texlive/i.test(bin)
        ? "TeX Live"
        : "TeX"
    : null;
  return {
    bin,
    distribution,
    version: bin ? readVersion(bin) : "",
    ...tools,
  };
}

export function toolPath(name) {
  const bin = ensureLatexPath();
  if (bin) {
    const exe = path.join(bin, `${name}.exe`);
    if (fs.existsSync(exe)) return exe;
    const plain = path.join(bin, name);
    if (fs.existsSync(plain)) return plain;
  }
  return name;
}
