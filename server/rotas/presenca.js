'use strict';
/**
 * Confirmação de presença pelo paciente (Agenda/Consultas/views.py do AppClinic),
 * páginas abertas pelo link do WhatsApp, sem login:
 *   /opcoesPresenca/?agenda=<consulta>-<paciente>   (OpcoesPresencaReactView)
 *   /confirmar-presenca-efetivo/                    (ConfirmaPresenca)
 *   /cancelar-presenca-efetivo/                     (CancelaPresenca)
 */
const db = require('../db');
const { render } = require('../templates');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const { obtem, int, erroPython } = require('../util/orm');
const { formata } = require('../util/formato-data');
const { pyStr } = require('../util/python');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const A = 'TbAgendaCons';

// strftime('%B') com o locale pt_BR.UTF-8 do servidor (glibc: minúsculas)
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** valor de filtro numérico do ORM: int() ou ValueError "Field 'id' expected a number" */
function numero(v) {
  const t = String(v === null || v === undefined ? '' : v).trim();
  if (!/^[-+]?\d+$/.test(t)) {
    const e = erroPython(`Field 'id' expected a number but got ${v === null ? 'None' : `'${v}'`}.`);
    e.valueError = true;
    throw e;
  }
  return parseInt(t, 10);
}

/** objeto relacionado; linha que sumiu: DoesNotExist */
async function rel(M, id) { return id === null || id === undefined ? null : obtem(M, { id }); }

/** _consulta_da_presenca(request) pela URL: exige consulta e paciente */
async function consultaDaPresenca(req) {
  const dados = req.method === 'POST' ? req.POST : req.GET;
  const idConsulta = dados.get('id_consulta') || req.GET.get('id_consulta', '0');
  const idPaciente = dados.get('paciente') || req.GET.get('paciente', '0');
  const q = db.tabela(A).where(db.coluna(A, 'id'), numero(idConsulta)).where(db.coluna(A, 'fk_paciente_id'), numero(idPaciente));
  const l = await q.limit(2);
  if (l.length !== 1) return null;
  return db.linha(A, l[0]);
}

/** f'{ag.data.strftime("%d de %B")} às {ag.hora.strftime("%H:%M")}' */
function quando(ag) {
  if (!ag.hora) throw erroPython("'NoneType' object has no attribute 'strftime'");
  const [, m, d] = String(ag.data).slice(0, 10).split('-');
  return `${d} de ${MESES[+m - 1]} às ${String(ag.hora).slice(0, 5)}`;
}

/** ConfirmaPresenca (confirmacao=1) / CancelaPresenca (confirmacao=2) */
function responde(novo, campoClinica) {
  return a(async (req, res) => {
    let ag;
    try {
      ag = await consultaDaPresenca(req);
    } catch (e) {
      if (!e.valueError) throw e;
      ag = null;
    }
    if (!ag) return json(res, { error: 'Consulta não encontrada' }, 404);
    const d = quando(ag);
    const nomePaciente = async () => pyStr(null, (await rel('TbPacientes', ag.fk_paciente_id) || erroNone('paciente')).paciente);
    let msg;
    if (ag.confirmacao === 1) {
      msg = `Olá ${await nomePaciente()},\nA sua consulta em ${d} \njá foi *c o n f i r m a d a !*`;
    } else if (ag.confirmacao === 2) {
      msg = `Olá ${await nomePaciente()},\nA sua consulta em ${d} \njá foi *c a n c e l a d a!*`;
    } else {
      ag.confirmacao = novo;
      ag.confirmacao_dh = db.agora();
      // TbAgendaCons.save(request): marca quem alterou (só com usuário logado)
      if (req.user && req.user.pk) {
        ag.id_usuario_alteracao = req.user.pk;
        ag.dh_alteracao = db.agora();
      }
      await modelo.salva(req, A, ag);
      const pac = await nomePaciente();
      const cl = await rel('TbClinica', ag.fk_clinica_id);
      if (!cl) throw erroNone(campoClinica);
      msg = `Olá ${pac},\nSua consulta em ${d} \n${pyStr(null, cl[campoClinica])}`;
    }
    json(res, { success: msg });
  });
}

const erroNone = (attr) => erroPython(`'NoneType' object has no attribute '${attr}'`);

module.exports = function (app) {
  app.get('/opcoesPresenca/', a(async (req, res) => {
    const prm = String(req.GET.get('agenda', '0')).split('-');
    const id = int(prm[0]);
    if (prm.length < 2) throw erroPython('list index out of range');
    const l = await db.tabela(A).where(db.coluna(A, 'id'), id).where(db.coluna(A, 'fk_paciente_id'), numero(prm[1]))
      .orderBy(db.coluna(A, 'id')).first();
    let ag = null;
    if (l) {
      const c = db.linha(A, l);
      // relacionados que sumiram: o template do Django engole o DoesNotExist
      const talvez = async (M, x) => { try { return await rel(M, x); } catch (e) { return null; } };
      ag = Object.assign({}, c, {
        fk_paciente: await talvez('TbPacientes', c.fk_paciente_id),
        fk_medico: await talvez('TbMedicos', c.fk_medico_id),
        data: formata(c.data, 'j \\d\\e F \\d\\e Y'),
        hora: c.hora === null ? null : formata(c.hora, 'H:i'),
      });
    }
    await render(res, 'Agenda/Consultas/OpcoesPresenca.html', { ag });
  }));
  // @csrf_exempt (em rotas/index.js), aceita GET e POST como a view do Django
  app.all('/confirmar-presenca-efetivo/', responde(1, 'whatsapp_confirma'));
  app.all('/cancelar-presenca-efetivo/', responde(2, 'whatsapp_cancela'));
};
