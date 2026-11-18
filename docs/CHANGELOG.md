# Änderungen

## 2.1.1 – Dateibaum mit Nachladen, schnellere Aktualisierung

- Der Dateibaum lädt Ordner erst beim Aufklappen; keine Abschneidung mehr bei großen Repositories, alle Ordner sind durchklickbar.
- Große Ordner (über 400 Einträge oder über 2000 Dateien) werden automatisch erkannt: sichtbar, aber nicht beobachtet, durchsucht, versioniert oder gesichert (abschaltbar). Manuelle Ausschlüsse bleiben ebenfalls sichtbar.
- Projekt-Updates übertragen nur noch die oberste Ebene (Nutzlast von Megabytes auf wenige Kilobyte), betroffene Ordner werden gezielt erneuert.
- Filter über dem Baum durchsucht den flachen Dateiindex des gesamten Projekts; Schnellöffnen und Navigation nutzen denselben Index.
- Historie (Git) schließt große/ausgeschlossene Ordner aus, dadurch schnelle Snapshots.
- Editor-Markierungen werden nicht mehr bei jedem Tastendruck neu gesetzt.

## 2.1.0 – Schreibwerkstatt für die Bachelorarbeit

Zugeschnitten auf eine Arbeit, die als Unterordner eines Software-Repositories liegt (z. B. `Benchmark-Agent/thesis/` mit dem TU-Berlin-S3-Template) und deren Rohmaterial (Protokoll, Auswertungen, CSV, Bilder) daneben im Repo wohnt.

**Kompilieren**
- Engine läuft im Ordner der Hauptdatei; `\input{chapters/…}` und `\addbibresource{refs.bib}` relativ dazu, wie in Overleaf und LaTeX Workshop. Log-Positionen, SyncTeX und Statistik rechnen Pfade entsprechend um.
- biblatex mit `backend=bibtex` (BibTeX-Lauf mit passenden BIBINPUTS), „Please (re)run BibTeX“ wird erkannt.
- Statistik teilt auch bei `article`-Klasse nach `\section` in Kapitel; Sternabschnitte (Abstract, Erklärung) zählen nicht als Kapitel.

**Prüfungen**
- Rechtschreibprüfung offline (Hunspell DE + EN, nspell) mit LaTeX-Maskierung, Sprachwechsel per `otherlanguage`/`selectlanguage`, Akzentbefehle (`\"a`), deutschen Komposita, Projekt- und persönlichem Wörterbuch; Schnellkorrektur per Glühbirne (Strg+.).
- Grammatik- und Stilprüfung über LanguageTool (öffentliche API oder eigener Server, auf Knopfdruck für die aktive Datei).
- Statische Prüfungen mit Projektwissen: unbekannte Labels/Zitate, mehrfach definierte Labels, nie referenzierte Abbildungen/Tabellen, undefinierte oder roh geschriebene Abkürzungen (`LLM` statt `\ac{LLM}`), manuelle Nummern („Figure 3“), Überschriften ohne Label, `\ref` statt `\cref` bei cleveref.
- Stilregeln sprachabhängig (Englisch: Kontraktionen, Füllwörter, Umgangssprache, Ich-Form; Deutsch wie bisher).

**Material aus dem Repo**
- CSV/TSV öffnen als sortierbare Tabelle mit Export als booktabs-Tabelle (Spaltenwahl, Zeilenlimit, Nachkommastellen, Dezimalkomma, tabularx) direkt in die aktive .tex-Datei.
- Bilder aus der Zwischenablage einfügen (Strg+V) oder aus Baum/Explorer in den Editor ziehen → Ablage in `fig/` bzw. `abbildungen/` neben der Hauptdatei und fertiger `figure`-Block; „Nach fig/ kopieren & einfügen“ für Bilder aus Ergebnisordnern. Pfade relativ zur Hauptdatei.
- Markdown: Gliederung der Überschriften im Gliederungs-Panel (für lange Protokolle), Mermaid-Diagramme in der Vorschau.
- Eintrag ins Arbeitsprotokoll (Strg+Shift+P): Text wird mit `## Datum` / `### HH:MM · Titel` an die Protokolldatei angehängt (automatisch erkannt oder in den Einstellungen gesetzt).
- Ausgeschlossene Ordner (z. B. `results/artifacts`): nicht im Baum, nicht durchsucht, nicht beobachtet, nicht gesichert; Ordner mit über 400 Einträgen werden gekürzt angezeigt.
- Binärdateien (PPTX, DOCX …) mit dem Standardprogramm öffnen.

**Literatur**
- Freitextsuche (Titel, Stichwörter) über CrossRef mit Import per Klick, zusätzlich zu DOI/ISBN/arXiv/URL.

**Schreiben & Abgabe**
- Panel „Abgabe & Formulierungen“: automatische Prüfungen (Fehler, undefinierte Verweise, Todos, unreferenzierte Labels, unzitierte Quellen, Rechtschreibung, Wortziel) plus abhakbare Checkliste (im Projekt gespeichert) und Formulierungsbausteine (Englisch/Deutsch) zum Einfügen.
- Fokusmodus (Strg+Shift+M), Schreibsitzung mit Pomodoro-Timer und Wörtern je Sitzung in der Statusleiste.
- PDF-Ansicht umschaltbar auf den Browser-Viewer (Textsuche, Markieren, Drucken).
- Automatische ZIP-Sicherung in einen frei wählbaren Ordner (Intervall, Anzahl), manuell per Menü.
- Verweis-Auswahl nutzt `\cref{}` und englische Bezeichner, wenn das Dokument cleveref bzw. Englisch verwendet.

## 2.0.0 – Grundlegender Umbau und Desktop-App

**Desktop**
- Electron-App mit deutschem Menü, nativen Dialogen, Fenster-Wiederherstellung, Single-Instance; Installer (NSIS) und portable EXE per electron-builder.
- Server läuft im Hauptprozess und sucht automatisch einen freien Port.

**Dateien**
- Alle Dateien sichtbar und editierbar: Code (Python, Java, JS/TS, C/C++, C#, Go, Rust, Shell, SQL …), Markdown mit Vorschau, JSON/YAML/XML, Bilder, PDFs; Text-/Binärerkennung per Byte-Sniffing.
- Build-Dateien optional einblenden; verknüpfte externe Ordner (`@name`); Drag-&-Drop-Upload; Duplizieren; im Explorer anzeigen.
- Erkennung externer Änderungen (Claude Code, Git, andere Editoren) mit automatischem Neuladen oder Konflikthinweis.

**Editor**
- Monaco lokal gebündelt (offlinefähig), Themes hell/dunkel, LaTeX-Tokenizer mit Sektionen/Zitaten/Verweisen, BibTeX-Sprache.
- Vervollständigung für Labels (mit Kontext), Zitate (Autor/Jahr/Titel), Bilder, Input-Dateien, Abkürzungen, Umgebungen, Bausteine.
- Hover-Infos, Strg+Klick-Navigation, Werkzeugleiste mit Bausteinen, Zitat- und Verweis-Auswahl, Markierungen für Fehler/Warnungen/Stil.

**Kompilieren**
- Engine-Wahl (pdflatex/xelatex/lualatex), Biber/BibTeX nur bei Bedarf (Hash statt Zeitstempel), Rerun-Erkennung, Abbruch, Zeitlimit, Build leeren.
- Neuer Log-Parser (Datei/Zeile für Fehler, undefinierte Verweise/Zitate, Overfull-Boxen, Seitenzahl).
- SyncTeX vorwärts und rückwärts; chktex-Lint und eigene Schreibhinweise.

**Panels**
- Gliederung mit Zeilen und Gleitobjekten; Aufgaben aus `\todo`/`% TODO`; Literatur mit DOI/ISBN/arXiv/URL-Import, Zitier-Klick, Prüfungen, unzitierte Einträge; Statistik mit Zielen, Countdown, Kapiteln, 30-Tage-Verlauf; Historie mit Meilensteinen, Diff-Ansicht und Datei-Wiederherstellung; projektweite Suche.
- Untere Leiste mit Problemen (Filter) und Log (Klick auf Zeilen).

**Vorlage**
- `meta.tex` mit Platzhaltern aus dem Dialog „Neue Bachelorarbeit“, Titelseite, Kurzfassung + Abstract, Abbildungs-/Tabellen-/Listing-/Abkürzungsverzeichnis, `acronym`, `listings`, `todonotes`, `pdfpages`, biblatex mit wählbarem Stil, eidesstattliche Erklärung, Kapitel mit Schreibhinweisen, `LEITFADEN.md` mit Zeitplan, Kapitelinhalten, Zitierregeln, Fehlerhilfe und Abgabe-Checkliste.

**Sonstiges**
- Export als PDF und ZIP, Schnellöffnen (Strg+P), Tastaturkürzel, Einstellungen-Dialog, Dark Mode, Toasts, Systemcheck (`npm run check`), Screenshot-Skript.

## 1.0.0
- Erste Version: Dateibaum (.tex/.bib), Monaco via CDN, pdflatex + biber, pdf.js-Vorschau, Historie per Git, Vorlage.
