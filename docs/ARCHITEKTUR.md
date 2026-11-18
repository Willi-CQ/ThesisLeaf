# ThesisLeaf – Architektur

Diese Beschreibung eignet sich als Grundlage für ein Umsetzungskapitel, falls die Bachelorarbeit den Editor selbst zum Gegenstand hat.

## 1. Überblick

ThesisLeaf ist eine lokale Client-Server-Anwendung, die in einer Electron-Hülle als Desktop-App läuft. Drei Schichten:

```
┌──────────────────────────────────────────────────────────────┐
│ Electron (electron/main.js)                                  │
│  Fenster, Menü, native Dialoge, Single-Instance, startet …   │
│  ┌────────────────────────┐   HTTP + WebSocket   ┌─────────┐ │
│  │ Server (server/)       │◄────────────────────►│ Client  │ │
│  │ Express, chokidar, ws  │                       │ React   │ │
│  │ Dateien · Compile ·    │                       │ Monaco  │ │
│  │ Log-Parser · SyncTeX · │                       │ pdf.js  │ │
│  │ Stats · Bib · History  │                       └─────────┘ │
│  └───────┬────────────────┘                                   │
│          │ spawn / execFile                                    │
│   pdflatex · biber · synctex · chktex · git                    │
└──────────────────────────────────────────────────────────────┘
```

Der Server ist ein reines Node-Modul (`createApp()`), das sowohl von `server/start.js` (Browser-Modus) als auch aus dem Electron-Hauptprozess gestartet wird. Der Client kommuniziert ausschließlich über `/api/*` und den WebSocket `/ws`; die Electron-Bridge (`preload.cjs`) ergänzt nur native Dialoge und Menü-Ereignisse.

## 2. Server-Module

| Modul | Aufgabe | Wichtige Entscheidungen |
| --- | --- | --- |
| `index.js` | Anwendungszustand, REST-Endpunkte, WebSocket-Broadcast, Dateiüberwachung, Zeitsteuerung (Compile-Debounce 900 ms, Historie 12 s, Lint 1,5 s) | Ein Projekt pro Server-Instanz; Zustand im Speicher, Konfiguration in `.local-overleaf/config.json` |
| `files.js` | Dateibaum, Text-/Binärerkennung (Endung + Byte-Sniffing), Locator für verknüpfte Ordner (`@name/…`), Metadaten-Extraktion (Labels, Gliederung, Zitate, Todos, Abkürzungen, Gleitobjekte, Include-Reihenfolge), Projektsuche, Vorlage mit Platzhaltern | Alle Pfade werden gegen den Projektordner validiert (`safeResolve`), Schreibzugriffe atomar (tmp + rename) |
| `compile.js` | Engine-Auswahl (Magic-Comment → Konfiguration → Präambel), Biber/BibTeX bei Bedarf (Hash der zitierten Schlüssel statt Zeitstempel), Wiederholungsläufe, Abbruch per AbortSignal, Zeitlimit; Arbeitsverzeichnis = Ordner der Hauptdatei | Ausgabe in `.local-overleaf/build`, damit der Projektordner sauber bleibt; relative Pfade wie in Overleaf |
| `logparser.js` | Zusammenfügen umbrochener Log-Zeilen (79 Zeichen), Dateistapel über Klammern, Fehler (`datei:zeile:`, `!`+`l.N`), Warnungen (undefinierte Verweise/Zitate, Pakete), Boxen, Seitenzahl, Rerun-Signale | Heuristik wie in LaTeX-Workshop; Positionen relativ zum Projekt |
| `synctex.js` | `synctex view`/`edit` mit mehreren Pfadvarianten, Koordinaten in PDF-Punkten (Ursprung oben links) | Case-sensitive Schlüssel (`h` vs. `H`) |
| `stats.js` | Wortzählung nach texcount-Prinzip (Kommentare, Mathematik, Listings, Befehle entfernt; Überschriften/Beschriftungen/Fußnoten getrennt), Kapitelaufteilung, Seiten aus dem Log, Tagesverlauf in `stats.json` | Keine Perl-Abhängigkeit (texcount braucht Perl) |
| `bib.js` | BibTeX-Parser, Import via doi.org (Content Negotiation), OpenLibrary/Google Books, arXiv-API, Webseiten-Metadaten; Schlüsselgenerierung `nachname jahr titelwort`; Prüfungen | Netzzugriff nur auf ausdrückliche Aktion |
| `lint.js` | chktex mit Format `%f:%l:%c:%n:%m`, unterdrückte Regeln, deutsche Erklärungen; eigene Stilhinweise (Abkürzungen ohne `~`, Anführungszeichen, Ich-Form, Füllwörter) | Läuft nach jeder Änderung an `.tex` gedrosselt |
| `history.js` | Verstecktes Git-Repo (`--git-dir`/`--work-tree`), Snapshots, `--shortstat`, Änderungslisten, Diff-Daten, Wiederherstellung von Datei oder Stand | Unabhängig von einem Nutzer-Git; Excludes für Build-Dateien |
| `zip.js` | Eigener ZIP-Writer (Deflate, UTF-8-Namen) ohne Fremdpaket | Reicht für Projektexporte |
| `spell.js` | Positionsgetreue LaTeX-/Markdown-Maskierung (Befehle, Mathematik, Kommentare, Präambel, Akzentbefehle → Buchstabe + Füllzeichen), Rechtschreibung via nspell (Hunspell DE/EN, Komposita, Wörterbücher), Grammatik via LanguageTool-API mit Offset→Zeile/Spalte | Sprache je Zeile aus `otherlanguage`/`selectlanguage`; Umlautwörter im englischen Text gegen das deutsche Wörterbuch |
| `backup.js` | ZIP-Sicherung in einen Zielordner mit Aufbewahrungslimit, Änderungserkennung über mtime | Timer im Server, manuell per API/Menü |
| `latex.js` | Suche nach MiKTeX/TeX Live, PATH-Ergänzung, Werkzeugliste, Version (30 s Cache) | `THESISLEAF_LATEX_BIN` als Override |
| `picker.js` | PowerShell-Ordnerdialog für den Browser-Modus | In Electron ersetzt durch `dialog.showOpenDialog` |

## 3. Client

React 18 mit Vite. `Workspace.jsx` hält den Zustand (offene Dateien, Inhalte, Dirty-Flags, Kompilierstatus, Statistik, Lint, Historie) und verteilt ihn an Panels. Monaco wird lokal gebündelt (kein CDN) mit eigenen Sprachen `latex` und `bibtex` (Tokenizer, Vervollständigung, Hover). pdf.js rendert Seiten bei Sichtbarkeit (IntersectionObserver) mit DPR-Skalierung; SyncTeX-Klicks rechnen CSS-Pixel über den Zoomfaktor in PDF-Punkte um.

Ereignisfluss beim Tippen:

```
Editor onChange → contents (State) → Debounce 600 ms → PUT /api/files/write
  → chokidar "change" → Broadcast project:update + file:changed
  → Compile-Debounce → pdflatex … → compile:done (Diagnosen, Seiten) → PDF neu laden
  → Stats/Lint → stats:update / lint:update
  → Historie-Debounce 12 s → git commit → history:update
```

Externe Änderungen: `file:changed` → Datei lesen → Vergleich mit dem zuletzt gespeicherten Inhalt (eigenes Echo) → ohne lokale Änderungen neu laden, sonst Konfliktbalken.

## 4. Desktop-Hülle

`electron/main.js` (ESM) startet den Server auf dem ersten freien Port ab 3847, lädt `dist/` per HTTP, baut das deutsche Menü mit Tastenkürzeln und leitet Menüaktionen per IPC (`menu`-Kanal) an den Client. Native Dialoge (Ordner wählen, PDF/ZIP speichern) laufen im Hauptprozess; der Renderer ist sandboxed (`contextIsolation`, kein `nodeIntegration`). Fensterposition wird in `userData/window.json` gespeichert. Die Vorlage liegt im gepackten Zustand unter `resources/template` (`extraResources`) und wird über `THESISLEAF_TEMPLATE_DIR` gefunden.

Packaging: electron-builder (NSIS-Installer, portable EXE). Client-Abhängigkeiten sind `devDependencies`, damit nur Server-Pakete in die App gelangen.

## 5. Datenablage

| Ort | Inhalt |
| --- | --- |
| `<Projekt>/.local-overleaf/build/` | PDF, Hilfsdateien, `.bib-hash` |
| `<Projekt>/.local-overleaf/git/` | Historie |
| `<Projekt>/.local-overleaf/config.json` | Hauptdatei, Engine, Ziele, Mounts, Auto-Kompilierung |
| `<Projekt>/.local-overleaf/stats.json` | Wörter/Seiten je Tag |
| `~/.thesisleaf/recents.json` | Zuletzt geöffnete Projekte |
| Browser `localStorage` (`thesisleaf.ui`) | Darstellung, Panelbreiten, Zoom |
| Electron `userData/window.json` | Fenstergeometrie |

## 6. Sicherheit

- Kein Zugriff außerhalb des Projektordners und der verknüpften Ordner (`safeResolve`).
- Server nur auf 127.0.0.1; keine Authentifizierung nötig, da lokal.
- Renderer ohne Node-Zugriff; externe Links öffnen im Systembrowser.
- Netzwerkzugriffe ausschließlich beim Literaturimport (doi.org, openlibrary.org, googleapis.com, arxiv.org, angegebene URL) und beim Nachinstallieren von Paketen durch MiKTeX.

## 7. Bekannte Grenzen und Ideen

- Ein Projekt je Instanz; mehrere Fenster wären eine Erweiterung.
- Keine Rechtschreibprüfung im Editor (Monaco hat keine eingebaute); denkbar über LanguageTool-Server oder Hunspell-Wörterbuch im Worker.
- Keine Textebene im PDF (keine Textsuche/-auswahl); pdf.js liefert sie, Integration wäre möglich.
- Kompilieren läuft unverändert lokal; ein Docker-TeX-Live-Backend könnte die Installation ersetzen.
- Multi-Cursor-Kollaboration ist bewusst nicht vorgesehen (lokale Einzelnutzung).
