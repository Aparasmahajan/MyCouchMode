import { kv, kvReady } from './_lib.js';
import { readTab, sheetsReady, truthy, writeTab } from './_sheets.js';

/**
 * Where MCM keeps shared data, in order of preference:
 *   1. Google Sheets (GOOGLE_SHEET_ID + service account) — tabs "Sites" and "Settings"
 *   2. Upstash Redis (KV_REST_API_URL + token)
 *   3. nothing (the admin page then offers "this device only")
 */
export type StorageKind = 'sheets' | 'kv' | 'none';
export const storageKind = (): StorageKind => (sheetsReady() ? 'sheets' : kvReady() ? 'kv' : 'none');

/* ---------- sites ---------- */
export interface Site {
  id: string; name: string; url?: string; mode: 'youtube' | 'utube' | 'frame' | 'tab';
  color: string; icon?: string; kids: boolean; hidden: boolean; desc: string;
}
const SITE_COLUMNS = ['order', 'id', 'name', 'url', 'mode', 'color', 'icon', 'kids', 'hidden', 'desc'];

/** Validates a list from the admin page or from rows someone typed into the sheet. */
export function cleanSites(list: unknown): Site[] | null {
  if (!Array.isArray(list) || list.length > 80) return null;
  const out: Site[] = [];
  const ids = new Set<string>();
  for (const s of list as any[]) {
    if (!s || typeof s !== 'object') continue;
    const name = String(s.name || '').trim().slice(0, 30);
    let id = String(s.id || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const mode = s.mode === 'youtube' || s.mode === 'utube' || s.mode === 'frame' ? s.mode : 'tab';
    const rawUrl = String(s.url || '').trim();
    const url = /^https?:\/\/[^\s]+$/i.test(rawUrl) ? rawUrl.slice(0, 500) : undefined;
    if (!id || (mode !== 'youtube' && mode !== 'utube' && !url)) continue;
    for (let n = 2; ids.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    ids.add(id);
    const color = String(s.color || '').trim();
    const icon = String(s.icon || '').trim();
    out.push({
      id,
      name: name || id,
      color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#3b5bff',
      mode,
      url,
      desc: String(s.desc || '').slice(0, 200),
      kids: typeof s.kids === 'boolean' ? s.kids : truthy(s.kids),
      icon: /^https:\/\/[^\s]+$/i.test(icon) ? icon.slice(0, 500) : undefined,
      hidden: typeof s.hidden === 'boolean' ? s.hidden : truthy(s.hidden),
    });
  }
  return out.length ? out : null;
}

export async function getSites(): Promise<Site[] | null> {
  const kind = storageKind();
  if (kind === 'sheets') {
    const rows = await readTab('Sites');
    // Rows may be reordered or numbered by hand in the sheet: sort by "order" when it is filled in.
    const sorted = rows.map((r, i) => ({ r, i, o: Number(r.order) }))
      .sort((a, b) => (Number.isFinite(a.o) && Number.isFinite(b.o) ? a.o - b.o : a.i - b.i))
      .map((x) => x.r);
    return cleanSites(sorted);
  }
  if (kind === 'kv') {
    const raw = await kv(['GET', 'mcm:sites']);
    return raw ? cleanSites(JSON.parse(raw)) : null;
  }
  return null;
}

export async function saveSites(sites: Site[]) {
  const kind = storageKind();
  if (kind === 'sheets') {
    return writeTab('Sites', SITE_COLUMNS, sites.map((s, i) => [
      i + 1, s.id, s.name, s.url || '', s.mode, s.color, s.icon || '', s.kids ? 'TRUE' : 'FALSE', s.hidden ? 'TRUE' : 'FALSE', s.desc,
    ]));
  }
  if (kind === 'kv') return kv(['SET', 'mcm:sites', JSON.stringify(sites)]);
  throw new Error('storage_not_configured');
}

/* ---------- settings (server-only: never sent to TVs or phones) ---------- */
export interface Settings { youtubeKey?: string; youtubeRegion?: string }
const SETTING_ROWS: [keyof Settings, string, string][] = [
  ['youtubeKey', 'youtube_api_key', 'YouTube Data API v3 key used for search. Server-only.'],
  ['youtubeRegion', 'youtube_region', 'Two-letter country code for search results, e.g. IN.'],
];

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < 5 * 60_000) return cache.value;
  let value: Settings = {};
  const kind = storageKind();
  try {
    if (kind === 'sheets') {
      const rows = await readTab('Settings');
      for (const [prop, key] of SETTING_ROWS) {
        const row = rows.find((r) => (r.setting || '').toLowerCase() === key);
        if (row?.value) value[prop] = row.value;
      }
    } else if (kind === 'kv') {
      const raw = await kv(['GET', 'mcm:settings']);
      if (raw) value = JSON.parse(raw);
    }
  } catch (e) {
    if (fresh) throw e; // the admin page wants to see the error; search just falls back to env
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(next: Settings) {
  const kind = storageKind();
  if (kind === 'sheets') {
    await writeTab('Settings', ['setting', 'value', 'note'], SETTING_ROWS.map(([prop, key, note]) => [key, next[prop] || '', note]));
  } else if (kind === 'kv') {
    await kv(['SET', 'mcm:settings', JSON.stringify(next)]);
  } else {
    throw new Error('storage_not_configured');
  }
  cache = { at: Date.now(), value: next };
}

/** The key search should use: the admin page's key first, then the Vercel env var. */
export async function youtubeConfig() {
  const s = await getSettings();
  const key = s.youtubeKey || process.env.YOUTUBE_API_KEY || '';
  const region = (s.youtubeRegion || process.env.YOUTUBE_REGION || '').toUpperCase();
  return { key, region: /^[A-Z]{2}$/.test(region) ? region : '', source: s.youtubeKey ? 'admin' : key ? 'env' : 'none' };
}
