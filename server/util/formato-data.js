'use strict';
/**
 * Filtro |date do Django (django.utils.dateformat), com os nomes em pt-BR
 * tirados do próprio Django (datas-ptbr.json).
 * Aceita Date ou texto 'AAAA-MM-DD[ HH:MM:SS[.ffffff]]' / 'HH:MM:SS'.
 */
const NOMES = require('./datas-ptbr.json');

const dois = (n) => String(n).padStart(2, '0');

function paraPartes(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    return { a: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), H: v.getHours(), i: v.getMinutes(),
      s: v.getSeconds(), u: v.getMilliseconds() * 1000, temData: true, temHora: true };
  }
  const t = String(v).replace('T', ' ');
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?/);
  if (m) {
    return { a: +m[1], m: +m[2], d: +m[3], H: +(m[4] || 0), i: +(m[5] || 0), s: +(m[6] || 0),
      u: m[7] ? +m[7].padEnd(6, '0') : 0, temData: true, temHora: m[4] !== undefined };
  }
  m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/);
  if (m) return { H: +m[1], i: +m[2], s: +(m[3] || 0), u: m[4] ? +m[4].padEnd(6, '0') : 0, temData: false, temHora: true };
  return null;
}

function diaSemana(p) {           // 0 = segunda (como os nomes exportados)
  const js = new Date(p.a, p.m - 1, p.d).getDay();   // 0 = domingo
  return (js + 6) % 7;
}

function hora12(H) { return H % 12 === 0 ? 12 : H % 12; }

function formata(valor, formato) {
  const p = paraPartes(valor);
  if (!p) return '';
  const f = formato === undefined ? 'N j, Y' : String(formato);
  let saida = '';
  for (let k = 0; k < f.length; k++) {
    const c = f[k];
    if (c === '\\') { saida += f[k + 1] || ''; k++; continue; }
    switch (c) {
      case 'd': saida += dois(p.d); break;
      case 'j': saida += p.d; break;
      case 'D': saida += NOMES.D[diaSemana(p)]; break;
      case 'l': saida += NOMES.l[diaSemana(p)]; break;
      case 'w': saida += (diaSemana(p) + 1) % 7; break;
      case 'm': saida += dois(p.m); break;
      case 'n': saida += p.m; break;
      case 'M': saida += NOMES.M[p.m - 1]; break;
      case 'F': saida += NOMES.F[p.m - 1]; break;
      case 'N': saida += NOMES.N[p.m - 1]; break;
      case 'b': saida += NOMES.b[p.m - 1]; break;
      case 'E': saida += NOMES.E[p.m - 1]; break;
      case 'y': saida += dois(p.a % 100); break;
      case 'Y': saida += p.a; break;
      case 'H': saida += dois(p.H); break;
      case 'G': saida += p.H; break;
      case 'h': saida += dois(hora12(p.H)); break;
      case 'g': saida += hora12(p.H); break;
      case 'i': saida += dois(p.i); break;
      case 's': saida += dois(p.s); break;
      case 'u': saida += String(p.u).padStart(6, '0'); break;
      case 'a': saida += p.H < 12 ? 'a.m.' : 'p.m.'; break;
      case 'A': saida += p.H < 12 ? 'AM' : 'PM'; break;
      case 'P':
        if (p.i === 0 && p.H === 0) saida += 'meia-noite';
        else if (p.i === 0 && p.H === 12) saida += 'meio-dia';
        else saida += `${hora12(p.H)}${p.i ? ':' + dois(p.i) : ''} ${p.H < 12 ? 'a.m.' : 'p.m.'}`;
        break;
      case 'c':
        saida += `${p.a}-${dois(p.m)}-${dois(p.d)}T${dois(p.H)}:${dois(p.i)}:${dois(p.s)}${p.u ? '.' + String(p.u).padStart(6, '0') : ''}`;
        break;
      default: saida += c;
    }
  }
  return saida;
}

module.exports = { formata, paraPartes };
