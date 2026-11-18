const EXT_LANG = {
  tex: "latex", ltx: "latex", sty: "latex", cls: "latex", bib: "bibtex", md: "markdown", markdown: "markdown", txt: "plaintext",
  json: "json", yaml: "yaml", yml: "yaml", xml: "xml", svg: "xml", html: "html", css: "css", scss: "scss", js: "javascript",
  jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript", py: "python", java: "java",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp", go: "go", rs: "rust", rb: "ruby", php: "php", sh: "shell",
  ps1: "powershell", bat: "bat", sql: "sql", kt: "kotlin", swift: "swift", r: "r", lua: "lua", ini: "ini", toml: "ini",
};

export function languageForPath(p) {
  const ext = String(p || "").split(".").pop().toLowerCase();
  return EXT_LANG[ext] || "plaintext";
}

export function baseName(p) {
  return String(p || "").replace(/\\/g, "/").split("/").pop();
}

export function dirName(p) {
  const parts = String(p || "").replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

export function joinPath(dir, name) {
  if (!dir) return name;
  return `${dir.replace(/\\/g, "/").replace(/\/+$/, "")}/${name}`;
}

export function stripExt(p) {
  return String(p || "").replace(/\.(tex|png|jpe?g|pdf|svg|eps)$/i, "");
}

/** Alle Dateien eines Baums flach (für Quick Open). */
export function flattenTree(tree, acc = [], limit = 4000) {
  for (const node of tree || []) {
    if (acc.length >= limit) break;
    if (node.type === "dir") flattenTree(node.children, acc, limit);
    else acc.push(node);
  }
  return acc;
}

export function findNode(tree, path) {
  for (const node of tree || []) {
    if (node.path === path) return node;
    if (node.type === "dir") {
      const hit = findNode(node.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

export function formatDuration(ms) {
  if (!ms) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function isTexPath(p) {
  return /\.(tex|ltx)$/i.test(p || "");
}
