"""Beispielmodul - wird in kapitel/04-umsetzung.tex per \\lstinputlisting eingebunden.

Eigenen Quellcode entweder hier in code/ ablegen oder den Projektordner der
Software in ThesisLeaf als verknüpften Ordner (@name) einbinden.
"""

from dataclasses import dataclass


@dataclass
class Ergebnis:
    anzahl: int
    mittelwert: float


def verarbeite(daten: list[float], schwellwert: float = 0.5) -> Ergebnis:
    """Filtert Werte oberhalb des Schwellwerts und bildet den Mittelwert."""
    relevant = [x for x in daten if x >= schwellwert]
    if not relevant:
        return Ergebnis(anzahl=0, mittelwert=0.0)
    return Ergebnis(anzahl=len(relevant), mittelwert=sum(relevant) / len(relevant))


if __name__ == "__main__":
    print(verarbeite([0.2, 0.7, 0.9, 0.4]))
