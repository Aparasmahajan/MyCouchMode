import { Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import { renderSVG } from 'uqr';
import { F, popLayer, pushLayer, resetLayers } from '../lib/nav';
import { AppIcon, Icon } from '../lib/logos';
import { appById } from '../lib/apps';
import { pad, textMode } from '../lib/input';
import { AVATAR_COLORS, profiles, sfxOn, tvCode } from '../lib/store';
import { ext } from '../lib/ext';
import {
  back, chooseProfile, frameApp, goHome, goRest, has, openYouTube, nowPlaying, pinEntry, pinError, pinFor,
  setSleep, showToast, sleepAtEnd, sleepMins, typeChar,
} from './state';
import { Clock, glyphs } from './Chrome';
import { link } from './App';

const remoteUrl = () => `${location.origin}/remote#${tvCode.value}`;
const prettyCode = (c: string) => `${c.slice(0, 3)}·${c.slice(3)}`;

/* ---------- Who's watching ---------- */
export function Welcome() {
  const g = glyphs();
  return (
    <section class="layer welcome" data-layer="welcome">
      <div class="corner"><b>MCM</b><Clock /></div>
      <div>
        <p class="eyebrow">My Couch Mode</p>
        <h2 class="layer-title">Who's watching?</h2>
      </div>
      <div class="profiles">
        {profiles.value.map((p) => (
          <F key={p.id} id={'pf:' + p.id} class="pf" onSelect={() => chooseProfile(p.id)}>
            <span class="avatar" style={{ background: AVATAR_COLORS[p.color] }}>{p.name[0]}</span>
            <span>{p.name}{p.kids ? <small>Kids mode</small> : p.pinHash ? <small>PIN locked</small> : null}</span>
          </F>
        ))}
        <F id="pf:add" class="pf" onSelect={() => pushLayer('pair')}>
          <span class="avatar add"><Icon name="plus" /></span>
          <span>Add profile<small>from your phone</small></span>
        </F>
      </div>
      <p class="press">
        Press <span class="g">{g.ok}</span> to continue · or pick a profile on your phone at{' '}
        <b>{location.host}/remote</b> with code <b class="mono">{prettyCode(tvCode.value)}</b>
      </p>
    </section>
  );
}

/* ---------- PIN entry ---------- */
export function PinPad() {
  const p = profiles.value.find((x) => x.id === pinFor.value);
  useEffect(() => { textMode.value = true; return () => { textMode.value = false; }; }, []);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'cancel'];
  return (
    <section class="layer pin" data-layer="pin">
      {p && <span class="avatar big" style={{ background: AVATAR_COLORS[p.color] }}>{p.name[0]}</span>}
      <h2 class="layer-title">Enter {p?.name}'s PIN</h2>
      <div class={`dots${pinError.value ? ' err' : ''}`}>
        {[0, 1, 2, 3].map((i) => <i key={i} class={i < pinEntry.value.length ? 'on' : ''} />)}
      </div>
      <p class="layer-sub">{pinError.value ? 'Wrong PIN. Try again.' : 'Use the keypad, number keys, or your phone.'}</p>
      <div class="numpad">
        {keys.map((k) => (
          <F key={k} id={'pin:' + k} class={`key${k.length > 1 ? ' wide' : ''}`} isDefault={k === '1'}
            onSelect={() => (k === 'del' ? typeChar('\b') : k === 'cancel' ? back() : typeChar(k))}>
            {k === 'del' ? 'Delete' : k === 'cancel' ? 'Cancel' : k}
          </F>
        ))}
      </div>
    </section>
  );
}

/* ---------- Pair a phone ---------- */
export function Pair() {
  const svg = renderSVG(remoteUrl(), { border: 1, blackColor: '#0a0d1c', whiteColor: '#ffffff' });
  const phones = link?.phones.value || 0;
  const status = link?.status.value;
  return (
    <section class="layer pair" data-layer="pair">
      <div class="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <h2 class="layer-title">Use your phone as the remote</h2>
        <div class="code mono">{prettyCode(tvCode.value)}</div>
        <ol class="steps">
          <li>Scan the code with your phone camera, or open <b>{location.host}/remote</b> and type the code.</li>
          <li>Pick your profile on the phone, or add a new one.</li>
          <li>Your phone is now the remote, keyboard and touchpad.</li>
        </ol>
        <div class="row">
          <F id="pair:done" class="pill primary" isDefault onSelect={back}>Done</F>
          <span class={`paired${phones ? '' : ' off'}`}>
            <span class={`dot${phones ? '' : ' off'}`} />
            {phones ? `${phones} phone${phones > 1 ? 's' : ''} connected` : status === 'ready' ? 'Waiting for a phone…' : status === 'offline' ? 'Remote link offline. Check the internet.' : 'Starting remote link…'}
          </span>
        </div>
      </div>
    </section>
  );
}

/* ---------- Control center (PS button) ---------- */
export function ControlCenter() {
  const np = nowPlaying.value;
  const phones = link?.phones.value || 0;
  const items: [string, string, string, () => void][] = [
    ['home', 'Home', 'cc:home', goHome],
    ['search', 'Search YouTube', 'cc:search', () => { popLayer(); openYouTube('#/search'); }],
    ['profile', 'Switch profile', 'cc:profile', () => resetLayers(['home', 'welcome'])],
    ['phone', 'Pair a phone', 'cc:pair', () => { popLayer(); pushLayer('pair'); }],
    ['full', document.fullscreenElement ? 'Exit full screen' : 'Full screen', 'cc:full', toggleFullscreen],
    ['timer', `Sleep timer: ${sleepAtEnd.value ? 'End of video' : sleepMins.value ? sleepMins.value + ' min' : 'Off'}`, 'cc:sleep', cycleSleep],
    ['sfx', `UI sounds: ${sfxOn.value ? 'On' : 'Off'}`, 'cc:sfx', () => (sfxOn.value = !sfxOn.value)],
    ['power', 'Rest mode', 'cc:rest', goRest],
    ['info', 'About MCM', 'cc:about', () => showToast('MCM · My Couch Mode v0.2. Made by Paras Mahajan.')],
  ];
  return (
    <section class="layer cc" data-layer="cc">
      <div class="cc-cards">
        <F id="cc:now" class="cc-card" onSelect={() => (has('player') ? popLayer() : showToast('Nothing is playing right now.'))}>
          <span class="k">Now playing</span>
          <span class="v">{np ? np.title : 'Nothing playing'}</span>
          <div class="bar"><i style={{ width: np && np.dur ? `${(np.pos / np.dur) * 100}%` : '0%' }} /></div>
        </F>
        <F id="cc:phones" class="cc-card" onSelect={() => { popLayer(); pushLayer('pair'); }}>
          <span class="k">Phone remote</span>
          <span class="v">{phones ? `${phones} connected` : 'Not connected'}</span>
          <span class="sub">Code <b class="mono">{prettyCode(tvCode.value)}</b></span>
        </F>
        <F id="cc:pad" class="cc-card" onSelect={() => showToast(pad.value.connected ? `${pad.value.name} is connected.` : 'Connect a controller by USB or Bluetooth, then press any button.')}>
          <span class="k">Controller</span>
          <span class="v">{pad.value.connected ? (pad.value.kind === 'ps' ? 'DualSense' : 'Controller') + ' connected' : 'None detected'}</span>
          <span class="sub">{pad.value.connected ? 'Tap PS for this menu, hold it for Home' : 'Plug in or pair over Bluetooth'}</span>
        </F>
        <F id="cc:ext" class="cc-card" onSelect={() => showToast(ext.value ? 'MCM Companion is on: apps open in a tab you can control with the phone and controller, with ads blocked.' : 'Install the MCM Companion extension (in the extension folder of the project) to control any site and block ads.', undefined, 4500)}>
          <span class="k">Companion</span>
          <span class="v">{ext.value ? 'Installed' : 'Not installed'}</span>
          <span class="sub">{ext.value ? (ext.value.adblock ? 'Ad blocking on' : 'Ad blocking off') : 'Any-site control and ad blocking'}</span>
        </F>
      </div>
      <div class="cc-bar">
        {items.map(([icon, label, id, fn], i) => (
          <Fragment key={id}>
            {(i === 3 || i === 7) && <span class="cc-sep" />}
            <F id={id} class={`cci${id === 'cc:sfx' && sfxOn.value ? ' on' : ''}`} isDefault={id === 'cc:home'} onSelect={fn} aria-label={label}>
              <Icon name={icon} />
              <span class="tip">{label}</span>
            </F>
          </Fragment>
        ))}
        <span class="spacer" />
        <Clock />
      </div>
    </section>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => showToast('Full screen needs a key press or click on the TV itself.'));
}
function cycleSleep() {
  const steps: (number | 'end')[] = [0, 'end', 30, 60, 90];
  const cur = sleepAtEnd.value ? 'end' : sleepMins.value;
  setSleep(steps[(steps.indexOf(cur) + 1) % steps.length] ?? 0);
}

/* ---------- Embedded app (sites that allow framing) ---------- */
export function Frame() {
  const app = appById(frameApp.value || '');
  if (!app?.url) return null;
  return (
    <section class="layer frame" data-layer="frame">
      <iframe src={app.url} title={app.name} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" />
      <div class="frame-bar">
        <span class="ti" style={{ '--c': app.color } as any}><AppIcon app={app} /></span>
        <span>{app.name} · use a mouse here. Install the MCM Companion extension to use your phone or controller as the mouse. Back returns to MCM.</span>
        <span class="spacer" />
        <F id="frame:back" class="pill" isDefault onSelect={back}><Icon name="back" /> Back</F>
      </div>
    </section>
  );
}

/* ---------- Rest mode ---------- */
export function Rest() {
  return (
    <section class="layer rest">
      <span class="led" />
      <b>Rest mode</b>
      <span>Press any button on the controller or phone to wake</span>
    </section>
  );
}

