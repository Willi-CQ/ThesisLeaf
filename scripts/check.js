/**
 * Diagnose: prüft Node, Git, LaTeX-Werkzeuge und den Build – `npm run check`.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { detectLatex } from "../server/latex.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ok = (label, value, hint = "") => console.log(`${value ? "✔" : "✘"} ${label}${value && typeof value === "string" ? `: ${value}` : ""}${!value && hint ? `  → ${hint}` : ""}`);

console.log("ThesisLeaf – Systemcheck\n");
ok("Node.js", process.version);

let git = "";
try {
  git = execFileSync("git", ["--version"], { encoding: "utf8", windowsHide: true }).trim();
} catch {
  /* fehlt */
}
ok("Git (für die Historie)", git, "https://git-scm.com installieren");

const latex = detectLatex();
ok("LaTeX-Distribution", latex.bin ? `${latex.distribution} – ${latex.version} (${latex.bin})` : "", "MiKTeX (https://miktex.org) oder TeX Live installieren");
for (const t of ["pdflatex", "xelatex", "lualatex", "biber", "bibtex", "synctex", "chktex"]) {
  ok(`  ${t}`, latex[t] ? "vorhanden" : "", t === "chktex" ? "optional (Stilprüfung)" : t === "synctex" ? "für PDF↔Quelltext-Sprung" : "");
}

ok("Client-Build (dist/)", fs.existsSync(path.join(ROOT, "dist", "index.html")) ? "vorhanden" : "", "npm run build");
ok("Electron", fs.existsSync(path.join(ROOT, "node_modules", "electron", "dist")) ? "installiert" : "", "npm install");
ok("Vorlage", fs.existsSync(path.join(ROOT, "template", "bachelorarbeit", "main.tex")) ? "vorhanden" : "");

for (const f of fs.readdirSync(path.join(ROOT, "server")).filter((n) => n.endsWith(".js"))) {
  try {
    execFileSync(process.execPath, ["--check", path.join(ROOT, "server", f)], { stdio: "ignore" });
  } catch {
    ok(`Syntax server/${f}`, "");
  }
}
console.log("\nStart: npm run desktop (Entwicklung) · npm run desktop:build (Installer) · npm run dev (Browser)");
