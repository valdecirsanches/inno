'use strict';
/**
 * Robô do WhatsApp: /webhook/resposta/ (Robo/scripts/improved_webhook.py do AppClinic).
 * O WAHA chama este endereço a cada mensagem; a resposta do paciente
 * ("1" confirma, "2" cancela) muda a consulta e o robô devolve a mensagem
 * de retorno pela mesma sessão por onde ela chegou. Sem login e sem CSRF.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db');
const modelo = require('../util/modelo');
const { json } = require('../util/http');
const { WhatsAppService } = require('../util/whatsapp');
const evolution = require('../util/evolution');
const { pyStrValor, pyGet, pyBool, ehDict, pyJsonLoads, pyJson } = require('../util/python');
const { variantesTelefone } = require('./api-whatsapp');
const { peloRobo } = require('./presenca');

const W = 'TbWhatsApp';
const LOGO = path.join(config.raiz, 'static', 'img', 'neuro100.png');
const col = (at) => db.coluna(W, at);

const limparNumero = (t) => (!t ? '' : pyStrValor(t).split('@')[0].replace(/\+/g, '').replace(/-/g, '').replace(/ /g, ''));

// ------------------------------------------- leitura da resposta do paciente
const SIM = new Set(['1', 'sim', 's', 'confirmo', 'confirmado', 'confirmada', 'confirmar', 'confirma', 'ok']);
const NAO = new Set(['2', 'nao', 'n', 'cancelar', 'cancela', 'cancelo', 'cancelado', 'cancelada', 'desmarcar']);

function interpretaResposta(body) {
  let t = String(body || '').normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim();
  t = t.replace(/[^a-z0-9 ]/g, ' ').trim();
  if (!t) return null;
  const m = t.match(/^([12])\b/);
  if (m) return m[1];
  if (SIM.has(t)) return '1';
  if (NAO.has(t)) return '2';
  return null;
}

// chaves em que o WAHA/WhatsApp manda o telefone real quando o "from" é um @lid
const CHAVES_TELEFONE = new Set(['remoteJidAlt', 'senderPn', 'SenderAlt', 'participantPn', 'participantAlt', 'pn', 'senderAlt']);

function telefonesNoPayload(obj, achados) {
  if (ehDict(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (CHAVES_TELEFONE.has(k) && typeof v === 'string' && /\d{10,15}@(c\.us|s\.whatsapp\.net)/.test(v)) achados.add(v.split('@')[0].replace(/\D/g, ''));
      else telefonesNoPayload(v, achados);
    }
  } else if (Array.isArray(obj)) {
    for (const v of obj) telefonesNoPayload(v, achados);
  }
  return achados;
}

async function clinicaDaSessao(sessao) {
  const C = 'TbClinica', cu = db.coluna(C, 'whatsapp_url');
  const base = () => db.tabela(C).whereNotNull(cu).whereNot(cu, '').orderBy(db.coluna(C, 'id'));
  // a clínica da sessão (na Evolution o endereço do WAHA pode estar vazio)
  let c = sessao ? await db.tabela(C).where(db.coluna(C, 'whatsappClient'), sessao).orderBy(db.coluna(C, 'id')).first() : null;
  if (!c) c = await base().first();
  return db.linha(C, c);
}

async function telefonesDoRemetente(remetente, payload, sessao) {
  const tels = new Set();
  const b = pyStrValor(remetente || '');
  if (b.endsWith('@c.us') || b.endsWith('@s.whatsapp.net')) tels.add(b.split('@')[0].replace(/\D/g, ''));
  telefonesNoPayload(payload, tels);
  if (b.endsWith('@lid') && !tels.size && ehDict(payload) && payload.evolution) {
    const cl = await clinicaDaSessao(sessao);
    if (cl && evolution.disponivel() && await evolution.provedorDaClinica(cl.id) === evolution.EVOLUTION) {
      const pn = await new evolution.Evolution(sessao || cl.whatsappClient).telefoneDoLid(b);
      if (pn) tels.add(pn);
    }
  }
  if (b.endsWith('@lid') && !tels.size) {
    const cl = await clinicaDaSessao(sessao);
    if (cl) {
      const s = new WhatsAppService(null, cl.whatsapp_url, sessao || cl.whatsappClient, undefined, cl);
      const pn = await s.pn_do_lid(b);
      if (pn) tels.add(pn);
    }
  }
  return new Set([...tels].filter(Boolean));
}

/** acha o envio de confirmação a que o paciente está respondendo */
async function localizaEnvio(remetente, payload, sessao) {
  const pendentes = () => db.tabela(W).where(col('status'), 'pendente').whereNotNull(col('id_consulta')).orderBy(col('dh'), 'desc');
  if (remetente) {
    const l = await pendentes().where(col('origem'), remetente).first();
    if (l) return [db.linha(W, l), new Set([remetente])];
  }
  const tels = await telefonesDoRemetente(remetente, payload, sessao);
  const formas = new Set();
  for (const t of tels) for (const f of variantesTelefone(t)) formas.add(f);
  if (!formas.size) return [null, tels];
  const f = [...formas];
  const l = await pendentes().where((q) => q.whereIn(col('telefone_limpo'), f).orWhereIn(col('destino'), f).orWhereIn(col('origem'), f)).first();
  return [db.linha(W, l), tels];
}

/** o WAHA pode reenviar o mesmo evento: cada mensagem é tratada uma vez */
async function jaProcessada(idMensagem, telefone) {
  if (!pyBool(idMensagem)) return false;
  const P = 'MensagemProcessada';
  const id = Array.from(pyStrValor(idMensagem)).slice(0, 255).join('');
  try {
    if (await db.tabela(P).where(db.coluna(P, 'message_id'), id).first()) return true;
    await db.tabela(P).insert(db.paraColunas(P, { message_id: id, telefone: Array.from(pyStrValor(telefone || '')).slice(0, 30).join(''), data_processamento: db.agora() }));
    return false;
  } catch (e) {
    return /duplicate|unique/i.test(e.message);   // tabela indisponível: segue sem deduplicar
  }
}

/** guarda o evento recebido (tbWhatsappLog) para conferência */
async function registraRecebido(req, corpo) {
  try { await modelo.salva(req, 'TbWhatsAppLog', { data_json: corpo }); } catch (e) { /* pass */ }
}

/** o JSONField grava json.dumps(valor): o salva recebe o texto pronto */
const comoJson = (v) => pyJson(v);

function resumoResposta(r) {
  let corpo;
  try { corpo = r.json(); } catch (e) { corpo = Array.from(r.text || '').slice(0, 300).join(''); }
  const ok = Array.isArray(corpo) || ehDict(corpo);
  return { http: r.status_code === undefined ? null : r.status_code, resposta: ok ? corpo : Array.from(pyStrValor(corpo)).slice(0, 300).join('') };
}

/** retorno ao paciente: a logo no topo com o texto junto (enviar_texto_com_logo) */
async function enviaMensagem(req, ag, sessaoId, telefone, mensagem) {
  const detalhes = { tipo: 'retorno', consulta: ag.id, sessao: sessaoId, telefone };
  try {
    const cl = ag.fk_clinica_id === null ? null : await db.busca('TbClinica', { id: ag.fk_clinica_id });
    if (!cl) throw new Error("'NoneType' object has no attribute 'whatsapp_url'");
    const s = new WhatsAppService(null, cl.whatsapp_url, sessaoId || cl.whatsappClient, undefined, cl);
    detalhes.sessao = s.session;
    let texto = mensagem;
    if (ehDict(mensagem)) texto = mensagem.success || mensagem.processado || pyStrValor(mensagem);
    const numero = limparNumero(telefone);
    const [r, modo] = await s.enviar_texto_com_logo(numero, texto, LOGO);
    detalhes.modo = modo;
    detalhes.texto = resumoResposta(r);
    const ok = [200, 201].includes(r.status_code || 0);
    if (!ok) console.error(`Retorno ao paciente NÃO enviado (consulta ${ag.id})`);
    return [ok, detalhes];
  } catch (e) {
    console.error(`Falha no envio de retorno WA: ${e.message}`);
    detalhes.erro = Array.from(e.message).slice(0, 300).join('');
    return [false, detalhes];
  } finally {
    await registraRecebido(req, comoJson(detalhes));
  }
}

async function resposta(req, res) {
  try {
    let corpo;
    try {
      const bruto = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : '');
      corpo = pyJsonLoads(new TextDecoder('utf-8', { fatal: true }).decode(bruto));
    } catch (e) {
      return json(res, { success: false, error: 'Payload inválido' }, 400);
    }
    if (!ehDict(corpo)) return json(res, { success: false, error: 'Payload inválido' }, 400);
    await registraRecebido(req, comoJson(corpo));

    let event, payload, sessao;
    if (evolution.ehEventoEvolution(corpo)) {
      // Evolution API: "messages.upsert" vira o mesmo evento do WAHA
      [event, payload, sessao] = evolution.eventoComoWaha(corpo);
    } else {
      event = pyGet(corpo, 'event');
      payload = pyGet(corpo, 'payload');
      if (!pyBool(payload)) payload = {};
      const sessaoBruta = pyGet(corpo, 'session');
      sessao = pyBool(sessaoBruta) ? sessaoBruta : '';
    }

    if (!['message_received', 'message', 'message.any'].includes(event)) {
      return json(res, { success: true, info: `Evento ${pyStrValor(event)} ignorado` });
    }
    if (pyBool(pyGet(payload, 'fromMe'))) return json(res, { success: true, info: 'Mensagem enviada pela clínica ignorada' });

    const de = pyGet(payload, 'from');
    const remetente = pyBool(de) ? pyStrValor(de) : '';
    if (remetente.endsWith('@g.us') || remetente === 'status@broadcast') return json(res, { success: true, info: 'Grupo/status ignorado' });

    const b = pyGet(payload, 'body');
    const corpoMsg = (pyBool(b) ? pyStrValor(b) : '').trim();
    const opcao = interpretaResposta(corpoMsg);
    if (opcao === null) return json(res, { success: true, message: 'Opção inválida ignorada' });

    const [envio, tels] = await localizaEnvio(remetente, payload, sessao);
    if (!envio) {
      return json(res, { success: false, error: 'Contexto não encontrado', remetente, telefones: [...tels].sort() });
    }

    let idMsg = pyGet(payload, 'id');
    if (ehDict(idMsg)) { const ser = pyGet(idMsg, '_serialized'); idMsg = pyBool(ser) ? ser : pyGet(idMsg, 'id'); }
    if (await jaProcessada(idMsg, envio.destino)) return json(res, { success: true, info: 'Mensagem já processada' });

    const ag = envio.id_consulta === null ? null : await db.busca('TbAgendaCons', { id: envio.id_consulta });
    if (!ag) return json(res, { success: false, error: 'Agenda não existe mais' });

    const acao = opcao === '1' ? 'CONFIRMAÇÃO' : 'CANCELAMENTO';
    const resData = await peloRobo(req, ag.id, opcao);
    if (!('success' in resData)) return json(res, { success: false, error: resData.error || 'Falha ao registrar' });

    // o retorno vai para o chat de onde veio a resposta, pela sessão por onde ela chegou
    const destino = remetente.endsWith('@c.us') || remetente.endsWith('@s.whatsapp.net') ? remetente : envio.destino;
    let [entregue, detalhes] = await enviaMensagem(req, ag, sessao || envio.session_id, destino, resData.success);
    if (!entregue && destino !== envio.destino) {
      [entregue, detalhes] = await enviaMensagem(req, ag, sessao || envio.session_id, envio.destino, resData.success);
    }
    envio.status = 'fechado';
    await modelo.salva(req, W, envio, { somenteCampos: ['status'] });
    return json(res, { success: true, acao, consulta: ag.id, retorno_enviado: entregue, retorno: detalhes });
  } catch (e) {
    console.error(`Erro Crítico Webhook: ${e.message}`);
    return json(res, { success: false, error: 'Erro interno' }, 500);
  }
}

/** o que foi feito com o evento fica gravado logo depois dele (botão "Webhook" da clínica) */
async function respostaComResultado(req, res) {
  const envia = res.send.bind(res);
  let enviado = null;
  res.send = (b) => { enviado = b; return envia(b); };
  await resposta(req, res);
  try {
    const corpo = JSON.parse(Buffer.isBuffer(enviado) ? enviado.toString('utf8') : String(enviado));
    if (!(ehDict(corpo) && String(corpo.info || '').startsWith('Evento '))) {
      await registraRecebido(req, comoJson({ tipo: 'resultado_webhook', http: res.statusCode, resposta: corpo }));
    }
  } catch (e) { /* sem resultado */ }
}

module.exports = function (app) {
  // @require_http_methods(["POST"]): outro método recebe 405 vazio
  app.all('/webhook/resposta/', (req, res, next) => {
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').type('html').send('');
    Promise.resolve(respostaComResultado(req, res)).catch(next);
  });
};

module.exports.interpretaResposta = interpretaResposta;
