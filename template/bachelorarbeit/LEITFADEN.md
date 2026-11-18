# Leitfaden: Bachelorarbeit schreiben mit ThesisLeaf

Dieser Leitfaden liegt im Projektordner, damit er jederzeit im Editor (Markdown-Vorschau) griffbereit ist. Er ersetzt nicht die Vorgaben deiner Hochschule – prüfe immer das offizielle Merkblatt zu Umfang, Zitierstil und Formalia.

## 1. Der Projektordner

| Datei / Ordner | Zweck |
| --- | --- |
| `main.tex` | Hauptdatei: bindet alles ein, wird kompiliert. Selten anfassen. |
| `meta.tex` | Titel, Name, Matrikelnummer, Prüfer, Datum, Sprache, Zitierstil. |
| `einstellungen.tex` | Pakete, Seitenlayout, Listings-Stil, Literaturoptionen. |
| `titelseite.tex`, `erklaerung.tex` | Titelseite und eidesstattliche Erklärung (Wortlaut der Hochschule einsetzen). |
| `abkuerzungen.tex` | Abkürzungen für `\ac{…}`. |
| `kapitel/*.tex` | Ein Kapitel pro Datei. Neue Kapitel: Datei anlegen und in `main.tex` per `\input` einhängen. |
| `literatur.bib` | Literaturdatenbank. Einträge per DOI/ISBN im Literatur-Panel importieren. |
| `abbildungen/` | Bilder (PNG, JPG, PDF). Einbinden ohne Endung: `\includegraphics{name}`. |
| `code/` | Quellcode-Ausschnitte für `\lstinputlisting`. |
| `.local-overleaf/` | Interne Daten von ThesisLeaf (Build, Historie, Statistik). Nicht abgeben. |

## 2. Zeitplan (Richtwert für 12 Wochen)

| Woche | Schritt | ThesisLeaf-Hilfe |
| --- | --- | --- |
| 1–2 | Thema schärfen, Forschungsfrage, Gliederung, Exposé | Gliederungs-Panel, Aufgaben-Panel (`\todo`) |
| 3–4 | Literatur sammeln und lesen, Grundlagenkapitel | Literatur-Panel (DOI-Import), `\cite` per Strg+Shift+C |
| 5–8 | Umsetzung / Untersuchung, parallel Kapitel 3–4 schreiben | Verknüpfter Code-Ordner, Listings, Statistik-Ziele |
| 9–10 | Evaluation, Ergebnisse, Diskussion | Tabellen-/Abbildungs-Bausteine |
| 11 | Einleitung und Fazit fertigstellen, Kurzfassung schreiben | Probleme-Panel (unbenutzte Labels, Warnungen) |
| 12 | Korrekturlesen, Formalia, Abgabe | Stilhinweise, Checkliste unten, ZIP/PDF-Export |

Setze in den Einstellungen (Ziele) Wortzahl, Seitenzahl und Abgabedatum – die Statistik zeigt dann, wie viele Wörter pro Tag noch nötig sind.

## 3. Was in welches Kapitel gehört

**Kurzfassung / Abstract** (150–250 Wörter): Problem, Ziel, Vorgehen, Ergebnis, Bedeutung. Keine Zitate, keine Verweise. Zuletzt schreiben.

**Einleitung** (5–10 %): Motivation → Problemstellung → Ziel und Forschungsfrage → Abgrenzung → Aufbau. Die Forschungsfrage wird im Fazit wörtlich wieder aufgegriffen.

**Grundlagen / Stand der Technik** (20–30 %): Nur Begriffe und Verfahren, die später gebraucht werden. Jede fremde Aussage mit Quelle. Verwandte Arbeiten vergleichen (Tabelle) und die Lücke benennen, die deine Arbeit schließt.

**Methodik / Anforderungen** (10–15 %): Vorgehensmodell, Erhebungsmethode, Anforderungen nummeriert (FA1 …, NFA1 …), Bewertungskriterien. Diese Nummern tauchen in der Evaluation wieder auf.

**Konzept und Umsetzung** (25–35 %): Architektur (Diagramm!), Entwurfsentscheidungen mit Alternativen und Begründung, dann Implementierungsdetails. Nur relevante Code-Ausschnitte, jeweils erklärt.

**Evaluation** (15–20 %): Aufbau der Untersuchung, Ergebnisse (Tabellen, Diagramme), Erfüllung der Anforderungen, Diskussion, Limitationen.

**Fazit und Ausblick** (5 %): Zusammenfassung, explizite Antwort auf die Forschungsfrage, Beitrag, offene Punkte. Nichts Neues mehr einführen.

## 4. Zitieren

- Jede Aussage, die nicht von dir stammt, braucht eine Quelle – auch Paraphrasen.
- `\cite{key}` → [1] bzw. (Autor 2021); `\textcite{key}` → „Müller (2021) zeigt …“; `\cite[S.~12]{key}` mit Seitenzahl.
- Wörtliche Zitate mit `\enquote{…}` und Seitenangabe; längere Zitate in `quote`-Umgebung.
- Der Zitierstil steht in `meta.tex` (`numeric`, `ieee`, `authoryear`, `apa`, `alphabetic`). Beim Wechsel neu kompilieren; MiKTeX installiert fehlende Stile automatisch.
- Web-Quellen: `@online` mit `url` und `urldate` (Abrufdatum). Das Literatur-Panel erzeugt das aus einer URL.
- Unzitierte Einträge werden nicht gedruckt (biblatex). Das Panel zeigt sie als „unzitiert“ an.

## 5. Abbildungen, Tabellen, Code

- Immer mit `\caption` und `\label`, im Text referenzieren: `Abbildung~\ref{fig:x}` (mit `~`, damit kein Zeilenumbruch entsteht). Der Verweis-Button setzt das automatisch.
- Label-Präfixe: `fig:`, `tab:`, `lst:`, `eq:`, `cha:`, `sec:`.
- Bilder als PDF oder PNG in `abbildungen/` ablegen; Diagramme als Vektorgrafik (PDF/SVG→PDF) bleiben scharf.
- Tabellen mit `booktabs` (`\toprule`, `\midrule`, `\bottomrule`), keine vertikalen Linien.
- Code: `\lstinputlisting[language=Python, firstline=…, lastline=…]{code/datei.py}` bleibt automatisch aktuell. Den Quellcode des eigenen Projekts kannst du als verknüpften Ordner (@name) im Dateibaum lesen.
- Platzhalter während des Schreibens: `\missingfigure{…}` und `\todo{…}` erscheinen im Aufgaben-Panel.

## 6. Typische Fehler und ihre Lösung

| Meldung | Ursache / Lösung |
| --- | --- |
| `Undefined control sequence` | Tippfehler im Befehl oder Paket fehlt in `einstellungen.tex`. |
| `Missing $ inserted` | Sonderzeichen `_`, `^`, `%`, `&` im Text → `\_`, `\%`, `\&`. |
| `Citation … undefined` | Schlüssel nicht in `literatur.bib` oder Biber lief noch nicht – erneut kompilieren. |
| `Reference … undefined` | Label existiert nicht oder erst nach zweitem Lauf verfügbar. |
| `File … not found` | Bildname/Pfad falsch; Endung weglassen; Datei in `abbildungen/`? |
| `Overfull \hbox` | Zeile zu lang (URL, langes Wort). Meist unkritisch; `\url{}` oder Umbruch. |
| Kompilierung hängt beim ersten Mal | MiKTeX installiert Pakete nach – Log beobachten, einmal warten. |

Nach hartnäckigen Fehlern: Kompilieren-Menü → „Hilfsdateien löschen & neu kompilieren“.

## 7. Schreibstil

- Unpersönlich oder in der Wir-Form – je nach Vorgabe der Hochschule; konsistent bleiben.
- Präsens für Fakten, Präteritum für das eigene Vorgehen („Es wurde implementiert …“).
- Ein Gedanke pro Absatz; jeder Abschnitt beginnt mit einem Satz, der sagt, worum es geht.
- Füllwörter (sehr, natürlich, offensichtlich) streichen. Die Stilprüfung im Probleme-Panel markiert Kandidaten.
- Abkürzungen mit `\ac{…}` einführen, Zahlen unter 13 ausschreiben (außer mit Einheit), Einheiten mit `\,` vom Wert trennen (`5\,ms`).

## 8. Checkliste vor der Abgabe

- [ ] `meta.tex` vollständig (Titel, Name, Matrikelnummer, Prüfer, Datum).
- [ ] Eidesstattliche Erklärung mit dem Wortlaut der Hochschule, Angaben zu KI-Werkzeugen falls gefordert.
- [ ] Alle `\todo` und `\missingfigure` entfernt (Aufgaben-Panel leer), `\listoftodos` auskommentiert oder `todonotes` mit `disable`.
- [ ] Probleme-Panel: keine Fehler, keine undefinierten Verweise oder Zitate.
- [ ] Jede Abbildung/Tabelle wird im Text referenziert und hat eine Quelle, wenn übernommen.
- [ ] Literaturverzeichnis vollständig, einheitlich, Web-Quellen mit Abrufdatum.
- [ ] Inhalts-, Abbildungs-, Tabellen- und Abkürzungsverzeichnis stimmen (nach dem letzten Lauf).
- [ ] Umfang und Format laut Merkblatt (Seitenränder, Schriftgröße, Zeilenabstand, ein-/zweiseitig).
- [ ] PDF-Metadaten (Titel, Autor) korrekt – werden aus `meta.tex` gesetzt.
- [ ] Rechtschreibprüfung durchgeführt (z. B. PDF in ein Textprogramm oder LanguageTool).
- [ ] Version sichern (Historie → „Abgabeversion“), PDF exportieren, Projekt als ZIP archivieren.
- [ ] Druckexemplar: PDF in Farbe prüfen, Links sind schwarz gesetzt.

## 9. ThesisLeaf-Kurzreferenz

| Aktion | Tastenkürzel |
| --- | --- |
| Kompilieren | Strg+Enter / F5 |
| Speichern | Strg+S (automatisch nach jeder Pause) |
| Datei öffnen | Strg+P |
| Im Projekt suchen | Strg+Shift+F |
| Cursorzeile im PDF zeigen | Strg+Alt+J |
| Vom PDF zum Quelltext | Doppelklick ins PDF |
| Zitat einfügen | Strg+Shift+C |
| Schnellkorrektur (Rechtschreibung/Grammatik) | Strg+. |
| Eintrag ins Arbeitsprotokoll | Strg+Shift+P |
| Fokusmodus | Strg+Shift+M |
| Bild aus der Zwischenablage als Abbildung | Strg+V im Editor |
| Fett / Hervorhebung | Strg+B / Strg+I |
| Panels | Strg+Shift+E (Dateien), O (Gliederung), B (Literatur), H (Historie) |
| Probleme & Log | Strg+J |
| Einstellungen | Strg+, |

Viel Erfolg!
