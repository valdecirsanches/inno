'use strict';
/**
 * Senhas no mesmo formato do Django (tb_usuarios.password):
 *   pbkdf2_sha256$<iterações>$<sal>$<hash base64>
 * Cada usuário entra no Inno com a senha que já usa no AppClinic.
 */
const crypto = require('crypto');

const ITERACOES = 260000;   // padrão do Django 3.2

function confere(senha, codificada) {
  if (!codificada || typeof codificada !== 'string') return false;
  const partes = codificada.split('$');
  if (partes.length !== 4) return false;
  const [alg, iter, sal, hash] = partes;
  const digest = { pbkdf2_sha256: 'sha256', pbkdf2_sha1: 'sha1' }[alg];
  if (!digest) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = crypto.pbkdf2Sync(String(senha), sal, parseInt(iter, 10), esperado.length, digest);
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

function codifica(senha) {
  // get_random_string(22) do Django: com menos de 22 letras o Django acha o sal
  // fraco e regrava a senha no próximo login (must_update)
  const ALFA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let sal = '';
  while (sal.length < 22) sal += ALFA[crypto.randomInt(ALFA.length)];
  const hash = crypto.pbkdf2Sync(String(senha), sal, ITERACOES, 32, 'sha256').toString('base64');
  return `pbkdf2_sha256$${ITERACOES}$${sal}$${hash}`;
}

/** Igual a get_session_auth_hash: trocar a senha encerra as sessões abertas. */
function hashDaSessao(codificada, segredo) {
  return crypto.createHmac('sha256', `inno.sessao${segredo}`).update(String(codificada || '')).digest('hex');
}

module.exports = { confere, codifica, hashDaSessao };
