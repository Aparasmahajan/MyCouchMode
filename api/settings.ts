import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminConfigured, isAdmin, readJson, send } from './_lib.js';
import { getSettings, saveSettings, storageKind, youtubeConfig } from './_store.js';

/**
 * Admin-only server settings (stored in the "Settings" tab of the Google Sheet, or Upstash).
 * GET -> what is configured, with secrets masked.   PUT {youtubeKey?, youtubeRegion?} -> save.
 * Send youtubeKey: "" to remove the saved key (search then falls back to YOUTUBE_API_KEY in Vercel).
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('cache-control', 'no-store');
  if (!adminConfigured()) return send(res, 503, { error: 'admin_not_configured' });
  if (!isAdmin(req)) return send(res, 401, { error: 'wrong_password' });
  const storage = storageKind();

  if (req.method === 'GET') {
    try {
      const s = await getSettings(true);
      const yt = await youtubeConfig();
      return send(res, 200, {
        storage,
        youtube: {
          source: yt.source, // 'admin' | 'env' | 'none'
          keyHint: yt.key ? `••••${yt.key.slice(-4)}` : '',
          region: s.youtubeRegion || '',
          envKey: !!process.env.YOUTUBE_API_KEY,
        },
      });
    } catch (e: any) {
      return send(res, 502, { error: 'storage_error', detail: e?.message || String(e), storage });
    }
  }

  if (req.method === 'PUT') {
    if (storage === 'none') return send(res, 503, { error: 'storage_not_configured' });
    let body: any;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad_json' }); }
    try {
      const cur = await getSettings(true);
      const next = { ...cur };
      if (typeof body.youtubeKey === 'string') {
        const k = body.youtubeKey.trim();
        if (k && !/^[A-Za-z0-9_-]{20,60}$/.test(k)) return send(res, 400, { error: 'bad_key', detail: 'That does not look like a Google API key (they start with "AIza").' });
        next.youtubeKey = k || undefined;
      }
      if (typeof body.youtubeRegion === 'string') {
        const r = body.youtubeRegion.trim().toUpperCase();
        if (r && !/^[A-Z]{2}$/.test(r)) return send(res, 400, { error: 'bad_region', detail: 'Use a two-letter country code such as IN.' });
        next.youtubeRegion = r || undefined;
      }
      await saveSettings(next);
      return send(res, 200, { ok: true });
    } catch (e: any) {
      return send(res, 502, { error: 'storage_error', detail: e?.message || String(e) });
    }
  }

  res.setHeader('allow', 'GET, PUT');
  return send(res, 405, { error: 'method_not_allowed' });
}
