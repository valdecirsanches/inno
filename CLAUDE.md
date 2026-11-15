# Inno: instruções para o Claude

O Inno é o AppClinic (Django, repositório `valdecirsanches/appclinic`) reescrito em Node.js,
com as mesmas telas, os mesmos endereços, as mesmas respostas e o mesmo banco MySQL.
O dono do projeto fala português: responda em português.

## Como continuar o trabalho

1. Leia o `README.md`: a tabela "O que já está convertido" diz o que está pronto e o que falta.
2. Traga o código original para conferir cada endereço: anexe e clone `valdecirsanches/appclinic`.
   Os endereços de cada módulo estão nos `urls.py` / `urls_api.py` dele, e a lista completa
   em `server/rotas-nomeadas.json`.
3. Converta um módulo por vez, teste, atualize a tabela do README e faça commit na `main`
   (é o fluxo combinado com o dono). Uma etapa por commit, mensagem em português.

## Regras da conversão

- **Fidelidade:** cada rota devolve o mesmo HTML/JSON que o Django, inclusive os erros
  (as telas contam com eles). Traduza linha a linha a view/ajax/report original.
- **Exceções só a favor do usuário** (travamentos, páginas quebradas). Toda exceção vai para
  a seção "Diferenças em relação ao AppClinic" do README.
- `str(None)` do Python vira `'None'` (use `pyStr`); `x or ''` continua `x || ''`.
- Erros do Python: use `erroPython('mensagem do Python')` (`server/util/orm.js`); viram 500.
- `try/except: pass` do original: engula o erro do mesmo jeito.

## Onde está cada coisa

- `server/rotas/`: um arquivo por módulo; registre os novos em `server/rotas/index.js`.
- `server/util/modelo.js`: formulários (`validaForm`, `camposDoForm`, `inicialEmTexto`),
  `salva` / `exclui` / `excluiLista` (com o log de auditoria em `tb_usuarios_log`).
- `server/util/viewset.js` + `server/util/serializers.js`: ModelViewSet/serializers do DRF
  para as rotas `/api/` (veja `server/rotas/api-medico.js` como exemplo).
- `server/util/pdf.js`: equivalente do ReportLab (canvas e platypus) para os impressos.
- `server/db.js`: acesso ao banco, com os tipos de `server/modelos.json`.
  O `modelos.json` tem também três tabelas acrescentadas à mão (o exportador não as gera):
  `TbUsuario_groups` e `TbUsuario_user_permissions` (as ManyToMany do usuário) e
  `LogEntry` (`django_admin_log`), que a exclusão de usuário apaga como o Django.
  Se exportar de novo, mantenha-as.

## Testes

- Banco de teste: SQLite montado a partir de `server/modelos.json` (`DB_CLIENT=better-sqlite3`).
  Exemplo completo em `tools/impressos/gera_inno.js` (cria as tabelas, faz login e chama as rotas).
- Rotas da etapa 5 (usuários, painel, logs, presença): `node tools/testes/etapa5.js`.
  Use como modelo para os testes das próximas etapas.
- Impressos (PDF): `tools/impressos/` roda os `reports.py` originais e compara página a página
  (veja `tools/impressos/LEIAME.md`). Rode de novo ao mexer em `server/util/pdf.js`.

## O que falta (atualize esta lista junto com o README)

- API da Memed (`/api/memed/`) e do WhatsApp (`/api/whatsapp/` e `/whatsapp/...`), que dependem dos serviços externos
- Admin do Django (`/admin/...`)
