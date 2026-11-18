import '../styles/remote.css';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { join, type Msg, type PhoneLink } from '../lib/link';
import { AppIcon, Icon } from '../lib/logos';
import { AVATAR_COLORS, load, save } from '../lib/shared';

interface TvProfile { id: string; name: string; color: number; kids: boolean; hasPin: boolean }
interface TvState {
  code: string;
  profiles: TvProfile[];
  active: string | null;
  layer: string;
  query: string;
  pinFor: string | null;
  now: { id: string; title: string; channel?: string; pos: number; dur: number; playing: boolean } | null;
  opts?: { rate: number; loop: boolean; captions: boolean };
  sleep?: { mins: number; atEnd: boolean };
  apps?: { id: string; name: string; color: string; icon?: string; kids: boolean }[];
  away?: boolean;
  ext?: boolean;
}

const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const pretty = (c: string) => `${c.slice(0, 3)}·${c.slice(3)}`;
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };

export function RemoteApp() {
  const local = new URLSearchParams(location.search).has('local');
  const [code, setCode] = useState(() => {
    const fromHash = cleanCode(decodeURIComponent(location.hash.slice(1)));
    return fromHash.length === 6 ? fromHash : load<string>('mcm.remote.code', '');
  });

  // Scanning another TV's QR code while this page is open only changes the #hash.
  useEffect(() => {
    const onHash = () => {
      const c = cleanCode(decodeURIComponent(location.hash.slice(1)));
      if (c.length === 6) setCode(c);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    save('mcm.remote.code', code);
    history.replaceState(null, '', `/remote${location.search}${code ? '#' + code : ''}`);
  }, [code]);

  return (
    <div class="remote">
      {code.length === 6 ? <Connected key={code} code={code} local={local} onForget={() => setCode('')} /> : <CodeEntry onCode={setCode} />}
      <footer>MCM · My Couch Mode · by Paras Mahajan</footer>
    </div>
  );
}

/* ---------- 1. Enter the code shown on the TV ---------- */
function CodeEntry({ onCode }: { onCode: (c: string) => void }) {
  const [v, setV] = useState('');
  const ready = cleanCode(v).length === 6;
  return (
    <main class="entry">
      <div class="brand-big"><img src="/icon.svg" alt="" /><div><b>MCM</b><span>My Couch Mode remote</span></div></div>
      <h1>Connect to your TV</h1>
      <p class="muted">Scan the QR code on the TV, or type the 6-character code from the TV's pairing screen (Control center → Pair a phone).</p>
      <form onSubmit={(e) => { e.preventDefault(); if (ready) onCode(cleanCode(v)); }}>
        <label for="code">TV code</label>
        <input id="code" class="code-input" value={v} maxLength={7} autocomplete="off" autocapitalize="characters" spellcheck={false}
          placeholder="ABC·123" onInput={(e) => setV(cleanCode((e.target as HTMLInputElement).value))} />
        <button class="btn primary" disabled={!ready}>Connect</button>
      </form>
    </main>
  );
}

/* ---------- 2. Connected ---------- */
function Connected({ code, local, onForget }: { code: string; local: boolean; onForget: () => void }) {
  const [tv, setTv] = useState<TvState | null>(null);
  const [note, setNote] = useState<{ msg: string; bad: boolean } | null>(null);
  const [tab, setTab] = useState<'remote' | 'profiles' | 'link'>('remote');
  const noteTimer = useRef<ReturnType<typeof setTimeout>>();

  const link: PhoneLink = useMemo(() => join(code, local, (m: Msg) => {
    if (m.t === 'state') setTv(m as unknown as TvState);
    if (m.t === 'error' || m.t === 'ok') {
      setNote({ msg: m.msg, bad: m.t === 'error' });
      clearTimeout(noteTimer.current);
      noteTimer.current = setTimeout(() => setNote(null), 3000);
    }
  }), [code, local]);
  useEffect(() => () => link.close(), [link]);

  const send = (m: Msg) => { buzz(); link.send(m); };
  const key = (k: string) => send({ t: 'key', k });
  const status = link.status.value;
  const active = tv?.profiles.find((p) => p.id === tv.active) || null;

  if (status !== 'connected' || !tv) {
    return (
      <main class="entry">
        <div class="spinner" aria-hidden="true" />
        <h1>{status === 'not-found' ? 'TV not found' : status === 'offline' ? 'No connection' : status === 'lost' ? 'Reconnecting…' : 'Connecting…'}</h1>
        <p class="muted">
          {status === 'not-found'
            ? `No TV is showing code ${pretty(code)} right now. Make sure MCM is open on the TV. Still trying…`
            : status === 'offline' ? 'Check the internet on this phone. Still trying…' : `Looking for TV ${pretty(code)}.`}
        </p>
        <button class="btn" onClick={onForget}>Use a different code</button>
      </main>
    );
  }

  return (
    <>
      <header class="bar-top">
        {active
          ? <span class="avatar sm" style={{ background: AVATAR_COLORS[active.color] }}>{active.name[0]}</span>
          : <span class="avatar sm ghost"><Icon name="profile" /></span>}
        <div class="who">
          <b>{active ? active.name : 'No profile yet'}</b>
          <span><span class="dot" />TV {pretty(code)}{local ? ' · same browser' : ''}</span>
        </div>
        <button class="icon-b" onClick={onForget} aria-label="Disconnect"><Icon name="close" /></button>
      </header>

      {note && <div class={`note${note.bad ? ' bad' : ''}`} role="status">{note.msg}</div>}

      {tv.layer === 'pin' && tv.pinFor ? (
        <PinScreen name={tv.profiles.find((p) => p.id === tv.pinFor)?.name || ''} onPin={(p) => send({ t: 'text', v: p })} onCancel={() => key('back')} />
      ) : !active ? (
        <ProfilePicker profiles={tv.profiles} onPick={(id, pin) => send({ t: 'profile', id, pin })} onAdd={() => setTab('profiles')} showAdd={tab !== 'profiles'}>
          {tab === 'profiles' && <AddProfile onAdd={(p) => send({ t: 'addProfile', ...p })} />}
        </ProfilePicker>
      ) : (
        <>
          <nav class="tabs" role="tablist">
            {(['remote', 'profiles', 'link'] as const).map((t) => (
              <button role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'remote' ? 'Remote' : t === 'profiles' ? 'Profiles' : 'Send link'}</button>
            ))}
          </nav>
          {tab === 'remote' && <RemotePad tv={tv} send={send} keyFn={key} kids={!!active.kids} />}
          {tab === 'profiles' && <Profiles tv={tv} send={send} />}
          {tab === 'link' && <SendLink send={send} />}
        </>
      )}
    </>
  );
}

/* ---------- Remote controls ---------- */
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEPS: [string, number | 'end'][] = [['Off', 0], ['Video end', 'end'], ['15 m', 15], ['30 m', 30], ['60 m', 60]];
const fmt = (s: number) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };

function RemotePad({ tv, send, keyFn, kids }: { tv: TvState; send: (m: Msg) => void; keyFn: (k: string) => void; kids: boolean }) {
  const [touch, setTouch] = useState<boolean>(load('mcm.remote.touch', false));
  useEffect(() => save('mcm.remote.touch', touch), [touch]);
  const [text, setText] = useState('');
  useEffect(() => { if (tv.layer === 'search') setText(tv.query); }, [tv.layer === 'search']);
  const np = tv.now;
  const opts = tv.opts || { rate: 1, loop: false, captions: false };
  const sleepNow = tv.sleep?.atEnd ? 'end' : tv.sleep?.mins || 0;
  const [drag, setDrag] = useState<number | null>(null);

  if (tv.away) return <AwayPad send={send} keyFn={keyFn} />;

  return (
    <main class="pad-screen">
      {np && (
        <section class="now">
          <div class="now-head">
            <img src={`https://i.ytimg.com/vi/${np.id}/mqdefault.jpg`} alt="" />
            <div class="now-info">
              <b>{np.title}</b>
              <span class="muted">{fmt(drag ?? np.pos)} / {fmt(np.dur)}</span>
            </div>
          </div>
          <input class="seek" type="range" min={0} max={Math.max(1, Math.floor(np.dur))} step={1} value={Math.floor(drag ?? np.pos)} aria-label="Seek"
            onInput={(e) => setDrag(Number((e.target as HTMLInputElement).value))}
            onChange={(e) => { send({ t: 'seekTo', pos: Number((e.target as HTMLInputElement).value) }); setTimeout(() => setDrag(null), 1200); }} />
          <div class="now-btns">
            <button onClick={() => send({ t: 'seek', d: -10 })} aria-label="Back 10 seconds"><Icon name="rew" /></button>
            <button class="pp" onClick={() => keyFn('playpause')} aria-label={np.playing ? 'Pause' : 'Play'}><Icon name={np.playing ? 'pause' : 'play'} /></button>
            <button onClick={() => send({ t: 'seek', d: 10 })} aria-label="Forward 10 seconds"><Icon name="ff" /></button>
            <span class="spacer" />
            <button class={opts.captions ? 'on' : ''} onClick={() => send({ t: 'captions', on: !opts.captions })} aria-label="Captions" aria-pressed={opts.captions}><Icon name="cc" /></button>
            <button class={opts.loop ? 'on' : ''} onClick={() => send({ t: 'loop', on: !opts.loop })} aria-label="Loop video" aria-pressed={opts.loop}><Icon name="loop" /></button>
          </div>
          <div class="chips" role="group" aria-label="Playback speed">
            <span class="chips-label"><Icon name="speed" /></span>
            {SPEEDS.map((r) => <button class={opts.rate === r ? 'on' : ''} onClick={() => send({ t: 'rate', r })}>{r}×</button>)}
          </div>
          <div class="chips" role="group" aria-label="Sleep timer">
            <span class="chips-label"><Icon name="timer" /></span>
            {SLEEPS.map(([label, v]) => <button class={sleepNow === v ? 'on' : ''} onClick={() => send({ t: 'sleep', v })}>{label}</button>)}
          </div>
        </section>
      )}

      <div class="seg" role="group" aria-label="Remote style">
        <button aria-pressed={!touch} onClick={() => setTouch(false)}>D-pad</button>
        <button aria-pressed={touch} onClick={() => setTouch(true)}>Touchpad</button>
      </div>

      {touch ? <Touchpad onKey={keyFn} /> : (
        <div class="dpad">
          {(['up', 'down', 'left', 'right'] as const).map((d) => (
            <button class={`d ${d}`} onClick={() => keyFn(d)} aria-label={d}><Icon name={d} /></button>
          ))}
          <button class="okb" onClick={() => keyFn('ok')}>OK</button>
        </div>
      )}

      <div class="btn-grid">
        <button onClick={() => keyFn('back')}><Icon name="back" />Back</button>
        <button onClick={() => keyFn('home')}><Icon name="home" />Home</button>
        <button onClick={() => keyFn('menu')}><Icon name="menu" />Menu</button>
        <button onClick={() => keyFn('voldown')}><Icon name="voldown" />Vol −</button>
        <button onClick={() => keyFn('mute')}><Icon name="mute" />Mute</button>
        <button onClick={() => keyFn('volup')}><Icon name="volup" />Vol +</button>
      </div>

      <label class="type">
        <Icon name="search" />
        <input value={text} placeholder="Type to search on the TV" autocomplete="off" enterKeyHint="search"
          onInput={(e) => { const v = (e.target as HTMLInputElement).value; setText(v); send({ t: 'text', v }); }} />
      </label>

      <h2 class="label">Open on TV</h2>
      <div class="quick">
        {(tv.apps || []).filter((a) => !kids || a.kids).map((a) => (
          <button onClick={() => send({ t: 'launch', app: a.id })}>
            <span class="qi" style={{ '--c': a.color } as any}><AppIcon app={a} /></span>
            {a.name}
          </button>
        ))}
      </div>
      {!tv.ext && <p class="muted small">Tip: install the MCM Companion extension in the TV's browser to control sites that open in a new tab, with ads blocked.</p>}
    </main>
  );
}

/* ---------- Trackpad for a site MCM opened in its own tab (needs the Companion extension) ---------- */
function AwayPad({ send, keyFn }: { send: (m: Msg) => void; keyFn: (k: string) => void }) {
  const [text, setText] = useState('');
  const last = useRef<{ x: number; y: number; t: number; moved: number } | null>(null);
  const acc = useRef({ dx: 0, dy: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    timer.current = null;
    const { dx, dy } = acc.current;
    if (dx || dy) send({ t: 'pointer', dx: Math.round(dx), dy: Math.round(dy) });
    acc.current = { dx: 0, dy: 0 };
  };
  const scrollStart = useRef<number | null>(null);

  return (
    <main class="pad-screen">
      <p class="away-note">A site is open on the TV. Drag to move the pointer, tap to click.</p>
      <div class="trackpad-wrap">
        <div class="trackpad"
          onPointerDown={(e) => { last.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => {
            const l = last.current; if (!l) return;
            const dx = e.clientX - l.x, dy = e.clientY - l.y;
            l.x = e.clientX; l.y = e.clientY; l.moved += Math.abs(dx) + Math.abs(dy);
            const speed = Math.min(4, 1.6 + Math.hypot(dx, dy) / 12); // faster swipes travel further
            acc.current.dx += dx * speed; acc.current.dy += dy * speed;
            if (!timer.current) timer.current = setTimeout(flush, 33);
          }}
          onPointerUp={() => {
            const l = last.current; last.current = null;
            if (l && l.moved < 10 && Date.now() - l.t < 300) send({ t: 'click' });
          }}>
          <span>Trackpad</span>
        </div>
        <div class="scrollstrip" aria-label="Scroll"
          onPointerDown={(e) => { scrollStart.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { if (scrollStart.current === null) return; const dy = e.clientY - scrollStart.current; scrollStart.current = e.clientY; if (dy) send({ t: 'scroll', dy: Math.round(dy * 3) }); }}
          onPointerUp={() => (scrollStart.current = null)}>
          <Icon name="up" /><span>Scroll</span><Icon name="down" />
        </div>
      </div>

      <div class="btn-grid">
        <button onClick={() => keyFn('back')}><Icon name="back" />Back</button>
        <button onClick={() => keyFn('playpause')}><Icon name="play" />Play/Pause</button>
        <button onClick={() => keyFn('menu')}><Icon name="full" />Full screen</button>
        <button onClick={() => send({ t: 'seek', d: -10 })}><Icon name="rew" />−10 s</button>
        <button onClick={() => keyFn('mute')}><Icon name="mute" />Mute</button>
        <button onClick={() => send({ t: 'seek', d: 10 })}><Icon name="ff" />+10 s</button>
      </div>

      <form class="type" onSubmit={(e) => { e.preventDefault(); send({ t: 'enter' }); }}>
        <Icon name="keyboard" />
        <input value={text} placeholder="Type into the selected box" autocomplete="off" enterKeyHint="go"
          onInput={(e) => { const v = (e.target as HTMLInputElement).value; setText(v); send({ t: 'text', v }); }} />
      </form>

      <div class="row">
        <button class="btn primary grow" onClick={() => keyFn('home')}><Icon name="home" /> Back to MCM</button>
        <button class="btn" onClick={() => send({ t: 'closeApp' })}>Close site</button>
      </div>
    </main>
  );
}

function Touchpad({ onKey }: { onKey: (k: string) => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [flash, setFlash] = useState(false);
  return (
    <div class={`touch${flash ? ' flash' : ''}`}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerUp={(e) => {
        const s = start.current; start.current = null;
        if (!s) return;
        setFlash(true); setTimeout(() => setFlash(false), 120);
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.hypot(dx, dy) < 14) return onKey('ok');
        onKey(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      }}>
      Swipe to move · tap to select
    </div>
  );
}

/* ---------- Profiles ---------- */
function ProfilePicker({ profiles, onPick, onAdd, showAdd, children }: { profiles: TvProfile[]; onPick: (id: string, pin?: string) => void; onAdd: () => void; showAdd: boolean; children?: any }) {
  const [pinFor, setPinFor] = useState<TvProfile | null>(null);
  if (pinFor) return <PinScreen name={pinFor.name} onPin={(pin) => { onPick(pinFor.id, pin); setPinFor(null); }} onCancel={() => setPinFor(null)} />;
  return (
    <main class="pick">
      <h1>Who's watching?</h1>
      <p class="muted">Pick a profile here and the TV signs in.</p>
      <div class="pick-grid">
        {profiles.map((p) => (
          <button onClick={() => (p.hasPin ? setPinFor(p) : onPick(p.id))}>
            <span class="avatar" style={{ background: AVATAR_COLORS[p.color] }}>{p.name[0]}</span>
            {p.name}{p.kids ? <small>Kids</small> : p.hasPin ? <small>PIN</small> : null}
          </button>
        ))}
      </div>
      {showAdd && <button class="btn" onClick={onAdd}><Icon name="plus" /> Add a profile</button>}
      {children}
    </main>
  );
}

function Profiles({ tv, send }: { tv: TvState; send: (m: Msg) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<{ p: TvProfile; action: 'switch' | 'remove' } | null>(null);
  if (pinFor) {
    return <PinScreen name={pinFor.p.name} onCancel={() => setPinFor(null)} onPin={(pin) => {
      send(pinFor.action === 'switch' ? { t: 'profile', id: pinFor.p.id, pin } : { t: 'removeProfile', id: pinFor.p.id, pin });
      setPinFor(null); setConfirm(null);
    }} />;
  }
  return (
    <main class="profiles-screen">
      <ul class="plist">
        {tv.profiles.map((p) => (
          <li>
            <span class="avatar" style={{ background: AVATAR_COLORS[p.color] }}>{p.name[0]}</span>
            <div class="pmeta"><b>{p.name}</b><span>{[p.id === tv.active && 'Watching now', p.kids && 'Kids', p.hasPin && 'PIN'].filter(Boolean).join(' · ') || 'Profile'}</span></div>
            {p.id !== tv.active && <button class="btn sm" onClick={() => (p.hasPin ? setPinFor({ p, action: 'switch' }) : send({ t: 'profile', id: p.id }))}>Switch</button>}
            {confirm === p.id
              ? <button class="btn sm danger" onClick={() => (p.hasPin ? setPinFor({ p, action: 'remove' }) : (send({ t: 'removeProfile', id: p.id }), setConfirm(null)))}>Confirm</button>
              : <button class="btn sm ghost" onClick={() => setConfirm(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>}
          </li>
        ))}
      </ul>
      <AddProfile onAdd={(p) => send({ t: 'addProfile', ...p })} />
    </main>
  );
}

function AddProfile({ onAdd }: { onAdd: (p: { name: string; color: number; kids: boolean; pin?: string }) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(3);
  const [kids, setKids] = useState(false);
  const [pin, setPin] = useState('');
  const pinOk = pin === '' || /^\d{4}$/.test(pin);
  return (
    <form class="add" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim() || !pinOk) return;
      onAdd({ name: name.trim(), color, kids, pin: pin || undefined });
      setName(''); setPin(''); setKids(false);
    }}>
      <h2>Add a profile</h2>
      <label for="pname">Name</label>
      <input id="pname" value={name} maxLength={16} placeholder="e.g. Mom" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      <span class="lab">Colour</span>
      <div class="swatches">
        {AVATAR_COLORS.map((c, i) => (
          <button type="button" class={i === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(i)} aria-label={`Colour ${i + 1}`} />
        ))}
      </div>
      <label class="check"><input type="checkbox" checked={kids} onChange={(e) => setKids((e.target as HTMLInputElement).checked)} /> Kids profile (YouTube only, strict safe search)</label>
      <label for="ppin">PIN (optional, 4 digits)</label>
      <input id="ppin" value={pin} inputMode="numeric" maxLength={4} placeholder="Leave empty for no PIN" onInput={(e) => setPin((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
      {!pinOk && <span class="err">A PIN has exactly 4 digits.</span>}
      <button class="btn primary" disabled={!name.trim() || !pinOk}>Add profile</button>
    </form>
  );
}

function PinScreen({ name, onPin, onCancel }: { name: string; onPin: (pin: string) => void; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <main class="pin-screen">
      <h1>{name}'s PIN</h1>
      <p class="muted">Enter the 4-digit PIN.</p>
      <input ref={ref} class="code-input" inputMode="numeric" type="password" maxLength={4} value={pin} autocomplete="off"
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
          setPin(v);
          if (v.length === 4) { onPin(v); setPin(''); }
        }} />
      <button class="btn" onClick={onCancel}>Cancel</button>
    </main>
  );
}

/* ---------- Send a YouTube link ---------- */
function SendLink({ send }: { send: (m: Msg) => void }) {
  const [url, setUrl] = useState('');
  const canPaste = !!navigator.clipboard?.readText;
  return (
    <main class="link-screen">
      <h1>Play a YouTube link</h1>
      <p class="muted">Copy a video link in the YouTube app, then paste it here. It starts playing on the TV.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) { send({ t: 'play', url: url.trim() }); setUrl(''); } }}>
        <label for="yturl">YouTube link</label>
        <input id="yturl" value={url} inputMode="url" placeholder="https://youtu.be/…" onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
        <div class="row">
          {canPaste && <button type="button" class="btn" onClick={async () => { try { setUrl(await navigator.clipboard.readText()); } catch { /* permission denied */ } }}>Paste</button>}
          <button class="btn primary" disabled={!url.trim()}><Icon name="play" /> Play on TV</button>
        </div>
      </form>
    </main>
  );
}
