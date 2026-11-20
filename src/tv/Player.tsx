import { useEffect, useRef, useState } from 'preact/hooks';
import { F, focused, popLayer, pushLayer, setFocus, useLayerKeys } from '../lib/nav';
import { Icon } from '../lib/logos';
import { lastSource, stickX, rumble } from '../lib/input';
import { activeId, getHistory, saveProgress, volume } from '../lib/store';
import { loadYouTubeApi, recommended, thumbOf, type SearchItem } from '../lib/youtube';
import { canInstall } from '../lib/install';
import {
  back, goRest, kidsMode, nowPlaying, player, playerMenu, playerOpts, playReq, playVideo, setSleep, showToast, sleepAtEnd, sleepMins, toggleAutoplay, toggleFill,
} from './state';

const DEFAULT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const fmt = (s: number) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
};
const rateLabel = (r: number) => `${r}×`;

/**
 * YouTube's official IFrame Player, driven by our own controls so the controller and phone work.
 * - Controls hidden: ← / → seek 10 s, OK plays/pauses, ↑ / ↓ shows the controls.
 * - Right stick left/right scrubs through the video (further = faster); let go to jump there.
 */
export function Player() {
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<any>(null);
  const [state, setState] = useState({ pos: 0, dur: 0, playing: false, title: '', error: '' });
  const [chrome, setChrome] = useState(true);
  const [pokeN, setPoke] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const chromeRef = useRef(true);
  chromeRef.current = chrome;
  const req = playReq.value;
  const opts = playerOpts.value;
  const poke = () => setPoke((n) => n + 1);

  // Show controls on any input; hide after 3.5 s while playing (never while scrubbing or paused).
  useEffect(() => {
    setChrome(true);
    if (!state.playing || scrub !== null) return;
    const id = setTimeout(() => setChrome(false), 3500);
    return () => clearTimeout(id);
  }, [focused.value, lastSource.value, pokeN, state.playing, scrub !== null]);

  // Create the player once, then load new videos into it.
  useEffect(() => {
    if (!req) return;
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      const start = Math.max(0, Math.floor((req.start || 0) - 3));
      if (yt.current) {
        yt.current.loadVideoById({ videoId: req.id, startSeconds: start });
        return;
      }
      yt.current = new YT.Player(host.current, {
        videoId: req.id,
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0, disablekb: 1, start, cc_load_policy: playerOpts.peek().captions ? 1 : 0 },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(volume.value);
            const r = playerOpts.peek().rate;
            if (r !== 1) e.target.setPlaybackRate(r);
            e.target.playVideo();
          },
          onStateChange: (e: any) => {
            setState((s) => ({ ...s, playing: e.data === 1 }));
            if (e.data === 1) {
              // YouTube ignores speed changes made before a video starts, and resets it for new videos.
              const want = playerOpts.peek().rate;
              if (e.target.getPlaybackRate?.() !== want) e.target.setPlaybackRate(want);
            }
            if (e.data === 0) onEnded();
          },
          onPlaybackRateChange: (e: any) => (playerOpts.value = { ...playerOpts.peek(), rate: e.data }),
          onError: () => setState((s) => ({ ...s, error: 'This video can’t be played outside YouTube. Pick another one.' })),
        },
      });
    }).catch((e) => setState((s) => ({ ...s, error: String(e.message || e) })));
    return () => { cancelled = true; };
  }, [req?.id, req?.start]);

  function onEnded() {
    const p = yt.current;
    if (playerOpts.peek().loop && p) { p.seekTo(0, true); p.playVideo(); return; }
    if (sleepAtEnd.peek()) { showToast('Sleep timer: the video ended, so MCM is going to rest.'); setTimeout(goRest, 1500); return; }
    setChrome(true);
    if (playerOpts.peek().autoplay && upNextRef.current[0]) { setCountdown(6); setTimeout(() => setFocus('un:play', true), 30); }
  }

  // Up next: the list this video came from (search results / recommendations), topped up with
  // more from the channels you watch and trending.
  const [upNext, setUpNext] = useState<SearchItem[]>([]);
  const upNextRef = useRef<SearchItem[]>([]);
  upNextRef.current = upNext;
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (!req) return;
    setCountdown(null);
    const fromQueue = (req.queue || []).filter((q) => q.id !== req.id);
    setUpNext(fromQueue);
    if (fromQueue.length >= 3) return;
    const watched = [req.id, ...(activeId.value ? getHistory(activeId.value).map((h) => h.id) : [])];
    recommended(watched, kidsMode(), 12).then((recs) => {
      if (playReq.peek()?.id !== req.id) return;
      const have = new Set(fromQueue.map((q) => q.id));
      setUpNext([...fromQueue, ...recs.filter((r) => !have.has(r.id))]);
    });
  }, [req?.id]);
  const playNext = () => {
    const [n, ...rest] = upNextRef.current;
    if (!n) return showToast('Nothing up next yet.');
    setCountdown(null);
    playVideo({ id: n.id, title: n.title, channel: n.channel, queue: rest });
    setTimeout(() => setFocus('pl:play', true), 30);
  };
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { playNext(); return; }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Poll position, save progress every 5 s, publish "now playing" for the phone.
  useEffect(() => {
    if (!req) return;
    let tick = 0;
    const id = setInterval(() => {
      const p = yt.current;
      if (!p?.getCurrentTime) return;
      const pos = p.getCurrentTime() || 0;
      const dur = p.getDuration() || 0;
      const title = p.getVideoData?.()?.title || req.title || 'YouTube video';
      const channel = p.getVideoData?.()?.author || req.channel;
      const playing = p.getPlayerState?.() === 1;
      setState((s) => ({ ...s, pos, dur, title, playing }));
      nowPlaying.value = { id: req.id, title, channel, pos, dur, playing, muted: mutedByBrowser.current };
      if (++tick % 5 === 0 && dur > 0 && activeId.value) saveProgress(activeId.value, { id: req.id, title, channel, thumb: thumbOf(req.id), pos, dur, at: Date.now() });
    }, 1000);
    return () => clearInterval(id);
  }, [req?.id]);

  // Right-stick scrubbing: tilt to move a preview marker, release to jump there.
  const scrubRef = useRef<number | null>(null);
  useEffect(() => {
    const x = stickX.value;
    const p = yt.current;
    if (!p?.getDuration) return;
    if (x !== 0) {
      if (scrubRef.current === null) scrubRef.current = p.getCurrentTime() || 0;
      let last = performance.now();
      let raf = 0;
      const step = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        const dur = p.getDuration() || 0;
        const maxSpeed = Math.max(20, Math.min(240, dur / 15)); // seconds of video per second of tilt
        const v = stickX.peek();
        scrubRef.current = Math.max(0, Math.min(dur, (scrubRef.current ?? 0) + Math.sign(v) * v * v * maxSpeed * dt));
        setScrub(scrubRef.current);
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }
    if (scrubRef.current !== null) {
      p.seekTo(scrubRef.current, true);
      rumble(0.4);
      scrubRef.current = null;
      setTimeout(() => setScrub(null), 250);
    }
  }, [stickX.value]);

  // Controls for the remote, keyboard shortcuts and the options menu; save on close.
  useEffect(() => {
    player.api = {
      toggle: () => { const p = yt.current; if (!p) return; p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo(); poke(); },
      seek: (d) => { const p = yt.current; if (!p) return; p.seekTo(Math.max(0, p.getCurrentTime() + d), true); poke(); },
      seekTo: (sec) => { const p = yt.current; if (!p) return; p.seekTo(Math.max(0, sec), true); poke(); },
      next: () => playNext(),
      setVolume: (v) => { const p = yt.current; if (!p) return; v ? (p.unMute(), p.setVolume(v)) : p.mute(); },
      setRate: (r) => {
        const p = yt.current;
        p?.setPlaybackRate(r);
        playerOpts.value = { ...playerOpts.peek(), rate: r };
        poke();
        // Some videos (live streams, some music) don't allow every speed: say so instead of showing a wrong label.
        setTimeout(() => {
          const actual = p?.getPlaybackRate?.();
          if (p?.getPlayerState?.() === 1 && actual && actual !== r) {
            playerOpts.value = { ...playerOpts.peek(), rate: actual };
            showToast(`This video doesn't allow ${r}× speed.`);
          }
        }, 800);
      },
      rates: () => yt.current?.getAvailablePlaybackRates?.() || DEFAULT_RATES,
      rate: () => yt.current?.getPlaybackRate?.() || playerOpts.peek().rate,
      setLoop: (on) => { playerOpts.value = { ...playerOpts.peek(), loop: on }; poke(); },
      setCaptions: (on) => {
        const p = yt.current;
        playerOpts.value = { ...playerOpts.peek(), captions: on };
        try {
          if (on) { p?.loadModule('captions'); p?.setOption?.('captions', 'reload', true); }
          else p?.unloadModule('captions');
        } catch { /* captions not available for this video */ }
        poke();
      },
    };
    let lock: any = null;
    (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => {});
    return () => {
      const p = yt.current;
      if (p?.getCurrentTime && req && activeId.value) {
        const dur = p.getDuration() || 0;
        if (dur > 0) saveProgress(activeId.value, { id: req.id, title: p.getVideoData?.()?.title || req.title || 'YouTube video', channel: p.getVideoData?.()?.author || req.channel, thumb: thumbOf(req.id), pos: p.getCurrentTime(), dur, at: Date.now() });
      }
      try { p?.destroy(); } catch { /* already gone */ }
      yt.current = null;
      player.api = null;
      nowPlaying.value = null;
      lock?.release?.();
    };
  }, []);

  // Hidden controls behave like a TV app: ←/→ seek, OK plays/pauses, ↑/↓ brings the controls back.
  useLayerKeys('player', (a) => {
    const api = player.api;
    if (!chromeRef.current) {
      if (a === 'left' || a === 'right') { api?.seek(a === 'left' ? -10 : 10); showSeek(a === 'left' ? -10 : 10); return true; }
      if (a === 'ok') { api?.toggle(); return true; }
      if (a === 'up' || a === 'down') { poke(); return true; }
    }
    if (focused.value === 'pl:bar' && (a === 'left' || a === 'right')) { api?.seek(a === 'left' ? -10 : 10); showSeek(a === 'left' ? -10 : 10); return true; }
    return false;
  });

  const [seekHint, setSeekHint] = useState<{ d: number; n: number } | null>(null);
  const showSeek = (d: number) => { poke(); setSeekHint((h) => ({ d: h && Math.sign(h.d) === Math.sign(d) && Date.now() - h.n < 1200 ? h.d + d : d, n: Date.now() })); };
  useEffect(() => { if (!seekHint) return; const id = setTimeout(() => setSeekHint(null), 1200); return () => clearTimeout(id); }, [seekHint?.n]);

  // Browsers only allow sound after someone presses a key or clicks on this page (choosing from the
  // phone doesn't count). If playback didn't start, play muted right away and turn the sound on at the
  // first key press or click on the TV. Installed as an app, MCM is allowed to play with sound directly.
  const mutedByBrowser = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      const p = yt.current;
      if (!p?.getPlayerState) return;
      const st = p.getPlayerState();
      if (st === 1 || st === 3) return; // playing or buffering
      mutedByBrowser.current = true;
      p.mute();
      p.playVideo();
      showToast(canInstall.value
        ? 'Playing without sound: the browser needs one key press or click on the TV. Install MCM as an app (Control center) to always get sound.'
        : 'Playing without sound: press any key or click once on the TV to turn the sound on.', undefined, 6000);
    }, 1500);
    return () => clearTimeout(id);
  }, [req?.id]);
  useEffect(() => {
    const unmute = (e: Event) => {
      if (!e.isTrusted || !mutedByBrowser.current) return;
      mutedByBrowser.current = false;
      const p = yt.current;
      if (p && volume.peek() > 0) { p.unMute(); p.setVolume(volume.peek()); showToast('Sound on.'); }
    };
    window.addEventListener('keydown', unmute, true);
    window.addEventListener('pointerdown', unmute, true);
    return () => { window.removeEventListener('keydown', unmute, true); window.removeEventListener('pointerdown', unmute, true); };
  }, []);

  const shown = scrub ?? state.pos;
  const pct = state.dur ? (shown / state.dur) * 100 : 0;
  const api = () => player.api;
  const openMenu = (m: 'speed' | 'sleep') => { playerMenu.value = m; pushLayer('pmenu'); };
  const sleepLabel = sleepAtEnd.value ? 'End of video' : sleepMins.value ? `${sleepMins.value} min` : 'Off';
  const up = { up: 'pl:bar' };

  return (
    <section class={`layer player${chrome ? '' : ' hide-chrome'}`} data-layer="player">
      <div class={`yt${opts.fill ? ' fill' : ''}`}><div ref={host} /></div>
      <div class="pl-shade" />
      <div class="pl-top">
        <div class="s">YouTube</div>
        <h2>{state.title || req?.title || 'Loading…'}</h2>
        <div class="pl-chips">
          {opts.rate !== 1 && <span class="chip"><Icon name="speed" />{rateLabel(opts.rate)}</span>}
          {opts.loop && <span class="chip">Loop</span>}
          {opts.captions && <span class="chip"><Icon name="cc" />Captions</span>}
          {(sleepAtEnd.value || sleepMins.value > 0) && <span class="chip"><Icon name="timer" />Sleep: {sleepLabel}</span>}
        </div>
      </div>
      {seekHint && <div class={`seek-hint ${seekHint.d < 0 ? 'l' : 'r'}`}>{seekHint.d > 0 ? '+' : '−'}{Math.abs(seekHint.d)}s</div>}
      {state.error && <div class="pl-error">{state.error}</div>}
      {countdown !== null && upNext[0] && (
        <div class="upnext" role="dialog" aria-label="Up next">
          <img src={upNext[0].thumb} alt="" />
          <div class="un-info">
            <span class="un-k">Up next in {countdown} s</span>
            <b>{upNext[0].title}</b>
            <span class="un-c">{upNext[0].channel}</span>
            <div class="un-actions">
              <F id="un:play" class="pill primary" isDefault onSelect={playNext}><Icon name="play" /> Play now</F>
              <F id="un:cancel" class="pill" onSelect={() => { setCountdown(null); setFocus('pl:play', true); }}>Cancel</F>
            </div>
          </div>
        </div>
      )}
      <div class="pl-bot">
        <F id="pl:bar" class={`bar scrub${scrub !== null ? ' active' : ''}`} nav={{ down: 'pl:play' }} aria-label="Timeline">
          <i style={{ width: pct + '%' }} />
          {scrub !== null && <span class="bubble" style={{ left: pct + '%' }}>{fmt(scrub)}</span>}
        </F>
        <div class="ctrls">
          <F id="pl:back" class="ctrl" nav={up} onSelect={() => { api()?.seek(-10); showSeek(-10); }} aria-label="Back 10 seconds">−10s</F>
          <F id="pl:play" class="ctrl" nav={up} isDefault onSelect={() => api()?.toggle()} aria-label={state.playing ? 'Pause' : 'Play'}>
            <Icon name={state.playing ? 'pause' : 'play'} />
          </F>
          <F id="pl:fwd" class="ctrl" nav={up} onSelect={() => { api()?.seek(10); showSeek(10); }} aria-label="Forward 10 seconds">+10s</F>
          <span class="ctrl-sep" />
          <F id="pl:speed" class="ctrl" nav={up} onSelect={() => openMenu('speed')} aria-label="Playback speed"><Icon name="speed" /><span>{rateLabel(opts.rate)}</span></F>
          <F id="pl:cc" class={`ctrl${opts.captions ? ' on' : ''}`} nav={up} onSelect={() => api()?.setCaptions(!opts.captions)} aria-label="Captions"><Icon name="cc" /></F>
          <F id="pl:loop" class={`ctrl${opts.loop ? ' on' : ''}`} nav={up} onSelect={() => api()?.setLoop(!opts.loop)} aria-label="Loop video"><Icon name="loop" /></F>
          <F id="pl:fit" class="ctrl" nav={up} onSelect={toggleFill} aria-label={opts.fill ? 'Fit whole picture' : 'Fill the screen'}><Icon name="full" /><span>{opts.fill ? 'Fill' : 'Fit'}</span></F>
          <F id="pl:sleep" class={`ctrl${sleepAtEnd.value || sleepMins.value ? ' on' : ''}`} nav={up} onSelect={() => openMenu('sleep')} aria-label="Sleep timer"><Icon name="timer" /></F>
          <F id="pl:next" class="ctrl" nav={up} onSelect={playNext} aria-label={upNext[0] ? `Next: ${upNext[0].title}` : 'Next video'}><Icon name="next" /></F>
          <F id="pl:auto" class={`ctrl${opts.autoplay ? ' on' : ''}`} nav={up} onSelect={toggleAutoplay} aria-label="Autoplay"><span>Auto {opts.autoplay ? 'on' : 'off'}</span></F>
          <F id="pl:close" class="ctrl" nav={up} onSelect={back} aria-label="Close player"><Icon name="close" /></F>
          <span class="time">{fmt(shown)} / {fmt(state.dur)}</span>
        </div>
        <p class="pl-tip">Tilt the right stick to scrub · ← → skip 10 s when controls are hidden</p>
      </div>
    </section>
  );
}

/** Side panel for playback speed and the sleep timer. */
export function PlayerMenu() {
  const kind = playerMenu.value;
  const api = player.api;
  const items: { id: string; label: string; on: boolean; pick: () => void }[] =
    kind === 'speed'
      ? (api?.rates() || DEFAULT_RATES).map((r) => ({
          id: 'pm:r' + r, label: r === 1 ? 'Normal' : rateLabel(r), on: playerOpts.value.rate === r,
          pick: () => api?.setRate(r),
        }))
      : ([['off', 'Off', 0], ['end', 'End of this video', 'end'], ['15', '15 minutes', 15], ['30', '30 minutes', 30], ['45', '45 minutes', 45], ['60', '1 hour', 60], ['90', '1.5 hours', 90]] as const).map(([k, label, v]) => ({
          id: 'pm:s' + k, label,
          on: v === 'end' ? sleepAtEnd.value : !sleepAtEnd.value && sleepMins.value === v,
          pick: () => { setSleep(v); showToast(v === 0 ? 'Sleep timer off.' : v === 'end' ? 'MCM will rest when this video ends.' : `MCM will rest in ${label}.`); },
        }));
  const current = items.find((i) => i.on)?.id;
  useEffect(() => { if (current) setTimeout(() => setFocus(current, true), 10); }, []);

  return (
    <section class="layer pmenu" data-layer="pmenu">
      <div class="pm-panel">
        <h3>{kind === 'speed' ? 'Playback speed' : 'Sleep timer'}</h3>
        {items.map((it) => (
          <F key={it.id} id={it.id} class={`pm-item${it.on ? ' on' : ''}`} isDefault={it.on} onSelect={() => { it.pick(); popLayer(); }}>
            <span>{it.label}</span>
            {it.on && <Icon name="check" />}
          </F>
        ))}
      </div>
    </section>
  );
}
