import { signal } from '@preact/signals';
import { appById, utubeOn } from '../lib/apps';
import { activeId, activeProfile, hashPin, lastProfileId, load, profiles, save, volume } from '../lib/store';
import { layers, popLayer, pushLayer, resetLayers, topLayer } from '../lib/nav';
import { away, awayMode, ext, extSend } from '../lib/ext';

/* ---------- UI signals shared by TV screens ---------- */
export const toast = signal<{ msg: string; app?: string; n: number } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(msg: string, app?: string, ms = 3000) {
  toast.value = { msg, app, n: Date.now() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), ms);
}

export type Art = { key: string; app?: string; color?: string; thumb?: string };
export const art = signal<Art>({ key: 'app:youtube', app: 'youtube', color: '#e0352b' });
export const tint = signal('#e0352b');

export const query = signal('');
export const frameApp = signal<string | null>(null);
export const pinFor = signal<string | null>(null);
export const pinEntry = signal('');
export const pinError = signal(false);
export const sleepMins = signal(0);
export const sleepAtEnd = signal(false); // stop after the current video ends
export const playerMenu = signal<'speed' | 'sleep' | null>(null);
export const resting = signal(false);
export const entered = signal(0); // bumps to replay the home "zoom in" animation
export const volHud = signal(0);

export interface PlayReq { id: string; start?: number; title?: string; channel?: string; queue?: { id: string; title: string; channel: string; thumb: string }[] }
export const playReq = signal<PlayReq | null>(null);
/** What the player will play next (shown on the phone too). */
export const upNextList = signal<{ id: string; title: string; channel: string; thumb: string }[]>([]);
export const nowPlaying = signal<{ id: string; title: string; channel?: string; pos: number; dur: number; playing: boolean; muted?: boolean } | null>(null);

/** Set by the Player while it is mounted. */
export interface PlayerApi {
  toggle(): void;
  seek(d: number): void;
  seekTo(sec: number): void;
  setVolume(v: number): void;
  setRate(r: number): void;
  rates(): number[];
  rate(): number;
  setLoop(on: boolean): void;
  setCaptions(on: boolean): void;
  next(): void;
  playId(id: string): void;
}
/** Player options the TV and the phone both show. */
export const playerOpts = signal({ rate: 1, loop: false, captions: false, fill: load<boolean>('mcm.fill', true), autoplay: load<boolean>('mcm.autoplay', true) });
export function toggleAutoplay() {
  const autoplay = !playerOpts.peek().autoplay;
  playerOpts.value = { ...playerOpts.peek(), autoplay };
  save('mcm.autoplay', autoplay);
}
/** Fill the whole screen (crops a little on non-16:9 screens) or fit the whole picture with bars. */
export function toggleFill() {
  const fill = !playerOpts.peek().fill;
  playerOpts.value = { ...playerOpts.peek(), fill };
  save('mcm.fill', fill);
}
export const player: { api: PlayerApi | null } = { api: null };

/** Sleep timer choices shared by the player menu, the control center and the phone. */
export function setSleep(v: number | 'end') {
  sleepAtEnd.value = v === 'end';
  sleepMins.value = v === 'end' ? 0 : v;
}

export function goRest() {
  sleepMins.value = 0;
  sleepAtEnd.value = false;
  resetLayers(['home']);
  resting.value = true;
}

/* ---------- actions ---------- */
export const has = (layer: string) => layers.value.includes(layer);

export function launchApp(id: string) {
  const a = appById(id);
  if (!a) return;
  if (a.mode === 'youtube') return openYouTube();
  if (a.mode === 'utube') return pushLayer('search');
  // With the Companion, every site opens in its own tab where the phone and controller work as a mouse.
  if (a.mode === 'frame' && ext.value) return openTab(a.url!, a.name, a.id);
  if (a.mode === 'frame') {
    frameApp.value = a.id;
    return pushLayer('frame');
  }
  openTab(a.url!, a.name, a.id);
}

export async function openTab(url: string, name: string, appId?: string, mode: 'pointer' | 'keys' = 'pointer') {
  // With the MCM Companion extension: no pop-up blocker, and the phone + controller keep working there.
  if (ext.value) {
    const r = await extSend({ type: 'open', url });
    if (r?.ok) {
      away.value = true;
      awayMode.value = mode;
      showToast(mode === 'keys'
        ? `${name} is open. Your controller and phone work as its remote. PS or Home comes back to MCM.`
        : `${name} is open. Stick or phone trackpad moves the pointer, ✕ or tap clicks. PS or Home comes back to MCM.`, appId, 4500);
      return;
    }
  }
  const w = window.open(url, '_blank');
  if (w) {
    try { w.opener = null; } catch { /* cross-origin */ }
    showToast(`${name} opened in a new tab. Switch back to this tab to return to MCM. Install the MCM Companion extension to control it with your phone and controller.`, appId, 4500);
    return;
  }
  showToast(`The browser blocked the new tab, so ${name} opens here. Use the browser's Back to return. Allow pop-ups for MCM, or install the MCM Companion extension.`, appId, 4500);
  setTimeout(() => location.assign(url), 3200);
}

/**
 * YouTube = YouTube's own TV app (youtube.com/tv) when the Companion is installed:
 * real accounts, recommendations, subscriptions, Premium. Without it, MCM's built-in search and player.
 * `hash` deep-links inside the TV app, e.g. "#/search" or "#/watch?v=ID".
 */
export function openYouTube(hash = '') {
  if (ext.value) return openTab(`https://www.youtube.com/tv${hash}`, 'YouTube', 'youtube', 'keys');
  if (hash.startsWith('#/watch?v=')) return playVideo({ id: hash.slice(10) });
  if (hash.startsWith('#/search')) return pushLayer('search');
  // The YouTube tile itself: explain the choices instead of silently opening search.
  pushLayer('ytsetup');
}

/** Search: uTube when it's on (or there is no extension), otherwise YouTube TV's search. */
export function openSearch() {
  if (utubeOn() || !ext.value) return pushLayer('search');
  openTab('https://www.youtube.com/tv#/search', 'YouTube', 'youtube', 'keys');
}

/** A YouTube link from the phone: plays in uTube when it's on, otherwise in YouTube TV. */
export function playYouTubeLink(id: string) {
  if (utubeOn() || !ext.value) return playVideo({ id });
  openTab(`https://www.youtube.com/tv#/watch?v=${id}`, 'YouTube', 'youtube', 'keys');
}

/** Bumped to run a search (Enter on the query box, the Search key, or the phone keyboard's Go). */
export const searchSubmit = signal(0);

export function playVideo(req: PlayReq) {
  playReq.value = { ...req };
  if (topLayer() !== 'player') pushLayer('player');
}

export function chooseProfile(id: string) {
  const p = profiles.value.find((x) => x.id === id);
  if (!p) return;
  if (p.pinHash) {
    pinFor.value = id;
    pinEntry.value = '';
    pinError.value = false;
    return pushLayer('pin');
  }
  activate(id);
}

export function activate(id: string) {
  const p = profiles.value.find((x) => x.id === id);
  if (!p) return;
  activeId.value = id;
  lastProfileId.value = id;
  query.value = '';
  pinFor.value = null;
  resetLayers(['home'], 'app:youtube');
  entered.value++;
  showToast(p.kids ? `Hi ${p.name}! Kids mode is on.` : `Signed in as ${p.name}.`);
}

export function tryPin(pin: string) {
  const p = profiles.value.find((x) => x.id === pinFor.value);
  if (!p) return false;
  if (p.pinHash && hashPin(pin) !== p.pinHash) {
    pinError.value = true;
    pinEntry.value = '';
    return false;
  }
  activate(p.id);
  return true;
}

/** Characters from the TV keyboard or the on-screen keyboard. '\b' deletes. */
export function typeChar(ch: string) {
  const top = topLayer();
  if (top === 'pin') {
    if (ch === '\b') pinEntry.value = pinEntry.value.slice(0, -1);
    else if (/\d/.test(ch) && pinEntry.value.length < 4) {
      pinError.value = false;
      pinEntry.value += ch;
      if (pinEntry.value.length === 4) setTimeout(() => tryPin(pinEntry.value), 120);
    }
    return;
  }
  if (top === 'search') {
    query.value = ch === '\b' ? query.value.slice(0, -1) : (query.value + ch).slice(0, 80);
  }
}

/** Full text from the phone keyboard. */
export function setText(v: string) {
  if (topLayer() === 'pin') {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    pinEntry.value = digits;
    pinError.value = false;
    if (digits.length === 4) setTimeout(() => tryPin(digits), 120);
    return;
  }
  if (!activeId.value) return;
  if (ext.value && !utubeOn()) return; // YouTube TV handles typing itself (the phone's text goes to its search)
  if (topLayer() !== 'search') pushLayer('search');
  query.value = v.slice(0, 80);
}

export function changeVolume(delta: number | 'mute') {
  const v = delta === 'mute' ? (volume.value > 0 ? 0 : 70) : Math.max(0, Math.min(100, volume.value + delta));
  volume.value = v;
  player.api?.setVolume(v);
  volHud.value = Date.now();
}

export function goHome() {
  if (!activeId.value) return;
  resetLayers(['home']);
}

export function back() {
  const top = topLayer();
  if (top === 'welcome' && !activeId.value) return;
  if (top === 'home') return;
  popLayer();
}

export const kidsMode = () => !!activeProfile()?.kids;
