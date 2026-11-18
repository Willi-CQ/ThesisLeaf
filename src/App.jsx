import { useCallback, useEffect, useState } from "react";
import { api, desktop } from "./api.js";
import { useUiSettings } from "./settings.js";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import Workspace from "./components/Workspace.jsx";

export default function App() {
  const [ui, updateUi] = useUiSettings();
  const [boot, setBoot] = useState({ loading: true, latex: null, recents: [] });
  const [project, setProject] = useState(null);
  const [extras, setExtras] = useState(null);
  const [error, setError] = useState("");

  const loadBoot = useCallback(async () => {
    try {
      const data = await api.project();
      setBoot({ loading: false, latex: data.latex, recents: data.recents || [] });
      if (data.project) {
        setExtras({ lastCompile: data.lastCompile, stats: data.stats, lint: data.lint });
        setProject(data.project);
      }
    } catch (err) {
      setBoot({ loading: false, latex: null, recents: [], error: err.message });
    }
  }, []);

  useEffect(() => {
    loadBoot();
  }, [loadBoot]);

  async function openPath(path) {
    setError("");
    const data = await api.open(path);
    setExtras(null);
    setProject(data);
  }

  async function createProject(path, vars) {
    setError("");
    const data = await api.create(path, vars);
    setExtras(null);
    setProject(data);
  }

  async function closeProject() {
    try {
      const data = await api.close();
      setBoot((b) => ({ ...b, recents: data.recents || b.recents }));
    } catch {
      /* ignore */
    }
    setProject(null);
    setExtras(null);
  }

  useEffect(() => {
    if (!desktop?.onMenu || project) return undefined;
    return desktop.onMenu(async (action) => {
      if (action === "open-project") {
        const { path } = await api.pick("Projektordner öffnen");
        if (path) openPath(path).catch((e) => setError(e.message));
      }
      if (action === "toggle-theme") {
        updateUi((u) => ({ theme: u.theme === "dark" ? "light" : "dark" }));
      }
    });
  }, [project, updateUi]);

  if (boot.loading) {
    return (
      <div className="boot">
        <div className="spinner" />
        <p>ThesisLeaf startet …</p>
      </div>
    );
  }

  if (!project) {
    return (
      <WelcomeScreen
        latex={boot.latex}
        recents={boot.recents}
        bootError={boot.error}
        error={error}
        onError={setError}
        onOpen={openPath}
        onCreate={createProject}
        onRecentsChange={(recents) => setBoot((b) => ({ ...b, recents }))}
        ui={ui}
        updateUi={updateUi}
      />
    );
  }

  return (
    <Workspace
      key={project.path}
      initialProject={project}
      initialExtras={extras}
      ui={ui}
      updateUi={updateUi}
      onClose={closeProject}
      onOpenOther={openPath}
      onCreateOther={createProject}
    />
  );
}
