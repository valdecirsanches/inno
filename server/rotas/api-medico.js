'use strict';
/**
 * /api/medico/: MedicoViewSet e HorariosViewSet (Cadastros/Medicos/views.py).
 * O router do AppClinic registra "horario" antes de "", então
 * /api/medico/horario/... nunca cai no detalhe de médico.
 */
const crypto = require('crypto');
const db = require('../db');
const viewset = require('../util/viewset');
const S = require('../util/serializers');
const { json } = require('../util/http');
const { relacionado, erroPython } = require('../util/orm');
const { formata } = require('../util/formato-data');

const col = (m, at) => db.coluna(m, at);
const s = (v) => (v === null || v === undefined ? 'None' : String(v));
const soDigitos = (v) => String(v || '').replace(/[^0-9]/g, '');

/** CurrentCPFHash (HiddenField): md5 dos dígitos do cpf enviado; '' sem cpf */
function cpfHash(req) {
  const d = req.data;
  const cpf = d && typeof d.get === 'function' ? d.get('cpf') : d && d.cpf;
  return cpf ? crypto.createHash('md5').update(String(cpf).replace(/[^\d]/g, '')).digest('hex') : '';
}

module.exports = function (app) {
  // ------------------------------------------------------- horários
  const H = 'TbHorarios';
  viewset.registra(app, '/api/medico/horario', {
    modelo: H,
    serializer: { declarados: [['deleted', S.pula], ['deleted_at', S.pula]] },
    paginar: false,
    filtros: { id: ['in'], fk_medico: ['exact'], dia_semana: ['exact'] },
    consulta: (req, detalhe) => {
      const q = db.tabela(H);
      if (detalhe) return q;
      const t = db.modelo(H).tabela;
      q.orderBy(`${t}.${col(H, 'hora')}`);
      db.like(q, `${t}.${col(H, 'agenda_periodo')}`, `%${String(req.GET.get('periodo', 'M')).replace(/[\\%_]/g, (c) => '\\' + c)}%`, { binario: true });
      q.where(`${t}.${col(H, 'fk_medico_id')}`, req.GET.get('fk_medico', 0));
      q.where(`${t}.${col(H, 'dia_semana')}`, req.GET.get('dia_semana', String(new Date().getDay())));
      return q;
    },
    acoes: [
      { nome: 'cria_horarios', url: 'cria-horarios', detalhe: false, metodos: ['post'], fn: (req, res) => criaHorarios(req, res) },
      { nome: 'limpa_horarios', url: 'limpa-horarios', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        const d = req.data;
        const pega = (k) => { const v = typeof d.get === 'function' ? (d.has(k) ? d.get(k) : undefined) : d[k]; if (v === undefined) throw erroPython(`'${k}'`); return v; };
        const medico = pega('medico'), dia = pega('dia_semana');
        const q = db.tabela(H);
        if (medico === null) q.whereNull(col(H, 'fk_medico_id')); else q.where(col(H, 'fk_medico_id'), medico);
        if (dia === null) q.whereNull(col(H, 'dia_semana')); else q.where(col(H, 'dia_semana'), dia);
        const modelo = require('../util/modelo');
        await modelo.excluiLista(req, H, db.linhas(H, await q));
        json(res, { success: 'Sucesso!' });
      } },
    ],
  });

  // --------------------------------------------------------- médicos
  const M = 'TbMedicos';
  const ser = serializerMedico();
  const hash = hashDoCpf;
  const acoes = [
    { nome: 'cid10', detalhe: false, metodos: ['get'], fn: async (req, res) => {
      const busca = req.GET.get('search', '');
      const results = [];
      if ([...busca].length > 1) {
        const C = 'CID10', p = `%${busca.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
        const q = db.tabela(C).where((w) => { db.like(w, col(C, 'codigo'), p); db.like(w, col(C, 'descricao'), p, { ou: true }); }).orderBy(col(C, 'codigo'));
        for (const c of db.linhas(C, await q)) results.push({ id: c.codigo, codigo: c.codigo, descricao: c.descricao });
      }
      json(res, { count: results.length, results });
    } },
    { nome: 'get_cid10', url: 'get-cid10', detalhe: false, metodos: ['get'], fn: async (req, res) => {
      const cids = req.GET.get('cids');
      if (cids === null) throw erroPython("'NoneType' object has no attribute 'split'");
      const C = 'CID10';
      const l = db.linhas(C, await db.tabela(C).whereIn(col(C, 'codigo'), cids.split(',')));
      json(res, l.map((c) => ({ title: `${c.codigo} | ${c.descricao}`, codigo: c.codigo, id: c.codigo, descricao: c.descricao, selected: true })));
    } },
    { nome: 'get_medico', url: 'get-medico', detalhe: false, metodos: ['post'], fn: async (req, res) => {
      let m = null;
      try { const x = await relacionado(M, req.user.fk_medico_id); m = x ? x.id : null; } catch (e) { m = null; }
      json(res, { success: m });
    } },
    { nome: 'doctor_local_get_all', url: 'doctor-local-get-all', detalhe: false, metodos: ['get'], fn: async (req, res) => {
      const l = db.linhas(M, await db.tabela(M));
      json(res, l.map((m) => ({ id: m.id, nome: m.medico, medico: m.medico, crm: m.crm, crm_uf: m.crm_uf, email: m.email })));
    } },
    { nome: 'get_doctor', url: 'get-doctor', detalhe: false, metodos: ['post', 'get'], fn: async (req, res) => {
      const id = req.GET.get('id');
      const { obtem } = require('../util/orm');
      if (id === null) throw erroPython('TbMedicos matching query does not exist.');
      const m = await obtem(M, { id: require('./cadastros').idFiltro(id) });
      json(res, { id: m.id, nome: m.medico, medico: m.medico, crm: m.crm, crm_uf: m.crm_uf, email: m.email });
    } },
    { nome: 'dados_para_memed', detalhe: true, metodos: ['post'], fn: async (req, res, o) => {
      if (o.clinicas_que_atende === null) throw erroPython("'NoneType' object has no attribute 'split'");
      const clns = o.clinicas_que_atende.split(',');
      for (const c of clns) if (!/^\s*[-+]?\d+\s*$/.test(c)) throw erroPython(`Field 'id' expected a number but got '${c}'.`);
      const C = 'TbClinica';
      const cl = db.linha(C, await db.tabela(C).whereIn(col(C, 'id'), clns).orderBy(col(C, 'id')).first());
      if (!cl) throw erroPython("'NoneType' object has no attribute 'nome'");
      json(res, {
        clinica_nome: cl.nome || '', clinica_bairro: cl.bairro || '', clinica_cidade: cl.cidade || '',
        clinica_endereco: cl.endereco || '', clinica_endereco_numero: cl.numero || '', clinica_telefone: soDigitos(cl.fone),
      });
    } },
    { nome: 'DoctorDataLocalRead', detalhe: true, metodos: ['get'], fn: async (req, res, o) => {
      if (!o.data_nascimento) throw erroPython("'NoneType' object has no attribute 'strftime'");
      const esp = await relacionado('TbEspecialidades', o.fk_especialidade_id);
      if (!esp) throw erroPython("'NoneType' object has no attribute 'nome'");
      const html = '<div>' +
        `<span>Nome: </Span><span style='color:Red'>${s(o.medico)}</Span><br/>` +
        `<span>Nascimento: </Span><span style='color:Red'>${formata(o.data_nascimento, 'd/m/Y')}</Span><br/>` +
        `<span>CPF: </Span><span style='color:Red'>${soDigitos(o.cpf)}</Span><br/>` +
        `<span>Gênero: </Span><span style='color:Red'>${s(o.genero)}</Span><br/>` +
        `<span>Celular: </Span><span style='color:Red'>${soDigitos(o.celular)}</Span><br/>` +
        `<span>CRM: </Span><span style='color:Red'>${s(o.crm)}-${s(o.crm_uf)}</Span><br/>` +
        `<span>Email: </Span><span style='color:Red'>${s(o.email)}</Span><br/>` +
        `<span>Especialidade: </Span><span style='color:Red'>${s(esp.nome)}</Span><br/>` +
        '</div>';
      json(res, { success: html });
    } },
    // horarios_load(self, request) sem o pk: o DRF chama com pk=... e dá erro sempre
    { nome: 'horarios_load', url: 'horarios-load', detalhe: true, metodos: ['get'], fn: async () => {
      throw erroPython("horarios_load() got an unexpected keyword argument 'pk'");
    } },
  ];
  viewset.registra(app, '/api/medico', {
    modelo: M, serializer: ser,
    filtros: { id: ['in'] }, busca: ['medico', 'crm', 'celular'],
    antesDeCriar: hash, antesDeAtualizar: hash,
    acoes,
  });
};

/** MedicoSerializer (também usado pelo MemedViewSet) */
function serializerMedico() {
  return viewset.criaSerializer('TbMedicos', Object.assign({}, S.medico.opc, {
    gravaveis: { fk_especialidade: S.relacionadoGravavel('TbEspecialidades', 'fk_especialidade_id') },
  }));
}
/** cpf_hash = HiddenField(default=CurrentCPFHash()): não vale no PATCH (parcial) */
function hashDoCpf(req, obj) { if (req.method !== 'PATCH') obj.cpf_hash = cpfHash(req); }
module.exports.serializerMedico = serializerMedico;
module.exports.hashDoCpf = hashDoCpf;

/** HorariosViewSet.cria_horarios */
async function criaHorarios(req, res) {
  const modelo = require('../util/modelo');
  const QueryDict = require('../util/querydict');
  const d = req.data;
  const pega = (k) => { const v = typeof d.get === 'function' ? (d.has(k) ? d.get(k) : undefined) : d[k]; if (v === undefined) throw erroPython(`'${k}'`); return v; };
  const form = new QueryDict(String(pega('form')));
  const medico = pega('medico');
  // HorariosForm: CharField(max_length) e TimeField opcionais; IntegerField dia_receita
  const txt = (k, max) => { const v = (form.get(k) || '').trim(); return v.length > max ? undefined : v; };
  const hora = (k) => {
    const v = (form.get(k) || '').trim();
    if (!v) return null;
    const m = v.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m || +m[1] > 23 || +m[2] > 59 || +(m[3] || 0) > 59) return undefined;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
  };
  const dm = txt('dia_matutino', 13), dv = txt('dia_vespertino', 13);
  const hi = [hora('hora_inicio_matutino'), hora('hora_inicio_vespertino')];
  const hf = [hora('hora_fim_matutino'), hora('hora_fim_vespertino')];
  const tm = [txt('duracao_consulta', 3), txt('intervalo_encaixes', 3), txt('intervalo_balcao', 3)];
  const drTxt = (form.get('dia_receita') || '').trim();
  const dr = drTxt === '' ? null : /^[-+]?\d+$/.test(drTxt) ? parseInt(drTxt, 10) : undefined;
  const valido = ![dm, dv, ...hi, ...hf, ...tm, dr].includes(undefined);
  if (valido) {
    const intPy = (v) => { if (!/^\s*[-+]?\d+\s*$/.test(v)) throw erroPython(`invalid literal for int() with base 10: '${v}'`); return parseInt(v, 10); };
    const dias = [dm !== '' ? dm.split(',') : 0, dv !== '' ? dv.split(',') : 0];
    const tempo = tm.map((t) => (t !== '' ? intPy(t) : 0));
    const periodo = [['AM', 'BM', 'CM'], ['AT', 'BT', 'CT']];
    const H = 'TbHorarios';
    const hhmmss = (sg) => `${String(Math.floor(sg / 3600)).padStart(2, '0')}:${String(Math.floor(sg / 60) % 60).padStart(2, '0')}:${String(sg % 60).padStart(2, '0')}`;
    for (const i of [0, 1]) {
      if (!(dias[i] && hi[i] !== null && hf[i] !== null)) continue;
      for (const j of [0, 1, 2]) {
        if (!tempo[j]) continue;
        if (tempo[j] < 0) continue;   // no AppClinic um intervalo negativo trava o servidor num laço sem fim
        // datetime de 1900-01-01: passar da meia-noite muda o dia e sai do laço
        for (let h = hi[i]; h < hf[i]; h += tempo[j] * 60) {
          if (h >= 86400) break;
          for (const dia of dias[i]) {
            const existe = await db.tabela(H).where(col(H, 'fk_medico_id'), medico).where(col(H, 'hora'), hhmmss(h)).where(col(H, 'dia_semana'), dia).first();
            if (!existe) await modelo.salva(req, H, { fk_medico_id: medico, agenda_periodo: periodo[i][j], hora: hhmmss(h), dia_semana: dia });
          }
        }
      }
    }
    if (dr) {
      const { obtem } = require('../util/orm');
      const m = await obtem('TbMedicos', { id: require('./cadastros').idFiltro(medico) });
      m.dia_receita = dr;
      await modelo.salva(req, 'TbMedicos', m);
    }
  }
  json(res, { success: 'Sucesso!' });
}
