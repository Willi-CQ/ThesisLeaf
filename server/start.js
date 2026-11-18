import { spawn } from "child_process";
import { createApp } from "./index.js";
import { detectLatex } from "./latex.js";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const port = Number(process.env.THESISLEAF_PORT || argValue("--port") || 3847);
const host = process.env.THESISLEAF_HOST || argValue("--host") || "127.0.0.1";

const appInstance = createApp({ port, host });

try {
  const { url } = await appInstance.start();
  const latex = detectLatex();
  console.log(`ThesisLeaf-Server: ${url}`);
  console.log(`LaTeX: ${latex.bin ? `${latex.distribution} – ${latex.version}` : "nicht gefunden"}`);
  if (process.argv.includes("--open")) {
    const target = url;
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "darwin") spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
  }
} catch (err) {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} ist belegt. Läuft ThesisLeaf bereits? (THESISLEAF_PORT=… setzt einen anderen Port)`);
  } else {
    console.error(err);
  }
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await appInstance.stop();
    process.exit(0);
  });
}
