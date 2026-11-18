import { app, BrowserWindow, dialog, ipcMain, Menu, shell, nativeTheme, net } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "";
const VERSION = app.getVersion();

if (app.isPackaged) {
  process.env.THESISLEAF_TEMPLATE_DIR = path.join(process.resourcesPath, "template", "bachelorarbeit");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let server = null;
let serverPort = 0;

function userFile(name) {
  return path.join(app.getPath("userData"), name);
}

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(userFile("window.json"), "utf8"));
  } catch {
    return null;
  }
}

function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const data = { ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() };
    fs.writeFileSync(userFile("window.json"), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const req = net.request({ url: `http://127.0.0.1:${port}/api/health`, method: "GET" });
    req.on("response", () => resolve(false));
    req.on("error", () => resolve(true));
    req.end();
  });
}

async function startServer() {
  const { createApp } = await import("../server/index.js");
  const preferred = Number(process.env.THESISLEAF_PORT) || 3847;
  for (let port = preferred; port < preferred + 30; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await portFree(port))) continue;
    const instance = createApp({
      port,
      host: "127.0.0.1",
      staticDir: path.join(ROOT, "dist"),
      picker: async (title) => {
        const r = await dialog.showOpenDialog(mainWindow, { title, properties: ["openDirectory", "createDirectory", "promptToCreate"] });
        return r.canceled ? null : r.filePaths[0];
      },
    });
    try {
      // eslint-disable-next-line no-await-in-loop
      await instance.start();
      server = instance;
      serverPort = port;
      return;
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
    }
  }
  throw new Error("Kein freier Port für den ThesisLeaf-Server gefunden");
}

function send(action, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("menu", action, payload);
}

function projectName() {
  const p = server?.state?.projectPath;
  return p ? path.basename(p) : "arbeit";
}

async function savePdf() {
  const st = server?.state;
  if (!st?.projectPath || !st.mainFile) {
    send("notify", { message: "Kein Projekt geöffnet.", kind: "error" });
    return null;
  }
  const { pdfPathFor } = await import("../server/compile.js");
  const pdf = pdfPathFor(st.projectPath, st.mainFile);
  if (!fs.existsSync(pdf)) {
    send("notify", { message: "Noch kein PDF vorhanden – zuerst kompilieren.", kind: "error" });
    return null;
  }
  const r = await dialog.showSaveDialog(mainWindow, {
    title: "PDF speichern",
    defaultPath: path.join(app.getPath("documents"), `${projectName()}.pdf`),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (r.canceled || !r.filePath) return null;
  fs.copyFileSync(pdf, r.filePath);
  send("notify", { message: `PDF gespeichert: ${r.filePath}` });
  return r.filePath;
}

async function saveZip() {
  const st = server?.state;
  if (!st?.projectPath) {
    send("notify", { message: "Kein Projekt geöffnet.", kind: "error" });
    return null;
  }
  const r = await dialog.showSaveDialog(mainWindow, {
    title: "Projekt als ZIP speichern",
    defaultPath: path.join(app.getPath("documents"), `${projectName()}.zip`),
    filters: [{ name: "ZIP-Archiv", extensions: ["zip"] }],
  });
  if (r.canceled || !r.filePath) return null;
  const { zipDirectory } = await import("../server/zip.js");
  const { pdfPathFor } = await import("../server/compile.js");
  const extra = [];
  if (st.mainFile) {
    const pdf = pdfPathFor(st.projectPath, st.mainFile);
    if (fs.existsSync(pdf)) extra.push({ name: `${projectName()}.pdf`, path: pdf });
  }
  fs.writeFileSync(r.filePath, zipDirectory(st.projectPath, { extraFiles: extra }));
  send("notify", { message: `ZIP gespeichert: ${r.filePath}` });
  return r.filePath;
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "&Datei",
      submenu: [
        { label: "Projekt öffnen …", accelerator: "CommandOrControl+O", click: () => send("open-project") },
        { label: "Neue Bachelorarbeit …", accelerator: "CommandOrControl+N", click: () => send("new-project") },
        { type: "separator" },
        { label: "Speichern", accelerator: "CommandOrControl+S", click: () => send("save") },
        { label: "Version sichern (Snapshot)", accelerator: "CommandOrControl+Shift+S", click: () => send("snapshot") },
        { label: "Eintrag ins Arbeitsprotokoll …", accelerator: "CommandOrControl+Shift+P", click: () => send("protocol") },
        { label: "Sicherung (ZIP) jetzt schreiben", click: () => send("backup") },
        { type: "separator" },
        { label: "PDF exportieren …", click: () => savePdf() },
        { label: "Projekt als ZIP exportieren …", click: () => saveZip() },
        { type: "separator" },
        { label: "Projektordner im Explorer anzeigen", click: () => send("reveal") },
        { type: "separator" },
        { label: "Projekt schließen", accelerator: "CommandOrControl+Shift+W", click: () => send("close-project") },
        isMac ? { role: "close" } : { role: "quit", label: "Beenden" },
      ],
    },
    {
      label: "&Bearbeiten",
      submenu: [
        { role: "undo", label: "Rückgängig" },
        { role: "redo", label: "Wiederholen" },
        { type: "separator" },
        { role: "cut", label: "Ausschneiden" },
        { role: "copy", label: "Kopieren" },
        { role: "paste", label: "Einfügen" },
        { role: "selectAll", label: "Alles auswählen" },
        { type: "separator" },
        { label: "Datei öffnen …", accelerator: "CommandOrControl+P", click: () => send("quick-open") },
        { label: "Im Projekt suchen", accelerator: "CommandOrControl+Shift+F", click: () => send("search") },
      ],
    },
    {
      label: "&Ansicht",
      submenu: [
        { label: "Fokusmodus (nur Editor)", accelerator: "CommandOrControl+Shift+M", click: () => send("focus") },
        { label: "Seitenleiste", accelerator: "CommandOrControl+\\", click: () => send("toggle-sidebar") },
        { label: "PDF-Vorschau", click: () => send("toggle-pdf") },
        { label: "Probleme & Log", accelerator: "CommandOrControl+J", click: () => send("toggle-bottom") },
        { type: "separator" },
        { label: "Dateien", accelerator: "CommandOrControl+Shift+E", click: () => send("panel", "files") },
        { label: "Gliederung", accelerator: "CommandOrControl+Shift+O", click: () => send("panel", "outline") },
        { label: "Literatur", accelerator: "CommandOrControl+Shift+B", click: () => send("panel", "bib") },
        { label: "Aufgaben", click: () => send("panel", "todos") },
        { label: "Statistik", click: () => send("panel", "stats") },
        { label: "Historie", accelerator: "CommandOrControl+Shift+H", click: () => send("panel", "history") },
        { type: "separator" },
        { label: "Hell / Dunkel", click: () => send("toggle-theme") },
        { label: "Schrift größer", accelerator: "CommandOrControl+=", click: () => send("font-size", 1) },
        { label: "Schrift kleiner", accelerator: "CommandOrControl+-", click: () => send("font-size", -1) },
        { type: "separator" },
        { role: "togglefullscreen", label: "Vollbild" },
        { role: "reload", label: "Neu laden" },
        { role: "toggleDevTools", label: "Entwicklerwerkzeuge" },
      ],
    },
    {
      label: "&LaTeX",
      submenu: [
        { label: "Kompilieren", accelerator: "CommandOrControl+Return", click: () => send("compile") },
        { label: "Kompilierung abbrechen", click: () => send("cancel-compile") },
        { label: "Cursorzeile im PDF zeigen", accelerator: "CommandOrControl+Alt+J", click: () => send("forward-sync") },
        { label: "Grammatik der aktiven Datei prüfen (LanguageTool)", click: () => send("grammar") },
        { label: "Schreibsitzung starten/beenden", click: () => send("session") },
        { type: "separator" },
        { label: "Einstellungen …", accelerator: "CommandOrControl+,", click: () => send("settings") },
      ],
    },
    {
      label: "&Hilfe",
      submenu: [
        { label: "Handbuch", click: () => shell.openPath(path.join(app.isPackaged ? process.resourcesPath : ROOT, "docs", "HANDBUCH.md")) },
        { label: "Schreib-Leitfaden für die Arbeit", click: () => shell.openPath(path.join(app.isPackaged ? process.resourcesPath : ROOT, "template", "bachelorarbeit", "LEITFADEN.md")) },
        { label: "Tastaturkürzel", click: () => send("settings-keys") },
        { label: "MiKTeX herunterladen", click: () => shell.openExternal("https://miktex.org/download") },
        { type: "separator" },
        {
          label: "Über ThesisLeaf",
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Über ThesisLeaf",
              message: `ThesisLeaf ${VERSION}`,
              detail: `Lokaler LaTeX-Editor für Bachelorarbeiten.\nServer-Port ${serverPort} · Electron ${process.versions.electron} · Node ${process.versions.node}\nDaten: ${app.getPath("userData")}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const bounds = loadBounds();
  const iconPath = path.join(ROOT, "build", process.platform === "win32" ? "icon.ico" : "icon.png");
  mainWindow = new BrowserWindow({
    width: bounds?.width || 1440,
    height: bounds?.height || 900,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 960,
    minHeight: 600,
    title: "ThesisLeaf",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1412" : "#f3f6f4",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      additionalArguments: [`--thesisleaf-version=${VERSION}`],
    },
  });
  if (bounds?.maximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("resize", saveBounds);
  mainWindow.on("move", saveBounds);
  mainWindow.on("close", saveBounds);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  try {
    mainWindow.webContents.session.setSpellCheckerLanguages(["de-DE", "en-US"]);
  } catch {
    /* Sprache nicht verfügbar */
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${serverPort}/`)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    const local = url.startsWith(`http://127.0.0.1:${serverPort}/`) || (DEV_URL && url.startsWith(DEV_URL));
    if (!local) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.loadURL(DEV_URL || `http://127.0.0.1:${serverPort}/`);
}

ipcMain.handle("pick-folder", async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: opts.title || "Ordner wählen",
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("save-pdf", () => savePdf());
ipcMain.handle("save-zip", () => saveZip());
ipcMain.handle("open-external", (_e, url) => {
  if (/^https?:\/\//i.test(String(url)) || /^mailto:/i.test(String(url))) shell.openExternal(url);
});
ipcMain.handle("reveal", (_e, target) => {
  if (target && fs.existsSync(target)) shell.showItemInFolder(target);
});
ipcMain.handle("server-port", () => serverPort);

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox("ThesisLeaf konnte nicht starten", err.message);
    app.quit();
    return;
  }
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  try {
    await server?.stop();
  } catch {
    /* ignore */
  }
});
