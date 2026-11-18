import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { monaco } from "../monacoSetup.js";
import { resolveTheme } from "../settings.js";
import { editorContext } from "../latexLanguage.js";

const SEVERITY = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
  hint: monaco.MarkerSeverity.Hint,
};

const SOURCE = { chktex: "chktex", style: "Stil", structure: "Struktur", spelling: "Rechtschreibung", grammar: "Grammatik" };

/** Findet an der Cursorposition einen Befehl mit Argument (für Strg+Klick-Navigation). */
function commandAt(line, column) {
  const re = /\\(cite\w*|parencite|textcite|autocite|footcite|ref|eqref|cref|Cref|autoref|nameref|pageref|input|include|subfile|includegraphics|lstinputlisting|ac|acs|acl|acf)\*?(?:\[[^\]]*\])*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    if (column - 1 >= start && column - 1 <= end) {
      const argStart = line.indexOf("{", start) + 1;
      const inside = column - 1 - argStart;
      const keys = m[2].split(",");
      let acc = 0;
      let key = keys[0];
      for (const k of keys) {
        if (inside >= acc && inside <= acc + k.length) {
          key = k;
          break;
        }
        acc += k.length + 1;
      }
      return { cmd: m[1], key: key.trim(), all: m[2] };
    }
  }
  return null;
}

let providersRegistered = false;

/** Schnellkorrekturen (Glühbirne / Strg+.) für Rechtschreib- und Grammatikhinweise. */
function registerProviders() {
  if (providersRegistered) return;
  providersRegistered = true;
  monaco.editor.registerCommand("thesisleaf.addWord", (_accessor, word, scope) => {
    editorContext.addWord?.(word, scope);
  });
  for (const lang of ["latex", "markdown", "plaintext"]) {
    monaco.languages.registerCodeActionProvider(lang, {
      provideCodeActions(model, _range, context) {
        const actions = [];
        for (const marker of context.markers || []) {
          const code = typeof marker.code === "object" ? marker.code?.value : marker.code;
          if (!code || !String(code).startsWith("tl:")) continue;
          const item = editorContext.diagnostics[Number(String(code).slice(3))];
          if (!item) continue;
          const range = new monaco.Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn);
          for (const s of item.suggestions || []) {
            actions.push({
              title: `Ersetzen durch „${s}“`,
              kind: "quickfix",
              isPreferred: actions.length === 0,
              diagnostics: [marker],
              edit: { edits: [{ resource: model.uri, textEdit: { range, text: s }, versionId: model.getVersionId() }] },
            });
          }
          if (item.kind === "spelling" && item.word) {
            actions.push({ title: `„${item.word}“ ins Projektwörterbuch aufnehmen`, kind: "quickfix", diagnostics: [marker], command: { id: "thesisleaf.addWord", title: "Wort aufnehmen", arguments: [item.word, "project"] } });
            actions.push({ title: `„${item.word}“ ins persönliche Wörterbuch aufnehmen`, kind: "quickfix", diagnostics: [marker], command: { id: "thesisleaf.addWord", title: "Wort aufnehmen", arguments: [item.word, "user"] } });
          }
        }
        return { actions, dispose() {} };
      },
    });
  }
}

export default function EditorPane({
  file,
  value,
  language,
  onChange,
  diagnostics,
  goto,
  ui,
  onReady,
  onCursor,
  onNavigate,
  onForwardSync,
  onSave,
  onCompile,
  onCitePicker,
  onPasteFiles,
  onDropPath,
}) {
  const editorRef = useRef(null);
  const viewStates = useRef(new Map());
  const currentPath = useRef(file?.path);
  const decorations = useRef([]);
  const callbacks = useRef({});
  callbacks.current = { onNavigate, onForwardSync, onSave, onCompile, onCitePicker, onCursor, onPasteFiles, onDropPath };

  function insertSnippet(snippet) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const ctrl = editor.getContribution("snippetController2");
    if (ctrl && ctrl.insert) ctrl.insert(snippet);
    else editor.trigger("keyboard", "type", { text: snippet.replace(/\$\{\d+:([^}]*)\}|\$\d+/g, "$1") });
  }

  function insertText(text) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = editor.getSelection();
    editor.executeEdits("thesisleaf", [{ range: sel, text, forceMoveMarkers: true }]);
    editor.pushUndoStop();
  }

  function wrapSelection(before, after, placeholder = "Text") {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = editor.getSelection();
    const selected = editor.getModel()?.getValueInRange(sel) || "";
    if (selected) insertText(`${before}${selected}${after}`);
    else insertSnippet(`${before}\${1:${placeholder}}${after}$0`);
  }

  function gotoLine(line, column = 1) {
    const editor = editorRef.current;
    if (!editor) return;
    const pos = { lineNumber: Math.max(1, line || 1), column: Math.max(1, column || 1) };
    editor.revealPositionInCenter(pos, monaco.editor.ScrollType.Smooth);
    editor.setPosition(pos);
    editor.focus();
    decorations.current = editor.deltaDecorations(decorations.current, [
      { range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1), options: { isWholeLine: true, className: "line-flash" } },
    ]);
    setTimeout(() => {
      if (editorRef.current) decorations.current = editorRef.current.deltaDecorations(decorations.current, []);
    }, 1600);
  }

  function handleMount(editor) {
    editorRef.current = editor;
    registerProviders();
    editor.onDidChangeCursorPosition((e) => callbacks.current.onCursor?.({ line: e.position.lineNumber, column: e.position.column }));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => callbacks.current.onSave?.());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => callbacks.current.onCompile?.());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => wrapSelection("\\textbf{", "}"));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => wrapSelection("\\emph{", "}"));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyJ, () => {
      const pos = editor.getPosition();
      callbacks.current.onForwardSync?.(pos.lineNumber, pos.column);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC, () => callbacks.current.onCitePicker?.());
    editor.addAction({
      id: "thesisleaf.forwardSync",
      label: "Im PDF zeigen (SyncTeX)",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1,
      run: (ed) => {
        const pos = ed.getPosition();
        callbacks.current.onForwardSync?.(pos.lineNumber, pos.column);
      },
    });
    editor.onMouseDown((e) => {
      if (!(e.event.ctrlKey || e.event.metaKey) || !e.target.position) return;
      const model = editor.getModel();
      if (!model) return;
      const lineText = model.getLineContent(e.target.position.lineNumber);
      const hit = commandAt(lineText, e.target.position.column);
      if (hit) {
        e.event.preventDefault();
        callbacks.current.onNavigate?.(hit);
      }
    });
    // Bilder einfügen (Zwischenablage) und Dateien aus dem Baum/Explorer fallen lassen
    const dom = editor.getDomNode();
    if (dom) {
      dom.addEventListener(
        "paste",
        (e) => {
          const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
          if (files.length && callbacks.current.onPasteFiles) {
            e.preventDefault();
            e.stopPropagation();
            callbacks.current.onPasteFiles(files);
          }
        },
        true,
      );
      dom.addEventListener(
        "drop",
        (e) => {
          const tlPath = e.dataTransfer?.getData("text/thesisleaf-path");
          const files = [...(e.dataTransfer?.files || [])];
          if (tlPath && callbacks.current.onDropPath) {
            e.preventDefault();
            e.stopPropagation();
            callbacks.current.onDropPath(tlPath);
          } else if (files.length && callbacks.current.onPasteFiles) {
            e.preventDefault();
            e.stopPropagation();
            callbacks.current.onPasteFiles(files);
          }
        },
        true,
      );
      dom.addEventListener("dragover", (e) => {
        if (e.dataTransfer?.types?.includes("text/thesisleaf-path") || e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      });
    }
    onReady?.({ insertSnippet, insertText, wrapSelection, gotoLine, editor, focus: () => editor.focus(), getSelection: () => editor.getModel()?.getValueInRange(editor.getSelection()) || "" });
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (currentPath.current && currentPath.current !== file?.path) {
      viewStates.current.set(currentPath.current, editor.saveViewState());
    }
    currentPath.current = file?.path;
    const vs = file?.path ? viewStates.current.get(file.path) : null;
    if (vs) editor.restoreViewState(vs);
    if (file?.path) editor.focus();
  }, [file?.path]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !goto) return;
    const t = setTimeout(() => gotoLine(goto.line, goto.column), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goto?.nonce]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const list = (diagnostics || []).filter((d) => d.line);
    editorContext.diagnostics = list;
    const markers = list.map((d, i) => {
      const line = Math.min(Math.max(1, d.line), model.getLineCount());
      const endLine = d.endLine ? Math.min(Math.max(line, d.endLine), model.getLineCount()) : line;
      const startColumn = d.column || 1;
      const endColumn = d.length ? Math.min(startColumn + d.length, model.getLineMaxColumn(line)) : model.getLineMaxColumn(endLine);
      return {
        startLineNumber: line,
        startColumn,
        endLineNumber: d.length ? line : endLine,
        endColumn,
        message: d.suggestions?.length ? `${d.message}\nVorschläge: ${d.suggestions.join(", ")}` : d.message,
        severity: SEVERITY[d.severity] || SEVERITY.info,
        source: SOURCE[d.kind] || "LaTeX",
        code: { value: `tl:${i}`, target: monaco.Uri.parse("thesisleaf://diag") },
      };
    });
    monaco.editor.setModelMarkers(model, "thesisleaf", markers);
  }, [diagnostics, file?.path]);

  if (!file) {
    return (
      <div className="preview-file empty-editor">
        <div>
          <p>Wähle links eine Datei oder öffne mit <kbd>Strg</kbd>+<kbd>P</kbd> eine Datei per Namen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-wrap">
      <Editor
        language={language || "plaintext"}
        theme={resolveTheme(ui.theme) === "dark" ? "thesisleaf-dark" : "thesisleaf-light"}
        path={file.path}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleMount}
        loading={<div className="editor-loading">Editor lädt …</div>}
        options={{
          fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
          fontSize: ui.fontSize,
          lineHeight: Math.round(ui.fontSize * 1.6),
          fontLigatures: false,
          minimap: { enabled: ui.minimap },
          wordWrap: ui.wordWrap ? "on" : "off",
          wrappingIndent: "same",
          lineNumbers: ui.lineNumbers ? "on" : "off",
          automaticLayout: true,
          scrollBeyondLastLine: false,
          renderLineHighlight: "all",
          padding: { top: 10, bottom: 40 },
          tabSize: 2,
          insertSpaces: true,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          quickSuggestions: { other: true, comments: false, strings: true },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: "smart",
          unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
          bracketPairColorization: { enabled: true },
          occurrencesHighlight: "off",
          renderWhitespace: "none",
          folding: true,
          glyphMargin: false,
          linkedEditing: true,
          lightbulb: { enabled: "on" },
          stickyScroll: { enabled: false },
          dropIntoEditor: { enabled: false },
          "semanticHighlighting.enabled": false,
        }}
      />
    </div>
  );
}
