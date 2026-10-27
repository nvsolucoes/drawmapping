import { createHash } from 'node:crypto';
import { problem } from './store.mjs';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 8192;

export function inspectImage(input) {
  const data = Buffer.from(input);
  if (data.length < 24 || data.length > MAX_IMAGE_BYTES) throw problem(400, 'Imagem inválida ou acima de 8 MB.');
  let extension, width, height;
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (data.toString('ascii', 12, 16) !== 'IHDR' || data.readUInt32BE(8) !== 13 || data.toString('ascii', data.length - 8, data.length - 4) !== 'IEND') throw problem(400, 'Arquivo PNG inválido.');
    extension = 'png'; width = data.readUInt32BE(16); height = data.readUInt32BE(20);
  } else if (data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9) {
    extension = 'jpg';
    let offset = 2;
    while (offset < data.length - 9) {
      if (data[offset] !== 0xff) { offset++; continue; }
      const marker = data[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = data.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) { height = data.readUInt16BE(offset + 5); width = data.readUInt16BE(offset + 7); break; }
      offset += 2 + length;
    }
  } else if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' && data.readUInt32LE(4) + 8 === data.length) {
    extension = 'webp';
    const kind = data.toString('ascii', 12, 16);
    if (kind === 'VP8X' && data.length >= 30) { width = data.readUIntLE(24, 3) + 1; height = data.readUIntLE(27, 3) + 1; }
    else if (kind === 'VP8L' && data.length >= 25 && data[20] === 0x2f) { const bits = data.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
    else if (kind === 'VP8 ' && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) { width = data.readUInt16LE(26) & 0x3fff; height = data.readUInt16LE(28) & 0x3fff; }
  }
  if (!extension || !width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > 40000000) throw problem(400, 'Use PNG, JPEG ou WebP válido, com até 8.192 px por lado e 40 megapixels.');
  return { id: `${createHash('sha256').update(data).digest('hex')}.${extension}`, extension, width, height, data };
}

export function decodeImageDataUrl(value) {
  if (typeof value !== 'string') throw problem(400, 'Envie uma imagem PNG, JPEG ou WebP.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 100) throw problem(400, 'Formato ou tamanho de imagem inválido.');
  const image = inspectImage(Buffer.from(match[2], 'base64'));
  if (image.extension !== ({ png: 'png', jpeg: 'jpg', webp: 'webp' })[match[1]]) throw problem(400, 'Tipo de imagem não corresponde ao arquivo.');
  return image;
}
