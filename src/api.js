/** Bridge zur Desktop-Hülle (Electron); im Browser undefined. */
export const desktop = typeof window !== "undefined" && window.thesisleaf ? window.thesisleaf : null;

const json = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

function req(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return fetch(url, opts).then(json);
}

const q = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

export const api = {
  health: () => req("GET", "/api/health"),
  recents: () => req("GET", "/api/recents"),
  removeRecent: (path) => req("DELETE", `/api/recents?${q({ path })}`),
  templateFields: () => req("GET", "/api/template/fields"),

  async pick(title, opts = {}) {
    if (desktop?.pickFolder) {
      const p = await desktop.pickFolder({ title, ...opts });
      return { path: p };
    }
    return req("POST", "/api/project/pick", { title, ...opts });
  },
  open: (path) => req("POST", "/api/project/open", { path }),
  create: (path, vars) => req("POST", "/api/project/create", { path, vars }),
  close: () => req("POST", "/api/project/close"),
  project: () => req("GET", "/api/project"),
  setMain: (mainFile) => req("POST", "/api/project/main", { mainFile }),
  settings: (body) => req("POST", "/api/project/settings", body),
  addMount: (name, path) => req("POST", "/api/project/mounts", { name, path }),
  removeMount: (name) => req("DELETE", `/api/project/mounts?${q({ name })}`),
  reveal: (path) => req("POST", "/api/project/reveal", { path }),
  openExternal: (path) => req("POST", "/api/open", { path }),

  read: (path) => req("GET", `/api/files/read?${q({ path })}`),
  rawUrl: (path, t) => `/api/files/raw?${q({ path, t })}`,
  write: (path, content) => req("PUT", "/api/files/write", { path, content }),
  stat: (path) => req("GET", `/api/files/stat?${q({ path })}`),
  createFile: (path, type, content) => req("POST", "/api/files/create", { path, type, content }),
  rename: (from, to) => req("POST", "/api/files/rename", { from, to }),
  duplicate: (path) => req("POST", "/api/files/duplicate", { path }),
  copy: (from, to) => req("POST", "/api/files/copy", { from, to }),
  remove: (path) => req("DELETE", `/api/files?${q({ path })}`),
  upload: (path, base64) => req("POST", "/api/files/upload", { path, base64 }),
  csv: (path) => req("GET", `/api/files/csv?${q({ path })}`),
  list: (path) => req("GET", `/api/files/list?${q({ path })}`),
  index: () => req("GET", "/api/files/index"),
  search: (params) => req("GET", `/api/search?${q(params)}`),

  compile: () => req("POST", "/api/compile"),
  cancelCompile: () => req("POST", "/api/compile/cancel"),
  cleanBuild: () => req("POST", "/api/compile/clean"),
  compileStatus: () => req("GET", "/api/compile/status"),
  log: () => req("GET", "/api/log"),
  pdfUrl: (revision) => `/api/pdf?t=${revision}`,
  forwardSync: (file, line, column) => req("GET", `/api/synctex/forward?${q({ file, line, column })}`),
  inverseSync: (page, x, y) => req("GET", `/api/synctex/inverse?${q({ page, x, y })}`),

  stats: () => req("GET", "/api/stats"),
  lint: (path) => req("GET", `/api/lint?${q({ path })}`),
  spellAdd: (word, scope) => req("POST", "/api/spell/add", { word, scope }),
  grammar: (path, language) => req("POST", "/api/grammar", { path, language }),
  bib: () => req("GET", "/api/bib"),
  bibLookup: (query) => req("POST", "/api/bib/lookup", { query }),
  bibSearch: (query, rows) => req("GET", `/api/bib/search?${q({ q: query, rows })}`),
  bibAdd: (file, bibtex) => req("POST", "/api/bib/add", { file, bibtex }),
  notesAppend: (text, file) => req("POST", "/api/notes/append", { text, file }),
  backups: () => req("GET", "/api/backup"),
  backupNow: () => req("POST", "/api/backup", {}),

  history: () => req("GET", "/api/history"),
  historyFile: (id, path) => req("GET", `/api/history/file?${q({ id, path })}`),
  historyDiff: (id, path) => req("GET", `/api/history/diff?${q({ id, path })}`),
  historyChanges: (id) => req("GET", `/api/history/changes?${q({ id })}`),
  restore: (id) => req("POST", "/api/history/restore", { id }),
  restoreFile: (id, path) => req("POST", "/api/history/restore-file", { id, path }),
  snapshot: (message) => req("POST", "/api/history/snapshot", { message }),

  exportPdfTo: (to) => req("POST", "/api/export/pdf", { to }),
  exportZipTo: (to, opts) => req("POST", "/api/export/zip", { to, ...opts }),
  exportPdfUrl: () => "/api/export/pdf",
  exportZipUrl: (build) => `/api/export/zip${build ? "?build=1" : ""}`,
};

/** Öffnet einen Link extern (Browser des Systems). */
export function openExternal(url) {
  if (desktop?.openExternal) desktop.openExternal(url);
  else window.open(url, "_blank", "noopener");
}
