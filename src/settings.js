import { useCallback, useEffect, useState } from "react";

const KEY = "thesisleaf.ui";

export const UI_DEFAULTS = {
  theme: "system",
  fontSize: 14,
  wordWrap: true,
  minimap: false,
  lineNumbers: true,
  autosaveDelay: 600,
  sidebarW: 270,
  pdfW: 560,
  showSidebar: true,
  panel: "files",
  bottom: null,
  bottomH: 200,
  pdfZoom: "fit",
  markdownView: "split",
  syncHighlight: true,
  toolbarCompact: false,
  showPdf: true,
  pdfViewer: "pdfjs",
  pomodoro: 25,
  focus: false,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...UI_DEFAULTS, ...JSON.parse(raw) } : { ...UI_DEFAULTS };
  } catch {
    return { ...UI_DEFAULTS };
  }
}

export function resolveTheme(theme) {
  if (theme === "dark" || theme === "light") return theme;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useUiSettings() {
  const [ui, setUi] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ui));
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = resolveTheme(ui.theme);
  }, [ui]);

  useEffect(() => {
    if (ui.theme !== "system" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset.theme = resolveTheme("system");
      setUi((u) => ({ ...u }));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [ui.theme]);

  const update = useCallback((patch) => {
    setUi((u) => ({ ...u, ...(typeof patch === "function" ? patch(u) : patch) }));
  }, []);

  return [ui, update];
}
