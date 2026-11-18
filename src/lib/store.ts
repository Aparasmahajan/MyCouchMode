import { signal, effect } from '@preact/signals';

import { load, save, AVATAR_COLORS } from './shared';
export { load, save, AVATAR_COLORS };

/* ---------- profiles ---------- */
export interface Profile {
  id: string;
  name: string;
  color: number;
  kids: boolean;
  pinHash?: string;
}

const DEFAULT_PROFILES: Profile[] = [
  { id: 'paras', name: 'Paras', color: 0, kids: false },
  { id: 'kids', name: 'Kids', color: 2, kids: true },
];

export const profiles = signal<Profile[]>(load('mcm.profiles', DEFAULT_PROFILES));
effect(() => save('mcm.profiles', profiles.value));

export const activeId = signal<string | null>(null);
export const lastProfileId = signal<string | null>(load('mcm.lastProfile', null));
effect(() => save('mcm.lastProfile', lastProfileId.value));

export const activeProfile = () => profiles.value.find((p) => p.id === activeId.value) || null;

/** Not real security: a PIN only keeps kids out of grown-up profiles on a shared TV. */
export function hashPin(pin: string) {
  let h = 0x811c9dc5;
  for (const ch of 'mcm:' + pin) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export function addProfile(p: { name: string; color: number; kids: boolean; pin?: string }) {
  const name = p.name.trim().slice(0, 16);
  if (!name) return null;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'profile';
  let id = base;
  let n = 2;
  while (profiles.value.some((x) => x.id === id)) id = `${base}-${n++}`;
  const prof: Profile = {
    id,
    name,
    color: Math.abs(p.color) % AVATAR_COLORS.length,
    kids: !!p.kids,
    pinHash: p.pin && /^\d{4}$/.test(p.pin) ? hashPin(p.pin) : undefined,
  };
  profiles.value = [...profiles.value, prof];
  return prof;
}

export function removeProfile(id: string) {
  if (profiles.value.length <= 1) return false;
  profiles.value = profiles.value.filter((p) => p.id !== id);
  try { localStorage.removeItem('mcm.history.' + id); } catch { /* ignore */ }
  if (activeId.value === id) activeId.value = null;
  return true;
}

/* ---------- watch history (per profile) ---------- */
export interface WatchItem {
  id: string; // YouTube video id
  title: string;
  channel?: string;
  thumb: string;
  pos: number;
  dur: number;
  at: number;
}

export const historyVersion = signal(0);

export function getHistory(profileId: string): WatchItem[] {
  historyVersion.value; // subscribe
  return load<WatchItem[]>('mcm.history.' + profileId, []);
}

export function saveProgress(profileId: string, item: WatchItem) {
  const list = load<WatchItem[]>('mcm.history.' + profileId, []).filter((x) => x.id !== item.id);
  // a video watched to the end drops out of "continue watching"
  if (!(item.dur > 0 && item.pos / item.dur > 0.95)) list.unshift(item);
  save('mcm.history.' + profileId, list.slice(0, 20));
  historyVersion.value++;
}

/* ---------- settings ---------- */
export const sfxOn = signal<boolean>(load('mcm.sfx', true));
effect(() => save('mcm.sfx', sfxOn.value));
export const volume = signal<number>(load('mcm.volume', 70));
effect(() => save('mcm.volume', volume.value));

/* ---------- pairing code (stable per TV so phones reconnect after reloads) ---------- */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
export const tvCode = signal<string>(load('mcm.code', '') || newCode());
effect(() => save('mcm.code', tvCode.value));
