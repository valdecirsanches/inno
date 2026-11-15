'use strict';
/** mimetypes.guess_type() do Python (tipos mais comuns) */
const TIPOS = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/vnd.microsoft.icon',
  txt: 'text/plain', csv: 'text/csv', html: 'text/html', htm: 'text/html', xml: 'text/xml', json: 'application/json',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/x-wav', avi: 'video/x-msvideo', mov: 'video/quicktime',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', rtf: 'application/rtf',
  dcm: 'application/dicom',
};
function tipo(nome) {
  const m = String(nome).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? TIPOS[m[1]] || null : null;
}
module.exports = { tipo };
