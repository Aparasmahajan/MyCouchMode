import { signal } from '@preact/signals';

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'ok' | 'back' | 'home' | 'menu' | 'search'
  | 'playpause' | 'volup' | 'voldown' | 'mute';
export type Source = 'keyboard' | 'pad' | 'phone';

export const lastSource = signal<Source>('keyboard');
export const pad = signal<{ connected: boolean; kind: 'ps' | 'xbox'; name: string }>({ connected: false, kind: 'ps', name: '' });

/** Right stick X (-1..1, 0 inside the dead zone). The player uses it to scrub through a video. */
export const stickX = signal(0);

/** When a text field is active (search, PIN), typed characters go to it instead of navigation. */
export const textMode = signal(false);

type ActionFn = (a: Action, src: Source) => void;
type CharFn = (ch: string) => void;

const KEYMAP: Record<string, Action> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back',
  h: 'home', H: 'home', m: 'menu', M: 'menu', ContextMenu: 'menu', '/': 'search',
  MediaPlayPause: 'playpause', k: 'playpause', '+': 'volup', '=': 'volup', '-': 'voldown',
  AudioVolumeUp: 'volup', AudioVolumeDown: 'voldown', AudioVolumeMute: 'mute',
};

// PS / standard mapping: 0 ✕/A, 1 ○/B, 2 □/X, 3 △/Y, 4 L1, 5 R1, 9 Options, 16 PS/Guide
const BUTTONS: Record<number, Action> = { 0: 'ok', 1: 'back', 2: 'playpause', 3: 'search', 9: 'menu', 4: 'voldown', 5: 'volup' };

let gp: Gamepad | null = null;

export function rumble(strength = 0.25) {
  try {
    (gp as any)?.vibrationActuator?.playEffect('dual-rumble', { duration: 35, weakMagnitude: strength, strongMagnitude: 0 }).catch(() => {});
  } catch { /* not supported */ }
}

export function startInput(onAction: ActionFn, onChar: CharFn) {
  const emit = (a: Action, src: Source) => {
    lastSource.value = src;
    onAction(a, src);
  };

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea, [contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (textMode.value) {
      if (e.key.length === 1) {
        e.preventDefault();
        lastSource.value = 'keyboard';
        return onChar(e.key);
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        return onChar('\b');
      }
    }
    const a = KEYMAP[e.key];
    if (!a) return;
    e.preventDefault();
    emit(a, 'keyboard');
  });

  /* Gamepad polling with key-repeat on held directions. PS tap = menu, PS hold = home. */
  const prev: Record<number, boolean> = {};
  const held: Partial<Record<Action, number>> = {};
  let psDown = 0;
  let alive = true;

  const dir = (d: Action, pressed: boolean, now: number) => {
    const next = held[d];
    if (pressed) {
      if (next === undefined) { held[d] = now + 380; emit(d, 'pad'); }
      else if (now >= next) { held[d] = now + 110; emit(d, 'pad'); }
    } else delete held[d];
  };

  const poll = (now: number) => {
    let pads: (Gamepad | null)[] = [];
    try { pads = navigator.getGamepads ? [...navigator.getGamepads()] : []; } catch { alive = false; }
    gp = pads.find(Boolean) || null;
    const was = pad.value;
    if (gp) {
      const kind = /054c|dualsense|dualshock|playstation|wireless controller/i.test(gp.id) ? 'ps' : 'xbox';
      if (!was.connected || was.kind !== kind) pad.value = { connected: true, kind, name: gp.id.split('(')[0].trim() };
      const b = (i: number) => !!gp!.buttons[i]?.pressed;
      const ax = gp.axes || [];
      dir('up', b(12) || ax[1] < -0.55, now);
      dir('down', b(13) || ax[1] > 0.55, now);
      dir('left', b(14) || ax[0] < -0.55, now);
      dir('right', b(15) || ax[0] > 0.55, now);
      for (const k in BUTTONS) {
        const i = +k;
        const p = b(i);
        if (p && !prev[i]) emit(BUTTONS[i], 'pad');
        prev[i] = p;
      }
      const rx = ax[2] ?? 0;
      const q = Math.abs(rx) < 0.25 ? 0 : Math.round(rx * 10) / 10;
      if (q !== stickX.peek()) { stickX.value = q; if (q) lastSource.value = 'pad'; }
      const ps = b(16);
      if (ps && !psDown) psDown = now;
      if (!ps && psDown) { emit(now - psDown > 500 ? 'home' : 'menu', 'pad'); psDown = 0; }
    } else if (was.connected) {
      pad.value = { ...was, connected: false };
      stickX.value = 0;
    }
    if (alive) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);

  return emit;
}
