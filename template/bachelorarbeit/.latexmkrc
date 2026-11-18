# Für die Kommandozeile (latexmk -pdf main.tex) – ThesisLeaf selbst nutzt
# diese Datei nicht, sondern ruft pdflatex/biber direkt auf.
$pdf_mode = 1;
$bibtex_use = 2;
$pdflatex = 'pdflatex -synctex=1 -interaction=nonstopmode -file-line-error %O %S';
$biber = 'biber %O %S';
$out_dir = '.local-overleaf/build';
