import type { MapDocument } from '../../shared/model.ts';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

let sessionPromise: Promise<{ token: string; dataDirectory: string }> | null = null;
export function getSession() {
  sessionPromise ??= fetch('/api/session', { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new ApiError('Não foi possível conectar ao servidor local.', response.status);
    return response.json() as Promise<{ token: string; dataDirectory: string }>;
  }).catch(error => { sessionPromise = null; throw error; });
  return sessionPromise;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = await getSession();
  const headers = new Headers(options.headers);
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET') headers.set('X-DrawMapping-Token', session.token);
  const response = await fetch(`/api${path}`, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    if (path === '/folders' && response.status === 404) {
      throw new ApiError('O servidor do DrawMapping está desatualizado. Salve seus mapas, execute Parar DrawMapping.bat e depois Iniciar DrawMapping.bat.', 404);
    }
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error ?? `Não foi possível concluir a ação (${response.status}).`, response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  maps: () => request<MapDocument[]>('/maps'),
  map: (id: string) => request<MapDocument>(`/maps/${id}`),
  create: (template: string, title?: string, folder = '') => request<MapDocument>('/maps', { method: 'POST', body: JSON.stringify({ template, title, folder }) }),
  folders: () => request<string[]>('/folders'),
  createFolder: (name: string) => request<{ name: string }>('/folders', { method: 'POST', body: JSON.stringify({ name }) }),
  save: (map: MapDocument) => request<MapDocument>(`/maps/${map.id}`, { method: 'PUT', body: JSON.stringify(map) }),
  duplicate: (id: string) => request<MapDocument>(`/maps/${id}/duplicate`, { method: 'POST' }),
  trash: () => request<MapDocument[]>('/trash'),
  remove: (id: string) => request<{ ok: boolean }>(`/maps/${id}`, { method: 'DELETE' }),
  restore: (id: string) => request<MapDocument>(`/maps/${id}/restore`, { method: 'POST' }),
  revisions: (id: string) => request<Revision[]>(`/maps/${id}/revisions`),
  restoreRevision: (id: string, revision: string) => request<MapDocument>(`/maps/${id}/revisions/${revision}/restore`, { method: 'POST' }),
  upload: (data: string) => request<{ id: string }>('/assets', { method: 'POST', body: JSON.stringify({ data }) }),
  import: (data: ArrayBuffer) => request<MapDocument>('/import', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: data }),
  backups: () => request<Backup[]>('/backups'),
  backup: () => request<{ name: string }>('/backups', { method: 'POST' }),
  restoreBackup: (name: string) => request<{ ok: boolean }>(`/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }),
};

export interface Revision { id: string; createdAt: string; title: string }
export interface Backup { name: string; createdAt: string; size: number }
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'A ação não foi concluída. Tente novamente.';
export const assetUrl = (id: string) => `/api/assets/${encodeURIComponent(id)}`;

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
}

export async function downloadFrom(path: string, filename: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Não foi possível preparar o arquivo para download.');
  downloadBlob(await response.blob(), filename);
}

export function readImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return Promise.reject(new Error('Escolha uma imagem PNG, JPEG ou WebP.'));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('A imagem deve ter no máximo 8 MB.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}
