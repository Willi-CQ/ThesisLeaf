# ThesisLeaf – Handbuch

## 1. Start

**Desktop-App:** Installer aus `release/` ausführen oder `npm run desktop`. Beim ersten Start prüft ThesisLeaf, ob LaTeX gefunden wurde (grüner Punkt auf dem Startbildschirm).

**Browser:** `npm run dev` (Entwicklung) oder `npm start` (gebauter Client), dann http://127.0.0.1:5173 bzw. :3847.

Auf dem Startbildschirm:
- **Projekt öffnen** – beliebigen Ordner mit `.tex`-Dateien wählen. Die Hauptdatei (mit `\documentclass`) wird automatisch erkannt und lässt sich in der Werkzeugleiste ändern.
- **Neue Bachelorarbeit** – Dialog mit Titel, Name, Prüfern, Sprache und Zitierstil. Die Vorlage wird in einen neuen Ordner kopiert, Platzhalter werden ausgefüllt, `meta.tex` bleibt jederzeit editierbar.
- **Zuletzt geöffnet** – Liste mit Entfernen-Knopf.

## 2. Aufbau des Arbeitsbereichs

```
┌ Werkzeugleiste: Projekt ▾ · Hauptdatei ▾ · Formatierung · Im PDF · Kompilieren ▾ · Ansicht ┐
│ Aktivitäts- │ Seitenleiste    │ Tabs + Editor / Markdown-Vorschau │ PDF-Vorschau          │
│ leiste      │ (Panel)         │ Probleme / Log (unten, Strg+J)    │ (Zoom, Seiten, Sync)  │
└ Statusleiste: Kompilierstatus · Seiten · Warnungen · Wörter · Speichern · Engine · Historie ┘
```

Alle Breiten lassen sich an den Trennlinien ziehen; Einstellungen bleiben pro Gerät gespeichert.

## 3. Panels (Aktivitätsleiste links)

### Dateien (Strg+Shift+E)
- Zeigt **alle** Dateien des Projekts: LaTeX, BibTeX, Markdown, Code, Bilder, PDFs, Konfiguration. Build-Dateien (`.aux`, `.log`, …) sind ausgeblendet und lassen sich mit dem Augen-Symbol einblenden.
- Rechtsklick: Öffnen, als Abbildung/`\input`/Listing einfügen, als Hauptdatei festlegen, Neue Datei/Ordner hier, im Explorer anzeigen, Pfad kopieren, Duplizieren, Umbenennen, Löschen.
- Dateien per Drag & Drop hochladen (Bilder, PDFs, Code).
- **Ordner verknüpfen** (Symbol mit Pfeil): externer Ordner erscheint als `@name`. Ideal für den Quellcode des eigenen Projekts. Wird nicht kompiliert und nicht versioniert, aber durchsucht.
- Markdown-Dateien (z. B. Notizen, README, von Claude Code erzeugte Dokumente) öffnen mit Editor + Vorschau; oben rechts umschaltbar.

### Gliederung (Strg+Shift+O)
Kapitel, Abschnitte, Abbildungen, Tabellen und Listings mit Sprung zur Zeile. Die aktuelle Position ist hervorgehoben. Ausgegraut: Dateien, die nicht per `\input` eingebunden sind.

### Literatur (Strg+Shift+B)
- Liste aller Einträge aus allen `.bib`-Dateien; Klick fügt `\cite{key}` an der Cursorposition ein.
- **Import:** DOI (`10.1145/…`), ISBN, arXiv-ID (`2103.00020`) oder URL eingeben → Vorschau als BibTeX → bearbeiten → speichern. Quellen: doi.org, OpenLibrary/Google Books, arXiv, Webseiten-Metadaten. Freitext (Titel, Stichwörter) sucht bei CrossRef; ein Klick auf einen Treffer importiert ihn per DOI.
- „+“ legt einen manuellen Eintrag aus einer Vorlage an (`@article`, `@book`, `@online`, …).
- Filter „unzitiert“ zeigt Einträge, die noch nirgends verwendet werden; unten Hinweise zu doppelten Schlüsseln und fehlenden Pflichtfeldern.

### Aufgaben
Alle `\todo{…}`, `\missingfigure{…}`, `% TODO`, `% FIXME`, `% NOTE` und Blindtext-Stellen mit Datei und Zeile. Der Zähler erscheint als Badge.

### Statistik
Wörter (Fließtext inkl. Fußnoten, ohne Befehle/Mathematik/Listings), Seiten aus dem letzten Lauf, Ziele mit Fortschrittsbalken, Tage bis zur Abgabe und nötige Wörter pro Tag, Wörter heute, 30-Tage-Verlauf, Wörter je Kapitel und je Datei, Anzahl Abbildungen/Tabellen/Gleichungen/Zitate. Ziele: Zielscheiben-Symbol oder Einstellungen → Ziele.

### Historie (Strg+Shift+H)
- Automatische Versionen etwa alle 12 Sekunden nach Änderungen (Git-Repository unter `.local-overleaf/git`, unabhängig von einem eigenen Git-Repo).
- Eingabefeld oben: Meilenstein benennen („Kapitel 3 fertig“) → Sichern.
- Version anklicken: geänderte Dateien, Diff zur aktuellen Datei (Seite an Seite), einzelne Datei oder alles wiederherstellen. Vor jedem Wiederherstellen wird der aktuelle Stand gesichert.

### Suchen (Strg+Shift+F)
Projektweite Suche mit Optionen für reguläre Ausdrücke, Groß-/Kleinschreibung und verknüpfte Ordner. Klick springt zur Fundstelle. Suche innerhalb einer Datei: Strg+F im Editor (Ersetzen: Strg+H).

## 4. Editor

- Vervollständigung erscheint nach `\`, in `\cite{`, `\ref{`, `\includegraphics{`, `\input{`, `\ac{` und `\begin{`.
- Werkzeugleiste (nur bei `.tex` aktiv): Fett, Hervorhebung, Überschrift, Liste, Zitat (Suchliste), Verweis (Suchliste mit passendem Präfix „Abbildung~“), Abbildung, Tabelle, Gleichung, Listing, Fußnote, Todo, weitere Bausteine.
- Hover über `\ref`, `\cite`, `\ac` zeigt Ziel/Quelle; Strg+Klick springt zu Label, Literatureintrag, eingebundener Datei oder Bild.
- Fehler und Warnungen der letzten Kompilierung sowie Stilhinweise erscheinen als Markierungen im Text (F8 springt zum nächsten Problem).
- Automatisches Speichern nach kurzer Pause (Standard 600 ms); Strg+S speichert sofort. Externe Änderungen werden erkannt: ohne eigene Änderungen wird neu geladen, sonst erscheint ein Hinweisbalken mit beiden Optionen.
- Markdown: Vorschau mit Bildern und Links relativ zur Datei.

## 5. Kompilieren

- **Kompilieren** (Strg+Enter): speichert alles, startet die Engine, bei Bedarf Biber/BibTeX und weitere Läufe für Querverweise. Der Knopf wird während des Laufs zu „Abbrechen“.
- **Auto** (Statusleiste oder Menü): kompiliert automatisch nach Änderungen an `.tex`, `.bib`, Bildern.
- Engine: automatisch aus `% !TeX program = xelatex` oder aus der Präambel (`fontspec` → xelatex), sonst pdflatex. Umstellbar im Kompilieren-Menü oder in den Einstellungen.
- Untere Leiste (Strg+J): **Probleme** mit Filtern (Fehler, Warnungen, Hinweise, Stil), Klick springt in die Datei; **Log** mit Hervorhebung und Klick auf `datei:zeile:`.
- Bei hartnäckigen Fehlern: Kompilieren-Menü → „Hilfsdateien löschen & neu kompilieren“.

## 6. PDF-Vorschau

- Bleibt zwischen Kompilierungen sichtbar, Scrollposition bleibt erhalten.
- Zoom: Breite, ganze Seite, feste Stufen, Strg+Mausrad. Seitenzahl eingeben, Pfeile.
- **Strg+Alt+J** (oder Knopf „Im PDF“) markiert die Stelle der Cursorzeile; **Doppelklick** oder Strg+Klick im PDF öffnet die passende Quelltextzeile.
- Download/Speichern über das Symbol rechts oder Projektmenü → PDF exportieren.

## 7. Einstellungen (Strg+,)

- **Darstellung:** hell/dunkel/System, Schriftgröße, Zeilenumbruch, Minimap, Speicherverzögerung, Markdown-Ansicht.
- **Kompilieren:** Engine, Literaturwerkzeug, Auto-Kompilierung und Verzögerung, Stilprüfung, Build-Dateien anzeigen.
- **Ziele:** Wörter, Seiten, Abgabedatum.
- **Ordner:** verknüpfte Ordner verwalten.
- **Tastatur:** alle Kürzel.

Projekt-Einstellungen liegen in `.local-overleaf/config.json` des Projekts, Darstellungs-Einstellungen pro Gerät.

## 8. Arbeiten mit Claude Code und anderen Werkzeugen

ThesisLeaf beobachtet den Projektordner. Dateien, die außerhalb entstehen oder geändert werden – etwa Markdown-Notizen, Gliederungen oder Kapitelentwürfe aus Claude Code, Dateien aus Git oder aus einem anderen Editor – erscheinen sofort im Dateibaum und werden bei geöffnetem Tab neu geladen. Markdown öffnet mit Vorschau, Code mit Syntaxfarben, Bilder und PDFs als Ansicht.

Empfehlung: Notizen und Entwürfe als `.md` im Projektordner ablegen (z. B. `notizen/`), Quellcode des eigenen Projekts als verknüpften Ordner einbinden und relevante Ausschnitte nach `code/` kopieren, damit `\lstinputlisting` sie findet.

## 9. Arbeit im Unterordner eines Repositories

ThesisLeaf kann das ganze Software-Repository als Projekt öffnen (z. B. `Benchmark-Agent/`), auch wenn die LaTeX-Quellen in einem Unterordner liegen (`thesis/thesis.tex`). Die Hauptdatei wird automatisch erkannt; die Engine läuft im Ordner der Hauptdatei, sodass `\input{chapters/…}`, `\addbibresource{refs.bib}` und `\includegraphics{fig/…}` genau wie in Overleaf funktionieren. So sind Arbeitsprotokoll, Auswertungs-Markdown, Architektur-Notizen, Ergebnis-CSV und Report-Bilder direkt im Dateibaum erreichbar.

Der Dateibaum lädt jede Ordnerebene erst beim Aufklappen, deshalb bleibt auch ein Repository mit tausenden Dateien flüssig. Alle Ordner sind sichtbar und durchklickbar. Große Ordner (über 400 Einträge oder über 2000 Dateien im Teilbaum, z. B. `results/artifacts`) erkennt ThesisLeaf automatisch und markiert sie mit „groß“: Sie werden weiterhin angezeigt, aber nicht beobachtet, durchsucht, versioniert oder gesichert. Manuelle Ausschlüsse (Rechtsklick → „Ordner ausschließen“ oder Einstellungen → Ordner) wirken genauso und tragen das Etikett „ausgeschlossen“. Die Automatik lässt sich in Einstellungen → Ordner abschalten. Der Filter über dem Baum durchsucht die Dateinamen des gesamten Projekts (ohne große/ausgeschlossene Ordner).

## 10. Rechtschreibung, Grammatik und statische Prüfungen

- **Rechtschreibung** läuft offline mit Hunspell-Wörterbüchern (Deutsch und Englisch). Die Sprache kommt aus der babel-Option der Präambel; `\begin{otherlanguage}{ngerman}` (Kurzfassung) und `\selectlanguage` werden je Zeile berücksichtigt. Befehle, Mathematik, Kommentare, Zitier- und Verweisschlüssel, Abkürzungen aus der Abkürzungsliste sowie Titelseiten/Erklärungen werden übersprungen.
- Hinweise erscheinen als Markierung im Editor und im Probleme-Panel. Glühbirne oder Strg+. zeigt Vorschläge und „ins Projektwörterbuch/persönliche Wörterbuch aufnehmen“ (`.local-overleaf/woerterbuch.txt` bzw. `~/.thesisleaf/woerterbuch.txt`).
- **Grammatik**: Knopf „AB“ in der Werkzeugleiste (oder Menü LaTeX) prüft die aktive Datei über LanguageTool. Standard ist die öffentliche API (Text wird übertragen, Limits: 20 KB, 20 Anfragen/Minute). Für einen lokalen Server die URL in Einstellungen → Prüfungen eintragen (z. B. Docker `erikvl87/languagetool`, `http://localhost:8010/v2/check`).
- **Statische Prüfungen** (sofort, ohne Kompilieren): Verweise auf unbekannte Labels, fehlende Literaturschlüssel, doppelte Labels, nie referenzierte Abbildungen/Tabellen/Listings, `\ac{…}` mit unbekanntem Schlüssel, Abkürzungen ohne `\ac`, manuelle Nummern („Figure 3“), Überschriften ohne Label, `Figure~\ref` statt `\cref` bei cleveref, Kontraktionen und Füllwörter (Englisch), Ich-Form und Anführungszeichen (Deutsch).

## 11. Ergebnisse einbauen: Tabellen und Bilder

- **CSV/TSV** öffnen sich als sortierbare Tabelle. „Als LaTeX-Tabelle“ blendet den Export ein: Spalten wählen, Zeilenlimit, Nachkommastellen, Dezimalkomma, volle Breite (tabularx), dann „In die aktive .tex-Datei einfügen“ oder „LaTeX kopieren“. Rechtsklick auf eine CSV im Baum → „Als LaTeX-Tabelle …“.
- **Bilder**: Screenshot mit Strg+V in den Editor einfügen → Datei landet im Abbildungsordner neben der Hauptdatei (`fig/` oder `abbildungen/`), ein `figure`-Block mit relativem Pfad wird eingefügt. Bilder aus dem Baum (auch aus `results/reports/…`) per Drag & Drop in den Editor ziehen oder Rechtsklick → „Als Abbildung einfügen“ (Pfad relativ) bzw. „Nach fig/ kopieren & einfügen“ (Kopie im Thesis-Ordner, Overleaf-kompatibel).
- **Code**: Rechtsklick → „Als Listing einfügen“ erzeugt `\lstinputlisting` mit relativem Pfad; aus verknüpften Ordnern eine Kopie in den Thesis-Ordner legen.

## 12. Arbeitsprotokoll, Sitzungen, Fokus, Sicherung

- **Protokoll-Eintrag** (Strg+Shift+P, Uhr-Symbol): Text wird an die Protokolldatei angehängt – unter `## JJJJ-MM-TT` als `### HH:MM · erste Zeile`, weitere Zeilen als Absatz. Die Datei wird automatisch erkannt (Name enthält „Arbeitsprotokoll“, „Protokoll“, „Journal“ …) oder in Einstellungen → Ordner gesetzt. Öffnet man die Markdown-Datei, zeigt das Gliederungs-Panel Datum und Einträge zum Springen.
- **Schreibsitzung** (Statusleiste „Sitzung“): merkt sich Startzeit und Wortzahl, zeigt Dauer und geschriebene Wörter, meldet sich nach der Pomodoro-Länge (Einstellungen → Darstellung).
- **Fokusmodus** (Strg+Shift+M, Zielscheiben-Symbol): nur Editor in Lesebreite; Seitenleiste, PDF und Formatierungsleiste sind ausgeblendet.
- **Sicherung** (Einstellungen → Sicherung): ZIP der Quellen mit aktuellem PDF in einen Ordner deiner Wahl, automatisch alle n Minuten bei Änderungen, mit Aufbewahrungslimit; manuell über Datei → „Sicherung (ZIP) jetzt schreiben“.

## 13. Abgabe-Panel

Fahnen-Symbol in der Aktivitätsleiste. Oben automatische Prüfungen (Kompilierfehler, undefinierte Verweise/Zitate, offene Todos, unreferenzierte Labels, unzitierte Quellen, Rechtschreibhinweise, Wortziel) mit Sprung zur passenden Ansicht, darunter die abhakbare Checkliste (im Projekt gespeichert). Der Reiter „Formulierungen“ bietet englische und deutsche Satzbausteine für Einleitung, Grundlagen, Methode, Ergebnisse, Diskussion und Fazit – Klick fügt sie an der Cursorposition ein.

## 14. Export und Abgabe

- Projektmenü → **PDF exportieren** (Desktop: Speichern-Dialog; Browser: Download).
- Projektmenü → **Projekt als ZIP**: Quellen ohne Build-Dateien, in der Desktop-App zusätzlich mit dem aktuellen PDF – geeignet für Overleaf-Upload, Betreuer oder Archiv.
- Vor der Abgabe: Historie → Meilenstein „Abgabeversion“ sichern.
