import type { IncomingMessage, ServerResponse } from 'node:http';
import { youtubeConfig } from './_store.js';

/**
 * GET /api/yt-search?q=...&safe=1
 * Proxies YouTube Data API v3 search so the API key never reaches the browser.
 * Search costs 100 quota units (the free quota is 10,000 a day), so results are cached at Vercel's edge.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const safe = url.searchParams.get('safe') === '1';
  // Key from the admin page (Google Sheet "Settings" tab), else YOUTUBE_API_KEY in Vercel.
  const { key, region } = await youtubeConfig();
  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (!key) return send(res, 503, { error: 'missing_key' });
  if (!q) return send(res, 400, { error: 'missing_query' });

  const api = new URL('https://www.googleapis.com/youtube/v3/search');
  api.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '12',
    safeSearch: safe ? 'strict' : 'moderate',
    q,
    key,
    ...(region ? { regionCode: region } : {}),
  }).toString();

  try {
    const r = await fetch(api);
    const data: any = await r.json();
    if (!r.ok) return send(res, 502, { error: 'youtube_error', detail: data?.error?.message || r.statusText });
    const items = (data.items || [])
      .filter((it: any) => it?.id?.videoId)
      .map((it: any) => ({
        id: it.id.videoId,
        title: decode(it.snippet.title),
        channel: decode(it.snippet.channelTitle),
        thumb: it.snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${it.id.videoId}/mqdefault.jpg`,
      }));
    res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return send(res, 200, { items });
  } catch (e) {
    return send(res, 502, { error: 'network', detail: String(e) });
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function decode(s: string) {
  return String(s || '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
