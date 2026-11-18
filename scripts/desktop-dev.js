/**
 * Startet Vite (Hot Reload) und anschließend Electron, das den ThesisLeaf-Server
 * im Hauptprozess betreibt. Beenden mit Strg+C beendet beides.
 */
import { spawn } from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5173;
const URL = `http://127.0.0.1:${PORT}`;
const isWin = process.platform === "win32";

const vite = spawn(isWin ? "npx.cmd" : "npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: isWin,
});

function waitFor(url, tries = 120) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (n <= 0) reject(new Error("Vite ist nicht gestartet"));
        else setTimeout(() => attempt(n - 1), 500);
      });
    };
    attempt(tries);
  });
}

let electron = null;

// In VS-Code-Terminals ist ELECTRON_RUN_AS_NODE gesetzt – damit würde Electron als reines Node starten.
const env = { ...process.env, VITE_DEV_SERVER_URL: URL };
delete env.ELECTRON_RUN_AS_NODE;

waitFor(URL)
  .then(() => {
    electron = spawn(isWin ? "npx.cmd" : "npx", ["electron", "."], {
      cwd: ROOT,
      stdio: "inherit",
      shell: isWin,
      env,
    });
    electron.on("exit", () => {
      vite.kill();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error(err.message);
    vite.kill();
    process.exit(1);
  });

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    electron?.kill();
    vite.kill();
    process.exit(0);
  });
}
