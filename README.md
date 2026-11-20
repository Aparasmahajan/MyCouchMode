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

### Recommendations and Up next (built-in YouTube)
- Home shows **Continue watching · Recommended**, and the search screen opens with **Recommended for you**: more from the channels you watched, then what's trending in your region (Kids profiles skip trending). These cost 1–2 quota units and are cached for 30–60 minutes.
- When a video ends, **Up next** counts down 6 seconds and plays the next one (Play now / Cancel). The player has **Next** and **Auto on/off**; the phone has a Next button.

### Videos sent from the phone don't start with sound?
Browsers only allow a page to play sound after a key press or click *on that page*; choosing on the phone doesn't count. MCM then starts the video muted and turns the sound on at the first key press or click on the TV. To always get sound:
- **Install MCM as an app** (Control center → Install MCM app, or the install icon in the address bar). Installed apps may autoplay with sound.
- Or in Brave: **Site settings → Autoplay → Allow** for your MCM address (Chrome: **Sound → Allow** helps once you've played a few videos).

## Adding sites (admin)

1. Open `https://<your-app>/admin` and sign in with `ADMIN_PASSWORD`.
2. **Add a site** → paste its address → **Check site**. MCM visits the site once and fills in the name, icon and colour. It also reads the site's security headers to decide how it opens:
   - **Inside MCM**: the site allows embedding (it shows inside MCM's frame).
   - **New tab**: the site forbids embedding. Every site works this way, and with the Companion extension you still control it from the phone and controller.
3. **Add to home screen**, then **Save changes**. TVs pick it up the next time they open or wake (and instantly on the same computer).

Where the list is stored:
- With **Upstash for Redis** connected in Vercel (free): one list for every TV.
- Without it: the admin page offers **Edit on this device only**, which only affects TVs running in that same browser. Use **Export** / **Import** to move a list between devices.

## YouTube

With the Companion extension, the YouTube tile opens **YouTube's own TV app** (youtube.com/tv) in its own tab:
- **Everyone signs in with their own Google account.** The TV app shows a code; enter it at **yt.be/activate** on a phone. Accounts can be switched from the TV app's profile menu.
- Their own recommendations, subscriptions, history, and YouTube Premium (no ads).
- The controller and the MCM phone remote act as a TV remote: arrows, OK, Back, play/pause, ±10 s. Typing on the phone searches YouTube.
- In the TV app, **Settings → Link with TV code** lets anyone cast from the YouTube app on their phone.

YouTube only serves the TV app to TVs, so the extension makes that one tab identify itself as a Samsung Tizen TV. Desktop YouTube-TV apps work the same way. YouTube could change this at any time; if it stops working, the tile still opens regular YouTube.

Without the extension, the YouTube tile explains this and offers **Set up YouTube TV** (download + steps), **Open regular YouTube** (sign in on youtube.com in a tab), or **Quick search here** (MCM's built-in search and player: type, then Enter or the phone's Go). The player fills the screen by default; **Fit/Fill** switches to showing the whole picture.

## Mouse mode for any site (Vzy, Crunchyroll, …)

With the Companion extension, every site opens in its own tab where:
- **Controller:** left stick or D-pad moves a pointer, ✕ clicks, right stick scrolls, ○ goes back, PS returns to MCM.
- **Phone:** a **Trackpad** (drag to move, tap to click, scroll strip on the right) or a **D-pad** (arrows move, Click clicks), plus back, play/pause, ±10 s, full screen and typing into the selected box.

Without the extension, sites that allow embedding open inside MCM, where only a real mouse works (browsers block one site from controlling another).

## MCM Companion extension (any site + ad blocking)

Websites can't control other websites, so a small browser extension does that part. It lives in [`extension/`](extension).

**Get it:** download `https://<your-app>/mcm-companion.zip` (the YouTube tile's **Set up YouTube TV** button does this) and unzip it. It is rebuilt from `extension/` on every deploy.

**Install (Chrome, Edge or Brave):** open `chrome://extensions` (Brave: `brave://extensions`) → turn on **Developer mode** → **Load unpacked** → choose the `extension` folder. Then reload MCM; the control center shows **Companion: Installed**. After updating the folder, press the extension's **reload** button on `chrome://extensions`.

What it adds:
- Apps open in one tab next to MCM, with no pop-up blocking.
- **Controller on any site:** left stick or D-pad moves a cursor, ✕ clicks, ○ goes back, □ plays/pauses, L1/R1 skip 10 s, L2/R2 volume, right stick scrolls, △ full screen, PS returns to MCM.
- **Phone on any site:** the remote switches to a trackpad with a scroll strip, back, play/pause, ±10 s, full screen, typing into the selected box, "Back to MCM" and "Close site".
- **Ad blocking:** about 100 ad and tracker networks are blocked in every tab, including sites shown inside MCM, plus leftover ad boxes are hidden. Toggle it from the extension's popup.

Ad blocking limits: a built-in list can't match Brave or uBlock Origin's constantly updated lists. For the most complete blocking, run MCM in **Brave**; the extension works there too. YouTube Premium already removes YouTube ads wherever you are signed in. DRM streaming services block clicks from extensions on some buttons; use the controller's media buttons (□, L1/R1) there.

## Deploy to Vercel

1. **Push to GitHub** (a private repository is fine).
2. **Vercel → Add New → Project**, import the repository. Vercel detects Vite; keep the defaults. If the repository root is the parent `MCM` folder, set **Root Directory** to `mcm`.
3. **Storage**: set up the Google Sheet (below), or use **Storage → Upstash for Redis** in Vercel instead.
4. **Settings → Environment Variables** (see `.env.example`):

   | Name | Value |
   |---|---|
   | `ADMIN_PASSWORD` | a strong password for `/admin` |
   | `GOOGLE_SHEET_ID` | from the sheet's address |
   | `GOOGLE_SA_EMAIL` | `client_email` from the service-account JSON |
   | `GOOGLE_SA_KEY` | `private_key` from the JSON, the whole block including the BEGIN/END lines |
   | `YOUTUBE_API_KEY` | optional: you can paste the key on `/admin` → YouTube instead |

5. **Deploy.** TV: `https://<app>.vercel.app` · phone: `/remote` · admin: `/admin`.
6. Open `/admin` → **YouTube** → paste the key → **Save** → **Test search**. Then add sites on the **Sites** tab.

### Google Sheet storage (free)

Use the same Google Cloud project as the YouTube key.

1. **APIs & Services → Library → Google Sheets API → Enable.**
2. **IAM & Admin → Service Accounts → Create service account** (name it `mcm-sheets`, no roles needed).
3. Open it → **Keys → Add key → Create new key → JSON**. Keep the file private; never commit it.
4. Create a sheet at [sheets.new](https://sheets.new) named **MCM Data**. No setup inside it is needed.
5. **Share** the sheet with the service account's email (`…@….iam.gserviceaccount.com`) as **Editor**.
6. Copy the sheet ID from its address: `docs.google.com/spreadsheets/d/<ID>/edit`.
7. Fill `.env` without pasting the key by hand, then import `.env` in Vercel (**Settings → Environment Variables → Import .env**):
   ```bash
   node scripts/fill-env.mjs ~/Downloads/<key-file>.json "<sheet URL>" <youtube key>
   ```

MCM creates two tabs on the first save:
- **Sites**: one row per home-screen tile (`order, id, name, url, mode, color, icon, kids, hidden, desc`). You can edit it directly in the sheet: add a row with just a name, `url` and `mode` (`frame` or `tab`), and TVs pick it up within about a minute. `kids`/`hidden` accept TRUE/FALSE or yes/no.
- **Settings**: server-only values such as `youtube_api_key` and `youtube_region`. Only you and the service account can open the sheet, and the API never sends the key to TVs or phones (the admin page shows only its last 4 characters).

If Google says service-account key creation is disabled, the account is a company (Workspace) account with that policy; use a personal Gmail account for the project.

### YouTube API key

1. In the same project: **APIs & Services → Library → YouTube Data API v3 → Enable.**
2. **Credentials → Create credentials → API key.** Edit it: **API restrictions → Restrict key → YouTube Data API v3**. Leave application restrictions on **None** (the key is used from Vercel's servers).
3. Paste it on `/admin` → **YouTube** and press **Test search**. Or set `YOUTUBE_API_KEY` in Vercel; a key saved on the admin page takes priority.

The key belongs to the Google Cloud project, not to anyone's YouTube account: searches are anonymous and nothing is saved to an account.

## How the phone link works

The TV and phone talk directly over WebRTC (PeerJS). PeerJS's free public server only helps them find each other, and no video or account data goes through it. The TV keeps the same 6-character code across reloads, so phones reconnect on their own.

## Known limits

- **New-tab apps without the extension.** Without the Companion extension, controller and phone control stop at the new tab, and the browser may block the tab as a pop-up. Install the extension to fix both.
- **Autoplay with sound.** Browsers allow it only after one key press or click on the TV page. Before that, MCM shows "Press OK to start playing". For a dedicated TV box, Chrome can be started with `--autoplay-policy=no-user-gesture-required`.
- **Profiles are stored on the TV's browser.** They don't sync to other TVs yet. Syncing them through the sheet needs a per-household code first, so profile names are never readable from the public site address. PINs only keep kids out; they are not account security.
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
api/sites.ts            Site list (GET public, PUT admin)
api/settings.ts         Admin-only settings: YouTube key + region
api/_store.ts           Storage: Google Sheet, else Upstash, else none
api/_sheets.ts          Google Sheets client (service account, no SDK)
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
