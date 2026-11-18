/**
 * Entwicklungshilfe: startet die App headless-ähnlich, öffnet ein Projekt und
 * speichert Screenshots (Willkommen, Workspace hell/dunkel, Panels).
 *   npx electron scripts/screenshot.js <projektordner> <ausgabeordner>
 */
import { app, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = process.argv[2] ? path.resolve(process.argv[2]) : null;
const outDir = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, "docs", "screenshots");
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const { createApp } = await import("../server/index.js");
  const port = 3911;
  const server = createApp({ port, staticDir: path.join(ROOT, "dist") });
  await server.start();
  const win = new BrowserWindow({ width: 1500, height: 920, show: false, webPreferences: { preload: path.join(ROOT, "electron", "preload.cjs"), contextIsolation: true, sandbox: true } });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  win.show();
  await sleep(1500);
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
    console.log("screenshot", name);
  };
  await shot("01-willkommen");
  if (project) {
    await win.webContents.executeJavaScript(`fetch('/api/project/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:${JSON.stringify(project)}})}).then(r=>r.json())`);
    await sleep(1500);
    await win.webContents.executeJavaScript(`location.reload()`);
    await sleep(4000);
    await shot("02-workspace");
    for (let i = 0; i < 40; i += 1) {
      const busy = await win.webContents.executeJavaScript(`fetch('/api/compile/status').then(r=>r.json()).then(j=>j.compiling)`);
      if (!busy) break;
      await sleep(1000);
    }
    await sleep(2500);
    await shot("03-workspace-pdf");
    const panels = ["outline", "bib", "todos", "stats", "history", "search"];
    for (const p of panels) {
      await win.webContents.executeJavaScript(`(function(){const raw=localStorage.getItem('thesisleaf.ui');const ui=raw?JSON.parse(raw):{};ui.panel=${JSON.stringify(p)};ui.showSidebar=true;localStorage.setItem('thesisleaf.ui',JSON.stringify(ui));location.reload();})()`);
      await sleep(3500);
      await shot(`04-panel-${p}`);
    }
    await win.webContents.executeJavaScript(`(function(){const raw=localStorage.getItem('thesisleaf.ui');const ui=raw?JSON.parse(raw):{};ui.theme='dark';ui.panel='files';ui.bottom='problems';localStorage.setItem('thesisleaf.ui',JSON.stringify(ui));location.reload();})()`);
    await sleep(3500);
    await shot("05-dunkel");
    await win.webContents.executeJavaScript(`(function(){const raw=localStorage.getItem('thesisleaf.ui');const ui=raw?JSON.parse(raw):{};ui.theme='light';ui.bottom=null;localStorage.setItem('thesisleaf.ui',JSON.stringify(ui));})()`);
  }
  await server.stop();
  app.quit();
});
