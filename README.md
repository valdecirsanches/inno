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
| `NUVEM_URL`, `NUVEM_API_KEY` | o servidor [cloud-storage](https://github.com/valdecirsanches/cloud-storage) e a chave do Inno no `config/clients.json` dele: é lá que ficam as imagens e anexos |
| `MEDIA_ROOT` | a pasta `media/` do AppClinic; só é lida, para copiar os arquivos antigos para a nuvem |
| `DEBUG` | `1` mostra o erro completo na tela; só para desenvolvimento |
| `MEMED_API_KEY`, `MEMED_SECRET_KEY`, `MEMED_DATA_TOKEN` | as chaves da Memed (as do `settings.py` do AppClinic) |

O `.env` nunca vai para o GitHub.

### Imagens e anexos na nuvem

As imagens e anexos do prontuário ficam **só** no cloud-storage (criptografados lá): o Inno
não grava arquivo nenhum no disco, e sem `NUVEM_URL`/`NUVEM_API_KEY` o envio dá erro. O banco
continua com o mesmo caminho de sempre (`extras/<paciente>/<ano>/<mês>/<dia>/<arquivo>`), que
vira o nome do arquivo na nuvem; `/media/...` e o download buscam o arquivo lá.

1. No servidor do cloud-storage, crie uma chave para o Inno no `config/clients.json`
   (`openssl rand -base64 32`), com o `id` `inno`.
2. No `.env` do Inno: `NUVEM_URL=https://cloud.x-star.com.br` e `NUVEM_API_KEY=<a chave>`.
3. Copie os arquivos que já existem na `media/` do AppClinic: `node tools/nuvem/migra-media.js --simular`
   mostra o que vai ser enviado; sem `--simular`, envia. Pode rodar de novo: o que já está lá
   é pulado, e nada é apagado da pasta.
4. Reinicie o Inno.

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

Enquanto a conversão não termina, use o Inno só para conferir os módulos prontos. O AppClinic continua sendo o sistema principal.

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

## Diferenças em relação ao AppClinic

O Inno reproduz até os erros do AppClinic, porque as telas contam com eles. As exceções, todas a favor do usuário:

- Entrar pela página `/login/` direto não leva mais a uma página "não encontrada" (`/login/None`).
- Endereços chamados sem a barra final respondem direto, sem o redirecionamento extra.
- A primeira vez que um usuário sem preferências salvas abre um paciente (ou a agenda), o Django dava erro. O Inno cria as preferências com os valores padrão.
- Impressos: o nome do arquivo com acento (resumo de atendimentos) vai no formato MIME (`=?utf-8?b?...?=`), porque o Node não envia latin-1 cru no cabeçalho.
- Criar horários com intervalo negativo travava o AppClinic num laço sem fim; o Inno ignora esse intervalo.
- Imagens e anexos ficam só na nuvem (cloud-storage), não na pasta `media/` como no AppClinic; o banco guarda o mesmo caminho.
- Ao abrir a agenda, se a lista de médicos chegava antes do calendário ter data, a tela pedia a agenda de "NaN-NaN-NaN" e recebia erro. O Inno espera a data.
- WhatsApp e Memed: quando o servidor de fora não responde, algumas respostas trazem o texto do erro de rede (`"error": "..."`). O texto é parecido com o do Python (`HTTPConnectionPool(...): Max retries exceeded...`), mas não idêntico, porque vem do Node.
- Atestado antigo: o CID gravado que não está na tabela de CID (ex.: "G43") não aparecia
  ao selecionar o atestado, e o salvamento seguinte apagava o CID. O Inno mostra o código.
- Atestado (e as outras seções do prontuário) gravado sem usuário ou sem médico: salvar e
  imprimir davam "Este campo não pode ser nulo.". O Inno aceita a chave vazia.
