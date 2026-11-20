import { signal, effect } from '@preact/signals';
import { load, save } from './shared';

export type AppMode = 'youtube' | 'utube' | 'frame' | 'tab';

/** A tile on the home screen. Built-in apps ship with the code; admins add more from /admin. */
export interface AppDef {
  id: string;
  name: string;
  color: string;
  mode: AppMode;
  url?: string;
  desc: string;
  kids?: boolean;
  icon?: string; // image URL for sites added from the admin page
  hidden?: boolean;
}

export const DEFAULT_APPS: AppDef[] = [
  { id: 'youtube', name: 'YouTube', color: '#e0352b', mode: 'youtube', kids: true, desc: 'YouTube’s own TV app: sign in with your account (or anyone’s), with your recommendations, subscriptions and Premium. Controller and phone work as a TV remote.' },
  { id: 'utube', name: 'uTube', color: '#ff3d6e', mode: 'utube', kids: true, desc: 'MCM’s own YouTube: search, recommendations, Up next, speed, captions and sleep timer, all with your controller and phone. Works without any extension.' },
  { id: 'vzy', name: 'Vzy', color: '#6b5cff', mode: 'frame', url: 'https://www.vzy.one/en', desc: 'Movies, series and live TV. With the Companion extension it opens in its own tab, and your phone or controller works as a mouse.' },
  { id: 'hotstar', name: 'JioHotstar', color: '#2353e6', mode: 'tab', url: 'https://www.hotstar.com/in', desc: 'Opens in a new tab. Press Home on your phone remote, or switch back to the MCM tab, to return.' },
  { id: 'zee5', name: 'ZEE5', color: '#8b2fc9', mode: 'tab', url: 'https://www.zee5.com', desc: 'Opens in a new tab.' },
  { id: 'sonyliv', name: 'SonyLIV', color: '#c9821a', mode: 'tab', url: 'https://www.sonyliv.com', desc: 'Opens in a new tab.' },
  { id: 'crunchyroll', name: 'Crunchyroll', color: '#f47521', mode: 'tab', url: 'https://www.crunchyroll.com', desc: 'Anime, streamed legally with subs and dubs. Opens in a new tab.' },
  { id: 'twitch', name: 'Twitch', color: '#9146ff', mode: 'tab', url: 'https://www.twitch.tv', desc: 'Live streams. Opens in a new tab.' },
  { id: 'spotify', name: 'Spotify', color: '#1db954', mode: 'tab', url: 'https://open.spotify.com', desc: 'Opens the web player in a new tab. Music keeps playing while you browse.' },
];
/** The two YouTube tiles are part of MCM itself: their text comes from the code, and they are always in the list. */
const BUILT_IN: Partial<Record<AppMode, AppDef>> = {
  youtube: DEFAULT_APPS.find((a) => a.id === 'youtube'),
  utube: DEFAULT_APPS.find((a) => a.id === 'utube'),
};

/** @deprecated use `sites` — kept so older imports keep compiling */
export const APPS = DEFAULT_APPS;

export const MODE_LABEL: Record<AppMode, [string, string]> = {
  youtube: ['inside', 'YouTube TV app'],
  utube: ['inside', 'Plays inside MCM'],
  frame: ['inside', 'Opens inside MCM'],
  tab: ['tab', 'Opens in a new tab'],
};

/* ---------- live site list ---------- */
const CACHE_KEY = 'mcm.sites.cache';
export const LOCAL_KEY = 'mcm.sites.local'; // admin "this device only" mode

export const sites = signal<AppDef[]>(withBuiltIns(normalize(load<AppDef[] | null>(LOCAL_KEY, null) || load<AppDef[] | null>(CACHE_KEY, null))) || DEFAULT_APPS);

/** uTube can be switched off on this TV (Control center); admins can also hide it for every TV. */
export const utubeLocal = signal<boolean>(load('mcm.utube', true));
effect(() => save('mcm.utube', utubeLocal.value));
export const utubeOn = () => utubeLocal.value && !!sites.value.find((s) => s.id === 'utube' && !s.hidden);
export const sitesSource = signal<'default' | 'cloud' | 'local'>('default');
effect(() => save(CACHE_KEY, sites.value));

export const visibleSites = () => sites.value.filter((s) => !s.hidden && (s.id !== 'utube' || utubeLocal.value));
export const appById = (id: string) => sites.value.find((a) => a.id === id);

/** Adds the built-in YouTube tiles to lists saved before they existed (right after YouTube). */
export function withBuiltIns(list: AppDef[] | null): AppDef[] | null {
  if (!list) return list;
  const out = [...list];
  for (const mode of ['youtube', 'utube'] as const) {
    if (out.some((s) => s.mode === mode)) continue;
    const yt = out.findIndex((s) => s.mode === 'youtube');
    out.splice(yt >= 0 ? yt + 1 : 0, 0, { ...BUILT_IN[mode]! });
  }
  return out;
}

/** Clean up anything that came from storage or the network. */
export function normalize(list: unknown): AppDef[] | null {
  if (!Array.isArray(list)) return null;
  const out: AppDef[] = [];
  const seen = new Set<string>();
  for (const raw of list as any[]) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    const mode: AppMode = raw.mode === 'youtube' || raw.mode === 'utube' || raw.mode === 'frame' ? raw.mode : 'tab';
    const url = typeof raw.url === 'string' && /^https?:\/\//i.test(raw.url) ? raw.url : undefined;
    if (!id || seen.has(id) || (mode !== 'youtube' && mode !== 'utube' && !url)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(raw.name || id).slice(0, 30),
      color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#3b5bff',
      mode,
      url,
      // The built-in YouTube tile's behaviour comes from the code, so its text does too.
      desc: BUILT_IN[mode] ? BUILT_IN[mode]!.desc : String(raw.desc || '').slice(0, 200),
      kids: !!raw.kids,
      icon: typeof raw.icon === 'string' && /^https:\/\//i.test(raw.icon) ? raw.icon : undefined,
      hidden: !!raw.hidden,
    });
  }
  return out.length ? out : null;
}

/** Load the admin-managed list: this device's local list first, then the cloud list. */
export async function refreshSites() {
  const local = withBuiltIns(normalize(load(LOCAL_KEY, null)));
  if (local) { sites.value = local; sitesSource.value = 'local'; return; }
  try {
    const r = await fetch('/api/sites', { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    const list = withBuiltIns(normalize(data.sites));
    if (list) { sites.value = list; sitesSource.value = 'cloud'; }
  } catch {
    /* offline: keep the cached list */
  }
}

/** The admin page tells TVs in the same browser to reload instantly. */
export function listenForSiteChanges() {
  if (!('BroadcastChannel' in window)) return;
  const bc = new BroadcastChannel('mcm-sites');
  bc.onmessage = () => refreshSites();
}
export function announceSiteChange() {
  if (!('BroadcastChannel' in window)) return;
  const bc = new BroadcastChannel('mcm-sites');
  bc.postMessage('changed');
  bc.close();
}
