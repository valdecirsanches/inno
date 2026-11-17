'use strict';
/**
 * Configuração do Inno. Tudo vem do arquivo .env (veja .env.exemplo):
 * nada de senha no código.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const env = (nome, padrao) => (process.env[nome] !== undefined && process.env[nome] !== '' ? process.env[nome] : padrao);

module.exports = {
  raiz: path.join(__dirname, '..'),
  porta: parseInt(env('PORTA', '8001'), 10),
  debug: env('DEBUG', '0') === '1',
  segredo: env('SECRET_KEY', ''),
  release: env('RELEASE', '2.0.17'),
  nomeSistema: env('NOME_SISTEMA', 'GERENCIADOR DE CLÍNICAS'),
  banco: {
    cliente: env('DB_CLIENT', 'mysql2'),          // mysql2 (produção) ou better-sqlite3 (testes)
    host: env('DB_HOST', '127.0.0.1'),
    porta: parseInt(env('DB_PORT', '3306'), 10),
    nome: env('DB_NAME', 'appclinic'),
    usuario: env('DB_USER', ''),
    senha: env('DB_PASSWORD', ''),
    arquivo: env('DB_FILE', ''),                  // só para better-sqlite3
  },
  // pasta media/ do AppClinic (documentos dos pacientes): as duas versões usam a mesma
  mediaRoot: env('MEDIA_ROOT', path.join(__dirname, '..', 'media')),
  // onde ficam os arquivos enviados: 'local' (MEDIA_ROOT) ou 'nuvem' (cloud-storage)
  armazenamento: env('ARMAZENAMENTO', 'local').trim().toLowerCase(),
  nuvem: { url: env('NUVEM_URL', ''), apiKey: env('NUVEM_API_KEY', '') },
  // mostrado na barra do sistema (user.hostdb / user.database no Django)
  bancoExibido: { host: env('DB_HOST_EXIBIDO', env('DB_HOST', '')), nome: env('DB_NAME', '') },
  // Memed (as mesmas chaves do settings.py do AppClinic)
  memed: {
    apiBase: env('MEMED_URL_API_BASE', 'https://api.memed.com.br/'),
    scriptBase: env('MEMED_URL_SCRIPT_BASE', 'https://partners.memed.com.br/'),
    apiKey: env('MEMED_API_KEY', ''),
    secretKey: env('MEMED_SECRET_KEY', ''),
    dataToken: env('MEMED_DATA_TOKEN', ''),
  },
};
