# Conferência dos impressos

Compara os PDFs do Inno com os do AppClinic, página a página.

1. `referencia.py` roda os `reports.py` originais do AppClinic (ReportLab) com um banco falso em memória, a partir de `dados.json`.
2. `gera_inno.js` sobe o Inno num SQLite com os mesmos dados e baixa cada PDF.
3. `compara.py` converte as páginas em imagem e mostra quantos pixels mudam (e grava `out/lado_<nome>.png`: AppClinic, Inno e a sobreposição).

```bash
npm install                                   # inclui o better-sqlite3 (desenvolvimento)
pip install reportlab pillow
node tools/impressos/gera_inno.js
cd tools/impressos
APPCLINIC=../../../appclinic python3 -I referencia.py $PWD/out/ficha.ref.pdf ficha id=1
python3 compara.py ficha
```
