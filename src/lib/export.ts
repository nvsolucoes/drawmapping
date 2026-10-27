import { strToU8, zipSync } from 'fflate';
import type { MapDocument } from '../../shared/model.ts';
import { layoutMap, edgePath } from './layout';
import { themes, safeFilename } from './themes';
import { assetUrl, downloadBlob } from './api';
import fontRegular from '@fontsource/manrope/files/manrope-latin-400-normal.woff2?url';
import fontBold from '@fontsource/manrope/files/manrope-latin-700-normal.woff2?url';

export const escapeXml = (text: string) => text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);

async function imageData(id: string) {
  const response = await fetch(assetUrl(id));
  if (!response.ok) throw new Error('Uma imagem não pôde ser carregada. A exportação foi cancelada.');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
}

let fontStylePromise: Promise<string> | null = null;
async function embeddedFontStyle() {
  fontStylePromise ??= Promise.all([fontRegular, fontBold].map(async (url, index) => {
    const response = await fetch(url); if (!response.ok) throw new Error('Não foi possível incluir a fonte local na exportação.');
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; response.blob().then(blob => reader.readAsDataURL(blob)).catch(reject); });
    return `@font-face{font-family:MapManrope;src:url('${data}') format('woff2');font-weight:${index ? 700 : 400};font-style:normal;}`;
  })).then(parts => `<style>${parts.join('')}</style>`);
  return fontStylePromise;
}

export async function generateSvg(map: MapDocument, expandAll = true): Promise<string> {
  const layout = layoutMap(map, { expandAll });
  const theme = themes[map.theme] ?? themes.studio;
  const imageIds = [...new Set(map.nodes.flatMap(node => node.image ? [node.image] : []))];
  const images = new Map(await Promise.all(imageIds.map(async id => [id, await imageData(id)] as const)));
  const { x, y, width, height } = layout.bounds;
  const fontStyle = await embeddedFontStyle();
  const edges = layout.edges.map(edge => `<path d="${edgePath(edge.source, edge.target)}" fill="none" stroke="${escapeXml(edge.color)}" stroke-width="${edge.source.depth === 0 ? 3.5 : 2}" stroke-linecap="round"/>`).join('');
  const nodes = layout.nodes.map(node => {
    const root = node.depth === 0;
    const rect = `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${root ? 20 : 12}" fill="${root ? escapeXml(node.color) : theme.surface}" stroke="${root ? escapeXml(node.color) : escapeXml(node.color)}" stroke-width="${root ? 0 : 1.5}"/>`;
    const lines = node.lines.map((line, index) => `<tspan x="${node.x + node.width / 2}" y="${node.y + (root ? 35 : 29) + index * (root ? 28 : 23)}">${escapeXml(line)}</tspan>`).join('');
    const text = `<text text-anchor="middle" fill="${root ? theme.rootText : theme.text}" font-family="MapManrope, Manrope, sans-serif" font-size="${root ? 22 : 16}" font-weight="${node.depth < 2 ? 700 : 400}">${lines}</text>`;
    const image = node.node.image ? `<image href="${images.get(node.node.image)}" x="${node.x + 12}" y="${node.y + node.height - 124}" width="${node.width - 24}" height="112" preserveAspectRatio="xMidYMid meet"/>` : '';
    return `<g>${rect}${text}${image}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${x} ${y} ${width} ${height}"><title>${escapeXml(map.title)}</title>${fontStyle}<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${theme.background}"/>${edges}${nodes}</svg>`;
}

export async function exportVisual(map: MapDocument, format: 'svg' | 'png' | 'pdf') {
  const svg = await generateSvg(map);
  if (format === 'svg') { downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(map.title)}.svg`); return; }
  if (format === 'pdf') {
    const frame = document.createElement('iframe'); frame.className = 'print-frame'; frame.title = 'Impressão do mapa'; document.body.appendChild(frame);
    let printed = false;
    const printOnce = () => { if (printed) return; printed = true; frame.contentWindow?.focus(); frame.contentWindow?.print(); };
    frame.onload = () => { void frame.contentDocument?.fonts.ready.then(printOnce); };
    frame.contentWindow?.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 100));
    const doc = frame.contentDocument!;
    doc.open(); doc.write(`<!doctype html><html lang="pt-BR"><head><title>${escapeXml(map.title)}</title><style>@page{size:A3 landscape;margin:12mm}body{margin:0;font-family:Segoe UI,sans-serif}h1{font-size:20px;margin:0 0 16px}svg{width:100%;height:auto;max-height:85vh}p{font-size:10px;color:#52645b}</style></head><body><h1>${escapeXml(map.title)}</h1>${svg}<p>DrawMapping · ${new Date().toLocaleDateString('pt-BR')}</p></body></html>`); doc.close();
    setTimeout(printOnce, 700);
    setTimeout(() => frame.remove(), 90_000); return;
  }
  const bounds = layoutMap(map, { expandAll: true }).bounds;
  const scale = Math.min(2, 8192 / Math.max(bounds.width, bounds.height), Math.sqrt(32_000_000 / (bounds.width * bounds.height)));
  if (scale < .15) throw new Error('Este mapa é grande demais para PNG. Exporte em SVG para preservar os detalhes.');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(bounds.width * scale); canvas.height = Math.ceil(bounds.height * scale);
    const context = canvas.getContext('2d'); if (!context) throw new Error('O navegador não disponibilizou a exportação de imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível gerar o PNG.')), 'image/png'));
    downloadBlob(blob, `${safeFilename(map.title)}.png`);
  } finally { URL.revokeObjectURL(url); }
}

export async function exportRecovery(map: MapDocument) {
  const entries: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify({ format: 'drawmapping', schemaVersion: 1, themeTokens: themes[map.theme] })),
    'document.json': strToU8(JSON.stringify(map)),
  };
  for (const id of new Set(map.nodes.flatMap(node => node.image ? [node.image] : []))) {
    const response = await fetch(assetUrl(id)); if (!response.ok) throw new Error('Não foi possível incluir uma imagem na recuperação.');
    entries[`assets/${id}`] = new Uint8Array(await response.arrayBuffer());
  }
  const zip = zipSync(entries, { level: 6 });
  downloadBlob(new Blob([new Uint8Array(zip)], { type: 'application/zip' }), `${safeFilename(map.title)}.drawmap`);
}
