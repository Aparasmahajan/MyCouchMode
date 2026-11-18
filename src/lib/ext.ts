import { signal } from '@preact/signals';

/**
 * Talks to the MCM Companion browser extension (see /extension) when it is installed.
 * With it, MCM opens apps in a tab without pop-up blocking, the phone remote keeps
 * working on that site, and Home / the PS button brings MCM back.
 */
export const ext = signal<{ version: string; adblock: boolean } | null>(null);
/** True while an app MCM opened is in front (MCM's own tab is in the background). */
export const away = signal(false);
/** How the phone drives the site in front: a mouse pointer, or TV-remote keys (YouTube TV). */
export const awayMode = signal<'pointer' | 'keys'>('pointer');

let rid = 0;
const waiting = new Map<number, (r: any) => void>();

export function initExt() {
  const v = document.documentElement.dataset.mcmExt;
  if (v) ext.value = { version: v, adblock: true };
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'mcm-ext') return;
    const m = e.data;
    if (m.type === 'ready') ext.value = { version: m.version, adblock: !!m.adblock };
    if (m.type === 'away') away.value = !!m.on;
    if (m.type === 'reply') { waiting.get(m.rid)?.(m.resp); waiting.delete(m.rid); }
  });
  // Coming back to the MCM tab always ends "away" mode.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') away.value = false; });
}

export function extSend(m: Record<string, unknown>): Promise<any> {
  return new Promise((resolve) => {
    if (!ext.value) return resolve({ ok: false, error: 'no_extension' });
    const id = ++rid;
    waiting.set(id, resolve);
    window.postMessage({ source: 'mcm-page', rid: id, ...m }, location.origin);
    setTimeout(() => { if (waiting.delete(id)) resolve({ ok: false, error: 'timeout' }); }, 3000);
  });
}
