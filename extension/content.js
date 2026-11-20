/* MCM Companion — content script (runs on every page, top frame only).
 *
 * On MCM pages it is a bridge: MCM asks it to open apps in a tab and to forward
 * phone-remote commands. On every other site it is the "companion": a controller
 * cursor plus the commands the phone remote sends while that site is in front. */
(() => {
  if (window.top !== window || window.__mcmCompanion) return;
  window.__mcmCompanion = true;
  const VERSION = chrome.runtime.getManifest().version;

  // Cosmetic ad hiding can be switched off from the popup.
  chrome.storage.local.get('cosmetic').then(({ cosmetic }) => {
    if (cosmetic === false) document.documentElement.setAttribute('data-mcm-ads', 'allow');
  });

  const start = () => {
    const isMcm = !!document.querySelector('meta[name="mcm-app"]');
    const isYouTubeTv = location.hostname === 'www.youtube.com' && location.pathname.startsWith('/tv');
    if (isMcm) { if (!/^\/(remote|admin)/.test(location.pathname)) bridge(); }
    else if (isYouTubeTv) youTubeTv();
    else companion();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  /* ================= bridge (on the MCM TV page) ================= */
  function bridge() {
    document.documentElement.dataset.mcmExt = VERSION;
    const post = (m) => window.postMessage({ source: 'mcm-ext', ...m }, location.origin);
    chrome.runtime.sendMessage({ type: 'mcm-hello' }, (r) => {
      void chrome.runtime.lastError;
      post({ type: 'ready', version: VERSION, adblock: !!(r && r.adblock) });
    });
    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || e.data.source !== 'mcm-page') return;
      const { source, rid, ...m } = e.data;
      chrome.runtime.sendMessage(m, (resp) => {
        void chrome.runtime.lastError;
        post({ type: 'reply', rid, resp: resp || { ok: false } });
      });
    });
    chrome.runtime.onMessage.addListener((m) => post(m));
  }

  /* ================= YouTube's TV app (youtube.com/tv) =================
   * Here the controller and phone act like a TV remote (arrow keys, OK, Back),
   * because the TV app is built for that instead of a mouse. */
  function youTubeTv() {
    chrome.runtime.sendMessage({ type: 'yttv-tab' }, () => void chrome.runtime.lastError);
    const KEYS = { up: [38, 'ArrowUp'], down: [40, 'ArrowDown'], left: [37, 'ArrowLeft'], right: [39, 'ArrowRight'], ok: [13, 'Enter'], back: [27, 'Escape'] };
    const press = (k) => { const [code, key] = KEYS[k]; window.postMessage({ source: 'mcm-key', code, key }, '*'); };
    const video = () => document.querySelector('video');
    const media = {
      toggle() { const v = video(); if (!v) return press('ok'); v.paused ? v.play().catch(() => {}) : v.pause(); },
      seek(d) { const v = video(); if (v) v.currentTime = Math.max(0, v.currentTime + d); },
      volume(d) { const v = video(); if (!v) return; v.muted = false; v.volume = Math.max(0, Math.min(1, v.volume + d)); },
      mute() { const v = video(); if (v) v.muted = !v.muted; },
    };
    const home = () => chrome.runtime.sendMessage({ type: 'home' }, () => void chrome.runtime.lastError);
    let searchTimer = 0;

    chrome.runtime.onMessage.addListener((m) => {
      if (!m || !m.t) return;
      if (m.t === 'key') {
        if (KEYS[m.k]) return press(m.k);
        if (m.k === 'playpause') return media.toggle();
        if (m.k === 'volup') return media.volume(0.1);
        if (m.k === 'voldown') return media.volume(-0.1);
        if (m.k === 'mute') return media.mute();
        return;
      }
      if (m.t === 'click' || m.t === 'enter') return press('ok');
      if (m.t === 'seek') return media.seek(Number(m.d) || 0);
      if (m.t === 'text') {
        // Typing on the phone opens YouTube's search with those words.
        clearTimeout(searchTimer);
        const q = String(m.v || '').trim();
        searchTimer = setTimeout(() => { location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : '#/search'; }, 700);
      }
    });

    // Controller: D-pad / left stick = arrows (repeating while held), ✕ OK, ○ Back, □ play/pause,
    // L1/R1 −/+10 s, L2/R2 volume, PS back to MCM.
    chrome.storage.local.get('yttvPad').then(({ yttvPad }) => {
      if (yttvPad === false) return; // turned off in the popup (if the TV app already reads the controller)
      const held = {};
      const prev = {};
      let psDown = 0;
      const BTN = { 0: () => press('ok'), 1: () => press('back'), 2: media.toggle, 4: () => media.seek(-10), 5: () => media.seek(10), 6: () => media.volume(-0.1), 7: () => media.volume(0.1) };
      const loop = (now) => {
        let gp = null;
        try { gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean) || null; } catch { /* blocked */ }
        if (gp && document.hasFocus()) {
          const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
          const ax = gp.axes || [];
          const dirs = { up: b(12) || ax[1] < -0.55, down: b(13) || ax[1] > 0.55, left: b(14) || ax[0] < -0.55, right: b(15) || ax[0] > 0.55 };
          for (const d in dirs) {
            if (dirs[d]) {
              if (held[d] === undefined) { held[d] = now + 380; press(d); }
              else if (now >= held[d]) { held[d] = now + 120; press(d); }
            } else delete held[d];
          }
          for (const k in BTN) { const p = b(+k); if (p && !prev[k]) BTN[k](); prev[k] = p; }
          const ps = b(16);
          if (ps && !psDown) psDown = now;
          if (!ps && psDown) { psDown = 0; home(); }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }

  /* ================= companion (on every other site) ================= */
  function companion() {
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let cursor = null;
    let hud = null;
    let hideTimer = 0;
    let hudTimer = 0;
    let shownHelp = false;
    let lastHover = null;
    let lastHoverAt = 0;

    const ensureUi = () => {
      if (cursor) return;
      cursor = document.createElement('div');
      cursor.id = 'mcm-cursor';
      hud = document.createElement('div');
      hud.id = 'mcm-hud';
      (document.body || document.documentElement).append(cursor, hud);
    };

    const say = (text, ms = 2600) => {
      ensureUi();
      hud.textContent = text;
      hud.classList.add('show');
      clearTimeout(hudTimer);
      hudTimer = setTimeout(() => hud.classList.remove('show'), ms);
    };

    const show = () => {
      ensureUi();
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      cursor.classList.add('show');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => cursor && cursor.classList.remove('show'), 5000);
      if (!shownHelp) { shownHelp = true; say('MCM: stick or phone moves the cursor · ✕/OK clicks · ○/Back goes back · PS/Home returns to MCM', 4500); }
    };

    const hover = () => {
      const now = performance.now();
      if (now - lastHoverAt < 60) return;
      lastHoverAt = now;
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      if (el !== lastHover) {
        if (lastHover) lastHover.dispatchEvent(new MouseEvent('mouseout', opts));
        el.dispatchEvent(new MouseEvent('mouseover', opts));
        lastHover = el;
      }
      el.dispatchEvent(new PointerEvent('pointermove', opts));
      el.dispatchEvent(new MouseEvent('mousemove', opts));
    };

    const moveBy = (dx, dy) => {
      x = Math.max(2, Math.min(innerWidth - 2, x + dx));
      y = Math.max(2, Math.min(innerHeight - 2, y + dy));
      // Pushing against the top or bottom edge scrolls the page.
      if ((y <= 3 && dy < 0) || (y >= innerHeight - 3 && dy > 0)) scrollAt(dy * 2);
      show();
      hover();
    };

    const scrollAt = (dy, dx = 0) => {
      let el = document.elementFromPoint(x, y);
      while (el && el !== document.body && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        const canY = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight;
        const canX = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth;
        if ((dy && canY) || (dx && canX)) { el.scrollBy(dx, dy); return; }
        el = el.parentElement;
      }
      window.scrollBy(dx, dy);
    };

    const click = () => {
      show();
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      cursor.classList.add('press');
      setTimeout(() => cursor && cursor.classList.remove('press'), 160);
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      const focusable = el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], button, a, [tabindex]');
      if (focusable && focusable.focus) focusable.focus({ preventScroll: true });
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.click();
      if (focusable && focusable.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable]')) {
        say('Type on your phone remote to fill this box.');
      }
    };

    const video = () => {
      let best = null;
      let area = 0;
      for (const v of document.querySelectorAll('video')) {
        const r = v.getBoundingClientRect();
        const a = Math.max(0, r.width) * Math.max(0, r.height);
        if (a > area) { area = a; best = v; }
      }
      return best;
    };

    const media = {
      toggle() { const v = video(); if (!v) return say('No video on this page.'); v.paused ? v.play().catch(() => say('Press ✕ on the play button instead.')) : v.pause(); },
      seek(d) { const v = video(); if (!v) return; v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 0.5, v.currentTime + d)); say(`${d > 0 ? '+' : '−'}${Math.abs(d)} s`, 900); },
      volume(d) { const v = video(); if (!v) return; v.muted = false; v.volume = Math.max(0, Math.min(1, v.volume + d)); say(`Volume ${Math.round(v.volume * 100)}%`, 900); },
      mute() { const v = video(); if (!v) return; v.muted = !v.muted; say(v.muted ? 'Muted' : 'Sound on', 900); },
      rate(r) { const v = video(); if (!v) return; v.playbackRate = r; say(`Speed ${r}×`, 900); },
      fullscreen() {
        if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
        const v = video();
        const target = v ? (v.closest('[class*="player" i], [id*="player" i]') || v) : document.documentElement;
        target.requestFullscreen().catch(() => say('Full screen needs a click: point at the site’s full-screen button and press ✕.'));
      },
    };

    const back = () => {
      if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
      history.back();
    };
    const home = () => chrome.runtime.sendMessage({ type: 'home' }, () => void chrome.runtime.lastError);

    const typeText = (value) => {
      const el = document.activeElement;
      if (!el || el === document.body) return say('Point at a text box and press ✕ first.');
      if (el.isContentEditable) { el.textContent = value; el.dispatchEvent(new InputEvent('input', { bubbles: true })); return; }
      if (!('value' in el)) return;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set; // works with React-style inputs too
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const enter = () => {
      const el = document.activeElement;
      if (!el) return;
      const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      const go = el.dispatchEvent(new KeyboardEvent('keydown', opts));
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
      if (go && el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
    };

    /* ----- phone remote commands (relayed by MCM through the background worker) ----- */
    const STEP = 70;
    chrome.runtime.onMessage.addListener((m) => {
      if (!m || !m.t) return;
      switch (m.t) {
        case 'key':
          switch (m.k) {
            case 'up': return moveBy(0, -STEP);
            case 'down': return moveBy(0, STEP);
            case 'left': return moveBy(-STEP, 0);
            case 'right': return moveBy(STEP, 0);
            case 'ok': return click();
            case 'back': return back();
            case 'playpause': return media.toggle();
            case 'volup': return media.volume(0.1);
            case 'voldown': return media.volume(-0.1);
            case 'mute': return media.mute();
            case 'menu': return media.fullscreen();
          }
          return;
        case 'pointer': return moveBy(Number(m.dx) || 0, Number(m.dy) || 0);
        case 'click': return click();
        case 'scroll': return scrollAt(Number(m.dy) || 0, Number(m.dx) || 0);
        case 'text': return typeText(String(m.v ?? ''));
        case 'enter': return enter();
        case 'seek': return media.seek(Number(m.d) || 0);
        case 'rate': return media.rate(Number(m.r) || 1);
      }
    });

    /* ----- game controller on this site ----- */
    const BTN = { 0: click, 1: back, 2: media.toggle, 3: media.fullscreen, 4: () => media.seek(-10), 5: () => media.seek(10), 6: () => media.volume(-0.1), 7: () => media.volume(0.1), 9: () => cursor && cursor.classList.toggle('show') };
    const prev = {};
    const held = {};
    let psDown = 0;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);

    const loop = (now) => {
      let gp = null;
      try { gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean) || null; } catch { /* blocked */ }
      if (gp && document.hasFocus()) {
        const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
        const ax = gp.axes || [];
        const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0);
        if (lx || ly) {
          const mag = Math.min(1, Math.hypot(lx, ly));
          const speed = 2 + 24 * mag * mag;
          moveBy((lx / mag) * speed * mag, (ly / mag) * speed * mag);
        }
        const rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
        if (rx || ry) scrollAt(ry * 28, rx * 28);
        // D-pad: one cursor step per press, repeating while held.
        [[12, 0, -1], [13, 0, 1], [14, -1, 0], [15, 1, 0]].forEach(([i, dx, dy]) => {
          if (b(i)) {
            if (!held[i]) { held[i] = now + 350; moveBy(dx * 50, dy * 50); }
            else if (now >= held[i]) { held[i] = now + 70; moveBy(dx * 50, dy * 50); }
          } else delete held[i];
        });
        for (const k in BTN) {
          const p = b(+k);
          if (p && !prev[k]) BTN[k]();
          prev[k] = p;
        }
        const ps = b(16);
        if (ps && !psDown) psDown = now;
        if (!ps && psDown) { psDown = 0; home(); }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    addEventListener('gamepadconnected', () => say('Controller ready. Left stick moves the cursor, PS returns to MCM.'));
  }
})();
