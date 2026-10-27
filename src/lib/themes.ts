import type { ThemeName } from '../../shared/model.ts';

export const themes: Record<ThemeName, { name: string; background: string; surface: string; text: string; muted: string; root: string; rootText: string; border: string; palette: string[] }> = {
  studio: { name: 'Estúdio Claro', background: '#f7f8f5', surface: '#ffffff', text: '#172b25', muted: '#607268', root: '#16634f', rootText: '#ffffff', border: '#dce5de', palette: ['#36816a', '#6285cc', '#b17b43', '#9473b8', '#c87569', '#48949a'] },
  midnight: { name: 'Palco Escuro', background: '#121d22', surface: '#1b2b31', text: '#f0f5f3', muted: '#b5c7c0', root: '#94d7bb', rootText: '#14372b', border: '#385047', palette: ['#8dd4b2', '#99b5f3', '#e0b47d', '#c5a2e6', '#efa69b', '#83cdd0'] },
  didactic: { name: 'Didático', background: '#fffdf7', surface: '#ffffff', text: '#172b25', muted: '#667269', root: '#224b9b', rootText: '#ffffff', border: '#dedfd4', palette: ['#2c7e5d', '#356ad8', '#ac632e', '#8054c8', '#ba514b', '#257a83'] },
};

export function safeFilename(title: string) { return [...title].filter(char => char.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]/g, '-').trim().slice(0, 100) || 'Meu mapa'; }
