'use strict';
/**
 * request.GET / request.POST do Django: chaves literais (sem interpretar
 * "a[]"), vários valores por chave, .get() devolve o último.
 */
class QueryDict {
  constructor(texto) {
    this._d = new Map();
    if (!texto) return;
    const params = new URLSearchParams(texto);
    for (const [k, v] of params) {
      if (!this._d.has(k)) this._d.set(k, []);
      this._d.get(k).push(v);
    }
  }
  static deObjeto(obj) {
    const q = new QueryDict('');
    for (const [k, v] of Object.entries(obj || {})) {
      q._d.set(k, Array.isArray(v) ? v.map((x) => (x === null || x === undefined ? '' : (typeof x === 'object' ? JSON.stringify(x) : String(x))))
        : [v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))]);
    }
    return q;
  }
  get(k, padrao = null) { const l = this._d.get(k); return l && l.length ? l[l.length - 1] : padrao; }
  getlist(k) { return (this._d.get(k) || []).slice(); }
  has(k) { return this._d.has(k); }
  keys() { return [...this._d.keys()]; }
  /** como dict(QueryDict) no Python: valor = último da lista */
  dict() { const o = {}; for (const k of this._d.keys()) o[k] = this.get(k); return o; }
  get tamanho() { return this._d.size; }
}

module.exports = QueryDict;
