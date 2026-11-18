const { contextBridge, ipcRenderer } = require("electron");

const versionArg = process.argv.find((a) => a.startsWith("--thesisleaf-version="));

contextBridge.exposeInMainWorld("thesisleaf", {
  version: versionArg ? versionArg.split("=")[1] : "",
  platform: process.platform,
  pickFolder: (opts) => ipcRenderer.invoke("pick-folder", opts || {}),
  savePdf: () => ipcRenderer.invoke("save-pdf"),
  saveZip: () => ipcRenderer.invoke("save-zip"),
  openExternal: (url) => ipcRenderer.invoke("open-external", String(url)),
  reveal: (target) => ipcRenderer.invoke("reveal", String(target)),
  serverPort: () => ipcRenderer.invoke("server-port"),
  onMenu: (callback) => {
    const handler = (_event, action, payload) => callback(action, payload);
    ipcRenderer.on("menu", handler);
    return () => ipcRenderer.removeListener("menu", handler);
  },
});
