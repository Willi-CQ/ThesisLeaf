/**
 * LaTeX- und BibTeX-Sprachunterstützung für Monaco: Tokenizer, Themes,
 * Vervollständigung (Befehle, Umgebungen, Labels, Zitate, Dateien), Hover.
 */

export const editorContext = {
  meta: { labels: [], citations: [], sections: [], acronyms: [], floats: [] },
  imageFiles: [],
  texFiles: [],
  activeFile: null,
  doc: null,
  /** Aktuelle Diagnosen der aktiven Datei (für Schnellkorrekturen) und Rückruf zum Wörterbuch. */
  diagnostics: [],
  addWord: null,
};

export function setEditorContext(patch) {
  Object.assign(editorContext, patch);
}

const COMMANDS = [
  "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph", "part", "appendix",
  "textbf", "textit", "emph", "underline", "texttt", "textsc", "textsf", "textrm", "textsuperscript", "textsubscript",
  "caption", "label", "ref", "eqref", "cref", "Cref", "autoref", "nameref", "pageref",
  "cite", "citep", "citet", "parencite", "textcite", "autocite", "footcite", "fullcite", "nocite", "citeauthor", "citeyear",
  "includegraphics", "input", "include", "footnote", "item", "todo", "missingfigure", "url", "href", "enquote",
  "textwidth", "linewidth", "textheight", "centering", "raggedright", "raggedleft", "hline", "toprule", "midrule", "bottomrule",
  "cmidrule", "multicolumn", "multirow", "printbibliography", "addbibresource", "bibliography", "bibliographystyle",
  "tableofcontents", "listoffigures", "listoftables", "listoftodos", "lstlistoflistings", "newpage", "clearpage", "cleardoublepage",
  "vspace", "hspace", "vfill", "hfill", "noindent", "indent", "par", "newline", "linebreak", "pagebreak",
  "usepackage", "documentclass", "newcommand", "renewcommand", "providecommand", "newenvironment", "setlength", "setcounter",
  "begin", "end", "frac", "dfrac", "sqrt", "sum", "prod", "int", "lim", "infty", "cdot", "cdots", "ldots", "dots", "times",
  "alpha", "beta", "gamma", "delta", "epsilon", "lambda", "mu", "pi", "sigma", "theta", "omega", "Delta", "Sigma", "Omega",
  "leq", "geq", "neq", "approx", "equiv", "rightarrow", "leftarrow", "Rightarrow", "Leftrightarrow", "mathbf", "mathrm",
  "mathcal", "mathbb", "text", "left", "right", "hat", "bar", "vec", "overline", "underline", "operatorname",
  "ac", "acs", "acl", "acf", "acp", "acsp", "aclp", "acro", "acrodef", "gls", "Gls", "glspl", "newacronym",
  "lstinputlisting", "lstset", "mintinline", "inputminted", "verb", "SI", "si", "num", "qty", "unit",
  "small", "footnotesize", "scriptsize", "tiny", "large", "Large", "LARGE", "huge", "Huge", "normalsize",
  "today", "LaTeX", "TeX", "textbackslash", "textasciitilde", "ldots", "dots", "quad", "qquad",
  "subfloat", "subcaption", "captionof", "fbox", "parbox", "minipage", "rule", "phantom", "hphantom", "vphantom",
  "definecolor", "color", "textcolor", "colorbox", "rowcolor", "cellcolor", "hypersetup", "geometry", "onehalfspacing",
  "singlespacing", "doublespacing", "selectlanguage", "foreignlanguage", "pagestyle", "thispagestyle", "pagenumbering",
  "addcontentsline", "phantomsection", "texorpdfstring", "maketitle", "title", "author", "date", "and", "thanks",
];

const ENVIRONMENTS = [
  "figure", "table", "tabular", "tabularx", "longtable", "itemize", "enumerate", "description", "quote", "quotation",
  "verbatim", "lstlisting", "minted", "equation", "equation*", "align", "align*", "gather", "gather*", "multline", "cases",
  "abstract", "titlepage", "center", "flushleft", "flushright", "minipage", "subfigure", "subtable", "algorithm",
  "algorithmic", "theorem", "lemma", "proof", "definition", "example", "remark", "acronym", "appendix", "frame", "tikzpicture",
  "comment", "displaymath", "matrix", "pmatrix", "bmatrix", "array", "split", "enumerate*", "itemize*",
];

/** Bausteine für die Werkzeugleiste und die Vervollständigung. */
export const SNIPPETS = [
  {
    id: "figure",
    label: "Abbildung",
    detail: "figure mit includegraphics, caption, label",
    body: [
      "\\begin{figure}[htbp]",
      "  \\centering",
      "  \\includegraphics[width=${1:0.8}\\textwidth]{${2:abbildungen/bild}}",
      "  \\caption{${3:Beschriftung}}",
      "  \\label{fig:${4:kurzname}}",
      "\\end{figure}",
      "$0",
    ].join("\n"),
  },
  {
    id: "table",
    label: "Tabelle",
    detail: "table + tabular mit booktabs",
    body: [
      "\\begin{table}[htbp]",
      "  \\centering",
      "  \\caption{${1:Beschriftung}}",
      "  \\label{tab:${2:kurzname}}",
      "  \\begin{tabular}{${3:lll}}",
      "    \\toprule",
      "    ${4:Spalte A} & ${5:Spalte B} & ${6:Spalte C} \\\\",
      "    \\midrule",
      "    ${7:Wert} & ${8:Wert} & ${9:Wert} \\\\",
      "    \\bottomrule",
      "  \\end{tabular}",
      "\\end{table}",
      "$0",
    ].join("\n"),
  },
  {
    id: "itemize",
    label: "Aufzählung",
    detail: "itemize",
    body: ["\\begin{itemize}", "  \\item ${1:Erster Punkt}", "  \\item ${2:Zweiter Punkt}", "\\end{itemize}", "$0"].join("\n"),
  },
  {
    id: "enumerate",
    label: "Nummerierte Liste",
    detail: "enumerate",
    body: ["\\begin{enumerate}", "  \\item ${1:Erster Schritt}", "  \\item ${2:Zweiter Schritt}", "\\end{enumerate}", "$0"].join("\n"),
  },
  {
    id: "description",
    label: "Beschreibungsliste",
    detail: "description",
    body: ["\\begin{description}", "  \\item[${1:Begriff}] ${2:Erklärung}", "\\end{description}", "$0"].join("\n"),
  },
  {
    id: "equation",
    label: "Gleichung",
    detail: "equation mit label",
    body: ["\\begin{equation}", "  ${1:a^2 + b^2 = c^2}", "  \\label{eq:${2:kurzname}}", "\\end{equation}", "$0"].join("\n"),
  },
  {
    id: "align",
    label: "Gleichungssystem",
    detail: "align",
    body: ["\\begin{align}", "  ${1:x} &= ${2:y} \\\\", "  ${3:a} &= ${4:b}", "\\end{align}", "$0"].join("\n"),
  },
  {
    id: "listing",
    label: "Quellcode-Listing",
    detail: "lstlisting mit Sprache, caption, label",
    body: [
      "\\begin{lstlisting}[language=${1:Python}, caption={${2:Beschriftung}}, label={lst:${3:kurzname}}]",
      "${4:# Code}",
      "\\end{lstlisting}",
      "$0",
    ].join("\n"),
  },
  {
    id: "listingfile",
    label: "Listing aus Datei",
    detail: "lstinputlisting",
    body: "\\lstinputlisting[language=${1:Python}, caption={${2:Beschriftung}}, label={lst:${3:kurzname}}]{${4:code/datei.py}}$0",
  },
  {
    id: "quote",
    label: "Zitat (Block)",
    detail: "quote-Umgebung",
    body: ["\\begin{quote}", "  ${1:Zitierter Text}~\\cite{${2:schluessel}}", "\\end{quote}", "$0"].join("\n"),
  },
  { id: "cite", label: "Zitieren", detail: "\\cite{…}", body: "\\cite{${1:schluessel}}$0" },
  { id: "ref", label: "Verweis", detail: "\\ref{…}", body: "\\ref{${1:label}}$0" },
  { id: "footnote", label: "Fußnote", detail: "\\footnote{…}", body: "\\footnote{${1:Text}}$0" },
  { id: "todo", label: "Todo-Notiz", detail: "\\todo{…}", body: "\\todo{${1:Was fehlt noch?}}$0" },
  { id: "enquote", label: "Anführungszeichen", detail: "\\enquote{…}", body: "\\enquote{${1:Text}}$0" },
  { id: "url", label: "URL", detail: "\\url{…}", body: "\\url{${1:https://}}$0" },
  { id: "acronym", label: "Abkürzung verwenden", detail: "\\ac{…}", body: "\\ac{${1:KURZ}}$0" },
  {
    id: "subfigure",
    label: "Teilabbildungen",
    detail: "zwei subfigures nebeneinander",
    body: [
      "\\begin{figure}[htbp]",
      "  \\centering",
      "  \\begin{subfigure}[b]{0.48\\textwidth}",
      "    \\centering",
      "    \\includegraphics[width=\\textwidth]{${1:abbildungen/links}}",
      "    \\caption{${2:Links}}",
      "    \\label{fig:${3:links}}",
      "  \\end{subfigure}",
      "  \\hfill",
      "  \\begin{subfigure}[b]{0.48\\textwidth}",
      "    \\centering",
      "    \\includegraphics[width=\\textwidth]{${4:abbildungen/rechts}}",
      "    \\caption{${5:Rechts}}",
      "    \\label{fig:${6:rechts}}",
      "  \\end{subfigure}",
      "  \\caption{${7:Gesamtbeschriftung}}",
      "  \\label{fig:${8:gesamt}}",
      "\\end{figure}",
      "$0",
    ].join("\n"),
  },
];

let registered = false;

export function registerLatex(monaco) {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: "latex", extensions: [".tex", ".ltx", ".sty", ".cls"], aliases: ["LaTeX", "latex"] });
  monaco.languages.setLanguageConfiguration("latex", {
    comments: { lineComment: "%" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$", notIn: ["comment"] },
      { open: "`", close: "'" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$" },
    ],
    wordPattern: /\\?[A-Za-z@]+\*?|[\p{L}\p{N}_:-]+/u,
    folding: {
      markers: {
        start: /^\s*\\begin\{/,
        end: /^\s*\\end\{/,
      },
    },
    onEnterRules: [
      {
        beforeText: /^\s*\\item\b.*$/,
        action: { indentAction: monaco.languages.IndentAction.None, appendText: "\\item " },
      },
    ],
  });

  monaco.languages.setMonarchTokensProvider("latex", {
    defaultToken: "",
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        [/(\\begin|\\end)(\{)([^}]*)(\})/, ["keyword.control", "delimiter.curly", "type", "delimiter.curly"]],
        [/\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?/, "keyword.section"],
        [/\\(?:cite\w*|parencite|textcite|autocite|footcite|fullcite|nocite)\*?/, "keyword.cite"],
        [/\\(?:ref|eqref|cref|Cref|autoref|nameref|pageref|vref|label)\*?/, "keyword.ref"],
        [/\\(?:todo|missingfigure)\b/, "keyword.todo"],
        [/\\\[/, { token: "string.math", next: "@displaymath" }],
        [/\\\(/, { token: "string.math", next: "@inlinemath" }],
        [/\$\$/, { token: "string.math", next: "@displaymath2" }],
        [/\$/, { token: "string.math", next: "@inlinemath2" }],
        [/\\[a-zA-Z@]+\*?/, "keyword"],
        [/\\[^a-zA-Z\s]/, "keyword.symbol"],
        [/[{}]/, "delimiter.curly"],
        [/\[[^\]\n]*\]/, "attribute"],
        [/[0-9]+(?:\.[0-9]+)?(?:pt|cm|mm|em|ex|in|bp|px)?/, "number"],
        [/~/, "keyword.symbol"],
      ],
      displaymath: [
        [/\\\]/, { token: "string.math", next: "@pop" }],
        [/%.*$/, "comment"],
        [/[^\\%]+/, "string.math"],
        [/./, "string.math"],
      ],
      inlinemath: [
        [/\\\)/, { token: "string.math", next: "@pop" }],
        [/[^\\]+/, "string.math"],
        [/./, "string.math"],
      ],
      displaymath2: [
        [/\$\$/, { token: "string.math", next: "@pop" }],
        [/[^$]+/, "string.math"],
        [/./, "string.math"],
      ],
      inlinemath2: [
        [/\$/, { token: "string.math", next: "@pop" }],
        [/[^$\n]+/, "string.math"],
        [/\n/, { token: "string.math", next: "@pop" }],
        [/./, "string.math"],
      ],
    },
  });

  monaco.languages.registerCompletionItemProvider("latex", {
    triggerCharacters: ["\\", "{", ",", "/"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const meta = editorContext.meta || {};
      const suggestions = [];
      const Kind = monaco.languages.CompletionItemKind;

      const citeCtx = /\\(?:cite\w*|parencite|textcite|autocite|footcite|fullcite|nocite)\*?(?:\[[^\]]*\])*\{[^}]*$/.test(line);
      const refCtx = /\\(?:ref|eqref|cref|Cref|autoref|nameref|pageref|vref)\*?\{[^}]*$/.test(line);
      const graphicsCtx = /\\includegraphics(?:\[[^\]]*\])?\{[^}]*$/.test(line);
      const inputCtx = /\\(?:input|include|subfile)\{[^}]*$/.test(line);
      const acCtx = /\\(?:ac|acs|acl|acf|acp|acsp|aclp|Ac|gls|Gls|glspl)\{[^}]*$/.test(line);
      const beginCtx = /\\begin\{[^}]*$/.test(line);
      const endCtx = /\\end\{[^}]*$/.test(line);

      const keyRange = (() => {
        const m = line.match(/\{([^{}]*)$/);
        const start = m ? position.column - m[1].length : word.startColumn;
        return { ...range, startColumn: Math.min(start, position.column) };
      })();

      if (citeCtx) {
        for (const c of meta.citations || []) {
          suggestions.push({
            label: c.key,
            kind: Kind.Reference,
            insertText: c.key,
            detail: [c.author, c.year].filter(Boolean).join(", "),
            documentation: c.title,
            filterText: `${c.key} ${c.author} ${c.title} ${c.year}`,
            sortText: c.key,
            range: keyRange,
          });
        }
        return { suggestions };
      }
      if (refCtx) {
        for (const l of meta.labels || []) {
          const sec = (meta.sections || []).find((s) => s.file === l.file && s.line <= l.line);
          suggestions.push({
            label: l.key,
            kind: Kind.Reference,
            insertText: l.key,
            detail: `${l.file}:${l.line}`,
            documentation: sec ? sec.title : undefined,
            filterText: `${l.key} ${sec ? sec.title : ""}`,
            range: keyRange,
          });
        }
        return { suggestions };
      }
      if (graphicsCtx) {
        for (const f of editorContext.imageFiles || []) {
          suggestions.push({ label: f, kind: Kind.File, insertText: f.replace(/\.(png|jpe?g|pdf|eps|svg)$/i, ""), detail: "Bilddatei", range: keyRange });
        }
        return { suggestions };
      }
      if (inputCtx) {
        for (const f of editorContext.texFiles || []) {
          if (f === editorContext.activeFile) continue;
          suggestions.push({ label: f, kind: Kind.File, insertText: f.replace(/\.tex$/i, ""), detail: "LaTeX-Datei", range: keyRange });
        }
        return { suggestions };
      }
      if (acCtx) {
        for (const a of meta.acronyms || []) {
          suggestions.push({ label: a.key, kind: Kind.Constant, insertText: a.key, detail: a.long, range: keyRange });
        }
        return { suggestions };
      }
      if (beginCtx || endCtx) {
        for (const env of ENVIRONMENTS) {
          suggestions.push({ label: env, kind: Kind.Module, insertText: env, range: keyRange });
        }
        return { suggestions };
      }

      const prefixIsCommand = /\\[a-zA-Z@]*$/.test(line);
      for (const cmd of COMMANDS) {
        suggestions.push({
          label: `\\${cmd}`,
          kind: Kind.Function,
          insertText: prefixIsCommand ? cmd : `\\${cmd}`,
          filterText: prefixIsCommand ? cmd : `\\${cmd}`,
          range,
          sortText: `1${cmd}`,
        });
      }
      for (const env of ENVIRONMENTS) {
        suggestions.push({
          label: `\\begin{${env}}`,
          kind: Kind.Snippet,
          insertText: `${prefixIsCommand ? "" : "\\"}begin{${env}}\n\t$0\n\\end{${env}}`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          filterText: prefixIsCommand ? `begin${env}` : `\\begin${env}`,
          range,
          sortText: `2${env}`,
        });
      }
      for (const s of SNIPPETS) {
        suggestions.push({
          label: s.label,
          kind: Kind.Snippet,
          insertText: prefixIsCommand ? s.body.replace(/^\\/, "") : s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: s.detail,
          filterText: `${s.id} ${s.label}`,
          range,
          sortText: `3${s.id}`,
        });
      }
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider("latex", {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const col = position.column - 1;
      const re = /\\(cite\w*|parencite|textcite|autocite|footcite|ref|eqref|cref|Cref|autoref|nameref|pageref|ac|acs|acl|acf|input|include|includegraphics)\*?(?:\[[^\]]*\])*\{([^}]*)\}/g;
      let m;
      while ((m = re.exec(line))) {
        const start = m.index;
        const end = start + m[0].length;
        if (col < start || col > end) continue;
        const cmd = m[1];
        const keys = m[2].split(",").map((k) => k.trim());
        const meta = editorContext.meta || {};
        const lines = [];
        if (/cite/.test(cmd)) {
          for (const key of keys) {
            const c = (meta.citations || []).find((x) => x.key === key);
            lines.push(c ? `**${c.key}** – ${c.author || "?"} (${c.year || "o. J."}): *${c.title || ""}*` : `**${key}** – nicht in der .bib-Datei gefunden`);
          }
        } else if (/ref/.test(cmd)) {
          for (const key of keys) {
            const l = (meta.labels || []).find((x) => x.key === key);
            const sec = l ? (meta.sections || []).filter((s) => s.file === l.file && s.line <= l.line).pop() : null;
            const fl = l ? (meta.floats || []).find((f) => f.label === key) : null;
            lines.push(
              l
                ? `**${key}** → ${l.file}:${l.line}${fl ? ` · ${fl.kind}: ${fl.caption}` : sec ? ` · ${sec.title}` : ""}`
                : `**${key}** – Label nicht gefunden`,
            );
          }
        } else if (/^ac/.test(cmd)) {
          for (const key of keys) {
            const a = (meta.acronyms || []).find((x) => x.key === key);
            lines.push(a ? `**${a.key}** – ${a.long}` : `**${key}** – Abkürzung nicht definiert`);
          }
        } else {
          lines.push(`Datei: \`${m[2]}\` (Strg+Klick öffnet)`);
        }
        return {
          range: new monaco.Range(position.lineNumber, start + 1, position.lineNumber, end + 1),
          contents: lines.map((value) => ({ value })),
        };
      }
      return null;
    },
  });
}

let bibRegistered = false;

export function registerBibtex(monaco) {
  if (bibRegistered) return;
  bibRegistered = true;
  monaco.languages.register({ id: "bibtex", extensions: [".bib"], aliases: ["BibTeX", "bibtex"] });
  monaco.languages.setLanguageConfiguration("bibtex", {
    comments: { lineComment: "%" },
    brackets: [
      ["{", "}"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: '"', close: '"' },
    ],
    folding: { markers: { start: /^@\w+\s*\{/, end: /^\}/ } },
  });
  monaco.languages.setMonarchTokensProvider("bibtex", {
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        [/@[a-zA-Z]+/, "keyword"],
        [/[{}]/, "delimiter.curly"],
        [/[a-zA-Z_][\w-]*(?=\s*=)/, "attribute"],
        [/=/, "operator"],
        [/"([^"\\]|\\.)*"/, "string"],
        [/,/, "delimiter"],
        [/[0-9]+/, "number"],
        [/[^\s{},="]+/, "identifier"],
      ],
    },
  });
  monaco.languages.registerCompletionItemProvider("bibtex", {
    triggerCharacters: ["@"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const types = {
        article: ["author", "title", "journal", "year", "volume", "number", "pages", "doi"],
        book: ["author", "title", "publisher", "year", "address", "edition", "isbn"],
        inproceedings: ["author", "title", "booktitle", "year", "pages", "publisher", "doi"],
        incollection: ["author", "title", "booktitle", "editor", "publisher", "year", "pages"],
        online: ["author", "title", "url", "urldate", "year"],
        misc: ["author", "title", "howpublished", "year", "note"],
        thesis: ["author", "title", "type", "institution", "year"],
        techreport: ["author", "title", "institution", "year", "number"],
        software: ["author", "title", "version", "url", "urldate", "year"],
      };
      const suggestions = Object.entries(types).map(([type, fields]) => ({
        label: `@${type}`,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: `@${type}{\${1:schluessel},\n${fields.map((f, i) => `  ${f.padEnd(10)} = {\${${i + 2}}}`).join(",\n")}\n}\n`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: `Neuer ${type}-Eintrag`,
        range,
      }));
      return { suggestions };
    },
  });
}

export function defineThemes(monaco) {
  monaco.editor.defineTheme("thesisleaf-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7a8a80", fontStyle: "italic" },
      { token: "keyword", foreground: "138a36" },
      { token: "keyword.control", foreground: "0f6f2b", fontStyle: "bold" },
      { token: "keyword.section", foreground: "9a3b00", fontStyle: "bold" },
      { token: "keyword.cite", foreground: "6f42c1" },
      { token: "keyword.ref", foreground: "0b6e99" },
      { token: "keyword.todo", foreground: "c42b2b", fontStyle: "bold" },
      { token: "keyword.symbol", foreground: "6a737d" },
      { token: "type", foreground: "0f6f2b" },
      { token: "string.math", foreground: "0b6e99" },
      { token: "string", foreground: "0b6e99" },
      { token: "attribute", foreground: "9a6700" },
      { token: "number", foreground: "0550ae" },
      { token: "delimiter.curly", foreground: "8a949c" },
      { token: "identifier", foreground: "1f2a24" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1f2a24",
      "editor.lineHighlightBackground": "#f4faf6",
      "editorLineNumber.foreground": "#9aa7a0",
      "editorLineNumber.activeForeground": "#138a36",
      "editorCursor.foreground": "#138a36",
      "editor.selectionBackground": "#c7ebd3",
      "editorIndentGuide.background": "#e8eeea",
      "editorBracketMatch.background": "#e0f3e6",
      "editorBracketMatch.border": "#8fd4a4",
    },
  });
  monaco.editor.defineTheme("thesisleaf-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7f8c85", fontStyle: "italic" },
      { token: "keyword", foreground: "5fd38a" },
      { token: "keyword.control", foreground: "8fe3ad", fontStyle: "bold" },
      { token: "keyword.section", foreground: "f0a866", fontStyle: "bold" },
      { token: "keyword.cite", foreground: "c9a4ff" },
      { token: "keyword.ref", foreground: "7cc4f0" },
      { token: "keyword.todo", foreground: "ff8a8a", fontStyle: "bold" },
      { token: "keyword.symbol", foreground: "9aa5a0" },
      { token: "type", foreground: "8fe3ad" },
      { token: "string.math", foreground: "7cc4f0" },
      { token: "string", foreground: "7cc4f0" },
      { token: "attribute", foreground: "e3c66a" },
      { token: "number", foreground: "8fb8ff" },
      { token: "delimiter.curly", foreground: "8a949c" },
      { token: "identifier", foreground: "e6ebe8" },
    ],
    colors: {
      "editor.background": "#151b18",
      "editor.foreground": "#e6ebe8",
      "editor.lineHighlightBackground": "#1c2420",
      "editorLineNumber.foreground": "#56635c",
      "editorLineNumber.activeForeground": "#5fd38a",
      "editorCursor.foreground": "#5fd38a",
      "editor.selectionBackground": "#25543a",
      "editorIndentGuide.background": "#242d28",
      "editorBracketMatch.background": "#1f3a2a",
      "editorBracketMatch.border": "#3f8a5c",
    },
  });
}
