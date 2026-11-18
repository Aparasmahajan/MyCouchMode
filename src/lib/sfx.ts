import { sfxOn } from './store';

/** Soft UI sounds made with WebAudio (no audio files to download). */
let ac: AudioContext | null = null;
const SPEC = {
  move: [1600, 1500, 0.018, 0.045],
  ok: [700, 1250, 0.05, 0.16],
  back: [900, 520, 0.04, 0.14],
  open: [520, 980, 0.04, 0.22],
} as const;

export function sfx(type: keyof typeof SPEC) {
  if (!sfxOn.value) return;
  try {
    ac = ac || new AudioContext();
    if (ac.state === 'suspended') ac.resume();
    const [f1, f2, gain, len] = SPEC[type];
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + len * 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + len + 0.02);
  } catch {
    /* audio not allowed yet */
  }
}
