'use strict';
/**
 * Valor por extenso dos recibos: tradução linha a linha de
 * Cadastros/Pacientes/extenso.py (Ramiro Batista da Luz, GPL), com as mesmas
 * grafias ("Seissentos", "Setessentos", "Hum mil"...) para os recibos saírem
 * iguais aos do AppClinic. Onde o Python dava erro, aqui também dá.
 */
class ErroPython extends Error {}

function chave(dic, k) {
  if (!Object.prototype.hasOwnProperty.call(dic, k)) throw new ErroPython(`KeyError: ${k}`);
  return dic[k];
}
function int(s) {
  const t = String(s).trim();
  if (!/^[-+]?\d+$/.test(t)) throw new ErroPython(`ValueError: invalid literal for int(): '${s}'`);
  return parseInt(t, 10);
}
const zfill = (s, n) => (s.length >= n ? s : '0'.repeat(n - s.length) + s);

const D = [
  { 1: 'Um', 2: 'Dois', 3: 'Tres', 4: 'Quatro', 5: 'Cinco', 6: 'Seis', 7: 'Sete', 8: 'Oito', 9: 'Nove' },
  { 10: 'Dez', 11: 'Onze', 12: 'Doze', 13: 'Treze', 14: 'Quatorze', 15: 'Quinze', 16: 'Dezesseis', 17: 'Dezessete',
    18: 'Dezoito', 19: 'Dezenove', 20: 'Vinte', 30: 'Trinta', 40: 'Quarenta', 50: 'Cinquenta', 60: 'Sessenta',
    70: 'Setenta', 80: 'Oitenta', 90: 'Noventa' },
  { 100: 'Cem', 1: 'Cento', 2: 'Duzentos', 3: 'Trezentos', 4: 'Quatrocentos', 5: 'Quinhentos', 6: 'Seissentos',
    7: 'Setessentos', 8: 'Oitocentos', 9: 'Novecentos' },
];
const GRANDEZA = ['', ' mil ', ' milhão ', ' milhões '];

function pyIndex(s, i) {           // s[i] do Python (índice negativo; IndexError fora)
  const j = i < 0 ? s.length + i : i;
  if (j < 0 || j >= s.length) throw new ErroPython('IndexError: string index out of range');
  return s[j];
}

function separa(num) {
  const s = String(num);
  if (s.includes('.')) {
    const partes = s.split('.');
    if (partes.length !== 2) throw new ErroPython('ValueError: too many values to unpack');
    return partes;
  }
  return [s, ''];
}

function centavos(txt) {
  if (txt.length === 1) txt = txt + '0';
  let sufixo = ' centavos';
  let r = '';
  if (txt) {
    if (int(txt) > 0) {
      if (pyIndex(txt, 0) === '0') {
        txt = pyIndex(txt, 0) + pyIndex(txt, 1);
        if (int(txt) === 1) sufixo = ' centavo';
        r = chave(D[0], int(txt)) + sufixo;
      } else if (pyIndex(txt, 1) === '0' || int(txt) < 21) {
        r = chave(D[1], int(txt)) + sufixo;
      } else {
        r = chave(D[1], int(pyIndex(txt, 0) + '0')) + ' e ' + chave(D[0], int(pyIndex(txt, 1))) + sufixo;
      }
    }
  }
  return r;
}

function inteiro(txt) {
  let r = '';
  if (txt) {
    if (int(txt) > 0) {
      txt = zfill(txt, 3);
      const n = int(txt);
      if (n < 10) r = chave(D[0], n) + r;
      else if (n < 100 && (pyIndex(txt, 2) === '0' || (n > 10 && n < 20))) r = chave(D[1], n);
      else if (n < 100) r = chave(D[1], int(pyIndex(txt, 1) + '0')) + ' e ' + chave(D[0], int(pyIndex(txt, 2)));
      else if (n === 100) r = chave(D[2], n);
      else if (n > 100 && n < 1000) {
        r = chave(D[2], int(pyIndex(txt, 0)));
        if (int(pyIndex(txt, 1)) > 0) r = r + ' e ' + inteiro(txt.slice(1, 3));
        else if (int(pyIndex(txt, 2)) > 0) r = r + ' e ' + inteiro(pyIndex(txt, 2));
      }
    }
  }
  return r;
}

/** extenso(num): num é o texto que o Python receberia (str(valor)) */
function extenso(num) {
  const [ti, td] = separa(num);
  let retorno = '';
  let sufixo = '';
  let contador = 0;
  let milhar = 0;
  let acumulador = '';
  let caracter = '';
  const temCentavos = td ? (int(td) > 0 ? 1 : 0) : 0;

  if (temCentavos) {
    if (int(ti) === 1) { retorno = 'Um real e ' + centavos(td); sufixo = ''; }
    else sufixo = ' reais e ';
  } else if (int(ti) === 1) { retorno = 'Um real'; sufixo = ''; }
  else sufixo = ' reais';

  if (ti && sufixo) {
    if (int(ti) > 0) {
      let indice = ti.length - 4;
      if (indice < 0) indice = 0;
      if (int(pyIndex(ti, indice) + '000') === 1000 && int(ti) > 999) {
        if (int(ti) === 1000) retorno = temCentavos ? 'Hum mil reais e ' + centavos(td) : 'Hum mil reais';
        else retorno = temCentavos ? 'Hum mil ' + inteiro(ti.slice(1, 4)) + ' reais e ' + centavos(td)
          : 'Hum mil ' + inteiro(ti.slice(1, 4)) + ' reais';
      } else {
        for (let i = -ti.length + 1; i <= 0; i++) {
          caracter = pyIndex(ti, i * -1);
          contador += 1;
          if (contador === 3 || ti.length === contador + 3 * milhar) {
            contador = 0;
            acumulador = caracter + acumulador;
            if (milhar > 1 && int(acumulador) > 1) milhar += 1;
            if (milhar >= GRANDEZA.length) throw new ErroPython('IndexError: list index out of range');
            retorno = inteiro(acumulador) + GRANDEZA[milhar] + sufixo + retorno;
            milhar += 1;
            sufixo = '';
            acumulador = '';
            caracter = '';
          }
          acumulador = caracter + acumulador;
        }
        retorno = retorno + centavos(td);
      }
    }
  }
  return retorno;
}

/** str(float) do Python para o valor do recibo (150 -> '150.0') */
function strFloat(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return n.toFixed(1);
  return String(n);
}

module.exports = { extenso, strFloat, ErroPython };
