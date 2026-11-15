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

## Modo MySQL

Com `MYSQL=1`, os dois sistemas rodam sobre MySQL/MariaDB (como no servidor) em vez de
SQLite: o comparador cria os bancos `cmp_django` e `cmp_inno` (usuário/senha em
`MYSQL_USER`/`MYSQL_PASSWORD`, padrão `teste`/`teste`; o Django precisa do `pymysql`).

## Rodar (na raiz do inno)

```bash
python3 tools/testes/rotas_django.py ../appclinic > /tmp/django.txt
ROTAS=/tmp/django.txt node tools/comparacao/compara.js ../appclinic ~/venv-dj/bin/python
node tools/comparacao/compara.js ../appclinic ~/venv-dj/bin/python tools/comparacao/roteiro-telas.js
node tools/comparacao/compara.js ../appclinic ~/venv-dj/bin/python tools/comparacao/roteiro-metodos.js
```

- `roteiro.js`: um GET em cada endereço, com parâmetros que as telas usam.
- `roteiro-telas.js`: o que as telas gravam (paciente, agenda, prontuário, recibo...).
- `roteiro-atestado.js`: a aba de atestado (lista, seleção com o CID, gravação, impressão).
- `roteiro-metodos.js`: cada endereço com GET, POST, PUT, PATCH e DELETE.
- `metodos_django.py`: gera `server/metodos-django.json` (que o Inno usa para responder
  aos métodos como o Django: 405 nas views em classe, qualquer método nas em função).
- `teste_settings.py`: o settings.py do AppClinic com SQLite (não altera o AppClinic).

O comparador confere as tabelas depois de cada passo e mostra o primeiro passo em que
cada uma diverge (fora os logs e as preferências do usuário).

Diferenças esperadas (estão no README, "Diferenças em relação ao AppClinic"): o login
sem "next" e as preferências criadas com `ultimo_pac = 0`.
