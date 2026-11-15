# Comparação lado a lado: AppClinic x Inno

Sobe o AppClinic original (Django) e o Inno, cada um com uma cópia do mesmo banco SQLite
de teste, faz as mesmas requisições na mesma ordem e mostra onde as respostas diferem.
No fim, compara as tabelas.

## Preparar (uma vez)

```bash
python3.11 -m venv ~/venv-dj
~/venv-dj/bin/pip install "Django==3.2.12" "djangorestframework==3.15.1" "django-filter==23.5" \
    "django-cors-headers==3.14.0" requests reportlab pillow num2words \
    "django-changed-fields==0.3.1" django-extra-fields psycopg2-binary
# o strftime('%B') do AppClinic precisa do locale pt_BR
sudo localedef -i pt_BR -f UTF-8 pt_BR.UTF-8
```

## Rodar (na raiz do inno)

```bash
python3 tools/testes/rotas_django.py ../appclinic > /tmp/django.txt
ROTAS=/tmp/django.txt node tools/comparacao/compara.js ../appclinic ~/venv-dj/bin/python
node tools/comparacao/compara.js ../appclinic ~/venv-dj/bin/python tools/comparacao/roteiro-telas.js
```

- `roteiro.js`: um GET em cada endereço, com parâmetros que as telas usam.
- `roteiro-telas.js`: o que as telas gravam (paciente, agenda, prontuário, recibo...).
- `teste_settings.py`: o settings.py do AppClinic com SQLite (não altera o AppClinic).

Diferenças esperadas (estão no README, "Diferenças em relação ao AppClinic"): o login
sem "next" e as preferências criadas com `ultimo_pac = 0`.
