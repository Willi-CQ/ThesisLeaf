import { useMemo, useState } from "react";
import Icon from "./Icons.jsx";

/** Abgabe-Checkliste: feste Punkte (abhakbar, im Projekt gespeichert) + automatische Prüfungen. */
const MANUAL_ITEMS = [
  { id: "meta", text: "Titel, Name, Matrikelnummer, Prüfer:innen und Betreuung auf der Titelseite eingetragen" },
  { id: "declaration", text: "Eigenständigkeits-/Eidesstattliche Erklärung mit dem Wortlaut der Hochschule, KI-Werkzeuge (Produkt, Version, Art der Nutzung) genannt" },
  { id: "abstract", text: "Abstract und Kurzfassung geschrieben (Problem, Ziel, Vorgehen, Ergebnis, Bedeutung)" },
  { id: "rq", text: "Forschungsfrage in der Einleitung gestellt und im Fazit wörtlich beantwortet" },
  { id: "figures", text: "Jede Abbildung/Tabelle wird im Text referenziert; übernommene mit Quelle" },
  { id: "bib", text: "Literaturverzeichnis vollständig, einheitlich, Web-Quellen mit Abrufdatum" },
  { id: "format", text: "Umfang, Ränder, Schrift, Zeilenabstand, ein-/zweiseitig laut Merkblatt" },
  { id: "spelling", text: "Rechtschreib- und Grammatikprüfung für alle Kapitel durchgeführt" },
  { id: "readers", text: "Von mindestens einer Person gegengelesen" },
  { id: "print", text: "PDF in Farbe und in Graustufen geprüft (Diagramme lesbar?)" },
  { id: "backup", text: "Version gesichert (Historie „Abgabeversion“), PDF exportiert, Projekt als ZIP archiviert" },
  { id: "submit", text: "Abgabeform geklärt (Upload, Druckexemplare, Fristen)" },
];

const PHRASES = {
  en: [
    {
      group: "Introduction",
      items: [
        "Writing performance benchmarks is demanding work: it requires …",
        "This thesis investigates how … affects …",
        "The remainder of this thesis is structured as follows. Section~\\ref{sec:background} …",
        "We pose the following research question: …",
        "To narrow the scope, we restrict … to …",
      ],
    },
    {
      group: "Background / Related Work",
      items: [
        "\\textcite{key} propose … whereas \\textcite{key2} focus on …",
        "In contrast to prior work, our approach …",
        "To the best of our knowledge, no previous study has …",
        "Throughout this thesis, the term … refers to …",
      ],
    },
    {
      group: "Method / Approach",
      items: [
        "We vary three factors in parallel: …",
        "Each condition is executable through a single configuration switch.",
        "A generated benchmark counts as successful when (i) …, (ii) … and (iii) …",
        "All measurements are captured outside the generated code, from two independent layers.",
      ],
    },
    {
      group: "Results",
      items: [
        "\\Cref{tab:results} summarises … across all conditions.",
        "As \\cref{fig:levels} shows, … increases from … to …",
        "The difference between … and … is not statistically significant (Kruskal–Wallis, $p = …$).",
        "Within-level variation (IQR) exceeds the differences between levels.",
      ],
    },
    {
      group: "Discussion / Threats to Validity",
      items: [
        "These findings suggest that …, although …",
        "A possible explanation is that …",
        "Internal validity: … Construct validity: … External validity: …",
        "Because all epochs reuse the same seeds, later runs are not independent replications.",
        "These results should therefore be interpreted with caution.",
      ],
    },
    {
      group: "Conclusion",
      items: [
        "In this thesis, we … To this end, we …",
        "Returning to the research question, …",
        "Future work could extend … to …",
      ],
    },
  ],
  de: [
    {
      group: "Einleitung",
      items: [
        "Die vorliegende Arbeit untersucht, inwiefern …",
        "Daraus ergibt sich folgende Forschungsfrage: …",
        "Die Arbeit gliedert sich wie folgt: Kapitel~\\ref{cha:grundlagen} …",
        "Nicht Gegenstand dieser Arbeit sind …",
      ],
    },
    {
      group: "Grundlagen / Stand der Technik",
      items: [
        "\\textcite{key} beschreibt …, während \\textcite{key2} …",
        "Im Gegensatz zu bisherigen Ansätzen …",
        "Unter … wird im Folgenden … verstanden.",
      ],
    },
    {
      group: "Methodik / Umsetzung",
      items: [
        "Das Vorgehen folgt einem iterativen Prozess aus …",
        "Als Bewertungskriterien dienen …",
        "Die Entscheidung für … gegenüber … wurde getroffen, weil …",
      ],
    },
    {
      group: "Ergebnisse / Diskussion",
      items: [
        "Tabelle~\\ref{tab:x} fasst … zusammen.",
        "Wie Abbildung~\\ref{fig:x} zeigt, …",
        "Die Ergebnisse deuten darauf hin, dass …",
        "Einschränkend ist anzumerken, dass …",
        "Dies deckt sich mit den Befunden von \\textcite{key}.",
      ],
    },
    {
      group: "Fazit",
      items: ["Zusammenfassend lässt sich festhalten, dass …", "Die Forschungsfrage lässt sich wie folgt beantworten: …", "Offen bleibt …; eine Folgearbeit könnte …"],
    },
  ],
};

export default function ChecklistPanel({ checklist, onToggle, auto, onGoto, onInsert, language }) {
  const [tab, setTab] = useState("check");
  const [lang, setLang] = useState(language === "en" ? "en" : "de");
  const done = MANUAL_ITEMS.filter((i) => checklist?.[i.id]).length;
  const autoItems = useMemo(
    () => [
      { ok: auto.errors === 0, text: auto.errors === 0 ? "Kompilierung ohne Fehler" : `${auto.errors} Kompilierfehler`, action: "problems" },
      { ok: auto.undefinedRefs === 0, text: auto.undefinedRefs === 0 ? "Keine undefinierten Verweise oder Zitate" : `${auto.undefinedRefs} undefinierte Verweise/Zitate`, action: "problems" },
      { ok: auto.todos === 0, text: auto.todos === 0 ? "Keine offenen Todo-Notizen" : `${auto.todos} offene Todo-Notizen`, action: "todos" },
      { ok: auto.unreferenced === 0, text: auto.unreferenced === 0 ? "Alle Abbildungen/Tabellen werden referenziert" : `${auto.unreferenced} Labels ohne Verweis`, action: "problems" },
      { ok: auto.uncited === 0, text: auto.uncited === 0 ? "Alle Literatureinträge werden zitiert" : `${auto.uncited} unzitierte Literatureinträge (werden nicht gedruckt)`, action: "bib" },
      { ok: auto.spelling === 0, text: auto.spelling === 0 ? "Keine Rechtschreibhinweise" : `${auto.spelling} Rechtschreibhinweise`, action: "problems" },
      { ok: auto.wordsOk, text: auto.wordsOk ? "Wortziel erreicht" : `Wortziel: ${auto.words.toLocaleString("de-DE")} von ${auto.wordGoal.toLocaleString("de-DE")}`, action: "stats" },
    ],
    [auto],
  );

  return (
    <>
      <div className="panel-head">
        <span>Abgabe</span>
        <div className="panel-actions">
          <button type="button" className={`chip ${tab === "check" ? "on" : ""}`} onClick={() => setTab("check")}>
            Checkliste {done}/{MANUAL_ITEMS.length}
          </button>
          <button type="button" className={`chip ${tab === "phrases" ? "on" : ""}`} onClick={() => setTab("phrases")}>
            Formulierungen
          </button>
        </div>
      </div>
      <div className="panel-scroll">
        {tab === "check" && (
          <>
            <div className="panel-sub">Automatisch geprüft</div>
            {autoItems.map((a, i) => (
              <button key={i} type="button" className={`check-row ${a.ok ? "ok" : "open"}`} onClick={() => onGoto(a.action)}>
                <Icon name={a.ok ? "todo" : "warning"} size={14} />
                <span>{a.text}</span>
              </button>
            ))}
            <div className="panel-sub">Vor der Abgabe abhaken</div>
            {MANUAL_ITEMS.map((item) => (
              <label key={item.id} className={`check-row manual ${checklist?.[item.id] ? "ok" : ""}`}>
                <input type="checkbox" checked={Boolean(checklist?.[item.id])} onChange={(e) => onToggle(item.id, e.target.checked)} />
                <span>{item.text}</span>
              </label>
            ))}
            <div className="muted small" style={{ padding: "10px 8px" }}>Der Haken wird im Projekt gespeichert (.local-overleaf/config.json). Die Checkliste im LEITFADEN.md ergänzt diese Liste.</div>
          </>
        )}
        {tab === "phrases" && (
          <>
            <div className="row" style={{ padding: "4px 8px" }}>
              <button type="button" className={`chip ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>
                English
              </button>
              <button type="button" className={`chip ${lang === "de" ? "on" : ""}`} onClick={() => setLang("de")}>
                Deutsch
              </button>
            </div>
            {PHRASES[lang].map((g) => (
              <div key={g.group}>
                <div className="panel-sub">{g.group}</div>
                {g.items.map((p, i) => (
                  <button key={i} type="button" className="phrase-row" onClick={() => onInsert(p)} title="An der Cursorposition einfügen">
                    {p}
                  </button>
                ))}
              </div>
            ))}
            <div className="muted small" style={{ padding: "10px 8px" }}>Klick fügt den Satz an der Cursorposition ein – Platzhalter (…) danach ersetzen.</div>
          </>
        )}
      </div>
    </>
  );
}
