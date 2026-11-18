#!/usr/bin/env node
/**
 * Copies the Google service-account details into .env so you never paste the private key by hand.
 *
 *   node scripts/fill-env.mjs <key-file.json> [sheet-url-or-id] [youtube-key]
 *
 * Example:
 *   node scripts/fill-env.mjs ~/Downloads/mycouchmode-1a2b3c.json "https://docs.google.com/spreadsheets/d/1AbC.../edit" AIza...
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV = fileURLToPath(new URL('../.env', import.meta.url));
const [keyFile, sheet, ytKey] = process.argv.slice(2);

if (!keyFile) {
  console.error('Usage: node scripts/fill-env.mjs <key-file.json> [sheet-url-or-id] [youtube-key]');
  process.exit(1);
}

let key;
try {
  key = JSON.parse(readFileSync(keyFile, 'utf8'));
} catch (e) {
  console.error(`Could not read ${keyFile}: ${e.message}`);
  process.exit(1);
}
if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
  console.error('That file is not a service-account key. Download it from IAM & Admin → Service Accounts → mcm-sheets → Keys → Add key → JSON.');
  process.exit(1);
}

let env = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
const set = (name, value) => {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  env = re.test(env) ? env.replace(re, () => line) : `${env.trimEnd()}\n${line}\n`;
};

set('GOOGLE_SA_EMAIL', key.client_email);
// One line with \n escapes, in double quotes: Vercel's .env import and dotenv both accept this.
set('GOOGLE_SA_KEY', `"${key.private_key.replace(/\r?\n/g, '\\n')}"`);

if (sheet) {
  const id = sheet.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1] || sheet.trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) { console.error('That does not look like a Google Sheet URL or ID.'); process.exit(1); }
  set('GOOGLE_SHEET_ID', id);
}
if (ytKey) {
  if (!/^AIza[A-Za-z0-9_-]{30,}$/.test(ytKey.trim())) { console.error('That does not look like a YouTube API key (they start with AIza).'); process.exit(1); }
  set('YOUTUBE_API_KEY', ytKey.trim());
}

writeFileSync(ENV, env);
const missing = ['ADMIN_PASSWORD', 'GOOGLE_SHEET_ID', 'GOOGLE_SA_EMAIL', 'GOOGLE_SA_KEY', 'YOUTUBE_API_KEY']
  .filter((n) => !new RegExp(`^${n}=.+$`, 'm').test(env));
console.log(`Updated .env with ${key.client_email}.`);
console.log(missing.length ? `Still empty: ${missing.join(', ')}` : 'All values are filled in. Import .env in Vercel.');
console.log(`Remember to share the Google Sheet with ${key.client_email} as Editor.`);
