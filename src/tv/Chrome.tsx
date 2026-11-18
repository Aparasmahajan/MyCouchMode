import { useEffect, useRef, useState } from 'preact/hooks';
import { AppIcon, Icon } from '../lib/logos';
import { appById } from '../lib/apps';
import { lastSource, pad } from '../lib/input';
import { volume } from '../lib/store';
import { art, tint, toast, volHud, type Art } from './state';

/** Full-screen art behind the home screen: crossfades between the selected app/video, plus drifting particles. */
export function Backdrop() {
  const [stack, setStack] = useState<Art[]>([art.value]);
  const cur = art.value;
  useEffect(() => {
    setStack((s) => (s[s.length - 1]?.key === cur.key ? s : [...s.slice(-1), cur]));
  }, [cur.key]);

  return (
    <div class="backdrop" aria-hidden="true">
      <div class="tv-bg" />
      {stack.map((a, i) => (
        <div key={a.key} class={`art${a.thumb ? ' video' : ''}${i < stack.length - 1 ? ' out' : ''}`}>
          {a.thumb && <img src={a.thumb} alt="" />}
          {a.app && <div class="big"><AppIcon app={appById(a.app) || { id: a.app, name: '', color: a.color || '#333' }} /></div>}
        </div>
      ))}
      <Particles />
      <div class="vignette" />
    </div>
  );
}

function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const x = c.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, raf = 0;
    const P = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4,
      s: Math.random() * 0.00025 + 0.00008, ph: Math.random() * 6.28, a: Math.random() * 0.5 + 0.15,
    }));
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; };
    const ro = new ResizeObserver(size); ro.observe(c); size();
    const frame = (t: number) => {
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, W, H);
      for (const p of P) {
        if (!reduce) { p.y -= p.s * 16; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } }
        x.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t / 900 + p.ph));
        x.fillStyle = p.r > 1.4 ? tint.peek() : '#ffffff';
        x.beginPath();
        x.arc((p.x + Math.sin(t / 3000 + p.ph) * 0.01) * W, p.y * H, p.r * (W / 900), 0, 6.283);
        x.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} class="fx" />;
}

const GLYPHS = {
  ps: { name: 'DualSense', ok: '✕', back: '○', menu: 'PS' },
  xbox: { name: 'Controller', ok: 'A', back: 'B', menu: 'Guide' },
  keyboard: { name: 'Keyboard', ok: 'Enter', back: 'Esc', menu: 'M' },
  phone: { name: 'Phone remote', ok: 'OK', back: 'Back', menu: '⊞' },
};
export const glyphs = () => (lastSource.value === 'pad' ? GLYPHS[pad.value.kind] : GLYPHS[lastSource.value]);

export function Hints() {
  const g = glyphs();
  return (
    <div class="hints">
      <span class="src"><span class="dot" />{g.name}</span>
      <span><span class="g">{g.ok}</span>Select</span>
      <span><span class="g">{g.back}</span>Back</span>
      <span><span class="g">{g.menu}</span>Control center</span>
    </div>
  );
}

export function Toast() {
  const t = toast.value;
  const app = t?.app ? appById(t.app) : null;
  return (
    <div class={`toast${t ? ' show' : ''}`} role="status">
      {t && (
        <>
          <span class="ti" style={{ '--c': app?.color || '#2a335c' } as any}>
            {app ? <AppIcon app={app} /> : <Icon name="info" />}
          </span>
          <span>{t.msg}</span>
        </>
      )}
    </div>
  );
}

export function VolumeHud() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!volHud.value) return;
    setShow(true);
    const id = setTimeout(() => setShow(false), 1300);
    return () => clearTimeout(id);
  }, [volHud.value]);
  return (
    <div class={`vol${show ? ' show' : ''}`}>
      <b>{volume.value || '—'}</b>
      <div class="vbar"><i style={{ height: volume.value + '%' }} /></div>
      <Icon name={volume.value ? 'volup' : 'mute'} />
    </div>
  );
}

export function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id); }, []);
  return <span class="clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
}
