# MCM · My Couch Mode

A console-style TV interface that runs in any modern browser on a TV or laptop.
Drive it with a game controller, a keyboard, or your phone. No app install needed.

**Author:** Paras Mahajan

## What works in this MVP

| Area | What you get |
|---|---|
| TV home | PS5-style home with sliding app tiles, full-screen art, "Continue watching", top bar with clock and connection status |
| Profiles | "Who's watching?" on start, per-profile watch history, optional 4-digit PIN, Kids profiles (YouTube only, strict safe search) |
| Controller | Any standard gamepad (DualSense, Xbox, generic). D-pad and left stick move, ✕/A select, ○/B back, △/Y search, □/X play/pause, L1/R1 volume, PS tap = control center, PS hold = home. Light vibration on supported pads. |
| Keyboard / TV remote | Arrow keys, Enter, Esc/Backspace = back, `M` control center, `H` home, `/` search, `K` play/pause |
| Phone remote | Open `/remote` on a phone, scan the QR or type the TV code. D-pad or touchpad, back/home/menu, volume, type-to-search, quick-launch apps, sign in to a profile, add or remove profiles, "send a YouTube link" to play on the TV, now-playing controls |
| YouTube | Search (through a Vercel function that hides the API key), official embedded player with our own controls, resume where you left off |
| Other services | Vzy opens inside MCM (it allows embedding). JioHotstar, ZEE5, SonyLIV, Twitch and Spotify open in a new tab, because they block embedding. |
| Control center | Now playing, phone, controller and Companion status, switch profile, pair a phone, full screen, sleep timer, UI sounds, rest mode |
| Player | Speed (0.25×–2×), captions, loop, sleep timer (end of video or 15–90 min), right-stick scrubbing, ←/→ skip 10 s when the controls are hidden, all mirrored on the phone with a seek slider |
| Admin page (`/admin`) | Add any website as a tile by pasting its address: MCM fills in the name, icon and colour and works out whether it can open inside MCM. Reorder, hide, edit, delete, export/import. |
| Companion extension | Controller cursor and phone trackpad on any site, PS/Home returns to MCM, no pop-up blocking, ad and tracker blocking |
| App | Installable PWA (works offline for the shell), about 29 KB of JavaScript (gzipped) on first load for the TV |

## Run it locally

```bash
npm install
cp .env.example .env    # optional: add YOUTUBE_API_KEY to enable search
npm run dev
```

- TV: open http://localhost:5173 in a browser.
- Phone on the same Wi-Fi: open `http://<your-computer-ip>:5173/remote` and type the code shown on the TV.
- Same browser test: open `http://localhost:5173/remote?local=1#<CODE>` in a second tab.

## Player controls

| Input | What it does |
|---|---|
| Right stick left/right | Scrub through the video (tilt further to go faster); let go to jump there |
| ← / → (controls hidden) | Skip back / forward 10 s |
| OK / ✕ (controls hidden) | Play / pause |
| □ / X | Play / pause at any time |
| Speed, CC, Loop, Sleep buttons | Speed menu, captions, repeat the video, sleep timer |
| Phone | Seek slider, ±10 s, speed chips, captions, loop, sleep timer |

## Adding sites (admin)

1. Open `https://<your-app>/admin` and sign in with `ADMIN_PASSWORD`.
2. **Add a site** → paste its address → **Check site**. MCM visits the site once and fills in the name, icon and colour. It also reads the site's security headers to decide how it opens:
   - **Inside MCM**: the site allows embedding (it shows inside MCM's frame).
   - **New tab**: the site forbids embedding. Every site works this way, and with the Companion extension you still control it from the phone and controller.
3. **Add to home screen**, then **Save changes**. TVs pick it up the next time they open or wake (and instantly on the same computer).

Where the list is stored:
- With **Upstash for Redis** connected in Vercel (free): one list for every TV.
- Without it: the admin page offers **Edit on this device only**, which only affects TVs running in that same browser. Use **Export** / **Import** to move a list between devices.

## MCM Companion extension (any site + ad blocking)

Websites can't control other websites, so a small browser extension does that part. It lives in [`extension/`](extension).

**Install (Chrome, Edge or Brave):** open `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose the `extension` folder. Then reload MCM; the control center shows **Companion: Installed**.

What it adds:
- Apps open in one tab next to MCM, with no pop-up blocking.
- **Controller on any site:** left stick or D-pad moves a cursor, ✕ clicks, ○ goes back, □ plays/pauses, L1/R1 skip 10 s, L2/R2 volume, right stick scrolls, △ full screen, PS returns to MCM.
- **Phone on any site:** the remote switches to a trackpad with a scroll strip, back, play/pause, ±10 s, full screen, typing into the selected box, "Back to MCM" and "Close site".
- **Ad blocking:** about 100 ad and tracker networks are blocked in every tab, including sites shown inside MCM, plus leftover ad boxes are hidden. Toggle it from the extension's popup.

Ad blocking limits: a built-in list can't match Brave or uBlock Origin's constantly updated lists. For the most complete blocking, run MCM in **Brave**; the extension works there too. YouTube Premium already removes YouTube ads wherever you are signed in. DRM streaming services block clicks from extensions on some buttons; use the controller's media buttons (□, L1/R1) there.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project**, import the repository. Vercel detects Vite; keep the defaults (build `npm run build`, output `dist`).
3. Under **Settings → Environment Variables**, add:
   - `YOUTUBE_API_KEY` (Google Cloud Console, with "YouTube Data API v3" enabled; restrict the key to that API)
   - `ADMIN_PASSWORD` (for `/admin`)
4. Under **Storage**, create **Upstash for Redis** and connect it to the project (Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`).
5. Deploy. The TV uses `https://<your-app>.vercel.app`, phones use `https://<your-app>.vercel.app/remote`.

Without a key everything still works except YouTube search. You can still send links from the phone.

## How the phone link works

The TV and phone talk directly over WebRTC (PeerJS). PeerJS's free public server only helps them find each other, and no video or account data goes through it. The TV keeps the same 6-character code across reloads, so phones reconnect on their own.

## Known limits

- **New-tab apps without the extension.** Without the Companion extension, controller and phone control stop at the new tab, and the browser may block the tab as a pop-up. Install the extension to fix both.
- **Autoplay with sound.** Browsers allow it only after one key press or click on the TV page. Before that, MCM shows "Press OK to start playing". For a dedicated TV box, Chrome can be started with `--autoplay-policy=no-user-gesture-required`.
- **Profiles are stored on the TV's browser.** They don't sync to other TVs yet. PINs only keep kids out; they are not account security.
- **YouTube quota.** One search costs 100 of the 10,000 free daily units, so roughly 100 searches a day. Results are cached at Vercel's edge for an hour.
- **App logos** are simplified stand-ins. Replace them with each service's official icons, following its brand guidelines, before a public launch.
- **Public PeerJS server.** It's free but has no uptime guarantee. For production, run your own PeerJS server or switch the link to Supabase Realtime (`src/lib/link.ts` is the only file to change).

## Project layout

```
api/yt-search.ts        Vercel function: YouTube search proxy (keeps the key server-side)
src/main.tsx            Loads the TV app or the phone remote (/remote), each as its own bundle
src/lib/nav.tsx         Focus engine: layers, spatial D-pad navigation, <F> focusable component
src/lib/input.ts        Keyboard + Gamepad API input
src/lib/link.ts         Phone <-> TV link (PeerJS, BroadcastChannel fallback)
src/lib/store.ts        Profiles, watch history, settings (localStorage)
src/lib/apps.ts         Built-in apps + the live site list from /api/sites
src/lib/ext.ts          Bridge to the Companion extension
src/admin/Admin.tsx     Admin page: onboard, edit, reorder sites
api/sites.ts            Site list storage (Upstash Redis)
api/site-check.ts       Visits a site once to suggest name, icon, colour and open mode
api/admin.ts            Admin password check
extension/              MCM Companion (Manifest V3): any-site control + ad blocking
src/tv/*                TV screens: Home, Search, Player, Welcome, PIN, Pair, Control center, Frame
src/remote/Remote.tsx   Phone remote
```

## Next steps

- Accounts and cloud sync for profiles and history (Supabase Auth + database)
- Companion browser extension so the controller and the Home button also work on new-tab services
- TMDB "where to watch" search across services
- Watch-together for YouTube, controller-friendly games, screensaver with photos
