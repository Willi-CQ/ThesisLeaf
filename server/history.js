import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function gitDir(root) {
  return path.join(root, ".local-overleaf", "git");
}

async function git(root, args, opts = {}) {
  return execFileAsync("git", [`--git-dir=${gitDir(root)}`, `--work-tree=${root}`, ...args], {
    cwd: root,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
    ...opts,
  });
}

let gitAvailable = null;
export async function hasGit() {
  if (gitAvailable !== null) return gitAvailable;
  try {
    await execFileAsync("git", ["--version"], { windowsHide: true, timeout: 5000 });
    gitAvailable = true;
  } catch {
    gitAvailable = false;
  }
  return gitAvailable;
}

let lastExtra = null;

/** Schreibt die Ausschlussliste der Historie; `extra` = ausgeschlossene/schwere Ordner des Projekts. */
function writeExclude(root, extra = []) {
  const exclude = path.join(gitDir(root), "info", "exclude");
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  const extraLines = extra.map((p) => `/${String(p).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")}/`);
  fs.writeFileSync(
    exclude,
    [
      ".local-overleaf/", ".git/", "node_modules/", "__pycache__/", ".venv/", "venv/", ".ruff_cache/", ".mypy_cache/", ".pytest_cache/",
      "*.aux", "*.log", "*.out", "*.toc", "*.lof", "*.lot", "*.fls", "*.fdb_latexmk", "*.synctex.gz", "*.synctex", "*.bbl", "*.blg",
      "*.run.xml", "*.bcf", "*.nav", "*.snm", "*.vrb", "*.idx", "*.ilg", "*.ind", "*.glo", "*.gls", "*.acn", "*.acr", "*.alg", "*.ist",
      "*.lol", "*.xdv", "*.tdo", "*.tmp-*", "Thumbs.db", ".DS_Store", ...extraLines, "",
    ].join("\n"),
    "utf8",
  );
  lastExtra = extra.join("|");
}

export async function initHistory(root, extra = null) {
  if (!(await hasGit())) return false;
  const dir = gitDir(root);
  if (!fs.existsSync(path.join(dir, "HEAD"))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.name", "ThesisLeaf"]);
    await git(root, ["config", "user.email", "thesisleaf@local"]);
    await git(root, ["config", "core.autocrlf", "false"]);
    await git(root, ["config", "core.quotepath", "false"]);
    await git(root, ["config", "commit.gpgsign", "false"]);
    await git(root, ["config", "gc.auto", "0"]);
  }
  if (extra !== null || lastExtra === null) writeExclude(root, extra || []);
  return true;
}

export async function snapshot(root, message = "Automatisch gespeichert") {
  if (!(await initHistory(root))) return null;
  await git(root, ["add", "-A"]);
  const { stdout } = await git(root, ["status", "--porcelain"]);
  if (!stdout.trim()) return null;
  await git(root, ["commit", "-m", message, "--quiet", "--no-verify"]);
  const { stdout: hash } = await git(root, ["rev-parse", "HEAD"]);
  return hash.trim();
}

export async function listHistory(root, limit = 200) {
  if (!(await initHistory(root))) return [];
  try {
    const { stdout } = await git(root, [
      "log",
      "-n",
      String(limit),
      "--date=iso-strict",
      "--pretty=format:%x1e%H%x09%cI%x09%s",
      "--shortstat",
    ]);
    if (!stdout.trim()) return [];
    const blocks = stdout.split("\x1e").map((b) => b.trim()).filter(Boolean);
    return blocks.map((block) => {
      const [head, ...rest] = block.split(/\r?\n/);
      const [id, date, ...msg] = head.split("\t");
      const statLine = rest.find((l) => /changed/.test(l)) || "";
      const files = Number((statLine.match(/(\d+) files? changed/) || [])[1] || 0);
      const insertions = Number((statLine.match(/(\d+) insertions?/) || [])[1] || 0);
      const deletions = Number((statLine.match(/(\d+) deletions?/) || [])[1] || 0);
      const message = msg.join("\t");
      return {
        id,
        date,
        message,
        files,
        insertions,
        deletions,
        manual: !/^(Automatisch gespeichert|Projekt geöffnet)$/.test(message),
      };
    });
  } catch (err) {
    const msg = String(err.stderr || err.message || "");
    if (/does not have any commits|unknown revision|bad revision|bad default revision/i.test(msg)) return [];
    throw err;
  }
}

export async function changedFiles(root, id) {
  const { stdout } = await git(root, ["show", "--pretty=format:", "--name-status", "--no-renames", id]);
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [status, ...p] = l.split("\t");
      return { status: status[0], path: p.join("\t") };
    });
}

export async function showFile(root, id, rel) {
  const posix = rel.split(path.sep).join("/");
  const { stdout } = await git(root, ["show", `${id}:${posix}`], { encoding: "utf8" });
  return stdout;
}

export async function diffFile(root, id, rel) {
  const posix = rel.split(path.sep).join("/");
  let old = "";
  let existedBefore = true;
  try {
    old = await showFile(root, id, posix);
  } catch {
    existedBefore = false;
  }
  let current = "";
  let existsNow = true;
  try {
    current = fs.readFileSync(path.resolve(root, posix), "utf8");
  } catch {
    existsNow = false;
  }
  return { old, current, existedBefore, existsNow };
}

export async function restore(root, id) {
  await git(root, ["checkout", id, "--", "."]);
  await snapshot(root, `Wiederhergestellt · ${id.slice(0, 7)}`);
}

export async function restoreFile(root, id, rel) {
  const posix = rel.split(path.sep).join("/");
  await git(root, ["checkout", id, "--", posix]);
  await snapshot(root, `Datei wiederhergestellt · ${path.basename(posix)} · ${id.slice(0, 7)}`);
}

export async function hasChanges(root) {
  if (!(await initHistory(root))) return false;
  await git(root, ["add", "-A"]);
  const { stdout } = await git(root, ["status", "--porcelain"]);
  return Boolean(stdout.trim());
}
