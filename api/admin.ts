import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminConfigured, isAdmin, send } from './_lib.js';
import { storageKind, youtubeConfig } from './_store.js';

/** POST /api/admin — checks the admin password and reports what the server has set up. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!adminConfigured()) return send(res, 503, { error: 'admin_not_configured', storage: storageKind() });
  if (!isAdmin(req)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return send(res, 401, { error: 'wrong_password' });
  }
  const yt = await youtubeConfig().catch(() => ({ key: process.env.YOUTUBE_API_KEY || '' }));
  return send(res, 200, { ok: true, storage: storageKind(), youtube: !!yt.key });
}
