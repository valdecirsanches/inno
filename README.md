# Inno

O AppClinic (EDS Solution / INNO Osasco) reescrito em **Node.js**, sem Django e sem Python.

- **Mesmas telas:** os templates, CSS, JavaScript e imagens são os do AppClinic 2.0.17. Quem usa não percebe a troca.
- **Mesmo banco:** usa o MySQL do AppClinic, com as mesmas tabelas. Os usuários entram com as senhas que já usam, e os dois sistemas podem rodar juntos enquanto você compara.
- **Mesmos endereços e respostas:** cada rota devolve o mesmo HTML e o mesmo JSON que o Django devolvia. Isso foi conferido por um teste automático que roda os dois lado a lado no mesmo banco.

## Instalação

Requisito: Node.js 18 ou mais novo.

```bash
git clone git@github.com:valdecirsanches/inno.git
cd inno
npm install --omit=dev
cp .env.exemplo .env      # e preencha: SECRET_KEY e os dados do MySQL
npm start
```

O Inno sobe na porta do `.env` (`PORTA`, padrão 8002), então dá para usar junto com o AppClinic na 8001.

Para manter rodando no servidor, use o `pm2`:

```bash
npm install -g pm2
pm2 start server/index.js --name inno
pm2 save
```

## Configuração (.env)

| Variável | Para quê |
|---|---|
| `PORTA` | porta do servidor |
| `SECRET_KEY` | chave das sessões. Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | o MySQL do AppClinic |
| `NUVEM_URL` | a nuvem onde ficam as imagens e anexos (ex.: `http://127.0.0.1:5190`, a de `~/apps/nuvem`) |
| `NUVEM_TIPO` | `simples` (padrão: a nuvem de `~/apps/nuvem`, rotas `/upload` e `/download/:id`) ou `cloud-storage` |
| `NUVEM_API_KEY` | só para `NUVEM_TIPO=cloud-storage`: a chave do Inno no `config/clients.json` dele |
| `MEDIA_ROOT` | a pasta `media/` do AppClinic; só é lida, para copiar os arquivos antigos para a nuvem |
| `DEBUG` | `1` mostra o erro completo na tela; só para desenvolvimento |
| `MEMED_API_KEY`, `MEMED_SECRET_KEY`, `MEMED_DATA_TOKEN` | as chaves da Memed (as do `settings.py` do AppClinic) |

O `.env` nunca vai para o GitHub.

### Imagens e anexos na nuvem

As imagens e anexos do prontuário ficam **só** na nuvem: o Inno não grava arquivo nenhum no
disco, e sem `NUVEM_URL` o envio dá erro. As tabelas do AppClinic continuam com o mesmo caminho
de sempre (`extras/<paciente>/<ano>/<mês>/<dia>/<arquivo>`); a ligação "caminho → id na nuvem"
fica na tabela `inno_nuvem`, só do Inno, criada sozinha no primeiro envio (o usuário do MySQL
precisa de permissão para criar tabela). `/media/...` e o download buscam o arquivo na nuvem.

O AppClinic usa a **mesma nuvem e a mesma tabela** (`appClinic/nuvem.py` no repositório dele): o que
um envia, o outro vê. Um arquivo que ainda não está na nuvem (enviado antes dessa mudança, na pasta
`media/`) é lido da pasta `MEDIA_ROOT` (só leitura) e copiado para a nuvem na mesma hora, nos dois
sistemas; a nuvem vai se completando sozinha, e `tools/nuvem/migra-media.js` copia tudo de uma vez.
Imagens perdidas em outras pastas (uma subpasta por paciente, com o id no nome, ex.: `.../media/extras/123/...`)
voltam para o prontuário com `node tools/nuvem/recupera-imagens.js --simular <pasta> [<pasta>...]` (mostra o que
faria) e, sem `--simular`, recupera: cada arquivo vai para a nuvem e ganha um registro em Imagens e anexos do
paciente (última consulta do paciente; data pelas pastas ano/mês/dia ou pela do arquivo). O arquivo **mantém a
mesma estrutura e o mesmo nome** da origem (`.../extras/123/2024/05/10/foto.png` fica `extras/123/2024/05/10/foto.png`
no banco e na nuvem), para ser fácil de achar e de restaurar; só se o caminho já estiver ocupado por outro arquivo
(conteúdo diferente) o nome ganha um sufixo, como no Django, e só se o caminho passar de 100 caracteres (o limite do
campo do anexo) o fim do nome é encurtado, mantendo a pasta e a extensão. Arquivo que já tem registro com o mesmo caminho só é
copiado para a nuvem; arquivo com o mesmo conteúdo já no prontuário é pulado, então pode rodar de novo; arquivo que
ficou na nuvem sem registro (uma rodada que falhou) ganha o registro sem ser enviado de novo. As pastas
de origem nunca são alteradas.

O roteiro `tools/comparacao/roteiro-extras.js` confere os dois lado a lado (precisa de uma nuvem
rodando e `NUVEM_URL`).

1. No `.env` do Inno: `NUVEM_URL=http://127.0.0.1:5190` (a nuvem de `~/apps/nuvem`, na mesma máquina).
2. `node tools/nuvem/testa.js` testa tudo (endereço, tabela, envio e leitura de um arquivo de teste)
   e diz onde parou.
3. Copie os arquivos que já existem na `media/` do AppClinic: `node tools/nuvem/migra-media.js --simular`
   mostra o que vai ser enviado; sem `--simular`, envia. Pode rodar de novo: o que já foi enviado
   é pulado, e nada é apagado da pasta.
4. Reinicie o Inno (`pm2 restart inno`). O erro completo de cada falha fica em `logs/erros.log`.

Com `NUVEM_TIPO=cloud-storage`, o Inno usa o [cloud-storage](https://github.com/valdecirsanches/cloud-storage)
(versão atual ou antiga), com a chave em `NUVEM_API_KEY`.

## O que já está convertido

| Etapa | Módulos | Situação |
|---|---|---|
| 1 | Login, saída, troca de senha, tela inicial, menu, cadastro de pacientes (busca, cadastro, consultas, recibos), listas de convênios, planos e médicos | pronta |
| 2 | Agenda de consultas (lista do dia, calendário, agendar, status, chegada, confirmação, abrir/gerar/desativar agenda, horários, cores, gráficos), listas de procedimentos e especialidades, `/api/especialidade/` | pronta |
| 2b | Atendimento, histórico do paciente e API da agenda | pronta |
| 3 | Prontuário (anamnese, exames, prescrições, relatórios, documentos) | pronta |
| 3b | Impressos em PDF: ficha e recibo do paciente, agenda do dia, resumo de atendimentos, atestado, pedido de exame, receita (comum e de controle especial), relatório e resumo do prontuário | pronta |
| 4 | Configurações (modelos de exames, prescrições e relatórios do médico), busca de CID (`/cadastros/LocalizaCID/`) | pronta |
| 4b | Cadastros: especialidades, planos de saúde, médicos (tela, busca, horários, gravação), convênios e clínicas (telas e `convenio.json` / `clinica.json`), filtro e resumo de atendimentos | pronta |
| 4c | API de médicos e horários (`/api/medico/`, `/api/medico/horario/`: lista, detalhe, gravação, CID-10, dados para a Memed, criar e limpar horários) | pronta |
| 5 | Segurança (tela de usuários e `usuario.json`: lista, gravação e exclusão), painel (`/painel/`), logs de auditoria (`/logs/painel/`, `/logs/gerenciar/`), opções de presença do paciente (`/opcoesPresenca/`, `/confirmar-presenca-efetivo/`, `/cancelar-presenca-efetivo/`) | pronta |
| 6a | API da Memed (`/api/memed/`: médico como prescritor, situação do cadastro, acesso da aba Memed do atendimento, sincronização de especialidades) | pronta |
| 6b | WhatsApp: API (`/api/whatsapp/`: envio da confirmação, texto da agenda, QR code, início e reinício da sessão, foto do contato), `/whatsapp/...` e o robô que lê as respostas dos pacientes (`/webhook/resposta/`) | pronta |
| 7 | Admin do Django (`/admin/...`) | a fazer |

O Inno atende todos os endereços do AppClinic, menos o admin do Django (`/admin/`). O que se fazia
por lá e já tem caminho no Inno: redefinir senha (botão **Redefinir senha** na tela de Usuários,
só para administradores) e ver os logs (`/logs/painel/`). O que ainda só o admin faz: marcar um
usuário como staff/superusuário e mexer em grupos e permissões do Django.

### Deixando o AppClinic

O Inno já pode ser o sistema principal. Antes de desligar o AppClinic:
1. **Webhook do WhatsApp:** o WAHA manda as respostas dos pacientes para o endereço configurado
   nele (`WHATSAPP_HOOK_URL` / webhook da sessão). Troque o endereço do AppClinic pelo do Inno
   (`http://<servidor>:<porta do Inno>/webhook/resposta/`), senão o robô para de responder.
2. **Imagens antigas:** rode `node tools/nuvem/migra-media.js` para levar à nuvem o que ainda está
   só na pasta `media/` do AppClinic, e mantenha a pasta (o Inno ainda a lê se faltar algo).
3. **Tarefas agendadas:** confira `crontab -l` no servidor; se algo chama o AppClinic, aponte para o Inno.
4. Pare o gunicorn do AppClinic.

## Como está organizado

```
server/
  index.js           servidor (Express)
  config.js          lê o .env
  db.js              acesso ao MySQL; converte cada coluna para o tipo que o Django usava
  modelos.json       definição das tabelas (exportada dos modelos do AppClinic)
  templates.js       telas (Nunjucks), imprimindo valores como o Django
  seguranca/         senhas no formato do Django, sessão, CSRF, login obrigatório
  util/drf.js        o papel do Django REST Framework nas rotas /api/
  util/orm.js        get(), int(), strptime() etc. com os mesmos erros do Django
  util/modelo.js     validação e gravação como o formulário e o save() do Django,
                     com o log de auditoria em tb_usuarios_log
  util/pdf.js        PDFs no lugar do ReportLab (mesmas medidas e mesmo layout)
  fontes/            fontes Bitstream Vera (as mesmas do ReportLab; licença livre)
  rotas/             uma pasta por módulo, com os mesmos endereços
templates/           as telas do AppClinic, convertidas para Nunjucks
static/              CSS, JS e imagens do AppClinic
tools/               scripts da conversão (rodam uma vez, no AppClinic, não no servidor)
                     e tools/impressos/, que confere os PDFs contra os do AppClinic;
                     tools/testes/ tem os testes das rotas (node tools/testes/etapa5.js etc.)
                     e a conferência de cobertura (cobertura.js: todos os endereços do AppClinic)
```

## Conferência com o AppClinic

`tools/comparacao/` sobe o AppClinic original (Django) e o Inno com cópias do mesmo banco
de teste e faz as mesmas requisições nos dois, comparando as respostas e as tabelas a cada
passo: 274 leituras (todos os endereços), 126 gravações (paciente, recibo, agenda,
prontuário, cadastros, configurações, usuários) e 837 combinações de endereço e método HTTP.
Fora as diferenças abaixo, as respostas e o banco ficam iguais.

## Versões e novidades

A versão (o "Release" do menu) e o histórico do que mudou em cada atualização ficam em
`versoes.json`, o mesmo arquivo no Inno e no AppClinic (`appClinic/versoes.py` lê lá; o
`RELEASE` do `.env` não é mais usado). A tela **Novidades** (`/versoes/`, clicando em Release)
mostra o histórico, e depois de cada atualização aparece uma vez, em cada navegador, o aviso
"Sistema atualizado". O número da versão também vai no endereço do CSS e do JS, então o navegador
baixa tudo de novo sem Ctrl+F5.

Para registrar uma versão (grava nos dois sistemas):

```
node tools/versao/nova.js 2.4.1 "Título" novo:"o que entrou" melhoria:"o que melhorou" correcao:"o que foi corrigido"
node tools/versao/nova.js --lista      # versões registradas
node tools/versao/nova.js --confere    # Inno e AppClinic com o mesmo versoes.json?
node tools/versao/nova.js --silenciosa 2.4.4 "Correções internas" correcao:"..."
```

Versão **silenciosa** (só correções internas): entra em Novidades, mas não mostra o aviso
"Sistema atualizado" (o aviso anuncia a última versão que não é silenciosa).

### Correções internas (2.4.3)

Corrigidas nos dois sistemas, sem mudar nenhuma tela:
- Usuários: o formulário não manda "ativo", "nome", "equipe" e "código", e o Django gravava
  `is_active = False` (a conta salva pela tela não entrava mais) e apagava o nome. Agora o
  campo que a tela não manda fica como estava (usuário novo: o padrão, ativo).
  Para achar e reativar contas desativadas assim: `node tools/manutencao/usuarios-inativos.js`
  (só lista) e `--reativa 3,7`.
- Especialidades: a confirmação de salvar e de excluir lia um campo que não existe e travava.
- Médicos: médico sem especialidade (chave vazia) pode ser salvo.
- Preferências (`tb_usuarios_opcoes`): criadas no login quando o usuário não tem; no Inno,
  também ao salvar paciente / abrir as consultas dele.
- Agenda: horário sem período não derruba mais o calendário de dias livres (DDHLivres).
- Painel de chamada: relógio em `static/javascripts/Tarefas/relogio.js` (o `js/clock.js` não
  existia); tiradas as chamadas a `ion.sound.js` e `Base/ajax.js`, que também não existem.
- Logs: sem registros, a tabela abria com erro (linha com colspan na DataTable).
- Convênios: tirado o `<script src="/static/js/">` vazio.
- Pacientes: sem paciente aberto, a tela não dá mais erro de JavaScript.
- Auditoria: o log não guarda mais o hash da senha (`password` vira `***`).

### Revisão do prontuário (2.4.4)

Testado no navegador, aba por aba: anamnese, exame físico, hipótese, evolução (salvar ao sair do
campo); exames, prescrições (com remédios), relatórios e atestado (novo, salvar, editar, imprimir,
clonar, apagar, salvar como padrão e aplicar padrão); resumo; encerrar consulta; consulta passada;
histórico e impressão do prontuário inteiro. Corrigido nos dois sistemas:
- Pesquisa de paciente (`LocalizaPaciente`): paciente sem clínica (ou com a clínica apagada)
  derrubava a pesquisa inteira; agora vem com a clínica em branco.
- Salvar como padrão sem descrição chamava `swal.showInputError` (do sweetalert antigo) e travava.
- Anamnese: depois de salvar recarregava com `data.success.paciente`, que a resposta não traz
  (GET sem paciente, erro 500); agora usa o id e a data que a resposta traz.
- Textos: "relat´rio" e "Ano de Pesquise".
Teste: `node tools/testes/prontuario.js`.

### Padrões de exame, prescrição e relatório (2.4.5)

- "Salvar como padrão" (o `+` ao lado de Padrões), nos dois sistemas:
  - a tela grava o registro antes (logo depois de "Novo" o id ainda era 0) e manda o id dele;
  - nome repetido só conta entre os padrões do mesmo médico e volta `{"error": "existe"}`
    (antes: `HttpResponse(..., mimetype=...)`, erro 500, sem aviso); registro inexistente volta
    `{"error": "salve"}`; a tela avisa nos dois casos;
  - relatório: o padrão vai para a lista do médico do usuário (sem médico, a do relatório).
- Configurações > Exames, Prescrições e Relatórios: o JavaScript chamava funções que não
  existiam e endereços que não existem; reescrito com os endereços que existem (Carrega/Salva/
  Exclui...Conf...). Prescrições: a lista de remédios do padrão aparece (a resposta vem em
  `success`), o botão do remédio não envia mais o formulário, e editar/excluir remédio funcionam.
- (2.4.6) Padrão de prescrição: a coluna do médico não aceita vazio. Usuário sem médico vinculado
  dava erro 500 ("Erro ao adicionar ... como prescrição padrão"); agora o padrão fica com o médico
  da prescrição (sem nenhum dos dois: `{"error": "medico"}` e a tela explica), "controle especial"
  vazio vira "não", e esse usuário vê os padrões de prescrição de todos os médicos.
- (2.4.7) Exclusões com filhos (chave DO_NOTHING; no MySQL: "Cannot delete or update a parent
  row"): prescrição e padrão de prescrição apagam os remédios junto; exame apagado deixa o anexo
  (`tb_extra`) no prontuário sem o vínculo. Inno: `DEPENDENTES` em `server/util/modelo.js`;
  AppClinic: `delete()` de `TbPrescricoes`, `TbConfPrescricoes` e `TbExames`. No Inno, qualquer
  outra exclusão barrada por chave estrangeira responde "Não foi possível excluir: este registro
  está em uso em outro cadastro (tabela)." em vez do SQL (o banco de teste, SQLite, não tem as
  chaves estrangeiras: estes casos só aparecem no MySQL).
- (2.4.8) Regra única para os três padrões (exame, prescrição, relatório): salvar como padrão usa
  o médico do usuário ou, sem médico vinculado, o do registro; a lista mostra os padrões do médico
  do usuário ou, sem médico vinculado, os de todos (antes o relatório salvo não aparecia); salvar
  na tela de Configurações mantém o médico do padrão quando o usuário não tem médico. Relatórios
  em ordem alfabética. Exame / padrão sem CID (`cid10` nulo) abre (antes `None.split`, erro 500).
- (2.4.9) Excluir anexo (Imagens e anexos): o log de auditoria falhava com "FieldFile is not JSON
  serializable" e a exclusão não acontecia (o Inno imitava isso). Agora o log guarda o caminho do
  arquivo (AppClinic: `convert_json_safe` em `logs/signals.py`) e o registro é apagado; o arquivo
  fica na nuvem, que não tem exclusão. O botão Excluir tinha a aspa do `class` aberta.
- (2.4.10) Convênio da consulta: a consulta (`tb_agendas.id_convenio`) guarda o convênio do
  paciente no dia em que foi marcada, e o cabeçalho do atendimento mostra esse. Agora, ao salvar o
  paciente com outro convênio, as consultas dele em aberto (data de hoje em diante e status
  AGENDADO, AGUARDANDO ou ATENDIMENTO) passam para o novo; as atendidas ficam como estavam.
  Consultas já marcadas antes disso: `node tools/manutencao/convenio-consultas.js` (lista) e
  `--corrige`. (2.4.11) Além disso, ao abrir o atendimento (`IniciaAtendimento`) de uma consulta
  em aberto, o convênio dela é acertado para o do cadastro antes de montar o cabeçalho.
- (2.4.18) Janela do WhatsApp na agenda (`agenda_texto`): a situação da conexão era a da sessão da
  clínica de quem marcou a consulta (`ag.fk_usuario`), mas o envio sai pela clínica de quem está
  usando (`request.user`); com sessões/provedores diferentes, a tela pedia QR Code com o WhatsApp
  conectado. Agora usa a do usuário (sem clínica: a de quem marcou). Erro da Evolution: a mensagem
  vem de `response.message` (antes só "Internal Server Error"). (2.4.19) A linha "Conectado à ..."
  (`host_ident`) mostra "Evolution API <url> ( <sessão de quem envia> )" quando o envio sai pela
  Evolution; com o WAHA, continua como era.
- (2.4.12) Médico do documento: aplicar padrão de prescrição/relatório (`UtilizaConf...`) gravava
  o médico do usuário, vazio para usuário sem médico vinculado (o botão Novo já usava o da consulta);
  agora usa o da consulta. Imprimir exame/relatório/prescrição sem médico gravado (usuário sem
  médico) dava `'NoneType' object has no attribute 'medico'`; agora usa o médico da consulta.
- (2.4.9) Nome: "Inno" no `<title>` das páginas (era "AppClinic 2.0") e no rodapé dos impressos
  (era "AppClinic 1.0"), nos dois sistemas.

## WhatsApp: WAHA ou Evolution API

Cada clínica usa o WAHA (padrão) ou a Evolution API. Quem escolhe é o superusuário ou o
administrador, no cadastro da clínica ("Servidor do WhatsApp"); a escolha fica na tabela
`tb_clinica_whatsapp` (a mesma no AppClinic, criada na primeira gravação) e o endereço do WAHA
da clínica fica guardado para voltar a ele. O servidor da Evolution vem do `.env`
(`EVOLUTION_URL`, `EVOLUTION_API_KEY` e, opcional, `EVOLUTION_WEBHOOK_URL`) e a instância tem o
nome do "ID da sessão" da clínica. Ao conectar pelo QR Code, a instância é criada e o webhook
das respostas (`/webhook/resposta/`, evento `MESSAGES_UPSERT`) é configurado nela.
O `WhatsAppService` (`server/util/whatsapp.js`) e o robô traduzem os pedidos e eventos do WAHA
para a Evolution (`server/util/evolution.js`, fonte única com `WhatsApp/evolution.py`).
O endereço e a chave do WAHA também vêm do `.env` (`WAHA_URL`, `WAHA_API_KEY`); a tela da clínica
não mostra mais o endereço (o campo fica escondido, para não apagar o valor gravado, que só vale
sem `WAHA_URL`). O botão "Webhook" da clínica (`/api/whatsapp/webhook/`) mostra o webhook esperado,
o gravado no servidor (Evolution: `/webhook/find`; WAHA: `config.webhooks` da sessão), o estado da
conexão e a última resposta que chegou (`tbWhatsappLog`); na Evolution o super/administrador
aplica o webhook por ali, e "Testar o endereço" faz o próprio servidor chamar o webhook.
Ao conferir a conexão de uma instância já conectada, o webhook é gravado de novo.
O botão mostra também as últimas mensagens recebidas e o que o robô fez com cada uma (o resultado
de cada evento fica gravado em `tbWhatsappLog` logo depois dele, com `tipo: resultado_webhook`).
Resposta de um contato `@lid` sem o telefone no evento: na Evolution, o telefone é procurado nos
contatos da instância (`/chat/findContacts`) e em qualquer chave do evento (senderPn, participantPn...).
Com "Webhook by Events" ligado, a Evolution chama `/webhook/resposta/<evento>` (ex.:
`/webhook/resposta//messages-upsert`); esse endereço também é aceito, e "Aplicar no servidor"
desliga a opção (`webhookByEvents: false`).
Teste: `node tools/testes/evolution/roda.js ../appclinic ~/venv-dj/bin/python` (Evolution e WAHA
falsos; o mesmo roteiro passa no AppClinic e no Inno).

## WhatsApp: logo no topo da mensagem

A confirmação de consulta e as respostas ao paciente (confirmado / cancelado) saem numa
mensagem só: a logo da clínica (`static/img/neuro100.png`) no topo e o texto como legenda
(`enviar_texto_com_logo`, igual no Inno e no AppClinic). A imagem vai embutida no envio, sem o
WAHA precisar baixá-la do servidor; se o WAHA recusar a imagem, o texto sai sozinho (sem
resposta do WAHA não reenvia, para não chegar em dobro). Sempre uma mensagem só. Teste:
`node tools/testes/whatsapp-logo.js`.

## Visual dos cadastros auxiliares

Clínicas, Médicos, Convênios, Especialidades, Planos de saúde e Usuários têm um visual
novo (pedido do dono), igual no Inno e no AppClinic: cabeçalho com ícone, lista com busca,
iniciais coloridas e contador, formulário em seções com o selo "Novo cadastro" / "Editando",
botões Novo e Salvar no rodapé do formulário e Ctrl+S para salvar.
O estilo fica em `static/css/Cadastros/cadastros.css` (tudo dentro de `.cad-page` / `.cad-heroi`)
e o acabamento em `static/javascripts/Cadastros/cadastros-ui.js`; os ids, campos e funções
que o JavaScript de cada tela usa continuam os mesmos. Os templates dessas telas são os mesmos
nos dois sistemas (no AppClinic com `{% static %}` / `{% url %}`): mudou num, mude no outro.
De quebra, duas falhas antigas foram corrigidas nos dois:
- Usuários: o botão Novo chamava uma função que não existe (`addUsuario`) e, com o campo id
  vazio, salvar um usuário novo dava erro 500; agora Novo limpa o formulário e o id começa em 0.
- Especialidades: Novo deixava no formulário o grupo e o nome do registro aberto; agora limpa.

Usuários tem também o botão **Redefinir senha** (`POST /seguranca/usuario/senha/`, view `UsuarioSenha`
no AppClinic): aparece só para administradores e só com um usuário aberto; grava a senha nova e,
se for a do próprio administrador, ele continua conectado.

## Diferenças em relação ao AppClinic

O Inno reproduz até os erros do AppClinic, porque as telas contam com eles. As exceções, todas a favor do usuário:

- Entrar pela página `/login/` direto não leva mais a uma página "não encontrada" (`/login/None`).
- Endereços chamados sem a barra final respondem direto, sem o redirecionamento extra.
- A primeira vez que um usuário sem preferências salvas abre um paciente (ou a agenda), o Django dava erro. O Inno cria as preferências com os valores padrão.
- Impressos: o nome do arquivo com acento (resumo de atendimentos) vai no formato MIME (`=?utf-8?b?...?=`), porque o Node não envia latin-1 cru no cabeçalho.
- Criar horários com intervalo negativo travava o AppClinic num laço sem fim; o Inno ignora esse intervalo.
- Ao abrir a agenda, se a lista de médicos chegava antes do calendário ter data, a tela pedia a agenda de "NaN-NaN-NaN" e recebia erro. O Inno espera a data.
- WhatsApp e Memed: quando o servidor de fora não responde, algumas respostas trazem o texto do erro de rede (`"error": "..."`). O texto é parecido com o do Python (`HTTPConnectionPool(...): Max retries exceeded...`), mas não idêntico, porque vem do Node.
- Atestado antigo: o CID gravado que não está na tabela de CID (ex.: "G43") não aparecia
  ao selecionar o atestado, e o salvamento seguinte apagava o CID. O Inno mostra o código.
- Atestado (e as outras seções do prontuário) gravado sem usuário ou sem médico: salvar e
  imprimir davam "Este campo não pode ser nulo.". O Inno aceita a chave vazia.
