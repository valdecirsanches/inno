'use strict';
/**
 * Impressos em PDF: ficha e recibo do paciente, agenda do dia, resumo de
 * atendimentos do convênio, atestado, pedido de exame, receita, relatório e
 * resumo do prontuário. Tradução linha a linha dos reports.py do AppClinic
 * (ReportLab), com as mesmas posições, fontes e textos.
 */
const path = require('path');
const config = require('../config');
const db = require('../db');
const modelo = require('../util/modelo');
const { obtem, relacionado, ultimo, erroPython, strptimeData } = require('../util/orm');
const { pyStr, idadeF, splitlines } = require('../util/python');
const { formata } = require('../util/formato-data');
const { json } = require('../util/http');
const pdf = require('../util/pdf');

const { Canvas, Paragraph, Spacer, Image, PageBreak, Table, SimpleDocTemplate, getSampleStyleSheet, colors, letter } = pdf;

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const col = (m, at) => db.coluna(m, at);
const s = (v) => pyStr(null, v);                      // str() / f'{v}' do Python
const IMG = (n) => path.join(config.raiz, 'static', 'img', n);
const hojeLocal = () => db.agora().slice(0, 16);      // datetime.today()
const dmY = (d) => formata(d, 'd/m/Y');                // strftime('%d/%m/%Y')
const HM = (h) => formata(h, 'H:i');                   // strftime('%H:%M')
/** x.strftime(...) de um campo que pode ser None */
function strf(v, f) { if (v === null || v === undefined || v === '') throw erroPython("'NoneType' object has no attribute 'strftime'"); return f(v); }
/** funcoes.ifnull */
const ifnull = (v, d) => (!v ? d : v);
/** funcoes.RODAPE */
const rodape = () => `*** Inno  © EDSSolution Tecnologia  (1989 - ${db.hoje().slice(0, 4)}) ***  Osasco - SP - Brasil Fone: 55 11 3605-5366`;
/** funcoes.moeda: locale.currency(valor, grouping=True, symbol=None) em pt_BR */
function moeda(v) {
  const n = Number(v);
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`;
}
/** extensoMes de Cadastros/Pacientes/extenso.py */
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
/** dExtenso.extenso (inteiros, usado no atestado) */
function extensoInt(n) {
  const ext = [{ 1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez', 11: 'onze', 12: 'doze', 13: 'treze', 14: 'quatorze', 15: 'quinze', 16: 'dezesseis', 17: 'dezessete', 18: 'dezoito', 19: 'dezenove' },
    { 2: 'vinte', 3: 'trinta', 4: 'quarenta', 5: 'cinquenta', 6: 'sessenta', 7: 'setenta', 8: 'oitenta', 9: 'noventa' },
    { 1: 'cento', 2: 'duzentos', 3: 'trezentos', 4: 'quatrocentos', 5: 'quinhentos', 6: 'seissentos', 7: 'setessentos', 8: 'oitocentos', 9: 'novecentos' }];
  const und = ['', ' mil', [' milhão', ' milhões'], [' bilhão', ' bilhões'], [' trilhão', ' trilhões']];
  const sufixo = (s3, g) => (Array.isArray(und[g]) ? (parseInt(s3, 10) > 1 ? und[g][1] : und[g][0]) : und[g]);
  const cent = (s3, g) => {
    s3 = s3.padStart(3, '0');
    if (s3 === '000') return '';
    if (s3 === '100') return 'cem';
    let r = '';
    const dez = s3[1] + s3[2];
    if (s3[0] !== '0') { r += ext[2][+s3[0]]; if (dez !== '00') r += ' e '; else return r + sufixo(s3, g); }
    if (+dez < 20) { if (ext[0][+dez] === undefined) throw erroPython('0'); r += ext[0][+dez]; }
    else if (s3[1] !== '0') { r += ext[1][+s3[1]]; if (s3[2] !== '0') r += ' e ' + ext[0][+s3[2]]; }
    return r + sufixo(s3, g);
  };
  let sn = String(Math.trunc(Number(n)));
  const ret = [];
  let g = 0;
  while (sn) { ret.push(cent(sn.slice(-3), g)); sn = sn.slice(0, -3); g++; }
  return ret.reverse().filter((x) => x).join(' e ');
}
/** try: ... except: pass */
async function tenta(fn) { try { await fn(); } catch (e) { /* como o except: pass do AppClinic */ } }
/** TbCadastroEmpresa.objects.all()[0] */
async function empresa() {
  const o = await db.busca('TbCadastroEmpresa', {});
  if (!o) throw erroPython('list index out of range');
  return o;
}
/** TbCadastroEmpresa.objects.all().first() */
async function empresaOuNada() {
  const M = 'TbCadastroEmpresa';
  return db.linha(M, await db.tabela(M).orderBy(col(M, 'id')).first());
}
/** filtro id=valor do GET (None -> IS NULL, texto -> erro do Django) */
function idDe(v, campo = 'id') {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!/^[-+]?\d+$/.test(t)) throw erroPython(`Field '${campo}' expected a number but got '${v}'.`);
  return parseInt(t, 10);
}
async function get(M, id) {
  if (id === null) throw erroPython(`${M} matching query does not exist.`);
  return obtem(M, { id });
}
/** nome do arquivo no Content-Disposition: com acento, no formato MIME que o
 * Django usa para cabeçalhos não latin-1 (o Node não envia latin-1 cru) */
const nomeArq = (n) => (/[^\x00-\x7f]/.test(n) ? `=?utf-8?b?${Buffer.from(n).toString('base64')}?=` : n);
function envia(res, buf, nome) {
  res.status(200).set('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nomeArq(nome)}"`);
  res.end(buf);
}
/** drawString(x, y, None) do ReportLab dá erro */
const txt = (v) => { if (v === null || v === undefined) throw erroPython("object of type 'NoneType' has no len()"); return String(v); };
/** desenha a imagem; sem o arquivo, segue sem ela (try/except do AppClinic) */
function logo(p, arq, x, y) { try { p.drawImage(arq, x, y); } catch (e) { /* sem imagem */ } }

// ------------------------------------------------- cabeçalho e rodapé
// Atendimento/reports.py: _header_footer
function cabecalhoMedico(canv, doc, med, o, { especial = false } = {}) {
  canv.saveState();
  const st = getSampleStyleSheet();
  const I = new Image(IMG('neuro100.png'));
  const HCRM = new Paragraph(`<para align=center spaceb=3>CRM <b>${s(med.crm)}</b></para>`, st.BodyText);
  const HMed = new Paragraph(`
                    <para align=center spaceb=3>${med.titulo ? med.titulo : ''} ${s(med.medico)}</para>`, st.Heading1);
  const HEsp = new Paragraph(med.especialidade ? `<para align=center spaceb=3>${med.especialidade}</para>` : '', st.Normal);
  const HTit = new Paragraph(med.cabecalho ? `<para align=center fontsize=7>${med.cabecalho}</para>` : '', st.Normal);
  const header = new Table([[HMed, '', '', I], ['', HEsp, '', ''], [HTit, '', '', ''], ['', '', '', HCRM]], { style: [
    ['BACKGROUND', [0, 0], [-1, 1], colors.HexColor('#C6E3FF')],
    ['LINEABOVE', [0, 1], [2, 1], 2, colors.white],
    ['SPAN', [3, 0], [3, 2]], ['SPAN', [0, 0], [2, 0]], ['SPAN', [0, 2], [2, 2]],
    ['ALIGN', [0, 0], [-1, -1], 'CENTER'], ['VALIGN', [0, 0], [-1, -1], 'MIDDLE'],
  ] });
  header._argW[0] = 60; header._argW[1] = 280; header._argW[2] = 50;
  header._argH[0] = 35; header._argH[1] = 15; header._argH[2] = 70;
  let [, h] = header.wrap(doc.width, doc.topMargin);
  header.drawOn(canv, doc.leftMargin, doc.height + doc.topMargin + (especial ? 220 : 70) - h);

  if (!o) throw erroPython("'NoneType' object has no attribute 'fantasia'");
  const FFant = new Paragraph(`<para align=center>${s(o.fantasia)}</para>`, st.Heading2);
  const FEsp = new Paragraph('<para align=center fontsize=8>Clínica Especializada no tratamento de doenças da coluna vertebral e do sistema nervoso central e periferico </para>', st.Normal);
  const comp = o.endereco_complemento ? ` | ${o.endereco_complemento} |` : '';
  const fones = especial ? `${s(o.tel1)} / ${s(o.tel2)}/ ${s(o.tel3)}` : s(o.tel1);
  const FEnd = new Paragraph(`<para align=center fontsize=8>${s(o.endereco)}, ${s(o.endereco_numero)}${comp} ${s(o.bairro)} ${s(o.cidade)} ${s(o.uf)} CEP: ${s(o.cep)} <br/> Telefone: ${fones} <br/>Email: ${s(o.email)} Site: ${s(o.site)}</para>`, st.Normal);
  let footer;
  if (!especial) {
    footer = new Table([[FFant], [FEsp], [FEnd]], { style: [
      ['BACKGROUND', [0, 0], [-1, 1], colors.HexColor('#C6E3FF')],
      ['LINEABOVE', [0, 1], [0, 1], 2, colors.white],
    ] });
    footer._argH[0] = 25; footer._argH[1] = 20;
  } else {
    // Prescricoes/reports.py: _header_footer_esp (receita de controle especial)
    const azul = colors.HexColor('#9FB5CC'), preto = colors.black;
    const fC = new Table([
      ['Identificação do comprador'], ['Nome:', '', ''], ['CRM:', '', '', '', '', 'UF:', '', 'Nº:', '', ''],
      ['Endereço:', '', '', ''], [''], ['Cidade:', '', '', '', '', '', '', '', 'UF:', ''], ['Telefone:', '', ''],
    ], { style: [
      ['BACKGROUND', [0, 0], [-1, 0], azul], ['ALIGN', [0, 0], [-1, 0], 'CENTER'], ['VALIGN', [0, 0], [-1, 0], 'MIDDLE'],
      ['SPAN', [0, 0], [-1, 0]], ['SPAN', [0, 1], [1, 1]], ['SPAN', [2, 1], [-1, 1]], ['LINEBELOW', [2, 1], [-1, 1], 0.5, preto],
      ['SPAN', [1, 2], [4, 2]], ['SPAN', [8, 2], [9, 2]], ['LINEBELOW', [1, 2], [4, 2], 0.5, preto],
      ['LINEBELOW', [6, 2], [6, 2], 0.5, preto], ['LINEBELOW', [8, 2], [9, 2], 0.5, preto],
      ['SPAN', [0, 3], [3, 3]], ['SPAN', [4, 3], [-1, 3]], ['LINEBELOW', [4, 3], [-1, 3], 0.5, preto],
      ['SPAN', [0, 4], [-1, 4]], ['LINEBELOW', [1, 4], [-1, 4], 0.5, preto],
      ['SPAN', [0, 5], [2, 5]], ['SPAN', [3, 5], [7, 5]], ['LINEBELOW', [3, 5], [7, 5], 0.5, preto], ['LINEBELOW', [9, 5], [9, 5], 0.5, preto],
      ['SPAN', [0, 6], [3, 6]], ['SPAN', [4, 6], [-1, 6]], ['LINEBELOW', [4, 6], [-1, 6], 0.5, preto],
    ] });
    [30, 5, 5, 10, 50, 20, 40, 20, 20, 40].forEach((w, i) => { fC._argW[i] = w; });
    const fF = new Table([
      ['Identificação do fornecedor'], [''], [''], [''], [''], ['Ass. do Farmacêutico:', '', ''], ['Data:', '', '', ''],
    ], { style: [
      ['BACKGROUND', [0, 0], [-1, 0], azul], ['ALIGN', [0, 0], [-1, 0], 'CENTER'], ['VALIGN', [0, 0], [-1, 0], 'MIDDLE'],
      ['SPAN', [0, 0], [-1, 0]], ['SPAN', [0, -2], [1, -2]], ['SPAN', [2, -2], [-1, -2]], ['LINEBELOW', [2, -2], [-1, -2], 0.5, preto],
      ['SPAN', [1, -1], [2, -1]], ['LINEBELOW', [1, -1], [2, -1], 0.5, preto],
    ] });
    [30, 75, 20, 110].forEach((w, i) => { fF._argW[i] = w; });
    footer = new Table([[''], ['', fC, fF, ''], [''], [''], [FFant], [FEsp], [FEnd]], { style: [
      ['BACKGROUND', [0, 0], [-1, -5], colors.HexColor('#C6E3FF')],
      ['GRID', [1, 1], [-2, -6], 0.5, preto],
      ['BACKGROUND', [0, -3], [-1, -2], colors.HexColor('#C6E3FF')],
      ['LINEABOVE', [0, -2], [-1, -2], 2, colors.white],
      ['SPAN', [0, -3], [-1, -3]], ['SPAN', [0, -2], [-1, -2]], ['SPAN', [0, -1], [-1, -1]],
    ] });
    footer._argW[0] = 5; footer._argW[3] = 5;
    footer._argH[0] = 5; footer._argH[2] = 5; footer._argH[3] = 5; footer._argH[4] = 25; footer._argH[5] = 15;
  }
  [, h] = footer.wrap(doc.width, doc.bottomMargin);
  footer.drawOn(canv, doc.leftMargin, doc.bottomMargin - h);
  canv.restoreState();
}

/** assinatura do médico (nome, especialidades com RQE, CRM) */
function assinatura(med, st) {
  const story = [new Paragraph(`<para align=right fontsize=8>${s(med.medico)}</para>`, st.Normal)];
  for (const n of [1, 2, 3]) {
    if (med[`especialidade${n}`]) {
      story.push(new Paragraph(`<para align=right fontsize=8>${med[`especialidade${n}`].toUpperCase()}- RQE: ${s(med[`rqe${n}`])}\n</para>`, st.Normal));
    }
  }
  story.push(new Paragraph(`<para align=right fontsize=8>CRM ${s(med.crm)}</para>`, st.Normal));
  return new Table([[story]], { style: [['LINEABOVE', [0, 0], [0, 0], 0.5, colors.black]] });
}
const tituloComLinha = (t, st) => new Table([[new Paragraph(t, st.Heading2)], [new Spacer(1, 1)]], { style: [['LINEBELOW', [0, 0], [0, 0], 0.5, colors.black]] });
const docPadrao = (title, o = {}) => new SimpleDocTemplate(Object.assign({ pagesize: letter, title, rightMargin: 55, leftMargin: 55, topMargin: 162, bottomMargin: 100 }, o));
/** médico do impresso: o do usuário; sem ele, o do registro */
async function medicoDe(req, fkMedicoId) {
  if (req.user.fk_medico_id) return relacionado('TbMedicos', req.user.fk_medico_id);
  return relacionado('TbMedicos', fkMedicoId);
}
const exigeMed = (m) => { if (!m) throw erroPython("'NoneType' object has no attribute 'medico'"); return m; };
const cids = (t) => String(t).split(',').join(', ');

module.exports = function (app) {
  // ===================================== Cadastros/Pacientes/reports.py
  app.get('/cadastros/paciente/ImprimeFicha/', a(async (req, res) => {
    const usuario = req.user;
    const idPac = req.GET.get('id');
    const p = new Canvas();
    p.setFont('Helvetica', 8);
    const COL = 18, lin = 800;
    const o = await empresa();
    const pac = await get('TbPacientes', idDe(idPac));
    p.setTitle(`Ficha de ${s(pac.paciente)}`);
    let i = 0;
    logo(p, IMG('neuro_small.png'), 17, 760);
    p.setFont('Helvetica', 7);
    p.drawRightString(580, 820, formata(hojeLocal(), 'd/m/Y H:i'));
    p.setFont('Helvetica', 16);
    p.drawString(110, lin - i, txt(o.razao));
    p.setFont('Helvetica', 8);
    i += 10;
    p.drawString(110, lin - i, `${s(ifnull(o.endereco, ''))}, ${s(ifnull(o.endereco_numero, '.'))} ${s(ifnull(o.bairro, '.'))} ${s(ifnull(o.cidade, '.'))} ${s(ifnull(o.uf, '.'))} ${s(ifnull(o.pais, ''))} `);
    i += 10;
    p.drawString(110, lin - i, `CEP: ${s(o.cep)} Telefone: ${s(o.tel1)} / ${s(o.tel2)} / ${s(o.tel3)}`);
    p.setFont('Helvetica', 6);
    i += 10;
    p.drawString(110, lin - i, `Usuário: ${s(usuario.login)}`);
    p.line(110, lin - 2 - i, 580, lin - 2 - i);
    i += 60;
    p.setFillColorRGB(0.7, 0.7, 0.7);
    p.rect(13, lin - i - 5, 568, 20, 1, 1);
    p.setFillColorRGB(0, 0, 0);
    p.setFont('Helvetica', 11);
    p.drawString(15, lin - i, 'FICHA CADASTRAL DO PACIENTE');
    i += 40;
    p.setFont('Helvetica', 8);
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `DATA CADASTRO: ${pac.data_cad ? dmY(pac.data_cad) : 'Nao Informado'} `);
    p.drawString(150, lin - i, `CODIGO: ${s(pac.codigo)}`);
    i += 15;
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `Nome: ${s(pac.paciente)}`);
    p.drawString(350, lin - i, `Data Nascimento: ${pac.data_nasc ? dmY(pac.data_nasc) : 'Nao Informado'}  Idade: ${s(idadeF(pac.data_nasc))} `);
    i += 15;
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `RG: ${s(pac.rg)}`);
    p.drawString(100, lin - i, `CPF: ${s(pac.cpf)}`);
    p.drawString(200, lin - i, `Sexo: ${s(pac.sexo)}`);
    p.drawString(300, lin - i, `Profissao: ${s(pac.profissao)}`);
    i += 15;
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `Endereco: ${pac.endereco || ''}, ${pac.endereco_numero || ''}`);
    i += 15;
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `Bairro: ${pac.bairro || ''}`);
    p.drawString(150, lin - i, `Cidade: ${pac.cidade || ''}`);
    p.drawString(300, lin - i, `UF: ${pac.estado || ''}`);
    p.drawString(340, lin - i, `CEP: ${pac.cep || ''}`);
    i += 15;
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `Telefone: ${pac.telefone || ''}`);
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(140, lin - i, `Celular: ${pac.celular || ''}`);
    p.drawString(300, lin - i, `Nome da Mãe: ${pac.mae || ''}`);
    i += 15;
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    const conv = pac.fk_convenio_id ? (await relacionado('TbConvenio', pac.fk_convenio_id)).convenio : '';
    p.drawString(17, lin - i, `Convenio: ${s(conv)}`);
    // pac.fk_plano.convenio: TbPlanos não tem "convenio", então fica sempre vazio
    p.drawString(300, lin - i, 'Plano:');
    p.drawString(450, lin - i, `Detalhe: ${pac.reg_conv || ''}`);
    i += 15;
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `Email: ${pac.email || ''}`);
    i += 15;
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `Carteirinha: ${pac.carteirinha || ''}`);
    i += 20;
    p.setFillColorRGB(0.7, 0.7, 0.7);
    p.rect(13, lin - i - 5, 568, 20, 1, 1);
    p.setFillColorRGB(0, 0, 0);
    p.setFont('Helvetica', 11);
    p.drawString(15, lin - i, 'CONSULTAS');

    const AG = 'TbAgendaCons';
    const qAg = db.tabela(AG);
    if (idPac === null) qAg.whereNull(col(AG, 'fk_paciente_id')); else qAg.where(col(AG, 'fk_paciente_id'), idDe(idPac, 'id'));
    const ags = db.linhas(AG, await qAg.orderBy([{ column: col(AG, 'data') }, { column: col(AG, 'hora') }]));
    i = 800;
    for (const ag of ags) {
      if (i > 750) {
        if (i !== 800) { p.showPage(); i = 0; } else i = 290;
        p.setFont('Helvetica', 7);
        p.drawString(COL, lin - i, 'DATA');
        p.drawString(65, lin - i, 'HORA');
        p.drawString(105, lin - i, 'MEDICO');
        p.drawString(350, lin - i, 'ACAO');
        p.drawString(450, lin - i, 'TIPO');
        p.drawString(530, lin - i, 'STATUS');
        i += 10;
        p.line(15, lin - 2 - i, 580, lin - 2 - i);
        i += 10;
      }
      await tenta(async () => {
        p.setFont('Helvetica', 8);
        p.drawString(17, lin - i, strf(ag.data, dmY));
        p.drawString(65, lin - i, strf(ag.hora, HM));
        p.drawString(105, lin - i, s((await relacionado('TbMedicos', ag.fk_medico_id)).medico));
        p.setFont('Helvetica', 6);
        if (ag.fk_procedimento_id === null) throw erroPython("'>' not supported between instances of 'NoneType' and 'int'");
        if (ag.fk_procedimento_id > 0) p.drawString(350, lin - i, s((await relacionado('TbProcedimentos', ag.fk_procedimento_id)).descricao));
        p.drawString(450, lin - i, s((await relacionado('TbEspecialidades', ag.fk_especialidade_id)).descricao));
      });
      p.drawString(530, lin - i, s(ag.status));
      p.line(13, lin - 5 - i, 580, lin - 5 - i);
      i += 15;
    }
    p.setFont('Helvetica', 6);
    p.rect(15, 22, 565, 10, 1, 0);
    p.drawCentredString(285, 25, rodape());
    p.showPage();
    envia(res, await p.save(), 'agenda_diaria.pdf');
  }));

  app.get('/cadastros/paciente/ImprimeRecibo/', a(async (req, res) => {
    const idRec = idDe(req.GET.get('id'));
    const p = new Canvas();
    p.setFont('Helvetica', 8);
    await empresaOuNada();
    const rec = await get('TbRecibos', idRec);
    const pac = await relacionado('TbPacientes', rec.fk_paciente_id);
    if (!pac) throw erroPython("'NoneType' object has no attribute 'paciente'");
    p.setTitle(`RECIBO ${s(pac.paciente)}`);
    const med = await relacionado('TbMedicos', rec.fk_medico_id);
    const exigeM = () => { if (!med) throw erroPython("'NoneType' object has no attribute 'empresa_fantasia'"); return med; };
    const lin = 780;
    let i = 0;
    for (let x = 0; x < 2; x++) {
      p.setFont('Helvetica', 10);
      p.drawString(17, lin - i, `${x + 1} Via`);
      i += 40;
      p.setFont('Helvetica', 20);
      if (exigeM().empresa_fantasia) {
        p.drawString(17, lin - i, [...med.empresa_fantasia].slice(0, 25).join(''));
        p.setFont('Helvetica', 8);
        p.drawString(300, lin - i, txt(med.empresa_razao));
        p.line(13, lin - 6 - i, 577, lin - 6 - i);
      }
      i += 17;
      if (med.empresa_fantasia) {
        p.setFont('Helvetica', 12);
        p.drawString(17, lin - i, `CNPJ: ${med.empresa_cnpj || ''}`);
        p.drawRightString(577, lin - i, `CRM: ${med.crm || ''}`);
      }
      i += 30;
      p.setFont('Helvetica', 8);
      if (med.empresa_endereco) {
        p.drawCentredString(288, lin - i, `${s(med.empresa_endereco)}, ${s(med.empresa_numero)} | ${s(med.empresa_complemento)} | ${s(med.empresa_bairro)} - ${s(med.empresa_cidade)} - ${s(med.empresa_uf)} - CEP: ${s(med.empresa_cep)} - Telefone: ${s(med.empresa_telefone)}`);
      }
      i += 30;
      p.line(13, lin - 2 - i, 577, lin - 2 - i);
      p.setFont('Helvetica', 16);
      p.drawString(17, lin - i, `RECIBO: ${pac.codigo || ''}/${Math.trunc(Number(rec.codigo || rec.id))}`);
      p.drawRightString(577, lin - i, `R$ ${moeda(rec.valor)}`);
      i += 30;
      p.setFont('Helvetica', 10);
      p.drawString(17, lin - i, `Recebemos de: ${pac.paciente || ''}`);
      p.setFont('VeraBd', 8);
      p.drawRightString(580, lin - i, `CPF:${pac.cpf || ''} - Cód:${s(pac.codigo)}`);
      i += 10;
      p.setFont('Helvetica', 8);
      p.drawString(90, lin - i, `Endereço: ${pac.endereco || ''},${pac.endereco_numero || ''} ${pac.bairro || ''} - ${pac.cidade || ''}/${s(pac.estado)} CEP: ${s(pac.cep)}`);
      i += 10;
      p.drawString(90, lin - i, `Email: ${pac.email || ''} - `);
      i += 10;
      i += 20;
      p.drawString(17, lin - i, 'A quantia supra de ');
      p.rect(110, lin - i - 32, 470, 40, 1, 0);
      i += 2;
      p.drawString(120, lin - i, txt(rec.valor_extenso));
      i += 45;
      p.drawString(17, lin - i, 'Proveniente de ');
      p.rect(110, lin - i - 32, 470, 40, 1, 0);
      i += 2;
      let k = 0;
      if (rec.referencia === null) throw erroPython("'NoneType' object has no attribute 'splitlines'");
      for (const j of splitlines(rec.referencia)) { p.drawString(120, lin - i, j); i += 10; k += 10; }
      i += 55 - k;
      const [ano, mes, dia] = strf(rec.data_recibo, (d) => d).split('-').map(Number);
      p.drawString(350, lin - i, `Osasco, ${dia} de ${MESES[mes - 1]} de ${ano}`);
      i += 50;
      p.line(13, lin - i, 260, lin - i);
      const func = await relacionado('TbUsuario', rec.fk_usuario_id);
      if (!func) throw erroPython("'NoneType' object has no attribute 'first_name'");
      p.drawCentredString(130, lin - i - 10, `Funcionario: ${s(func.first_name)} `);
      p.line(320, lin - i, 580, lin - i);
      p.drawCentredString(450, lin - i - 10, 'Assinatura do recebedor');
      i += 60;
      if (x === 0) { p.setFont('Helvetica', 12); p.drawString(0, 400, '.'.repeat(206)); }
      i += 20;
    }
    p.showPage();
    envia(res, await p.save(), 'recibo.pdf');
  }));

  // ====================================== Agenda/Consultas/reports.py
  app.get('/agenda/consultas/ImprimeAgenda/', a(async (req, res) => {
    const usuario = req.user;
    const medico = req.GET.get('medico'), dt = req.GET.get('dt');
    if (dt === null) throw erroPython('strptime() argument 1 must be str, not None');
    const d = strptimeData(dt);
    const p = new Canvas();
    p.setTitle(`Agenda do dia ${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}`);
    p.setFont('Helvetica', 8);
    const COL = 18, lin = 800;
    const o = await empresa();
    const AG = 'TbAgendaCons';
    const q = db.tabela(AG).where(col(AG, 'data'), d.iso).whereNot(col(AG, 'status'), 'LIVRE');
    if (medico !== '0') { if (medico === null) q.whereNull(col(AG, 'fk_medico_id')); else q.where(col(AG, 'fk_medico_id'), idDe(medico)); }
    const ags = db.linhas(AG, await q);
    let i = lin, pg = 0;
    for (const ag of ags) {
      if (i >= 750) {
        pg++; i = 0;
        if (pg > 1) { p.setFont('Helvetica', 6); p.rect(15, 22, 565, 10, 1, 0); p.drawCentredString(285, 25, rodape()); p.showPage(); }
        logo(p, IMG('neuro_small.png'), 17, 760);
        p.setFont('Helvetica', 7);
        p.drawRightString(580, 820, formata(hojeLocal(), 'd/m/Y H:i'));
        p.setFont('Helvetica', 16);
        p.drawString(110, lin - i, txt(o.razao));
        p.setFont('Helvetica', 8);
        i += 10;
        p.drawString(110, lin - i, `${s(ifnull(o.endereco, ''))}, ${s(ifnull(o.endereco_numero, '.'))} ${s(ifnull(o.bairro, '.'))} ${s(ifnull(o.cidade, '.'))} ${s(ifnull(o.uf, '.'))} ${s(ifnull(o.pais, ''))} `);
        i += 10;
        p.drawString(110, lin - i, `CEP: ${s(o.cep)} Fone: ${s(o.tel1)} / ${s(o.tel2)} / ${s(o.tel3)}`);
        p.setFont('Helvetica', 6);
        i += 10;
        p.drawString(110, lin - i, `Usuário: ${s(usuario.login)}`);
        p.line(110, lin - 2 - i, 580, lin - 2 - i);
        i += 20;
        p.setFont('Helvetica', 12);
        p.drawString(500, lin - i, `Página: ${pg}`);
        p.drawString(110, lin - i, `CONSULTAS AGENDADAS DO DIA: ${strf(ag.data, dmY)}`);
        i += 30;
        p.setFont('Helvetica', 16);
        if (medico !== '0') p.drawString(COL, lin - i, txt(exigeMed(await relacionado('TbMedicos', ag.fk_medico_id)).medico));
        else p.drawString(COL, lin - i, 'AGENDA DE TODOS OS MEDICOS');
        p.line(13, lin - 4 - i, 580, lin - 4 - i);
        i += 15;
        p.setFont('Helvetica', 7);
        p.drawString(COL, lin - i, 'HORA');
        p.drawString(55, lin - i, 'CODIGO');
        p.drawString(105, lin - i, 'PACIENTE');
        p.drawString(105, lin - i - 10, 'Telefone');
        p.drawString(300, lin - i, 'CONVENIO');
        if (medico === '0') p.drawString(300, lin - i - 10, 'MEDICO');
        p.drawString(400, lin - i, 'PROCEDIMENTO');
        p.drawString(500, lin - i, 'ESPEC.');
        p.drawString(540, lin - i, 'STATUS');
        i += 10;
        p.line(15, lin - 2 - i, 580, lin - 2 - i);
        i += 10;
      }
      let pac = null, pacErro = null;
      try { pac = await relacionado('TbPacientes', ag.fk_paciente_id); } catch (e) { pacErro = e; }
      await tenta(async () => {
        p.setFont('Helvetica', 8);
        p.drawString(COL, lin - i, strf(ag.hora, HM));
        if (pacErro) throw pacErro;
        p.drawString(55, lin - i, s(pac.codigo));
        p.setFont('Helvetica', 6);
        p.drawString(105, lin - i, s(pac.paciente));
        p.setFont('Helvetica', 5);
        if (ag.fk_convenio_id === null) throw erroPython("'>' not supported");
        if (ag.fk_convenio_id > 0) p.drawString(300, lin - i, s((await relacionado('TbConvenio', ag.fk_convenio_id)).convenio));
        if (medico === '0') {
          p.setFont('Helvetica', 5);
          p.drawString(300, lin - i - 5, s((await relacionado('TbMedicos', ag.fk_medico_id)).medico));
          p.setFont('Helvetica', 5);
        }
        if (ag.fk_procedimento_id === null) throw erroPython("'>' not supported");
        if (ag.fk_procedimento_id > 0) p.drawString(400, lin - i, s((await relacionado('TbProcedimentos', ag.fk_procedimento_id)).descricao));
        p.drawString(500, lin - i, s((await relacionado('TbEspecialidades', ag.fk_especialidade_id)).descricao));
      });
      p.drawString(540, lin - i, s(ag.status));
      if (ag.fk_procedimento_id) {
        if (pacErro) throw pacErro;
        if (!pac) throw erroPython("'NoneType' object has no attribute 'telefone'");
        if (pac.telefone || pac.celular) {
          p.setFont('Helvetica', 6);
          p.drawString(105, lin - i - 10, `${s(ifnull(pac.telefone, ''))}  Cel. ${s(ifnull(pac.celular, ''))}`);
          i += 10;
        }
      }
      p.line(13, lin - 7 - i, 580, lin - 7 - i);
      i += 17;
    }
    p.setFont('Helvetica', 6);
    p.rect(15, 22, 565, 10, 1, 0);
    p.drawCentredString(285, 25, rodape());
    p.showPage();
    envia(res, await p.save(), 'agenda_diaria.pdf');
  }));

  // ====================================== Cadastros/Convenio/reports.py
  app.get('/cadastros/convenio/ImprimirAtendimentos', a(async (req, res) => {
    const usuario = req.user;
    const dt = req.GET.get('dt');
    const md = await get('TbMedicos', idDe(req.GET.get('md')));
    const AG = 'TbAgendaCons', CV = 'TbConvenio', PC = 'TbPacientes';
    const tA = db.modelo(AG).tabela, tC = db.modelo(CV).tabela, tP = db.modelo(PC).tabela;
    const q = db.tabela(AG).select(`${tA}.*`)
      .leftJoin(tC, `${tA}.${col(AG, 'fk_convenio_id')}`, `${tC}.${col(CV, 'id')}`)
      .leftJoin(tP, `${tA}.${col(AG, 'fk_paciente_id')}`, `${tP}.${col(PC, 'id')}`);
    if (usuario.fk_clinica_id === null || usuario.fk_clinica_id === undefined) q.whereNull(`${tA}.${col(AG, 'fk_clinica_id')}`);
    else q.where(`${tA}.${col(AG, 'fk_clinica_id')}`, usuario.fk_clinica_id);
    if (dt === null) q.whereNull(`${tA}.${col(AG, 'data')}`); else q.where(`${tA}.${col(AG, 'data')}`, strptimeData(dt).iso);
    q.where(`${tA}.${col(AG, 'status')}`, 'ATENDIDO').where(`${tA}.${col(AG, 'fk_medico_id')}`, md.id)
      .orderBy([{ column: `${tC}.${col(CV, 'convenio')}` }, { column: `${tP}.${col(PC, 'paciente')}` }]);
    const ags = db.linhas(AG, await q);

    const p = new Canvas();
    p.setTitle(`Resumo de atendimentos - ${s(md.medico)}`);
    p.setFont('Helvetica', 8);
    const lin = 800;
    const o = await empresa();
    let i = 0;
    // o AppClinic monta o caminho do logo com "\" (Windows): no servidor Linux não acha e segue sem logo
    p.setFont('Helvetica', 7);
    p.drawRightString(580, 820, formata(hojeLocal(), 'd/m/Y H:i'));
    p.setFont('Helvetica', 16);
    p.drawString(110, lin - i, txt(o.razao));
    p.setFont('Helvetica', 8);
    p.setAuthor('EDSSolution');
    i += 10;
    p.drawString(110, lin - i, `${s(ifnull(o.endereco, ''))}, ${s(ifnull(o.endereco_numero, '.'))} ${s(ifnull(o.bairro, '.'))} ${s(ifnull(o.cidade, '.'))} ${s(ifnull(o.uf, '.'))} ${s(ifnull(o.pais, ''))} `);
    i += 10;
    p.drawString(110, lin - i, `CEP: ${s(o.cep)} Telefone: ${s(o.tel1)} / ${s(o.tel2)} / ${s(o.tel3)} `);
    p.setFont('Helvetica', 6);
    i += 10;
    p.drawString(110, lin - i, `Funcionario: ${s(usuario.nome)} `);
    p.line(110, lin - 2 - i, 580, lin - 2 - i);
    i += 40;
    if (dt === null) throw erroPython('strptime() argument 1 must be str, not None');
    const dtx = dmY(strptimeData(dt).iso);
    p.setFillColorRGB(0.7, 0.7, 0.7);
    p.rect(13, lin - i - 5, 568, 20, 1, 1);
    p.setFillColorRGB(0, 0, 0);
    p.setFont('Helvetica', 11);
    p.drawString(15, lin - i, `RESUMO DE ATENDIMENTO  DO DIA: ${dtx}`);
    i += 25;
    p.setFont('Helvetica', 18);
    p.line(13, lin - 2 - i, 580, lin - 2 - i);
    p.drawString(17, lin - i, `Medico: ${s(md.medico)} `);
    i = 800;
    for (const ag of ags) {
      if (i > 750) {
        if (i !== 800) { p.showPage(); i = 0; } else i = 110;
        p.setFont('Helvetica', 7);
        p.drawString(17, lin - i, 'CONVENIO');
        p.drawString(120, lin - i, 'PACIENTE');
        p.drawString(320, lin - i, 'DATA');
        p.drawString(365, lin - i, 'GUIA/OUTROS');
        p.drawString(420, lin - i, 'USUARIO');
        p.drawString(530, lin - i, 'STATUS');
        i += 3;
        p.line(15, lin - 2 - i, 580, lin - 2 - i);
        i += 10;
      }
      await tenta(async () => {
        p.setFont('Helvetica', 7);
        p.drawString(17, lin - i, s((await relacionado(CV, ag.fk_convenio_id)).convenio));
        p.drawString(120, lin - i, s((await relacionado(PC, ag.fk_paciente_id)).paciente));
        p.drawString(320, lin - i, strf(ag.data, dmY));
        p.drawString(365, lin - i, s(ag.guia));
        p.drawString(420, lin - i, s((await relacionado('TbUsuario', ag.fk_usuario_id)).nome));
        p.drawString(530, lin - i, s(ag.status));
      });
      p.line(13, lin - 5 - i, 580, lin - 5 - i);
      i += 15;
    }
    p.setFont('Helvetica', 6);
    p.rect(15, 22, 565, 10, 1, 0);
    p.drawCentredString(285, 25, rodape());
    p.showPage();
    envia(res, await p.save(), `Resumo_${s(md.medico)}.pdf`);
  }));

  // ===================================== Prontuario/Atestado/reports.py
  app.get('/atendimento/ImprimeAtestado/', a(async (req, res) => {
    const p = new Canvas();
    p.setFont('Helvetica', 8);
    const lin = 800;
    const o = await empresa();
    let at;
    try { at = await get('TbAtestado', idDe(req.GET.get('id_atestado'))); } catch (e) {
      return json(res, { error: 'Falha ao imprimir, certifique-se se salvou o registro.' }, 500);
    }
    const pront = await relacionado('TbPacientes', at.fk_prontuario_id);
    const semPront = () => { throw erroPython("'NoneType' object has no attribute 'paciente'"); };
    let i = 10;
    const check = IMG('check1.png'), uncheck = IMG('uncheck.png');
    logo(p, IMG('neuro100.png'), 465, lin - i - 85);
    i -= 10;
    p.setFont('Helvetica', 7);
    p.setFont('Helvetica', 18);
    i += 50;
    p.drawString(55, lin - i, txt(o.fantasia));
    p.setFont('Helvetica', 10);
    i += 10;
    p.drawString(55, lin - i, `${s(ifnull(o.endereco, ''))}, ${s(ifnull(o.endereco_numero, '.'))} ${s(ifnull(o.bairro, '.'))} ${s(ifnull(o.cidade, '.'))} ${s(ifnull(o.uf, '.'))} ${s(ifnull(o.pais, ''))} `);
    i += 10;
    p.drawString(55, lin - i, `CEP: ${s(o.cep)} Telefone: ${s(o.tel1)} / ${s(o.tel2)} / ${s(o.tel3)} `);
    i += 10;
    p.drawString(55, lin - i, `Email: ${s(o.email)} Site: ${s(o.site)} `);
    p.setFont('Helvetica', 8);
    i += 13;
    p.drawString(55, lin - i, `Emissor: ${s(req.user.first_name)} Em: ${strf(at.data_salvo, dmY)} ${strf(at.hora_saida, HM)}`);
    i += 22;
    p.setFillColorRGB(0, 0, 0);
    p.setFont('Helvetica', 11);
    p.drawString(55, lin - i, 'Ao departamento pessoal de:');
    i += 45;
    p.setFillColorRGB(0.7, 0.7, 0.7);
    p.rect(53, lin - i, 505, 60);
    i += 30;
    p.setFillColorRGB(0, 0, 0);
    p.rect(53, lin - i - 35, 505, 60);
    p.setFillColorRGB(0, 0, 0);
    p.setFont('Helvetica', 16);
    const x = at.requerente ? at.requerente : (pront || semPront()).paciente;
    p.setTitle(`Atestado - ${s(x)}`);
    p.drawString(55, lin - i + 10, txt(x));
    i += 12;
    p.setFont('Helvetica', 12);
    if (at.para === 'A') p.drawString(55, lin - i + 10, `Acompanhante de: ${s((pront || semPront()).paciente)}`);
    i += 15;
    p.drawString(55, lin - i + 10, `Hora da chegada:  ${s(at.hora_chegada)} Horas`);
    i += 15;
    p.drawString(55, lin - i + 10, `Hora da saída:  ${s(at.hora_saida)} Horas`);
    i += 8;
    const zo = 35;
    p.rect(53, lin - i - zo + 10, 505, zo);
    p.setFont('Helvetica', 8);
    p.drawString(55, lin - i, 'COM A FINALIDADE DE: ');
    i += 15;
    p.drawImage(at.para === 'C' ? check : uncheck, 60, lin - i - 5);
    p.drawString(80, lin - i, 'CONSULTA ');
    p.drawImage(at.para === 'A' ? check : uncheck, 145, lin - i - 5);
    p.drawString(165, lin - i, 'ACOMPANHAR FAMILIAR ');
    p.drawImage(at.para === 'O' ? check : uncheck, 270, lin - i - 5);
    p.drawString(295, lin - i, 'OUTRA FINALIDADE: ');
    p.rect(380, lin - i - 5, 170, 20);
    i += 25;
    p.setFont('Helvetica', 10);
    p.drawString(90, lin - i, 'Outrossim, comunicamos que: ');
    i += 30;
    p.drawImage(at.volta === 'A' ? check : uncheck, 55, lin - i + 10);
    p.drawString(75, lin - i + 15, 'A) Pode voltar ao trabalho em seguida: ');
    i += 20;
    p.drawImage(at.volta === 'A1' ? check : uncheck, 55, lin - i + 10);
    p.drawString(75, lin - i + 15, `A.1) Deverá ficar afastado do trabalho restante do dia de hoje: ${strf(at.dt_referencia, dmY)} `);
    i += 20;
    p.drawImage(at.volta === 'B' ? check : uncheck, 55, lin - i + 10);
    p.drawString(75, lin - i + 15, `B) Deverá ficar afastado do trabalho no dia de hoje: ${strf(at.dt_referencia, dmY)} `);
    i += 20;
    let x1 = '', x2 = '';
    if (at.volta === 'C' && at.afastado_por) { x1 = at.afastado_por; x2 = extensoInt(at.afastado_por); p.drawImage(check, 55, lin - i + 10); }
    else p.drawImage(uncheck, 55, lin - i + 10);
    p.drawString(75, lin - i + 15, `C) Deverá ficar afastado do trabalho por ${s(x1)} (${s(x2)}) dias a contar desta data.`);
    i += 20;
    p.drawString(75, lin - i + 15, 'D) É caso de acidente de trabalho, portanto:');
    i += 5;
    p.drawString(80, lin - i, 'D.1) Ser encaminhado ao INSS:');
    i += 5;
    p.drawImage(at.volta === 'D1' ? check : uncheck, 55, lin - i);
    i += 15;
    p.drawString(80, lin - i, 'D.2) Voltar com as guias de acidente:');
    i += 5;
    p.drawImage(at.volta === 'D2' ? check : uncheck, 55, lin - i);
    i += 15;
    p.drawString(75, lin - i, 'E) Deve ficar afastado do trabalhos por prazo superior a 15 (quinze) dias, devendo:');
    i += 20;
    p.drawString(80, lin - i, 'E.1) Ser encaminhado ao INSS:');
    i += 5;
    p.drawImage(at.volta === 'E1' ? check : uncheck, 55, lin - i);
    const c1 = at.comparecer_em ? dmY(at.comparecer_em) : '...';
    const c2 = at.comparecer_as ? HM(at.comparecer_as) : '...';
    i += 15;
    p.drawString(80, lin - i, `E.2) Comparecer com os impressos do INSS para preenchimento do laudo pericial dia ${c1} as ${c2} hs. :`);
    i += 5;
    p.drawImage(at.volta === 'E2' ? check : uncheck, 55, lin - i);
    i += 15;
    if (at.volta === null) throw erroPython("object of type 'NoneType' has no len()");
    const volta = [...at.volta];
    p.drawString(55, lin - i, `RECOMENDANDO O ITEM:  ${volta.length < 2 ? at.volta : `${volta[0]}.${volta[1]}`} `);
    p.drawString(315, lin - i, `CID:    ${at.cid || ''}`);
    i += 5;
    p.rect(185, lin - i, 105, 20);
    p.rect(340, lin - i, 135, 20);
    i += 5;
    p.rect(53, lin - i - zo + 35, 505, i - 270);
    i += 15;
    p.drawString(55, lin - i, 'Data: ');
    p.drawString(138, lin - i, 'Médico: ');
    p.drawString(491, lin - i, 'CRM: ');
    i += 15;
    p.setFont('Helvetica', 12);
    p.drawString(62, lin - i, strf(at.dt_referencia, dmY));
    const med = await relacionado('TbMedicos', at.fk_medico_id);
    if (!med) throw erroPython("'NoneType' object has no attribute 'medico'");
    p.drawString(138, lin - i, `${med.medico || ''}`);
    p.drawString(491, lin - i, med.crm || '');
    i += 5;
    p.rect(53, lin - i, 80, 30);
    p.rect(135, lin - i, 351, 30);
    p.rect(488, lin - i, 70, 30);
    p.setFont('Helvetica', 7);
    i += 60;
    p.rect(53, lin - i - 50, 505, 105);
    p.setFont('Helvetica', 10);
    p.drawString(55, lin - i + 35, 'A(o) funcionária(o): ');
    i += 20;
    p.drawString(55, lin - i + 35, '1 - Enviar este comunicado ao Departamento Pessoal da Empresa no prazo máximo de 24 horas ');
    i += 20;
    p.drawString(55, lin - i + 35, '2 - Quando o afastamento for superior a 15(quinze) dias, comunique-se imediatamente com o Departamento');
    i += 15;
    p.drawString(70, lin - i + 35, 'Pessoal da Empresa.');
    p.drawString(53, 160, `Salvo em: ${strf(at.data_salvo, dmY)}`);
    p.setFont('Helvetica', 6);
    p.rect(53, 22, 505, 10, 1, 0);
    p.setFont('Helvetica', 3);
    const pacNome = (pront || semPront()).paciente;
    if (pacNome === null) throw erroPython('can only concatenate str (not "NoneType") to str');
    p.drawString(53, 145, 'Paciente:' + pacNome);
    p.setFont('Helvetica', 6);
    p.drawCentredString(285, 25, rodape());
    p.showPage();
    envia(res, await p.save(), 'atestado.pdf');
  }));

  // ====================================== Prontuario/Exames/reports.py
  app.get('/atendimento/ImprimeExame/', a(async (req, res) => {
    const ex = await get('TbExames', idDe(req.GET.get('id_exame')));
    const med = exigeMed(await medicoDe(req, ex.fk_medico_id));
    const pront = await relacionado('TbPacientes', ex.fk_prontuario_id);
    const titulo = !ex.descricao ? '' : ex.descricao.toUpperCase();
    const doc = docPadrao(titulo);
    const st = getSampleStyleSheet();
    const el = [tituloComLinha(titulo, st)];
    if (!pront) throw erroPython("'NoneType' object has no attribute 'paciente'");
    el.push(new Paragraph(`<font size=10>PACIENTE: ${s(pront.paciente)} - \n                                  CPF: ${pront.cpf || ''},  \n                                  ${s(idadeF(pront.data_nasc))} ANOS</font>`, st.Normal));
    let pped = '<br/>';
    if (ex.pedido) for (const l of splitlines(ex.pedido)) pped += `${l.toUpperCase()}<br/>`;
    el.push(new Paragraph(`<font size=10>${pped}</font>`, st.Normal));
    if (ex.cid10) el.push(new Paragraph(`<para fontsize=10>CID 10 ${cids(ex.cid10)}</para>`, st.Normal));
    el.push(new Paragraph('<font size=10><br/>JUSTIFICATIVA:</font>', st.Normal));
    let pjust = '';
    if (ex.motivo) for (const l of splitlines(ex.motivo)) pjust += `${l.toUpperCase()}<br/>`;
    el.push(new Paragraph(`<font size=10>${pjust}</font>`, st.Normal));
    el.push(new Spacer(1, 7));
    el.push(assinatura(med, st));
    el.push(new PageBreak());
    const o = await empresaOuNada();
    const cb = (c, d) => cabecalhoMedico(c, d, med, o);
    envia(res, await doc.build(el, { onFirstPage: cb, onLaterPages: cb, numeraPaginas: pdf.numeraPaginas }), 'Exame.pdf');
  }));

  // =================================== Prontuario/Relatorios/reports.py
  app.get('/atendimento/ImprimeRelatorio/', a(async (req, res) => {
    const rel = await get('TbRelatorios', idDe(req.GET.get('id_relatorio')));
    const med = exigeMed(await medicoDe(req, rel.fk_medico_id));
    const pront = await relacionado('TbPacientes', rel.fk_prontuario_id);
    const doc = docPadrao(rel.titulo);
    const st = getSampleStyleSheet();
    const el = [tituloComLinha(rel.titulo || '', st)];
    if (!pront) throw erroPython("'NoneType' object has no attribute 'paciente'");
    el.push(new Paragraph(`<font size=10>PACIENTE: ${s(pront.paciente)} - \n                                  CPF: ${pront.cpf || ''},  \n                                  ${s(idadeF(pront.data_nasc))} ANOS</font>`, st.Normal));
    el.push(new Spacer(1, 2));
    el.push(new Paragraph(`<font size=8>${String(pront.profissao || '').toUpperCase()}</font>`, st.Normal));
    el.push(new Spacer(1, 7));
    let ptext = '';
    if (rel.texto) for (const l of splitlines(rel.texto)) ptext += `${l}<br/>`;
    el.push(new Paragraph(`<font size=8>${ptext}</font>`, st.Normal));
    if (rel.cid10) el.push(new Paragraph(`<para fontsize=8><br/>CID 10 ${cids(rel.cid10)}</para>`, st.Normal));
    el.push(new Spacer(1, 7));
    el.push(assinatura(med, st));
    el.push(new PageBreak());
    const o = await empresaOuNada();
    const cb = (c, d) => cabecalhoMedico(c, d, med, o);
    envia(res, await doc.build(el, { onFirstPage: cb, onLaterPages: cb, numeraPaginas: pdf.numeraPaginas }), 'Relatorio.pdf');
  }));

  // ================================== Prontuario/Prescricoes/reports.py
  app.get('/atendimento/ImprimePrescricao/', a(async (req, res) => {
    const PR = 'TbPrescricoes';
    const presc = await get(PR, idDe(req.GET.get('id_prescricao')));
    const med = exigeMed(await medicoDe(req, presc.fk_medico_id));
    const titulo = presc.cont_esp ? 'RECEITUARIO DE CONTROLE ESPECIAL' : 'RECEITUARIO';
    const doc = presc.cont_esp ? docPadrao(titulo, { topMargin: 150, bottomMargin: 250 }) : docPadrao(titulo);
    const st = getSampleStyleSheet();
    const el = [tituloComLinha(titulo, st)];
    if (!presc.fk_prontuario_id) {
      // presc.fk_prontuario = presc.fk_consulta.fk_paciente; presc.save()
      const cons = await relacionado('TbAgendaCons', presc.fk_consulta_id);
      if (!cons) throw erroPython("'NoneType' object has no attribute 'fk_paciente'");
      presc.fk_prontuario_id = cons.fk_paciente_id;
      await modelo.salva(req, PR, presc);
    }
    const pront = await relacionado('TbPacientes', presc.fk_prontuario_id);
    if (!pront) throw erroPython("'NoneType' object has no attribute 'paciente'");
    el.push(new Paragraph(`<para fontsize=10>PACIENTE: ${s(pront.paciente)}, ${s(idadeF(pront.data_nasc))} ANOS CPF: ${s(pront.cpf)}<br/></para>`, st.Normal));
    if (presc.cont_esp) {
      el.push(new Spacer(1, 4));
      if (presc.fk_prontuario_id && pront.endereco) {
        el.push(new Paragraph(`<para fontsize=10>ENDEREÇO: ${pront.endereco.toUpperCase()}, ${s(pront.endereco_numero)}<br/></para>`, st.Normal));
        el.push(new Paragraph(`<para fontsize=10 lindent=62 leading=1>CEP: ${s(pront.cep)}, ${s(pront.bairro)} - ${s(pront.cidade)} - ${s(pront.estado)} <br/></para>`, st.Normal));
      }
    }
    let pped = '<br/>';
    if (presc.prescricao) for (const l of splitlines(presc.prescricao)) pped += `${l.toUpperCase()}<br/>`;
    el.push(new Paragraph(`<font size=10>${pped}</font>`, st.Normal));
    el.push(new Spacer(1, 7));
    const RM = 'TbPrescricaoRemedios';
    const rems = db.linhas(RM, await db.tabela(RM).where(col(RM, 'fk_prescricao_id'), presc.id));
    const story = [];
    for (const rem of rems) {
      const remedio = [[
        new Paragraph(`<para align=left size=10>${rem.nome || ''} ${rem.tipo || ''}</para>`, st.Normal),
        new Paragraph(`<para align=right>${rem.qtdade || ''} ${rem.unidade || ''}</para>`, st.Normal),
      ]];
      if (rem.descricao) remedio.push([new Paragraph(`<para align=left size=10 lindent=10>${rem.descricao}</para>`, st.Normal)]);
      story.push(new Table(remedio, { style: [['LINEBELOW', [0, 0], [-1, 0], 0.5, colors.black, 2, [1, 4]]] }));
    }
    el.push(new Table([[story]], { style: [] }));
    el.push(assinatura(med, st));
    el.push(new PageBreak());
    const o = await empresaOuNada();
    const cb = (c, d) => cabecalhoMedico(c, d, med, o, { especial: !!presc.cont_esp });
    // a receita de controle especial sai em duas vias (paciente e farmácia)
    const els = presc.cont_esp ? el.concat(el) : el;
    envia(res, await doc.build(els, { onFirstPage: cb, onLaterPages: cb, numeraPaginas: pdf.viaReceita }), 'Exame.pdf');
  }));

  // ================================= Prontuario/reports.py (ProntuarioPrint)
  app.get('/atendimento/ImprimeProntuario/', a(async (req, res) => {
    const idPront = idDe(req.GET.get('id_prontuario'));
    const AG = 'TbAgendaCons';
    const qUlt = db.tabela(AG);
    if (idPront === null) qUlt.whereNull(col(AG, 'fk_paciente_id')); else qUlt.where(col(AG, 'fk_paciente_id'), idPront);
    const ult = db.linha(AG, await qUlt.orderBy(col(AG, 'id'), 'desc').first());
    if (!ult) throw erroPython("'NoneType' object has no attribute 'fk_medico_id'");
    const rel = await get('TbPacientes', idPront);
    const med = await get('TbMedicos', ult.fk_medico_id);
    const doc = docPadrao('Prontuário eletrônico');
    const st = getSampleStyleSheet();
    const el = [tituloComLinha('Prontuário', st)];
    el.push(new Paragraph(`<font size=8>${s(rel.paciente)}, ${s(idadeF(rel.data_nasc))} ANOS</font>`, st.Normal));
    el.push(new Spacer(1, 2));
    if (rel.profissao === null) throw erroPython("'NoneType' object has no attribute 'upper'");
    el.push(new Paragraph(`<font size=8>${rel.profissao.toUpperCase()}</font>`, st.Normal));
    el.push(new Spacer(1, 7));
    const linhaTit = (t) => new Table([[new Paragraph(t, st.Heading5)], [new Spacer(1, 1)]], { style: [['LINEBELOW', [0, 0], [0, 0], 0.5, colors.black]] });
    const p8 = (t) => new Paragraph(`<font size=8>${t}</font>`, st.Normal);
    for (const consulta of await carregaResumo(idPront)) {
      const cab = consulta.cabecalho, corpo = consulta.corpo;
      el.push(new Table([[new Paragraph(`${cab.data} : ${cab.hora} - Dr. ${cab.medico}`, st.Heading4)], [new Spacer(1, 1)]]));
      if (corpo.anamnese) {
        const an = corpo.anamnese;
        el.push(linhaTit('Anamnese'));
        const data = [[new Paragraph(an.queixa_principal, st.Heading5)]];
        if (an.queixa_historia === null) throw erroPython("'NoneType' object has no attribute 'splitlines'");
        for (const l of splitlines(an.queixa_historia)) data.push([p8(l)]);
        data.push([new Spacer(1, 1)]);
        el.push(new Table(data));
      }
      if (corpo.exameFisico) {
        const ef = corpo.exameFisico;
        el.push(linhaTit('Exame Físico'));
        const data = [];
        if (ef.imc) data.push([p8(`Altura: ${s(ef.altura)}`), p8(`peso: ${s(ef.peso)}`), p8(`IMC: ${s(ef.imc)}`)]);
        const pa = ef.pressao_art ? p8(`Pressão Arterial: ${s(ef.pressao_art)}`) : '';
        const pu = ef.pulso ? p8(`Pulso: ${s(ef.pulso)}`) : '';
        if (pa && pu) data.push([pa, pu]); else if (pa) data.push([pa]); else if (pu) data.push([pu]);
        if (ef.obs) { let t = ''; for (const l of splitlines(ef.obs)) t += `${l}<br/>`; data.push([p8(`Obs: <br/>${t}`)]); }
        data.push([new Spacer(1, 1)]);
        el.push(new Table(data));
      }
      if (corpo.hipoteseDiagnostica) {
        const hd = corpo.hipoteseDiagnostica;
        el.push(linhaTit('Diagnostico'));
        const data = [];
        if (hd.diagnostico) data.push([p8(`Diagnóstico: ${hd.diagnostico.map((x) => `${x}; `).join('')}`)]);
        if (hd.outros_diagnosticos) data.push([p8(`Outros Diagnósticos: ${hd.outros_diagnosticos.map((x) => `${x}; `).join('')}`)]);
        if (hd.obs) { let t = ''; for (const l of splitlines(hd.obs)) t += `${l}<br/>`; data.push([p8(`Obs: <br/>${t}`)]); }
        data.push([new Spacer(1, 1)]);
        el.push(new Table(data));
      }
      if (corpo.evolucao !== undefined) {
        el.push(linhaTit('Evolução'));
        if (corpo.evolucao === null) throw erroPython("'NoneType' object has no attribute 'splitlines'");
        const data = splitlines(corpo.evolucao).map((l) => [p8(l)]);
        data.push([new Spacer(1, 1)]);
        el.push(new Table(data));
      }
      if (corpo.exames) {
        el.push(linhaTit('Exames'));
        for (const ex of corpo.exames) {
          const data = [[new Paragraph(ex.data, st.Normal)], [new Spacer(1, 1)]];
          if (ex.pedido === null) throw erroPython("'NoneType' object has no attribute 'splitlines'");
          data.push([p8(splitlines(ex.pedido).map((l) => `${l}<br/> `).join(''))]);
          if (ex.cid10) data.push([p8(ex.cid10)]);
          data.push([new Spacer(1, 1)]);
          el.push(new Table(data));
        }
      }
      if (corpo.prescricoes) {
        el.push(linhaTit('Prescrições'));
        for (const pr of corpo.prescricoes) {
          const data = [[new Paragraph(pr.data, st.Normal)]];
          data.push([p8(pr.prescricao ? splitlines(pr.prescricao).map((l) => `${l}<br/> `).join('') : '')]);
          for (const r of pr.remedio) data.push([p8(`${s(r.nome)} ${s(r.tipo)}`), p8('-'.repeat(40)), p8(`${s(r.qtdade)} ${s(r.unidade)}`)]);
          el.push(new Table(data));
        }
      }
      if (corpo.relatorios) {
        el.push(linhaTit('Relatórios'));
        const data = [];
        for (const r of corpo.relatorios) if (r.titulo) data.push([new Paragraph(`<font size=8>${r.data}</font> - ${r.titulo}`, st.Normal)]);
        data.push([new Spacer(1, 1)]);
        el.push(new Table(data));
      }
      el.push(new Table([[new Spacer(200, 1)]], { style: [['LINEBELOW', [0, 0], [0, 0], 0.5, colors.black]] }));
    }
    const o = await empresaOuNada();
    const cb = (c, d) => cabecalhoMedico(c, d, med, o);
    envia(res, await doc.build(el, { onFirstPage: cb, onLaterPages: cb, numeraPaginas: pdf.numeraPaginas }), 'Exame.pdf');
  }));
};

/** ResumoProntuario.__carregaResumo / __historicoConsulta */
async function carregaResumo(idPront) {
  const AG = 'TbAgendaCons';
  const q = db.tabela(AG);
  if (idPront === null) q.whereNull(col(AG, 'fk_paciente_id')); else q.where(col(AG, 'fk_paciente_id'), idPront);
  const cons = db.linhas(AG, await q.where(col(AG, 'data'), '<=', db.hoje()).where(col(AG, 'status'), 'ATENDIDO').orderBy(col(AG, 'data'), 'desc'));
  const ret = [];
  for (const c of cons) {
    const hc = await historicoConsulta(c);
    if (Object.keys(hc).length) {
      const medico = c.fk_medico_id ? (await relacionado('TbMedicos', c.fk_medico_id)).medico : '';
      ret.push({ cabecalho: { data: strf(c.data, dmY), hora: c.hora ? HM(c.hora) : '', medico: s(medico) }, corpo: hc });
    }
  }
  return ret;
}
async function historicoConsulta(c) {
  const r = {};
  const doUlt = (M) => ultimo(M, { fk_consulta_id: c.id });
  const todos = async (M) => db.linhas(M, await db.tabela(M).where(col(M, 'fk_consulta_id'), c.id));
  const an = await doUlt('TbAnamnese');
  if (an) r.anamnese = { queixa_historia: an.queixa_historia, queixa_principal: an.queixa_principal ? an.queixa_principal : 'Não Descrito queixa principal' };
  const ef = await doUlt('TbExameFisico');
  if (ef) r.exameFisico = { altura: ef.altura || '', peso: ef.peso || '', imc: ef.imc || '', pressao_art: ef.pressao_art || '', pulso: ef.pulso || '', obs: ef.obs_exame_fisico };
  const hd = await doUlt('TbHipoteseDiagnostica');
  if (hd) {
    const descr = async (txt0) => {
      const l = [];
      for (const i of String(txt0).split(',')) {
        const cid = await db.tabela('CID10').where(col('CID10', 'codigo'), i).first();
        l.push(cid ? cid[col('CID10', 'descricao')] : i);
      }
      return l;
    };
    r.hipoteseDiagnostica = {
      diagnostico: hd.diagnostico ? await descr(hd.diagnostico) : '',
      outros_diagnosticos: hd.outros_diagnosticos ? await descr(hd.outros_diagnosticos) : '',
      obs: hd.obs_diagnostico ? hd.obs_diagnostico : '',
    };
  }
  const ev = await doUlt('TbEvolucao');
  if (ev) r.evolucao = ev.evolucao;
  const exs = await todos('TbExames');
  if (exs.length) r.exames = exs.map((e) => ({ data: strf(e.data_salvo, dmY), pedido: e.pedido, cid10: e.cid10 ? e.cid10 : '' }));
  const prs = await todos('TbPrescricoes');
  if (prs.length) {
    r.prescricoes = [];
    for (const p of prs) {
      const RM = 'TbPrescricaoRemedios';
      const rems = db.linhas(RM, await db.tabela(RM).where(col(RM, 'fk_prescricao_id'), p.id));
      r.prescricoes.push({ data: strf(p.data_salvo, dmY), prescricao: p.prescricao, remedio: rems.map((i) => ({ nome: i.nome, tipo: i.tipo, qtdade: i.qtdade, unidade: i.unidade })) });
    }
  }
  const rls = await todos('TbRelatorios');
  if (rls.length) {
    const l = rls.filter((x) => x.titulo).map((x) => ({ data: strf(x.data_salvo, dmY), titulo: x.titulo }));
    if (l.length) r.relatorios = l;
  }
  return r;
}

module.exports.moeda = moeda;
module.exports.extensoInt = extensoInt;
