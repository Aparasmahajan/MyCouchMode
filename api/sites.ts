import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminConfigured, isAdmin, readJson, send } from './_lib.js';
import { cleanSites, getSites, saveSites, storageKind } from './_store.js';

/**
 * GET  /api/sites            -> { sites: Site[] | null, storage }   (public, read by every TV)
 * PUT  /api/sites  {sites}   -> { ok: true }                         (admin only)
 * Storage is Google Sheets ("Sites" tab), else Upstash Redis — see _store.ts.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') {
    const storage = storageKind();
    if (storage === 'none') return send(res, 200, { sites: null, storage });
    try {
      const sites = await getSites();
      // Brief edge caching keeps Google Sheets quota low when many TVs start at once.
      res.setHeader('cache-control', 'public, s-maxage=20, stale-while-revalidate=300');
      return send(res, 200, { sites, storage });
    } catch (e: any) {
      res.setHeader('cache-control', 'no-store');
      return send(res, 502, { error: 'storage_error', detail: e?.message || String(e) });
    }
  }

  res.setHeader('cache-control', 'no-store');
  if (req.method === 'PUT') {
    if (!adminConfigured()) return send(res, 503, { error: 'admin_not_configured' });
    if (!isAdmin(req)) return send(res, 401, { error: 'wrong_password' });
    if (storageKind() === 'none') return send(res, 503, { error: 'storage_not_configured' });
    let body: any;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad_json' }); }
    const sites = cleanSites(body?.sites);
    if (!sites) return send(res, 400, { error: 'bad_sites' });
    try {
      await saveSites(sites);
      return send(res, 200, { ok: true, count: sites.length });
    } catch (e: any) {
      return send(res, 502, { error: 'storage_error', detail: e?.message || String(e) });
    }
  }

  res.setHeader('allow', 'GET, PUT');
  return send(res, 405, { error: 'method_not_allowed' });
}
