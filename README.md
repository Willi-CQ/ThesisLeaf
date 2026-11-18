# ThesisLeaf

Lokale LaTeX-Schreibwerkstatt für Bachelorarbeiten – als Desktop-App (Electron) oder im Browser. Kein Cloud-Konto, alle Daten bleiben im Projektordner. Editor links, PDF rechts, dazu Historie, Literaturimport, SyncTeX, Statistik und Schreibhilfen.

## Funktionen

**Schreiben**
- Monaco-Editor (VS-Code-Kern) mit LaTeX-Syntax, Vervollständigung für Befehle, Umgebungen, `\ref`-Labels, `\cite`-Schlüssel, Bilddateien, `\input`-Dateien und Abkürzungen.
- Hover über `\ref`/`\cite` zeigt Ziel bzw. Quelle; Strg+Klick springt hin.
- Werkzeugleiste mit Bausteinen: Abbildung, Tabelle, Gleichung, Listing, Listen, Zitat, Verweis, Fußnote, Todo.
- Alle Dateien des Projekts sind sichtbar und editierbar: `.tex`, `.bib`, Markdown mit Vorschau, Quellcode (Python, Java, JS, …), Bilder, PDFs, Konfiguration. Build-Dateien (`.aux`, `.log`) lassen sich einblenden.
- Verknüpfte Ordner (`@name`): den Quellcode des eigenen Projekts neben der Arbeit lesen und daraus Listings einfügen.
- Dateien werden bei externen Änderungen (anderes Programm, Claude Code, Git) automatisch neu geladen; Konflikte werden angezeigt.

**Kompilieren**
- pdflatex / xelatex / lualatex (automatisch per Magic-Comment oder Präambel), Biber oder BibTeX nur wenn nötig, Wiederholungsläufe bis Querverweise stabil sind.
- Auto-Kompilierung nach Änderungen, Abbrechen, Zeitlimit, Build-Ordner leeren.
- Log-Parser: Fehler, Warnungen, undefinierte Verweise/Zitate, Overfull-Boxen mit Datei und Zeile; Klick springt in den Editor.
- Stilprüfung im Hintergrund (chktex + eigene Schreibhinweise).
- SyncTeX in beide Richtungen: Strg+Alt+J zeigt die Cursorzeile im PDF, Doppelklick im PDF springt zur Quelltextzeile.

**Prüfen**
- Rechtschreibprüfung offline (Hunspell Deutsch + Englisch) mit LaTeX-Maskierung, Sprachwechsel per `otherlanguage`, Projekt-/persönlichem Wörterbuch und Schnellkorrektur (Strg+.).
- Grammatik über LanguageTool (öffentliche API oder eigener Server) auf Knopfdruck.
- Statische Prüfungen mit Projektwissen: unbekannte Labels/Zitate, unreferenzierte Abbildungen, Abkürzungen ohne `\ac`, manuelle Nummern, `\ref` statt `\cref`, sprachabhängige Stilregeln.

**Material aus dem Repo**
- Thesis im Unterordner eines Software-Repositories (z. B. `thesis/thesis.tex`): Engine läuft im Ordner der Hauptdatei, biblatex mit bibtex-Backend, große Ergebnisordner ausschließbar.
- CSV als Tabelle öffnen und als booktabs-Tabelle einfügen; Bilder per Strg+V oder Drag & Drop als `figure` mit relativem Pfad; Markdown-Gliederung und Mermaid-Diagramme; Eintrag ins Arbeitsprotokoll mit Zeitstempel (Strg+Shift+P).

**Organisieren**
- Gliederung mit Sprung zur Zeile, Abbildungen/Tabellen, Aufgaben (`\todo`, `% TODO`, Blindtext).
- Abgabe-Panel: automatische Prüfungen, abhakbare Checkliste, Formulierungsbausteine (EN/DE); Fokusmodus, Schreibsitzung mit Pomodoro, automatische ZIP-Sicherung.
- Literatur-Panel: Einträge durchsuchen, per Klick zitieren, Import per DOI, ISBN, arXiv-ID oder URL, Prüfung auf doppelte Schlüssel und fehlende Felder, unzitierte Einträge.
- Statistik: Wörter (texcount-ähnlich) gesamt und je Kapitel, Seiten, Ziele mit Fortschritt, Abgabe-Countdown, Wörter pro Tag, 30-Tage-Verlauf.
- Historie: automatische Versionen (Git im Hintergrund), benannte Meilensteine, Diff-Ansicht je Datei, Wiederherstellen einzelner Dateien oder des ganzen Stands.
- Projektweite Suche (auch regulär), Schnellöffnen (Strg+P), Export als PDF oder ZIP (ohne Build-Dateien, z. B. für Overleaf oder die Abgabe).
- Vorlage „Neue Bachelorarbeit“ mit Titelseite, Kurzfassung/Abstract, Verzeichnissen, Abkürzungen, biblatex, Listings, eidesstattlicher Erklärung und Schreib-Leitfaden.

## Voraussetzungen

- Windows 10/11 (macOS/Linux laufen im Browser-Modus, Desktop-Build dafür nicht getestet)
- [MiKTeX](https://miktex.org/download) oder TeX Live (pdflatex, biber, synctex, optional chktex)
- Git (für die Historie) – https://git-scm.com
- Für Entwicklung/Build: Node.js ≥ 20

## Schnellstart

```bash
npm install
npm run desktop          # Desktop-App im Entwicklungsmodus (Vite + Electron)
npm run dev              # Browser-Modus: http://127.0.0.1:5173
npm run build            # Client bauen (dist/)
npm start                # Server + gebauter Client, öffnet den Browser
npm run desktop:build    # Installer + portable EXE nach release/
npm run check            # Systemcheck (LaTeX, Git, Build)
```

Installer und portable Version liegen nach `npm run desktop:build` in `release/` (`ThesisLeaf-2.1.1-x64.exe`, `ThesisLeaf-2.1.1-portable.exe`).

## Bedienung

Die ausführliche Anleitung steht in [docs/HANDBUCH.md](docs/HANDBUCH.md); der Schreib-Leitfaden für die Arbeit selbst liegt in jeder neuen Vorlage als `LEITFADEN.md`.

| Aktion | Kürzel |
| --- | --- |
| Kompilieren | Strg+Enter / F5 |
| Datei öffnen | Strg+P |
| Suchen im Projekt | Strg+Shift+F |
| Cursorzeile im PDF | Strg+Alt+J |
| PDF → Quelltext | Doppelklick im PDF |
| Zitat einfügen | Strg+Shift+C |
| Seitenleiste / untere Leiste | Strg+\ / Strg+J |
| Einstellungen | Strg+, |

## Projektstruktur

```
electron/      Desktop-Hülle: main.js (Fenster, Menü, Dialoge, startet den Server), preload.cjs (Bridge)
server/        Express + WebSocket: Dateien, Kompilieren, Log-Parser, SyncTeX, Statistik, Literatur, Historie, ZIP
src/           React-Client: Workspace, Panels, Editor (Monaco), PDF (pdf.js), Markdown-Vorschau
template/      Vorlage „Bachelorarbeit“ mit LEITFADEN.md
docs/          Handbuch, Architektur, Änderungsliste, Screenshots
scripts/       desktop-dev.js, check.js, screenshot.js, make-icon.ps1
```

Projektbezogene Daten liegen im Projektordner unter `.local-overleaf/` (Build-Ausgaben, Git-Historie, `config.json`, `stats.json`); Geräte-Einstellungen im Browser-Speicher, die Liste zuletzt geöffneter Projekte in `~/.thesisleaf/recents.json`.

## Fehlerbehebung

- **„Kein LaTeX gefunden“** – MiKTeX installieren oder den Bin-Ordner per Umgebungsvariable `THESISLEAF_LATEX_BIN` angeben.
- **Erste Kompilierung dauert lange** – MiKTeX installiert fehlende Pakete nach (Internet nötig). Im Log-Panel sichtbar.
- **Electron startet als Node / „does not provide an export named app“** – die Umgebungsvariable `ELECTRON_RUN_AS_NODE` ist gesetzt (VS-Code-Terminal). `npm run desktop` entfernt sie automatisch; manuell: `set ELECTRON_RUN_AS_NODE=` bzw. `env -u ELECTRON_RUN_AS_NODE`.
- **Port 3847 belegt** – `THESISLEAF_PORT=3900 npm run server`; die Desktop-App sucht automatisch den nächsten freien Port.
- **`EPERM … rename win-unpacked.tmp` beim Installer-Build** – der Projektordner liegt in OneDrive, das Dateien während des Packens sperrt. Ausgabe außerhalb ablegen: `npx electron-builder --win -c.directories.output=C:/Users/<name>/AppData/Local/ThesisLeaf/release` (so entstand der mitgelieferte Build).
- **Historie aus** – Git ist nicht installiert oder nicht im PATH.

## Lizenz

MIT
