import type { IncomingMessage, ServerResponse } from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { adminConfigured, isAdmin, send } from './_lib';

/**
 * GET /api/site-check?url=https://example.com   (admin only once ADMIN_PASSWORD is set)
 * Visits a site once and suggests how to onboard it:
 *   name, icon, brand colour, and whether it can open inside MCM (embeddable) or needs a new tab.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('cache-control', 'no-store');
  if (adminConfigured() && !isAdmin(req)) return send(res, 401, { error: 'wrong_password' });

  const input = new URL(req.url || '/', 'http://localhost').searchParams.get('url') || '';
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input);
  } catch {
    return send(res, 400, { error: 'bad_url', detail: 'That is not a web address.' });
  }

  try {
    const { response, finalUrl } = await safeFetch(target);
    const html = await readLimited(response, 400_000);
    const head = (html.match(/<head[\s\S]*?<\/head>/i)?.[0] || html.slice(0, 120_000));
    const verdict = frameVerdict(response.headers);
    // Bot-protection pages ("Just a moment...") say nothing about the real site.
    const blocked = response.status >= 400 || /just a moment|attention required|access denied/i.test(head);
    return send(res, 200, {
      ok: true,
      url: finalUrl.toString(),
      status: response.status,
      blocked,
      name: blocked ? hostName(finalUrl) : siteName(head, finalUrl),
      desc: blocked ? '' : meta(head, 'description')?.slice(0, 200) || '',
      color: (!blocked && usable(themeColor(head))) || colorFromHost(finalUrl.hostname),
      icon: bestIcon(head, finalUrl),
      embeddable: verdict.ok,
      reason: verdict.reason,
    });
  } catch (e: any) {
    return send(res, 422, { error: 'unreachable', detail: e?.message || String(e) });
  }
}

/* ---------- fetch safely (no internal addresses, limited redirects) ---------- */
async function assertPublic(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https addresses are allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new Error('Private addresses are not allowed.');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addrs) if (isPrivate(address)) throw new Error('Private addresses are not allowed.');
}

function isPrivate(ip: string) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function safeFetch(start: URL) {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; MCM-SiteCheck/1.0)',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'en-IN,en;q=0.9',
      },
    });
    const loc = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && loc) {
      url = new URL(loc, url);
      continue;
    }
    return { response, finalUrl: url };
  }
  throw new Error('Too many redirects.');
}

async function readLimited(r: Response, limit: number) {
  if (!r.body) return '';
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/* ---------- can it open inside MCM? ---------- */
function frameVerdict(h: Headers) {
  const xfo = (h.get('x-frame-options') || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return { ok: false, reason: `The site sends X-Frame-Options: ${xfo.toUpperCase()}, so browsers refuse to show it inside another site.` };
  const csp = h.get('content-security-policy') || '';
  const fa = csp.split(';').map((d) => d.trim()).find((d) => d.toLowerCase().startsWith('frame-ancestors'));
  if (fa) {
    const values = fa.split(/\s+/).slice(1);
    if (!values.includes('*') && !values.includes('https:')) return { ok: false, reason: `The site only allows these sites to embed it: ${values.join(' ') || 'none'}.` };
  }
  return { ok: true, reason: 'No embedding restrictions found. It should open inside MCM; if it shows a blank page, switch it to "New tab".' };
}

/* ---------- page details ---------- */
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

function meta(head: string, key: string) {
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const n = (attr(tag, 'name') || attr(tag, 'property') || '').toLowerCase();
    if (n === key) return decode(attr(tag, 'content') || '').trim();
  }
  return undefined;
}

function siteName(head: string, u: URL) {
  const fromMeta = meta(head, 'og:site_name') || meta(head, 'application-name') || meta(head, 'apple-mobile-web-app-title');
  if (fromMeta) return fromMeta.slice(0, 30);
  const title = decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const part = title.split(/\s[|\-–—:·]\s/).map((s) => s.trim()).filter(Boolean);
  const short = part.sort((a, b) => a.length - b.length)[0];
  if (short && short.length <= 30) return short;
  return hostName(u);
}

function hostName(u: URL) {
  const host = u.hostname.replace(/^www\./, '').split('.')[0];
  return host.charAt(0).toUpperCase() + host.slice(1);
}

/** Near-black or near-white theme colours make poor tiles. */
function usable(hex?: string) {
  if (!hex) return undefined;
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.08 || lum > 0.9 ? undefined : hex;
}

function themeColor(head: string) {
  const c = meta(head, 'theme-color') || meta(head, 'msapplication-tilecolor');
  if (!c) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('').toLowerCase();
  return undefined;
}

function bestIcon(head: string, base: URL) {
  let best: { href: string; score: number } | null = null;
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href || !/icon/.test(rel)) continue;
    const size = Number((attr(tag, 'sizes') || '').split('x')[0]) || 0;
    const score = (rel.includes('apple-touch') ? 1000 : 0) + (/\.svg(\?|$)/i.test(href) ? 900 : 0) + size;
    if (!best || score > best.score) best = { href, score };
  }
  try {
    const u = new URL(best ? decode(best.href) : '/favicon.ico', base);
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return undefined;
  }
}

function colorFromHost(host: string) {
  let h = 0;
  for (const ch of host) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  // HSL(hue, 65%, 45%) to hex
  const s = 0.65, l = 0.45;
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function decode(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
