import '../styles/tv.css';
import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { startInput, rumble, lastSource, type Action } from '../lib/input';
import { host, type HostLink, type Msg } from '../lib/link';
import { handleLayerKey, layers, move, pushLayer, popLayer, resetLayers, selectFocused, topLayer } from '../lib/nav';
import { activeId, addProfile, hashPin, lastProfileId, profiles, removeProfile, tvCode, newCode } from '../lib/store';
import { appById, listenForSiteChanges, refreshSites, visibleSites } from '../lib/apps';
import { away, awayMode, ext, extSend, initExt } from '../lib/ext';
import { initInstall } from '../lib/install';
import { parseYouTubeId } from '../lib/youtube';
import { sfx } from '../lib/sfx';
import {
  activate, back, changeVolume, goHome, goRest, has, launchApp, nowPlaying, pinFor, player, playerOpts,
  openSearch, playYouTubeLink, query, resting, upNextList, searchSubmit, setSleep, setText, showToast, sleepAtEnd, sleepMins, tint, typeChar,
} from './state';
import { Home } from './Home';
import { Search } from './Search';
import { Player, PlayerMenu } from './Player';
import { ControlCenter, Frame, Pair, PinPad, Rest, Welcome, YouTubeSetup } from './Overlays';
import { Backdrop, Hints, Toast, VolumeHud } from './Chrome';

export let link: HostLink | null = null;

function onAction(a: Action) {
  if (resting.value) {
    resting.value = false;
    sfx('open');
    return activeId.value ? resetLayers(['home']) : resetLayers(['home', 'welcome']);
  }
  if (handleLayerKey(a)) return;
  switch (a) {
    case 'up': case 'down': case 'left': case 'right':
      move(a); rumble(); return;
    case 'ok': rumble(0.5); return selectFocused();
    case 'back': sfx('back'); return back();
    case 'home': return goHome();
    case 'menu':
      if (!activeId.value) return;
      return topLayer() === 'cc' ? popLayer() : pushLayer('cc');
    case 'search':
      if (activeId.value && topLayer() !== 'search') openSearch();
      return;
    case 'playpause': return player.api?.toggle();
    case 'volup': return changeVolume(5);
    case 'voldown': return changeVolume(-5);
    case 'mute': return changeVolume('mute');
  }
}

/** Phone messages that drive whatever site is in front while an app is open in its own tab. */
const FORWARD = new Set(['key', 'text', 'pointer', 'click', 'scroll', 'enter', 'submit', 'seek', 'rate']);

function onPhone(m: Msg, reply: (r: Msg) => void) {
  if (m.t !== 'hello') lastSource.value = 'phone';
  if (away.value && FORWARD.has(m.t)) {
    if (m.t === 'key' && m.k === 'home') { extSend({ type: 'home' }); away.value = false; return goHome(); }
    extSend({ type: 'cmd', cmd: m.t === 'submit' ? { t: 'enter' } : m }).then((r) => { if (r && !r.ok && r.error === 'app_tab_gone') away.value = false; });
    return;
  }
  switch (m.t) {
    case 'hello':
      showToast(`${m.name || 'A phone'} is connected as a remote.`);
      return reply(stateMsg());
    case 'key':
      return onAction(m.k as Action);
    case 'text':
      return setText(String(m.v ?? ''));
    case 'launch':
      if (!activeId.value) return reply({ t: 'error', msg: 'Pick a profile first.' });
      if (!appById(m.app)) return;
      resetLayers(['home'], `app:${m.app}`);
      return setTimeout(() => launchApp(m.app), 30);
    case 'play': {
      const id = parseYouTubeId(String(m.url || ''));
      if (!id) return reply({ t: 'error', msg: 'That does not look like a YouTube link.' });
      if (!activeId.value) return reply({ t: 'error', msg: 'Pick a profile on the TV first.' });
      playYouTubeLink(id);
      return reply({ t: 'ok', msg: 'Playing on the TV.' });
    }
    case 'profile': {
      const p = profiles.value.find((x) => x.id === m.id);
      if (!p) return;
      if (p.pinHash && hashPin(String(m.pin || '')) !== p.pinHash) return reply({ t: 'error', msg: 'Wrong PIN. Try again.' });
      return activate(p.id);
    }
    case 'addProfile': {
      const p = addProfile({ name: String(m.name || ''), color: Number(m.color) || 0, kids: !!m.kids, pin: m.pin ? String(m.pin) : undefined });
      if (!p) return reply({ t: 'error', msg: 'Give the profile a name.' });
      showToast(`Profile "${p.name}" added from a phone.`);
      return reply({ t: 'ok', msg: `Added ${p.name}.` });
    }
    case 'removeProfile': {
      const p = profiles.value.find((x) => x.id === m.id);
      if (!p) return;
      if (p.pinHash && hashPin(String(m.pin || '')) !== p.pinHash) return reply({ t: 'error', msg: 'Wrong PIN. Try again.' });
      if (!removeProfile(p.id)) return reply({ t: 'error', msg: 'Keep at least one profile.' });
      if (!activeId.value) resetLayers(['home', 'welcome']);
      return reply({ t: 'ok', msg: `Removed ${p.name}.` });
    }
    case 'seek':
      return player.api?.seek(Number(m.d) || 0);
    case 'seekTo':
      return player.api?.seekTo(Number(m.pos) || 0);
    case 'rate':
      return player.api?.setRate(Number(m.r) || 1);
    case 'loop':
      return player.api?.setLoop(!!m.on);
    case 'captions':
      return player.api?.setCaptions(!!m.on);
    case 'sleep': {
      const v = m.v === 'end' ? 'end' : Math.max(0, Math.min(240, Number(m.v) || 0));
      setSleep(v);
      return showToast(v === 0 ? 'Sleep timer off.' : v === 'end' ? 'MCM will rest when this video ends.' : `MCM will rest in ${v} minutes.`);
    }
    case 'next':
      return player.api?.next();
    case 'playId':
      return player.api?.playId(String(m.id || ''));
    case 'submit':
      return void searchSubmit.value++;
    case 'closeApp':
      extSend({ type: 'home', close: true });
      away.value = false;
      return;
  }
}

function stateMsg(): Msg {
  return {
    t: 'state',
    code: tvCode.value,
    profiles: profiles.value.map((p) => ({ id: p.id, name: p.name, color: p.color, kids: p.kids, hasPin: !!p.pinHash })),
    active: activeId.value,
    layer: topLayer(),
    query: query.value,
    pinFor: topLayer() === 'pin' ? pinFor.value : null,
    now: nowPlaying.value,
    upNext: nowPlaying.value ? upNextList.value : [],
    opts: playerOpts.value,
    sleep: { mins: sleepMins.value, atEnd: sleepAtEnd.value },
    apps: visibleSites().map((a) => ({ id: a.id, name: a.name, color: a.color, icon: a.icon, kids: !!a.kids })),
    away: away.value,
    awayMode: awayMode.value,
    ext: !!ext.value,
  };
}

let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  startInput(onAction, typeChar);
  initExt();
  initInstall();
  refreshSites();
  listenForSiteChanges();
  // Pick up sites the admin added: when the TV wakes up / comes back, and every 10 minutes.
  let lastRefresh = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefresh > 60_000) { lastRefresh = Date.now(); refreshSites(); }
  });
  setInterval(() => { lastRefresh = Date.now(); refreshSites(); }, 10 * 60_000);
  link = host(tvCode.value, onPhone);
  effect(() => {
    if (link?.status.value === 'id-taken') {
      // Another TV already owns this code: pick a new one.
      link.close();
      tvCode.value = newCode();
      link = host(tvCode.value, onPhone);
    }
  });
  // Keep every phone in sync with what the TV shows.
  let t: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    stateMsg(); // subscribe to all signals it reads
    clearTimeout(t);
    t = setTimeout(() => link?.send(stateMsg()), 80);
  });
  // Sleep timer counts down once a minute.
  setInterval(() => {
    if (sleepMins.value > 0) {
      sleepMins.value--;
      if (sleepMins.value === 0) goRest();
    }
  }, 60_000);
  // Start on the "who's watching" screen, like a console.
  resetLayers(['home', 'welcome'], lastProfileId.value ? `pf:${lastProfileId.value}` : undefined);
}

export function TvApp() {
  useEffect(boot, []);
  const top = topLayer();
  // Each open screen sits in a slot stacked by the order it was opened, so the newest is always in
  // front (e.g. a video started from search covers the search screen). Slots never move in the DOM,
  // which keeps the YouTube player from reloading.
  const slot = (name: string, el: any) =>
    has(name) && <div class="slot" style={{ zIndex: 10 + layers.value.indexOf(name) }}>{el}</div>;
  return (
    <div class="stage">
      <div class={`tv top-${top}`} style={{ '--tint': tint.value } as any}>
        <Backdrop />
        <Home />
        {slot('welcome', <Welcome />)}
        {slot('player', <Player />)}
        {slot('frame', <Frame />)}
        {slot('search', <Search />)}
        {slot('ytsetup', <YouTubeSetup />)}
        {slot('pair', <Pair />)}
        {slot('pin', <PinPad />)}
        {slot('pmenu', <PlayerMenu />)}
        {slot('cc', <ControlCenter />)}
        {resting.value && <Rest />}
        <Hints />
        <VolumeHud />
        <Toast />
      </div>
    </div>
  );
}
