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

/* ---------- recommendations (cached in memory for this session) ---------- */
const recCache = new Map<string, Promise<SearchItem[]>>();
function cachedList(url: string): Promise<SearchItem[]> {
  if (!recCache.has(url)) {
    recCache.set(url, fetch(url).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => d.items || []).catch(() => {
      recCache.delete(url);
      return [];
    }));
  }
  return recCache.get(url)!;
}
/** Most popular videos in the admin's region. */
export const fetchTrending = () => cachedList('/api/yt?op=trending');
/** Latest uploads from the channel of `videoId` (excluding that video). */
export const fetchRelated = (videoId: string) => cachedList(`/api/yt?op=related&id=${encodeURIComponent(videoId)}`);

/** "Up next" / recommended: more from the channels you watch, then trending. No duplicates. */
export async function recommended(watchedIds: string[], kids: boolean, limit = 12): Promise<SearchItem[]> {
  const lists = await Promise.all([
    ...watchedIds.slice(0, 2).map((id) => fetchRelated(id)),
    kids ? Promise.resolve([] as SearchItem[]) : fetchTrending(), // trending isn't filtered for kids
  ]);
  const seen = new Set(watchedIds);
  const out: SearchItem[] = [];
  // Interleave so one channel doesn't take every slot.
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const it = l[i];
      if (it && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
      if (out.length >= limit) break;
    }
  }
  return out;
}
