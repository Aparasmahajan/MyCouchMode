import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';

/** Shared helpers for the Vercel functions. Files starting with "_" are not routes. */

export function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readJson(req: IncomingMessage, limit = 200_000): Promise<any> {
  const anyReq = req as any;
  if (anyReq.body && typeof anyReq.body === 'object') return anyReq.body; // Vercel pre-parsed it
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('too_large');
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

/* ---------- admin password ---------- */
export const adminConfigured = () => !!process.env.ADMIN_PASSWORD;

export function isAdmin(req: IncomingMessage) {
  const want = process.env.ADMIN_PASSWORD;
  const got = req.headers['x-admin-password'];
  if (!want || typeof got !== 'string') return false;
  // compare hashes so the lengths always match
  const a = createHash('sha256').update(want).digest();
  const b = createHash('sha256').update(got).digest();
  return timingSafeEqual(a, b);
}

/* ---------- Upstash Redis (Vercel Marketplace) over its REST API ---------- */
const kvUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const kvToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const kvReady = () => !!(kvUrl() && kvToken());

export async function kv(command: (string | number)[]) {
  const r = await fetch(kvUrl(), {
    method: 'POST',
    headers: { authorization: `Bearer ${kvToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error || `kv_${r.status}`);
  return data.result;
}
