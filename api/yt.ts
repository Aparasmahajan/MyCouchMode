import type { IncomingMessage, ServerResponse } from 'node:http';
import { send } from './_lib.js';
import { youtubeConfig } from './_store.js';

/**
 * Recommendations for MCM's built-in YouTube (cheap on quota, cached at the edge):
 *   GET /api/yt?op=trending            -> most popular videos in your region       (1 unit)
 *   GET /api/yt?op=related&id=VIDEOID   -> latest uploads from that video's channel (2 units)
 * Search stays in /api/yt-search (100 units each).
 */
const API = 'https://www.googleapis.com/youtube/v3';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const op = url.searchParams.get('op');
  const { key, region } = await youtubeConfig();
  if (!key) return send(res, 503, { error: 'missing_key' });

  try {
    if (op === 'trending') {
      const d = await yt('videos', { part: 'snippet', chart: 'mostPopular', maxResults: '20', regionCode: region || 'IN' }, key);
      const items = (d.items || []).map((v: any) => item(v.id, v.snippet));
      res.setHeader('cache-control', 'public, s-maxage=1800, stale-while-revalidate=86400');
      return send(res, 200, { items });
    }

    if (op === 'related') {
      const id = url.searchParams.get('id') || '';
      if (!/^[\w-]{11}$/.test(id)) return send(res, 400, { error: 'bad_id' });
      const v = await yt('videos', { part: 'snippet', id }, key);
      const channelId: string | undefined = v.items?.[0]?.snippet?.channelId;
      if (!channelId?.startsWith('UC')) return send(res, 200, { items: [] });
      // Every channel's uploads playlist is its id with "UC" replaced by "UU".
      const p = await yt('playlistItems', { part: 'snippet', playlistId: 'UU' + channelId.slice(2), maxResults: '16' }, key);
      const items = (p.items || [])
        .map((x: any) => item(x.snippet?.resourceId?.videoId, x.snippet))
        .filter((x: any) => x.id && x.id !== id && !/^(Private|Deleted) video$/.test(x.title));
      res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return send(res, 200, { items, channel: v.items[0].snippet.channelTitle });
    }

    return send(res, 400, { error: 'bad_op' });
  } catch (e: any) {
    return send(res, 502, { error: 'youtube_error', detail: e?.message || String(e) });
  }
}

async function yt(path: string, params: Record<string, string>, key: string) {
  const u = new URL(`${API}/${path}`);
  u.search = new URLSearchParams({ ...params, key }).toString();
  const r = await fetch(u);
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || r.statusText);
  return d;
}

function item(id: string, s: any) {
  return {
    id,
    title: decode(s?.title || ''),
    channel: decode(s?.videoOwnerChannelTitle || s?.channelTitle || ''),
    thumb: s?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  };
}

function decode(s: string) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
