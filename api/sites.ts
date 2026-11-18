import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminConfigured, isAdmin, kv, kvReady, readJson, send } from './_lib';

const KEY = 'mcm:sites';

/**
 * GET  /api/sites            -> { sites: Site[] | null, storage: 'kv' | 'none' }   (public, read by every TV)
 * PUT  /api/sites  {sites}   -> { ok: true }                                          (admin only)
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'GET') {
    if (!kvReady()) return send(res, 200, { sites: null, storage: 'none' });
    try {
      const raw = await kv(['GET', KEY]);
      return send(res, 200, { sites: raw ? JSON.parse(raw) : null, storage: 'kv' });
    } catch (e) {
      return send(res, 502, { error: 'storage_error', detail: String(e) });
    }
  }

  if (req.method === 'PUT') {
    if (!adminConfigured()) return send(res, 503, { error: 'admin_not_configured' });
    if (!isAdmin(req)) return send(res, 401, { error: 'wrong_password' });
    if (!kvReady()) return send(res, 503, { error: 'storage_not_configured' });
    let body: any;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad_json' }); }
    const sites = clean(body?.sites);
    if (!sites) return send(res, 400, { error: 'bad_sites' });
    try {
      await kv(['SET', KEY, JSON.stringify(sites)]);
      return send(res, 200, { ok: true, count: sites.length });
    } catch (e) {
      return send(res, 502, { error: 'storage_error', detail: String(e) });
    }
  }

  res.setHeader('allow', 'GET, PUT');
  return send(res, 405, { error: 'method_not_allowed' });
}

/** Server-side validation: never store anything a TV could trip over. */
function clean(list: unknown) {
  if (!Array.isArray(list) || list.length > 80) return null;
  const out: any[] = [];
  const ids = new Set<string>();
  for (const s of list as any[]) {
    const id = String(s?.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    const mode = s?.mode === 'youtube' || s?.mode === 'frame' ? s.mode : 'tab';
    const url = typeof s?.url === 'string' && /^https?:\/\/[^\s]+$/i.test(s.url) ? s.url.slice(0, 500) : undefined;
    if (!id || ids.has(id) || (mode !== 'youtube' && !url)) continue;
    ids.add(id);
    out.push({
      id,
      name: String(s.name || id).slice(0, 30),
      color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#3b5bff',
      mode,
      url,
      desc: String(s.desc || '').slice(0, 200),
      kids: !!s.kids,
      icon: typeof s.icon === 'string' && /^https:\/\/[^\s]+$/i.test(s.icon) ? s.icon.slice(0, 500) : undefined,
      hidden: !!s.hidden,
    });
  }
  return out.length ? out : null;
}
