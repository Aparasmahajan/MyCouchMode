/* MCM Companion — runs inside YouTube's TV app page (youtube.com/tv) in the page's own world.
 *
 * 1. Makes the page see a Smart TV browser, so YouTube serves its TV app (the request
 *    header is changed by rules/yttv.json and a per-tab rule in background.js).
 * 2. Turns MCM key messages into real-looking key presses the TV app understands. */
(() => {
  const UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36';
  const fake = (obj, prop, value) => {
    try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch { /* ignore */ }
  };
  fake(Navigator.prototype, 'userAgent', UA);
  fake(Navigator.prototype, 'appVersion', UA.slice(8));
  fake(Navigator.prototype, 'platform', 'Linux armv7l');
  fake(Navigator.prototype, 'userAgentData', undefined);

  // Key presses requested by the MCM content script (controller or phone remote).
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'mcm-key') return;
    const { code, key } = e.data;
    const target = document.activeElement || document.body || document.documentElement;
    for (const type of ['keydown', 'keyup']) {
      const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(ev, 'keyCode', { get: () => code });
      Object.defineProperty(ev, 'which', { get: () => code });
      target.dispatchEvent(ev);
    }
  });
})();
