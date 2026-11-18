import { createSign } from 'node:crypto';

/**
 * Minimal Google Sheets client for Vercel functions, using a service account.
 * No SDK: a signed JWT is exchanged for an access token, then the Sheets REST API is called.
 *
 * Env: GOOGLE_SHEET_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_KEY (the private_key from the JSON key file).
 */
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

const sheetId = () => process.env.GOOGLE_SHEET_ID || '';
const saEmail = () => process.env.GOOGLE_SA_EMAIL || '';
// Vercel keeps real newlines, but keys pasted as one line arrive with literal "\n".
const saKey = () => (process.env.GOOGLE_SA_KEY || '').replace(/\\n/g, '\n').trim();

export const sheetsReady = () => !!(sheetId() && saEmail() && saKey());

/* ---------- auth ---------- */
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function signJwt(email: string, privateKey: string, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sig = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey);
  return `${header}.${claims}.${b64url(sig)}`;
}

let token: { value: string; exp: number } | null = null; // reused while the function stays warm

async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(saEmail(), saKey()) }),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google sign-in failed: ${d.error_description || d.error || r.status}. Check GOOGLE_SA_EMAIL and GOOGLE_SA_KEY.`);
  token = { value: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return token.value;
}

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SHEETS}/${sheetId()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d?.error?.message || r.statusText;
    if (r.status === 403 || r.status === 404) throw new Error(`Google Sheets: ${msg}. Share the sheet with ${saEmail()} as Editor and check GOOGLE_SHEET_ID.`);
    throw new Error(`Google Sheets: ${msg}`);
  }
  return d;
}

/* ---------- tabs ---------- */
async function ensureTab(title: string) {
  const d = await api('?fields=sheets.properties.title');
  const exists = (d.sheets || []).some((s: any) => s.properties?.title === title);
  if (!exists) await api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
}

/** Reads a tab as objects keyed by its header row. A missing tab reads as empty. */
export async function readTab(title: string): Promise<Record<string, string>[]> {
  let d: any;
  try {
    d = await api(`/values/${encodeURIComponent(`'${title}'!A1:Z1000`)}`);
  } catch (e: any) {
    if (/Unable to parse range/i.test(e.message)) return [];
    throw e;
  }
  const [header = [], ...rows] = (d.values || []) as string[][];
  const keys = header.map((h) => String(h).trim().toLowerCase());
  return rows
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, String(r[i] ?? '').trim()])));
}

/** Replaces a tab's contents with a header row plus rows (creating the tab if needed). */
export async function writeTab(title: string, header: string[], rows: (string | number | boolean)[][]) {
  await ensureTab(title);
  const range = encodeURIComponent(`'${title}'!A1:Z1000`);
  await api(`/values/${range}:clear`, { method: 'POST', body: '{}' });
  await api(`/values/${encodeURIComponent(`'${title}'!A1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [header, ...rows] }),
  });
}

export const truthy = (v: unknown) => /^(true|yes|y|1|✓)$/i.test(String(v ?? '').trim());
