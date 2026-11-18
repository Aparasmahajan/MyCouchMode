/** YouTube helpers: link parsing, the official IFrame Player API, and search via /api/yt-search. */

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return valid(u.pathname.slice(1, 12));
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v) return valid(v);
      const m = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}
const valid = (id: string) => (/^[\w-]{11}$/.test(id) ? id : null);

export const thumbOf = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

let apiPromise: Promise<any> | null = null;
export function loadYouTubeApi(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('Could not load the YouTube player.')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export interface SearchItem { id: string; title: string; channel: string; thumb: string }
export type SearchResult = { items: SearchItem[] } | { error: 'missing_key' | 'failed'; detail?: string };

export async function searchYouTube(q: string, safe: boolean, signal?: AbortSignal): Promise<SearchResult> {
  try {
    const r = await fetch(`/api/yt-search?q=${encodeURIComponent(q)}${safe ? '&safe=1' : ''}`, { signal });
    const data = await r.json().catch(() => ({}));
    if (r.status === 503 && data.error === 'missing_key') return { error: 'missing_key' };
    if (!r.ok) return { error: 'failed', detail: data.detail || r.statusText };
    return { items: data.items || [] };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    return { error: 'failed', detail: String(e) };
  }
}

/** "Up next" suggestions for a video (more from the same channel). */
export async function relatedVideos(id: string, signal?: AbortSignal): Promise<SearchResult> {
  try {
    const r = await fetch(`/api/yt-related?id=${encodeURIComponent(id)}`, { signal });
    const data = await r.json().catch(() => ({}));
    if (r.status === 503 && data.error === 'missing_key') return { error: 'missing_key' };
    if (!r.ok) return { error: 'failed', detail: data.detail || r.statusText };
    return { items: data.items || [] };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    return { error: 'failed', detail: String(e) };
  }
}
