'use strict';
/**
 * PDFs no lugar do ReportLab do AppClinic, sobre o pdfkit.
 *
 * Canvas: a mesma API do reportlab.pdfgen.canvas (origem no canto inferior
 * esquerdo, drawString na linha de base, setFont, rect, line, drawImage,
 * showPage, save), para os relatórios serem traduzidos linha a linha.
 *
 * Platypus: o pedaço do reportlab.platypus que os relatórios usam
 * (Paragraph com <para>, <font>, <b>, <i>, <br/>; Table com SPAN, BACKGROUND,
 * LINEABOVE/LINEBELOW/GRID, ALIGN/VALIGN e larguras automáticas; Spacer,
 * Image, PageBreak; SimpleDocTemplate com cabeçalho/rodapé e "Pag. x de y"),
 * com as mesmas medidas e os mesmos algoritmos de layout do ReportLab 3.
 */
const path = require('path');
const PDFDocument = require('pdfkit');

const FUZZ = 1e-6;
const A4 = [595.2755905511812, 841.8897637795277];
const letter = [612, 792];
const mm = 72 / 25.4;
const inch = 72;
const TA_LEFT = 0, TA_CENTER = 1, TA_RIGHT = 2, TA_JUSTIFY = 4;

const FONTES = path.join(__dirname, '..', 'fontes');
const TTF = { Vera: 'Vera.ttf', VeraBd: 'VeraBd.ttf', VeraIt: 'VeraIt.ttf', VeraBI: 'VeraBI.ttf' };
// famílias (registerFontFamily do ReportLab): normal, negrito, itálico, negrito+itálico
const FAMILIAS = {
  Helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
  Vera: ['Vera', 'VeraBd', 'VeraIt', 'VeraBI'],
};
const FAMILIA_DE = {};
for (const f of Object.values(FAMILIAS)) for (const n of f) FAMILIA_DE[n] = f;
FAMILIA_DE['Times-Roman'] = FAMILIAS.Times;
function fonteCom(nome, negrito, italico) {
  const f = FAMILIA_DE[nome];
  if (!f) return nome;
  const atual = f.indexOf(nome);
  const b = negrito || atual === 1 || atual === 3, i = italico || atual === 2 || atual === 3;
  return f[(b ? 1 : 0) + (i ? 2 : 0)];
}

// ---------------------------------------------------------------- cores
const NOMES_COR = { black: [0, 0, 0], white: [1, 1, 1], red: [1, 0, 0], green: [0, 0.5, 0], blue: [0, 0, 1], grey: [0.5, 0.5, 0.5], gray: [0.5, 0.5, 0.5] };
function cor(c) {
  if (c === null || c === undefined) return null;
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') {
    if (c.startsWith('#')) { const h = c.slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); }
    const n = NOMES_COR[c.toLowerCase()];
    if (n) return n;
  }
  return [0, 0, 0];
}
const HexColor = (h) => cor(h.startsWith('#') ? h : '#' + h);
const colors = { black: [0, 0, 0], white: [1, 1, 1], grey: [0.5, 0.5, 0.5], HexColor };
const paraPdf = (c) => c.map((v) => v * 255);

// ------------------------------------------------------------- medidas
const medidor = new PDFDocument({ autoFirstPage: false });
for (const [n, a] of Object.entries(TTF)) medidor.registerFont(n, path.join(FONTES, a));
// o ReportLab não aplica kerning: desliga nas fontes padrão (AFM) e nas TrueType
medidor.font('Helvetica');
Object.getPrototypeOf(medidor._font.font).getKernPair = () => 0;
const SEM_KERN = { features: { kern: false, liga: false } };
const cacheLarg = new Map();
function stringWidth(texto, fonte, tam) {
  const t = String(texto);
  if (!t) return 0;
  const k = fonte + '\u0000' + t;
  let w = cacheLarg.get(k);
  if (w === undefined) {
    medidor.font(fonte).fontSize(1000);
    w = medidor.widthOfString(t, SEM_KERN) / 1000;
    if (cacheLarg.size > 50000) cacheLarg.clear();
    cacheLarg.set(k, w);
  }
  return w * tam;
}

// ================================================================ Canvas
function estadoInicial() {
  return { fonte: 'Helvetica', tam: 12, entrelinha: 14.4, preenche: [0, 0, 0], traco: [0, 0, 0], espessura: 1, ponta: 0, juncao: 0, tracejado: null };
}

class Canvas {
  /**
   * @param {object} o pagesize, numeraPaginas(canvas, n, total): desenhado em
   *   cada página no save() (o NumberedCanvas do AppClinic)
   */
  constructor(o = {}) {
    this.pagesize = o.pagesize || A4;
    this.numeraPaginas = o.numeraPaginas || null;
    this.doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margin: 0, compress: true,
      info: { Title: 'untitled', Author: 'anonymous', Subject: 'unspecified', Creator: 'ReportLab PDF Library - www.reportlab.com', Producer: 'Inno' } });
    for (const [n, a] of Object.entries(TTF)) this.doc.registerFont(n, path.join(FONTES, a));
    this._partes = [];
    this.doc.on('data', (b) => this._partes.push(b));
    this._fim = new Promise((ok, erro) => { this.doc.on('end', ok); this.doc.on('error', erro); });
    this._aberta = false;
    this._paginas = 0;
    this._pageNumber = 1;
    this._pilha = [];
    this._e = estadoInicial();
    this._imagens = new Map();
  }

  get H() { return this.pagesize[1]; }
  _garante() {
    if (!this._aberta) {
      this.doc.addPage({ size: this.pagesize, margin: 0 });
      this._aberta = true;
      this._paginas++;
    }
  }

  setTitle(t) { this.doc.info.Title = String(t); }
  setAuthor(t) { this.doc.info.Author = String(t); }
  setSubject(t) { this.doc.info.Subject = String(t); }

  setFont(nome, tam, entrelinha) { this._e.fonte = nome; this._e.tam = tam; this._e.entrelinha = entrelinha === undefined ? tam * 1.2 : entrelinha; }
  setFontSize(tam, entrelinha) { this.setFont(this._e.fonte, tam, entrelinha); }
  setFillColorRGB(r, g, b) { this._e.preenche = [r, g, b]; }
  setStrokeColorRGB(r, g, b) { this._e.traco = [r, g, b]; }
  setFillColor(c) { this._e.preenche = cor(c); }
  setStrokeColor(c) { this._e.traco = cor(c); }
  setLineWidth(w) { this._e.espessura = w; if (this._aberta) this.doc.lineWidth(w); }
  setLineCap(c) { this._e.ponta = c; }
  setLineJoin(j) { this._e.juncao = j; }
  setDash(d) { this._e.tracejado = d && (Array.isArray(d) ? d : [d]); }
  stringWidth(t, fonte, tam) { return stringWidth(t, fonte || this._e.fonte, tam || this._e.tam); }

  saveState() { this._garante(); this._pilha.push(Object.assign({}, this._e)); this.doc.save(); }
  restoreState() { const e = this._pilha.pop(); if (e) { this._e = e; this.doc.restore(); } }

  _texto(x, y, t) {
    t = String(t).replace(/[\r\n]/g, '');
    if (!t) return;
    this._garante();
    const e = this._e;
    this.doc.font(e.fonte).fontSize(e.tam).fillColor(paraPdf(e.preenche));
    this.doc.text(t, x, this.H - y, { lineBreak: false, baseline: 'alphabetic', features: SEM_KERN.features });
  }
  drawString(x, y, t) { this._texto(x, y, t); }
  drawRightString(x, y, t) { this._texto(x - this.stringWidth(String(t)), y, t); }
  drawCentredString(x, y, t) { this._texto(x - this.stringWidth(String(t)) / 2, y, t); }

  _traco() {
    const e = this._e, d = this.doc;
    d.strokeColor(paraPdf(e.traco)).lineWidth(e.espessura).lineCap(['butt', 'round', 'square'][e.ponta] || 'butt')
      .lineJoin(['miter', 'round', 'bevel'][e.juncao] || 'miter');
    if (e.tracejado && e.tracejado.length) d.dash(e.tracejado[0], { space: e.tracejado.length > 1 ? e.tracejado[1] : e.tracejado[0] });
    else d.undash();
  }
  line(x1, y1, x2, y2) {
    this._garante();
    this._traco();
    this.doc.moveTo(x1, this.H - y1).lineTo(x2, this.H - y2).stroke();
  }
  rect(x, y, w, h, stroke = 1, fill = 0) {
    // assinatura do ReportLab: rect(x, y, width, height, stroke=1, fill=0)
    if (typeof stroke === 'object') ({ stroke = 1, fill = 0 } = stroke);
    if (!stroke && !fill) return;
    this._garante();
    const y0 = Math.min(y, y + h), hh = Math.abs(h);
    this.doc.rect(x, this.H - y0 - hh, w, hh);
    if (fill) this.doc.fillColor(paraPdf(this._e.preenche));
    if (stroke) this._traco();
    if (fill && stroke) this.doc.fillAndStroke(); else if (fill) this.doc.fill(); else this.doc.stroke();
  }
  _imagem(arq) {
    let i = this._imagens.get(arq);
    if (!i) { i = this.doc.openImage(arq); this._imagens.set(arq, i); }
    return i;
  }
  /** tamanho da imagem em pontos (pixels, como o ImageReader do ReportLab) */
  tamanhoImagem(arq) { const i = this._imagem(arq); return [i.width, i.height]; }
  drawImage(arq, x, y, w = null, h = null) {
    const i = this._imagem(arq);
    if (w === null) w = i.width;
    if (h === null) h = i.height;
    this._garante();
    this.doc.image(i, x, this.H - y - h, { width: w, height: h });
  }

  showPage() {
    this._garante();
    this._aberta = false;
    this._pageNumber++;
    while (this._pilha.length) this.restoreState();
    this._e = estadoInicial();
  }

  /** termina o PDF e devolve o Buffer */
  async save() {
    if (this._aberta) this.showPage();
    if (this._paginas === 0) { this._garante(); this.showPage(); }
    if (this.numeraPaginas) {
      const total = this._paginas;
      for (let n = 0; n < total; n++) {
        this.doc.switchToPage(n);
        this._aberta = true;
        this._e = estadoInicial();
        this.numeraPaginas(this, n + 1, total);
      }
    }
    this.doc.end();
    await this._fim;
    return Buffer.concat(this._partes);
  }
}

/** "Pag. x de y" do NumberedCanvas (Atendimento/reports.py) */
const numeraPaginas = (c, n, total) => { c.setFontSize(10); c.drawRightString(200 * mm, 5 * mm + 0.2 * inch, `Pag. ${n} de ${total}`); };
/** "Via Paciente" / "Via Farmácia" do ReceitaEspecialCanvas */
const viaReceita = (c, n) => { c.setFontSize(10); c.drawRightString(200 * mm, 5 * mm + 0.2 * inch, `Via ${n % 2 === 1 ? 'Paciente' : 'Farmácia'}`); };

// ============================================================== estilos
function ParagraphStyle(o) {
  const base = o.parent ? Object.assign({}, o.parent) : {
    fontName: 'Helvetica', fontSize: 10, leading: 12, leftIndent: 0, rightIndent: 0, firstLineIndent: 0,
    alignment: TA_LEFT, spaceBefore: 0, spaceAfter: 0, textColor: [0, 0, 0],
  };
  const s = Object.assign(base, o);
  delete s.parent;
  return s;
}
function getSampleStyleSheet() {
  const s = {};
  s.Normal = ParagraphStyle({ name: 'Normal' });
  s.BodyText = ParagraphStyle({ name: 'BodyText', parent: s.Normal, spaceBefore: 6 });
  s.Italic = ParagraphStyle({ name: 'Italic', parent: s.BodyText, fontName: 'Helvetica-Oblique' });
  s.Heading1 = ParagraphStyle({ name: 'Heading1', parent: s.Normal, fontName: 'Helvetica-Bold', fontSize: 18, leading: 22, spaceAfter: 6 });
  s.Title = ParagraphStyle({ name: 'Title', parent: s.Normal, fontName: 'Helvetica-Bold', fontSize: 18, leading: 22, alignment: TA_CENTER, spaceAfter: 6 });
  s.Heading2 = ParagraphStyle({ name: 'Heading2', parent: s.Normal, fontName: 'Helvetica-Bold', fontSize: 14, leading: 18, spaceBefore: 12, spaceAfter: 6 });
  s.Heading3 = ParagraphStyle({ name: 'Heading3', parent: s.Normal, fontName: 'Helvetica-BoldOblique', fontSize: 12, leading: 14, spaceBefore: 12, spaceAfter: 6 });
  s.Heading4 = ParagraphStyle({ name: 'Heading4', parent: s.Normal, fontName: 'Helvetica-BoldOblique', fontSize: 10, leading: 12, spaceBefore: 10, spaceAfter: 4 });
  s.Heading5 = ParagraphStyle({ name: 'Heading5', parent: s.Normal, fontName: 'Helvetica-Bold', fontSize: 9, leading: 10.8, spaceBefore: 8, spaceAfter: 4 });
  s.Heading6 = ParagraphStyle({ name: 'Heading6', parent: s.Normal, fontName: 'Helvetica-Bold', fontSize: 7, leading: 8.4, spaceBefore: 6, spaceAfter: 2 });
  s.centered = ParagraphStyle({ name: 'centered', parent: s.Normal, alignment: TA_CENTER });
  return s;
}

// ============================================================ Flowables
class Flowable {
  constructor() { this.hAlign = 'LEFT'; this._fixedWidth = false; this.width = 0; this.height = 0; }
  wrap() { return [this.width, this.height]; }
  getSpaceBefore() { return this.spaceBefore !== undefined ? this.spaceBefore : (this.style && this.style.spaceBefore) || 0; }
  getSpaceAfter() { return this.spaceAfter !== undefined ? this.spaceAfter : (this.style && this.style.spaceAfter) || 0; }
  split() { return []; }
  drawOn(canv, x, y, sW = 0) {
    if (this.hAlign === 'CENTER' || this.hAlign === 'CENTRE') x += sW / 2;
    else if (this.hAlign === 'RIGHT') x += sW;
    this.draw(canv, x, y);
  }
  draw() {}
}

class Spacer extends Flowable {
  constructor(w, h) { super(); this.width = w; this.height = h; this._fixedWidth = true; }
  minWidth() { return this.width; }
}

class PageBreak extends Flowable { constructor() { super(); this.quebra = true; } }

class Image extends Flowable {
  constructor(arq, width = null, height = null) {
    super();
    this.arq = arq;
    const i = medidor.openImage(arq);
    this.width = width === null ? i.width : width;
    this.height = height === null ? i.height : height;
    this._fixedWidth = true;
    this.hAlign = 'CENTER';
  }
  minWidth() { return this.width; }
  draw(canv, x, y) { canv.drawImage(this.arq, x, y, this.width, this.height); }
}

// ------------------------------------------------------------ Paragraph
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodifica = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTIDADES[e.toLowerCase()] !== undefined ? ENTIDADES[e.toLowerCase()] : m;
});
function atributos(s) {
  const o = {};
  const re = /([a-zA-Z_]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(s))) o[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
  return o;
}
const ALINHA = { left: TA_LEFT, center: TA_CENTER, centre: TA_CENTER, right: TA_RIGHT, justify: TA_JUSTIFY };
const ATRIB_PARA = { fontsize: 'fontSize', size: 'fontSize', leading: 'leading', lindent: 'leftIndent', rindent: 'rightIndent', findent: 'firstLineIndent', spaceb: 'spaceBefore', spacea: 'spaceAfter' };

/** texto com marcação -> estilo do parágrafo e lista de itens (palavra ou quebra) */
function analisa(texto, estilo) {
  let t = String(texto);
  const st = Object.assign({}, estilo);
  const mp = /<para\b([^>]*)>/i.exec(t);
  if (mp) {
    const at = atributos(mp[1]);
    for (const [k, v] of Object.entries(at)) {
      if (ATRIB_PARA[k]) st[ATRIB_PARA[k]] = parseFloat(v);
      else if (k === 'align' || k === 'alignment') st.alignment = ALINHA[v.toLowerCase()] !== undefined ? ALINHA[v.toLowerCase()] : st.alignment;
      else if (k === 'font' || k === 'face') st.fontName = v;
      else if (k === 'color' || k === 'fg') st.textColor = cor(v);
    }
    t = t.slice(0, mp.index) + t.slice(mp.index + mp[0].length);
    t = t.replace(/<\/para\s*>/gi, '');
  }
  // pilha de formatação
  const pilha = [{ fonte: st.fontName, tam: st.fontSize, cor: st.textColor, b: false, i: false }];
  const atual = () => pilha[pilha.length - 1];
  const itens = [];       // { tipo:'palavra', partes:[{texto,fonte,tam,cor}] } | { tipo:'br', tam }
  let palavra = null;     // palavra em construção
  const fechaPalavra = () => { if (palavra) { itens.push(palavra); palavra = null; } };
  const texto_ = (s) => {
    s = decodifica(s);
    const pedacos = s.split(/([ \t\r\n\f\v]+)/);
    for (const p of pedacos) {
      if (p === '') continue;
      if (/^[ \t\r\n\f\v]+$/.test(p)) { fechaPalavra(); continue; }
      const f = atual();
      if (!palavra) palavra = { tipo: 'palavra', partes: [] };
      palavra.partes.push({ texto: p, fonte: fonteCom(f.fonte, f.b, f.i), tam: f.tam, cor: f.cor });
    }
  };
  const re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
  let pos = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > pos) texto_(t.slice(pos, m.index));
    pos = m.index + m[0].length;
    const fecha = m[1] === '/', tag = m[2].toLowerCase(), auto = m[4] === '/';
    if (tag === 'br') { fechaPalavra(); itens.push({ tipo: 'br', tam: atual().tam }); continue; }
    if (fecha) { if (pilha.length > 1) pilha.pop(); continue; }
    const n = Object.assign({}, atual());
    if (tag === 'b' || tag === 'strong') n.b = true;
    else if (tag === 'i' || tag === 'em') n.i = true;
    else if (tag === 'font' || tag === 'span') {
      const at = atributos(m[3]);
      if (at.size || at.fontsize) n.tam = parseFloat(at.size || at.fontsize);
      if (at.name || at.face || at.fontname) n.fonte = at.name || at.face || at.fontname;
      if (at.color || at.fg) n.cor = cor(at.color || at.fg);
    }
    if (!auto) pilha.push(n);
  }
  if (pos < t.length) texto_(t.slice(pos));
  fechaPalavra();
  return { estilo: st, itens };
}

const largPalavra = (p) => p.partes.reduce((s, q) => s + stringWidth(q.texto, q.fonte, q.tam), 0);
const ultimaParte = (p) => p.partes[p.partes.length - 1];

class Paragraph extends Flowable {
  constructor(texto, estilo) {
    super();
    const a = analisa(texto === null || texto === undefined ? '' : texto, estilo || getSampleStyleSheet().Normal);
    this.style = a.estilo;
    this.itens = a.itens;
  }
  minWidth() {
    let w = 0;
    for (const it of this.itens) if (it.tipo === 'palavra') w = Math.max(w, largPalavra(it));
    return w;
  }
  /** quebra em linhas como o breakLines do ReportLab */
  _quebra(larguras) {
    const linhas = [];
    let lin = null;
    const nova = () => ({ palavras: [], larg: 0, tam: 0 });
    for (const it of this.itens) {
      if (!lin) lin = nova();
      if (it.tipo === 'br') {
        if (!lin.palavras.length) lin.tam = Math.max(lin.tam, it.tam);
        lin.porBr = it.tam;
        linhas.push(lin); lin = null; continue;
      }
      const max = larguras[Math.min(linhas.length, 1)];
      let w = largPalavra(it);
      const esp = lin.palavras.length ? stringWidth(' ', ultimaParte(lin.palavras[lin.palavras.length - 1]).fonte, ultimaParte(lin.palavras[lin.palavras.length - 1]).tam) : 0;
      // spaceShrinkage (0,05): os espaços podem encolher 5% para caber mais uma palavra
      if (lin.palavras.length) {
        let encolhe = esp;
        for (let k = 1; k < lin.palavras.length; k++) { const u = ultimaParte(lin.palavras[k - 1]); encolhe += stringWidth(' ', u.fonte, u.tam); }
        if (lin.larg + esp + w > max + encolhe * 0.05) { linhas.push(lin); lin = nova(); }
      }
      // palavra maior que a linha: quebrada nas letras (splitLongWords)
      const maxL = larguras[Math.min(linhas.length, 1)];
      if (!lin.palavras.length && w > maxL + FUZZ && it.partes.length === 1 && it.partes[0].texto.length > 1) {
        const q = it.partes[0];
        let resto = q.texto;
        while (resto) {
          const lim = larguras[Math.min(linhas.length, 1)];
          let k = 1;
          while (k < resto.length && stringWidth(resto.slice(0, k + 1), q.fonte, q.tam) <= lim + FUZZ) k++;
          const pedaco = { tipo: 'palavra', partes: [Object.assign({}, q, { texto: resto.slice(0, k) })] };
          resto = resto.slice(k);
          lin.palavras.push(pedaco); lin.larg = largPalavra(pedaco); lin.tam = Math.max(lin.tam, q.tam);
          if (resto) { linhas.push(lin); lin = nova(); }
        }
        continue;
      }
      lin.larg += (lin.palavras.length ? esp : 0) + w;
      lin.palavras.push(it);
      for (const q of it.partes) lin.tam = Math.max(lin.tam, q.tam);
    }
    if (lin && lin.palavras.length) linhas.push(lin);
    for (const l of linhas) if (!l.tam) l.tam = this.style.fontSize;
    return linhas;
  }
  wrap(availWidth) {
    const s = this.style;
    this.width = availWidth;
    if (!this._linhasFixas) this.linhas = this._quebra([availWidth - s.leftIndent - s.firstLineIndent - s.rightIndent, availWidth - s.leftIndent - s.rightIndent]);
    this.height = this.linhas.length * s.leading;
    return [this.width, this.height];
  }
  split(availWidth, availHeight) {
    this.wrap(availWidth);
    const s = this.style, n = this.linhas.length;
    if (availHeight < s.leading - FUZZ) return [];
    let k = Math.floor((availHeight + FUZZ) / s.leading);
    if (k >= n) return [this];
    if (k === 1 && n > 1) return [];      // allowOrphans = 0
    const parte = (linhas, primeira) => {
      const p = Object.create(Paragraph.prototype);
      Object.assign(p, this, { linhas, _linhasFixas: true, style: Object.assign({}, s, primeira ? { spaceAfter: 0 } : { spaceBefore: 0, firstLineIndent: 0 }) });
      return p;
    };
    // como o ReportLab: se a última linha da 1ª parte terminou num <br/>, a
    // 2ª parte começa por esse <br/> (uma linha vazia)
    const resto = this.linhas.slice(k);
    if (this.linhas[k - 1].porBr !== undefined) resto.unshift({ palavras: [], larg: 0, tam: this.linhas[k - 1].porBr, porBr: this.linhas[k - 1].porBr });
    return [parte(this.linhas.slice(0, k), true), parte(resto, false)];
  }
  draw(canv, x, y) {
    const s = this.style;
    if (!this.linhas || !this.linhas.length) return;
    let base = y + this.height - this.linhas[0].tam;
    this.linhas.forEach((l, i) => {
      const ini = s.leftIndent + (i === 0 && !this._linhasFixas ? s.firstLineIndent : 0);
      const disp = this.width - ini - s.rightIndent;
      let xx = x + ini, ajuste = 0;
      if (l.larg - disp > 1e-8 && l.palavras.length > 1) ajuste = (disp - l.larg) / (l.palavras.length - 1);   // espaços encolhidos
      else if (s.alignment === TA_CENTER) xx += (disp - l.larg) / 2;
      else if (s.alignment === TA_RIGHT) xx += disp - l.larg;
      l.palavras.forEach((p, j) => {
        if (j) { const u = ultimaParte(l.palavras[j - 1]); xx += stringWidth(' ', u.fonte, u.tam) + ajuste; }
        for (const q of p.partes) {
          canv.setFillColor(q.cor || [0, 0, 0]);
          canv.setFont(q.fonte, q.tam);
          canv.drawString(xx, base, q.texto);
          xx += stringWidth(q.texto, q.fonte, q.tam);
        }
      });
      base -= s.leading;
    });
  }
}

// ---------------------------------------------------------------- Table
const ehFlowable = (v) => v instanceof Flowable;
const textoCelula = (v) => (v === null || v === undefined ? '' : String(v));
function estiloCelula() {
  return { fontname: 'Helvetica', fontsize: 10, leading: 12, leftPadding: 6, rightPadding: 6, topPadding: 3, bottomPadding: 3, color: [0, 0, 0], alignment: 'LEFT', valign: 'BOTTOM' };
}
const LINHAS = ['GRID', 'BOX', 'OUTLINE', 'INNERGRID', 'LINEBELOW', 'LINEABOVE', 'LINEBEFORE', 'LINEAFTER'];

class Table extends Flowable {
  constructor(data, { colWidths = null, rowHeights = null, style = null } = {}) {
    super();
    if (Array.isArray(style) || style === null) style = style || [];
    this.hAlign = 'CENTER';
    this._nrows = data.length;
    this._ncols = data.length ? Math.max(...data.map((r) => r.length)) : 0;
    this._cellvalues = data.map((r) => { const l = r.map((c) => (c === null || c === undefined ? '' : c)); while (l.length < this._ncols) l.push(''); return l; });
    this._argW = Array.isArray(colWidths) ? colWidths.slice() : Array(this._ncols).fill(colWidths);
    this._argH = Array.isArray(rowHeights) ? rowHeights.slice() : Array(this._nrows).fill(rowHeights);
    this._cellStyles = this._cellvalues.map((r) => r.map(() => estiloCelula()));
    this._bkgrndcmds = []; this._linecmds = []; this._spanCmds = [];
    this._comandos = [];
    for (const c of style) this._addCommand(c);
  }
  _norm(sc, ec, sr, er) {
    if (sc < 0) sc += this._ncols; if (ec < 0) ec += this._ncols;
    if (sr < 0) sr += this._nrows; if (er < 0) er += this._nrows;
    return [sc, ec, sr, er];
  }
  _addCommand(cmd) {
    this._comandos.push(cmd);
    const op = cmd[0];
    if (op === 'BACKGROUND') this._bkgrndcmds.push(cmd);
    else if (op === 'SPAN') this._spanCmds.push(cmd);
    else if (LINHAS.includes(op)) {
      const c = cmd.slice();
      c[5] = c.length > 5 ? c[5] : 1;            // ponta (round)
      c[6] = c.length > 6 ? c[6] : null;         // tracejado
      this._linecmds.push(c);
    } else {
      const [sc, ec, sr, er] = this._norm(cmd[1][0], cmd[2][0], cmd[1][1], cmd[2][1]);
      const v = cmd.slice(3);
      for (let i = sr; i <= er; i++) for (let j = sc; j <= ec; j++) {
        const s = this._cellStyles[i] && this._cellStyles[i][j];
        if (!s) continue;
        if (op === 'ALIGN' || op === 'ALIGNMENT') s.alignment = v[0];
        else if (op === 'VALIGN') s.valign = v[0];
        else if (op === 'FONT') { s.fontname = v[0]; if (v.length > 1) { s.fontsize = v[1]; s.leading = v.length > 2 ? v[2] : v[1] * 1.2; } }
        else if (op === 'FONTNAME' || op === 'FACE') s.fontname = v[0];
        else if (op === 'FONTSIZE' || op === 'SIZE') s.fontsize = v[0];
        else if (op === 'LEADING') s.leading = v[0];
        else if (op === 'TEXTCOLOR') s.color = cor(v[0]);
        else if (op === 'LEFTPADDING') s.leftPadding = v[0];
        else if (op === 'RIGHTPADDING') s.rightPadding = v[0];
        else if (op === 'TOPPADDING') s.topPadding = v[0];
        else if (op === 'BOTTOMPADDING') s.bottomPadding = v[0];
      }
    }
  }
  _canGetWidth(v) {
    if (Array.isArray(v)) return v.every((e) => this._canGetWidth(e));
    if (ehFlowable(v)) return v._fixedWidth;
    return true;
  }
  _elementWidth(v, s) {
    if (Array.isArray(v)) { let w = 0; for (const e of v) w = Math.max(w, this._elementWidth(e, s)); return w; }
    if (ehFlowable(v)) { if (v._fixedWidth) return v.width; return v.minWidth ? v.minWidth() : 0; }
    return Math.max(...textoCelula(v).split('\n').map((x) => stringWidth(x, s.fontname, s.fontsize)));
  }
  _lista(v) { return Array.isArray(v) ? v.flat(Infinity) : [v]; }
  _listCellGeom(V, w, s, W = null, H = null, aH = 72000) {
    if (!V.length) return [0, 0];
    const aW = w - s.leftPadding - s.rightPadding;
    aH = aH - s.topPadding - s.bottomPadding;
    let t = 0, ww = 0, sb0 = null, sa = 0;
    for (const v of V) {
      const [vw, vh] = v.wrap(aW, aH);
      const sb = v.getSpaceBefore(); sa = v.getSpaceAfter();
      if (W) W.push(vw); if (H) H.push(vh);
      ww = Math.max(ww, vw);
      t += vh + sa + sb;
      if (sb0 === null) sb0 = sb;
    }
    return [ww, t - sb0 - sa];
  }
  _calcSpanRanges() {
    this._spanRanges = {};
    this._colSpanCells = new Set(); this._rowSpanCells = new Set();
    for (let x = 0; x < this._ncols; x++) for (let y = 0; y < this._nrows; y++) this._spanRanges[`${x},${y}`] = [x, y, x, y];
    for (const [, a, b] of this._spanCmds) {
      let [x0, x1, y0, y1] = this._norm(a[0], b[0], a[1], b[1]);
      if (x0 > x1) [x0, x1] = [x1, x0];
      if (y0 > y1) [y0, y1] = [y1, y0];
      if (x0 !== x1 || y0 !== y1) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (x0 !== x1) this._colSpanCells.add(`${x},${y}`);
          if (y0 !== y1) this._rowSpanCells.add(`${x},${y}`);
          this._spanRanges[`${x},${y}`] = null;
        }
        this._spanRanges[`${x0},${y0}`] = [x0, y0, x1, y1];
      }
    }
  }
  _calcPreliminaryWidths(availWidth) {
    const W = this._argW.slice();
    let totalDefined = 0, numberUndefined = 0;
    for (const w of W) { if (w === null || w === undefined) numberUndefined++; else totalDefined += w; }
    const minimums = new Map();
    let totalMinimum = 0;
    for (let c = 0; c < this._ncols; c++) {
      if (W[c] === null || W[c] === undefined) {
        let final = 0;
        for (let r = 0; r < this._nrows; r++) {
          const s = this._cellStyles[r][c];
          final = Math.max(final, (this._elementWidth(this._cellvalues[r][c], s) || 0) + s.leftPadding + s.rightPadding);
        }
        minimums.set(c, final); totalMinimum += final;
      }
    }
    if (!minimums.size) return null;
    let remaining = availWidth - (totalMinimum + totalDefined);
    if (remaining > 0) {
      let percentTotal = (totalDefined / availWidth) * 100;
      let defaultDesired = 1;
      if (numberUndefined && percentTotal < 100) {
        const defaultWeight = (100 - percentTotal) / numberUndefined;
        percentTotal = 100;
        defaultDesired = (defaultWeight / percentTotal) * availWidth;
      }
      const desired = [];
      let totalDesired = 0, effectiveRemaining = remaining;
      for (const [c, minimum] of minimums) {
        const d = defaultDesired;
        if (d <= minimum) W[c] = minimum;
        else { desired.push([d - minimum, minimum, d, c]); totalDesired += d; effectiveRemaining += minimum; }
      }
      if (desired.length) {
        let proportion = effectiveRemaining / totalDesired;
        desired.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
        const finalSet = [];
        for (const [, minimum, d, c] of desired) {
          if (proportion * d < minimum) {
            W[c] = minimum; totalDesired -= d; effectiveRemaining -= minimum;
            if (totalDesired) proportion = effectiveRemaining / totalDesired;
          } else finalSet.push([minimum, d, c]);
        }
        for (const [, d, c] of finalSet) W[c] = proportion * d;
      }
    } else {
      remaining = availWidth - totalDefined;
      const adj = remaining <= 0 ? 1 : remaining / totalMinimum;
      for (const [c, minimum] of minimums) W[c] = minimum * adj;
    }
    this._argW = W;
    return W;
  }
  _calcWidth(W) {
    W = (W || this._argW).slice();
    if (W.some((w) => w === null || w === undefined)) {
      const spanCons = new Map();
      const W0 = W.slice();
      for (let j = 0; j < this._ncols; j++) {
        if (W[j] !== null && W[j] !== undefined) continue;
        let w = 0;
        for (let i = 0; i < this._nrows; i++) {
          const v = this._cellvalues[i][j], s = this._cellStyles[i][j];
          const k = `${j},${i}`;
          const span = this._spanCmds.length ? this._spanRanges[k] : [j, i, j, i];
          let t;
          if (this._spanCmds.length && this._colSpanCells.has(k) && !span) t = 0;
          else {
            t = this._elementWidth(v, s) + s.leftPadding + s.rightPadding;
            if (span && span[0] !== span[2]) { const x = `${span[0]},${span[2]}`; spanCons.set(x, Math.max(spanCons.get(x) || t, t)); t = 0; }
          }
          w = Math.max(w, t);
        }
        W[j] = w;
      }
      if (spanCons.size) spanFixDim(W0, W, spanCons);
    }
    this._colWidths = W;
    this._colpositions = [0];
    let x = 0;
    for (const w of W) { x += w; this._colpositions.push(x); }
    this._width = x;
  }
  _calcHeight(W) {
    W = W || this._argW;
    const H = this._argH.slice();
    if (H.some((h) => h === null || h === undefined)) {
      const H0 = this._argH.slice();
      const spanCons = new Map();
      for (let i = 0; i < this._nrows; i++) {
        if (H[i] !== null && H[i] !== undefined) continue;
        let h = 0;
        for (let j = 0; j < this._ncols; j++) {
          let v = this._cellvalues[i][j]; const s = this._cellStyles[i][j];
          let w = W[j];
          const k = `${j},${i}`;
          const span = this._spanCmds.length ? this._spanRanges[k] : [j, i, j, i];
          if (this._spanCmds.length && this._rowSpanCells.has(k) && !span) continue;
          let t;
          if (Array.isArray(v) || ehFlowable(v)) {
            v = this._cellvalues[i][j] = this._lista(v);
            if (this._spanCmds.length && this._colSpanCells.has(k)) {
              if (!span) continue;
              w = Math.max(this._colpositions[span[2] + 1] - this._colpositions[span[0]], w || 0);
            }
            if (w === null || w === undefined) w = Math.max(0, ...v.map((e) => e.wrap(72000, 72000)[0]));
            t = this._listCellGeom(v, w, s)[1];
          } else {
            t = (s.leading || 1.2 * s.fontsize) * textoCelula(v).split('\n').length;
          }
          t += s.bottomPadding + s.topPadding;
          if (span && span[1] !== span[3]) { const x = `${span[1]},${span[3]}`; spanCons.set(x, Math.max(spanCons.get(x) || t, t)); t = 0; }
          h = Math.max(h, t);
        }
        H[i] = h;
      }
      if (spanCons.size) spanFixDim(H0, H, spanCons);
    }
    this._rowHeights = H;
    this._rowpositions = [];
    let y = 0;
    for (let i = H.length - 1; i >= 0; i--) { this._rowpositions.push(y); y += H[i]; }
    this._rowpositions.push(y);
    this._rowpositions.reverse();
    this._height = y;
  }
  _calcSpanRects() {
    this._spanRects = {}; this._hBlocks = new Map(); this._vBlocks = new Map();
    const cp = this._colpositions, rp = this._rowpositions;
    for (const [k, v] of Object.entries(this._spanRanges)) {
      if (!v) { this._spanRects[k] = null; continue; }
      const [c0, r0, c1, r1] = v;
      if (c1 - c0 > 0) for (let c = c0 + 1; c <= c1; c++) { const a = this._vBlocks.get(cp[c]) || []; a.push([rp[r1 + 1], rp[r0]]); this._vBlocks.set(cp[c], a); }
      if (r1 - r0 > 0) for (let r = r0 + 1; r <= r1; r++) { const a = this._hBlocks.get(rp[r]) || []; a.push([cp[c0], cp[c1 + 1]]); this._hBlocks.set(rp[r], a); }
      this._spanRects[k] = [cp[c0], rp[r1 + 1], cp[c1 + 1] - cp[c0], rp[r0] - rp[r1 + 1]];
    }
    for (const m of [this._hBlocks, this._vBlocks]) for (const a of m.values()) a.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  }
  wrap(availWidth, availHeight) {
    let W = null;
    if (this._argW.some((w) => w === null || w === undefined) && this._cellvalues.some((r) => r.some((v) => !this._canGetWidth(v)))) {
      W = this._calcPreliminaryWidths(availWidth);
    }
    if (this._spanCmds.length) {
      this._calcSpanRanges();
      if (this._argH.some((h) => h === null || h === undefined)) this._calcWidth(W);
    }
    this._calcHeight(W);
    this._calcWidth(W);
    if (this._spanCmds.length) this._calcSpanRects();
    this.width = this._width; this.height = this._height;
    return [this._width, this._height];
  }
  /** divide por linhas (splitByRow), sem dividir dentro da linha */
  split(availWidth, availHeight) {
    this.wrap(availWidth, availHeight);
    let n = 0, h = 0;
    for (const rh of this._rowHeights) { if (h + rh > availHeight + FUZZ) break; h += rh; n++; }
    if (n === 0 || n >= this._nrows || this._spanCmds.length) return n >= this._nrows ? [this] : [];
    const parte = (r0, r1) => {
      const cmds = [];
      for (const c of this._comandos) {
        const [sc, ec, sr, er] = this._norm(c[1][0], c[2][0], c[1][1], c[2][1]);
        const a = Math.max(sr, r0), b = Math.min(er, r1 - 1);
        if (a > b) continue;
        cmds.push([c[0], [sc, a - r0], [ec, b - r0], ...c.slice(3)]);
      }
      const t = new Table(this._cellvalues.slice(r0, r1), { colWidths: this._argW, rowHeights: this._argH.slice(r0, r1), style: cmds });
      t.hAlign = this.hAlign;
      return t;
    };
    return [parte(0, n), parte(n, this._nrows)];
  }
  draw(canv, x, y) {
    canv.saveState();
    this._canv = canv; this._x = x; this._y = y;
    this._drawBkgrnd();
    for (let r = 0; r < this._nrows; r++) for (let c = 0; c < this._ncols; c++) {
      let rect;
      if (this._spanCmds.length) { rect = this._spanRects[`${c},${r}`]; if (!rect) continue; }
      else rect = [this._colpositions[c], this._rowpositions[r + 1], this._colWidths[c], this._rowHeights[r]];
      this._drawCell(this._cellvalues[r][c], this._cellStyles[r][c], rect);
    }
    this._drawLines();
    canv.restoreState();
  }
  _drawBkgrnd() {
    const canv = this._canv, X = this._x, Y = this._y;
    for (const [, a, b, arg] of this._bkgrndcmds) {
      const [sc, ec, sr, er] = this._norm(a[0], b[0], a[1], b[1]);
      let x0 = this._colpositions[sc], y0 = this._rowpositions[sr];
      const x1 = this._colpositions[Math.min(ec + 1, this._ncols)], y1 = this._rowpositions[Math.min(er + 1, this._nrows)];
      let w = x1 - x0, h = y1 - y0;
      const c = cor(arg);
      if (!c) continue;
      if (ec === sc && er === sr && this._spanRects) { const r = this._spanRects[`${sc},${sr}`]; if (r) [x0, y0, w, h] = r; }
      canv.setFillColor(c);
      canv.rect(X + x0, Y + y0, w, h, 0, 1);
    }
  }
  _drawCell(v, s, [cx, cy, cw, ch]) {
    const canv = this._canv, X = this._x + cx, Y = this._y + cy;
    canv.setFillColor(s.color);
    canv.setFont(s.fontname, s.fontsize, s.leading);
    if (Array.isArray(v) || ehFlowable(v)) {
      const V = this._lista(v), W = [], H = [];
      const [, h] = this._listCellGeom(V, cw, s, W, H, ch);
      let y;
      if (s.valign === 'TOP') y = Y + ch - s.topPadding;
      else if (s.valign === 'BOTTOM') y = Y + s.bottomPadding + h;
      else y = Y + (ch + s.bottomPadding - s.topPadding + h) / 2;
      if (V.length) y += V[0].getSpaceBefore();
      V.forEach((f, i) => {
        let x;
        if (s.alignment === 'RIGHT') x = X + cw - s.rightPadding - W[i];
        else if (s.alignment === 'CENTER' || s.alignment === 'CENTRE') x = X + (cw + s.leftPadding - s.rightPadding - W[i]) / 2;
        else x = X + s.leftPadding;
        y -= f.getSpaceBefore();
        y -= H[i];
        f.draw(canv, x, y);
        y -= f.getSpaceAfter();
      });
    } else {
      const linhas = textoCelula(v).split('\n'), n = linhas.length;
      let draw, x;
      if (s.alignment === 'CENTER' || s.alignment === 'CENTRE') { draw = 'drawCentredString'; x = X + (cw + s.leftPadding - s.rightPadding) * 0.5; }
      else if (s.alignment === 'RIGHT') { draw = 'drawRightString'; x = X + cw - s.rightPadding; }
      else { draw = 'drawString'; x = X + s.leftPadding; }
      let y;
      if (s.valign === 'TOP') y = Y + ch - s.topPadding - s.fontsize;
      else if (s.valign === 'MIDDLE') y = Y + (s.bottomPadding + ch - s.topPadding + n * s.leading) / 2 - s.fontsize;
      else y = Y + s.bottomPadding + n * s.leading - s.fontsize;
      canv.setFillColor(s.color);
      canv.setFont(s.fontname, s.fontsize, s.leading);
      for (const l of linhas) { canv[draw](x, y, l); y -= s.leading; }
    }
  }
  _drawLines() {
    const canv = this._canv;
    for (const [op, a, b, peso, c, ponta, tracejado] of this._linecmds) {
      const [sc, ec, sr, er] = this._norm(a[0], b[0], a[1], b[1]);
      canv.setLineCap(ponta);
      canv.setDash(tracejado);
      const H = (s0, e0, r0, r1) => this._hLines(s0, e0, r0, r1, peso, c);
      const V = (c0, c1, s0, e0) => this._vLines(c0, c1, s0, e0, peso, c);
      if (op === 'GRID') { H(sc, ec, sr, er + 1); V(sc, ec + 1, sr, er); }
      else if (op === 'BOX' || op === 'OUTLINE') { H(sc, ec, sr, sr); H(sc, ec, er + 1, er + 1); V(sc, sc, sr, er); V(ec + 1, ec + 1, sr, er); }
      else if (op === 'INNERGRID') { H(sc, ec, sr + 1, er); V(sc + 1, ec, sr, er); }
      else if (op === 'LINEBELOW') H(sc, ec, sr + 1, er + 1);
      else if (op === 'LINEABOVE') H(sc, ec, sr, er);
      else if (op === 'LINEBEFORE') V(sc, ec, sr, er);
      else if (op === 'LINEAFTER') V(sc + 1, ec + 1, sr, er);
    }
  }
  /** _drawHLines: linhas horizontais nas posições de linha r0..r1, das colunas sc..ec */
  _hLines(sc, ec, r0, r1, peso, c) {
    const ecp = this._colpositions.slice(sc, ec + 2), rp = this._rowpositions.slice(r0, r1 + 1);
    if (ecp.length <= 1 || rp.length < 1) return;
    this._canv.setStrokeColor(c); this._canv.setLineWidth(peso);
    for (const y of rp) this._hLine((x0, y0, x1, y1) => this._canv.line(this._x + x0, this._y + y0, this._x + x1, this._y + y1), ecp[0], ecp[ecp.length - 1], y, this._hBlocks);
  }
  _vLines(c0, c1, sr, er, peso, c) {
    const erp = this._rowpositions.slice(sr, er + 2), cp = this._colpositions.slice(c0, c1 + 1);
    if (erp.length <= 1 || cp.length < 1) return;
    this._canv.setStrokeColor(c); this._canv.setLineWidth(peso);
    for (const x of cp) this._hLine((y0, x0, y1, x1) => this._canv.line(this._x + x0, this._y + y0, this._x + x1, this._y + y1), erp[erp.length - 1], erp[0], x, this._vBlocks);
  }
  _hLine(linha, scp, ecp, y, blocos) {
    const B = blocos && blocos.get(y);
    if (!B || scp >= B[B.length - 1][1] - FUZZ || ecp <= B[0][0] + FUZZ) { linha(scp, y, ecp, y); return; }
    let i = 0;
    while (scp < ecp - FUZZ && i < B.length) {
      const [x0, x1] = B[i];
      if (x1 <= scp + FUZZ || x0 >= ecp - FUZZ) { i++; continue; }
      const i0 = Math.max(scp, x0), i1 = Math.min(ecp, x1);
      if (i0 > scp) linha(scp, y, i0, y);
      scp = i1;
    }
    if (scp < ecp - FUZZ) linha(scp, y, ecp, y);
  }
}

function spanFixDim(V0, V, spanCons) {
  const M = new Map();
  const itens = [...spanCons.entries()].map(([k, v]) => [v, k.split(',').map(Number)]);
  itens.sort((a, b) => b[0] - a[0] || b[1][0] - a[1][0] || b[1][1] - a[1][1]);
  for (let [v, [x0, x1]] of itens) {
    if (x0 >= V0.length) continue;
    x1 += 1;
    let t = 0;
    for (let x = x0; x < x1; x++) t += V[x] + (M.get(x) || 0);
    if (t >= v - FUZZ) continue;
    const X = [];
    for (let x = x0; x < x1; x++) if (V0[x] === null || V0[x] === undefined) X.push(x);
    if (!X.length) continue;
    v = (v - t) / X.length;
    for (const x of X) M.set(x, (M.get(x) || 0) + v);
  }
  for (const [x, v] of M) V[x] += v;
}

// ---------------------------------------------------- SimpleDocTemplate
class LayoutError extends Error {}

class SimpleDocTemplate {
  constructor({ pagesize = A4, title = null, leftMargin = inch, rightMargin = inch, topMargin = inch, bottomMargin = inch } = {}) {
    Object.assign(this, { pagesize, title, leftMargin, rightMargin, topMargin, bottomMargin });
    this.width = pagesize[0] - leftMargin - rightMargin;
    this.height = pagesize[1] - topMargin - bottomMargin;
  }
  /** monta o PDF; devolve o Buffer */
  async build(elementos, { onFirstPage = null, onLaterPages = null, numeraPaginas: numera = null } = {}) {
    const canv = new Canvas({ pagesize: this.pagesize, numeraPaginas: numera });
    if (this.title !== null && this.title !== undefined) canv.setTitle(this.title);
    const P = 6;   // padding do Frame
    const x1 = this.leftMargin, yTopo = this.bottomMargin + this.height;
    const aW = this.width - 2 * P;
    let pagina = 0, y = 0, noTopo = true, espacoAnt = 0, aberta = false;
    const comeca = () => {
      pagina++;
      aberta = true; noTopo = true; espacoAnt = 0;
      y = yTopo - P;
      const cb = pagina === 1 ? onFirstPage : onLaterPages;
      if (cb) cb(canv, this);
    };
    const termina = () => { canv.showPage(); aberta = false; };
    const fila = elementos.slice();
    while (fila.length) {
      const f = fila.shift();
      if (!aberta) comeca();
      if (f.quebra) { if (!fila.length) break; termina(); continue; }
      const piso = this.bottomMargin + P;
      let s = 0;
      if (!noTopo) s = Math.max(f.getSpaceBefore() - espacoAnt, 0);
      const disp = y - piso - s;
      let coube = false;
      if (disp > 0) {
        const [w, h] = f.wrap(aW, disp);
        if (y - (h + s) >= piso - 1e-8) {
          f.drawOn(canv, x1 + P, y - h - s, aW - w);
          y -= h + s;
          const sa = f.getSpaceAfter();
          y -= sa; espacoAnt = sa; noTopo = false; coube = true;
        }
      }
      if (coube) continue;
      const partes = disp > 0 ? f.split(aW, disp) : [];
      if (partes.length > 1) { fila.unshift(...partes); continue; }
      if (noTopo) throw new LayoutError(`Flowable ${f.constructor.name} too large on page ${pagina}`);
      termina();
      fila.unshift(f);
    }
    if (aberta) termina();
    return canv.save();
  }
}

/** resposta PDF como o HttpResponse(content_type='application/pdf') do Django */
function envia(res, buffer, nome) {
  res.status(200);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${nome}"`);
  res.send(buffer);
}

module.exports = {
  A4, letter, mm, inch, TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY, colors, HexColor, stringWidth,
  Canvas, numeraPaginas, viaReceita, ParagraphStyle, getSampleStyleSheet,
  Flowable, Paragraph, Spacer, Image, PageBreak, Table, SimpleDocTemplate, LayoutError, envia,
};
