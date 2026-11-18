import { useState } from 'preact/hooks';
import { MODE_LABEL, visibleSites, type AppDef } from '../lib/apps';
import { AppIcon, Icon } from '../lib/logos';
import { F, focused, pushLayer } from '../lib/nav';
import { pad } from '../lib/input';
import { AVATAR_COLORS, activeProfile, getHistory, type WatchItem } from '../lib/store';
import { art, entered, launchApp, openYouTube, playVideo, tint } from './state';
import { Clock } from './Chrome';
import { link } from './App';

type Hero = { kind: 'app'; app: AppDef } | { kind: 'video'; item: WatchItem };

const TILE_STEP = 8.2; // in --u units: tile width + gap
const CARD_STEP = 18.2;

export function Home() {
  const prof = activeProfile();
  const apps = visibleSites().filter((a) => !prof?.kids || a.kids);
  const history = prof ? getHistory(prof.id).slice(0, 8) : [];
  const [hero, setHero] = useState<Hero>({ kind: 'app', app: apps[0] });
  const [lastTile, setLastTile] = useState('app:youtube');
  const [lastCard, setLastCard] = useState<string | null>(null);

  const showApp = (a: AppDef) => {
    setHero({ kind: 'app', app: a });
    setLastTile('app:' + a.id);
    tint.value = a.color;
    art.value = { key: 'app:' + a.id, app: a.id, color: a.color };
  };
  const showVideo = (v: WatchItem) => {
    setHero({ kind: 'video', item: v });
    setLastCard('vid:' + v.id);
    art.value = { key: 'vid:' + v.id, thumb: v.thumb };
  };

  const fid = focused.value || '';
  const tileIdx = Math.max(0, apps.findIndex((a) => 'app:' + a.id === fid));
  const cardIdx = Math.max(0, history.findIndex((v) => 'vid:' + v.id === fid));
  const tileShift = fid.startsWith('app:') ? tileIdx : apps.findIndex((a) => 'app:' + a.id === lastTile);
  const cardShift = Math.min(Math.max(0, history.length - 4), Math.max(0, (fid.startsWith('vid:') ? cardIdx : 0) - 1));

  const openHero = () => (hero.kind === 'app' ? launchApp(hero.app.id) : playVideo({ id: hero.item.id, start: hero.item.pos, title: hero.item.title, channel: hero.item.channel }));
  const toTiles = () => lastTile;
  const toCards = () => lastCard || (history[0] ? 'vid:' + history[0].id : null);
  const phones = link?.phones.value || 0;

  return (
    <section class="layer-home" data-layer="home" key={entered.value}>
      <div class="top">
        <span class="brand">MCM</span>
        <span class="greet">{prof ? `Hi, ${prof.name}` : ''}</span>
        <span class="spacer" />
        <span class="mini" title="Controller"><Icon name="pad" /><span class={`dot${pad.value.connected ? '' : ' off'}`} /></span>
        <span class="mini" title="Phone remotes"><Icon name="phone" /><span class={`dot${phones ? '' : ' off'}`} />{phones > 1 ? phones : ''}</span>
        <F id="top:search" class="icon-btn" onSelect={() => openYouTube('#/search')} aria-label="Search"><Icon name="search" /></F>
        <F id="top:cc" class="icon-btn" onSelect={() => pushLayer('cc')} aria-label="Control center"><Icon name="gear" /></F>
        <F id="top:profile" class="avatar" style={{ background: AVATAR_COLORS[prof?.color ?? 0] }} onSelect={() => pushLayer('welcome')} aria-label="Switch profile">
          {prof?.name[0] || '?'}
        </F>
        <Clock />
      </div>

      <div class="rail apps">
        <div class="track" style={{ transform: `translateX(calc(${-Math.max(0, Math.min(tileShift, apps.length - 3)) * TILE_STEP} * var(--u)))` }}>
          {apps.map((a) => (
            <F key={a.id} id={'app:' + a.id} class="tile" isDefault={a.id === 'youtube'} onFocus={() => showApp(a)} onSelect={() => launchApp(a.id)} nav={{ down: 'hero:open' }}>
              <span class="ic" style={{ '--c': a.color } as any}>
                <AppIcon app={a} />
                {a.mode === 'tab' && <span class="ext"><Icon name="ext" /></span>}
              </span>
              <span class="lbl">{a.name}</span>
            </F>
          ))}
        </div>
      </div>

      <div class="hero">
        {hero.kind === 'app' ? (
          <>
            <span class={`badge ${MODE_LABEL[hero.app.mode][0]}`}>{MODE_LABEL[hero.app.mode][1]}</span>
            <div class="brandline">
              <span class="mark" style={{ '--c': hero.app.color } as any}><AppIcon app={hero.app} /></span>
              <h2>{hero.app.name}</h2>
            </div>
            <p>{hero.app.desc}</p>
          </>
        ) : (
          <>
            <span class="badge inside">YouTube · {Math.round((hero.item.pos / (hero.item.dur || 1)) * 100)}% watched</span>
            <div class="brandline"><h2 class="video-title">{hero.item.title}</h2></div>
            <p>{hero.item.channel ? `${hero.item.channel} · ` : ''}Pick up where you left off.</p>
          </>
        )}
        <div class="cta">
          <F id="hero:open" class="pill primary" onSelect={openHero} nav={{ up: toTiles, down: toCards }}>
            {hero.kind === 'video' ? 'Resume' : hero.app.mode === 'tab' ? 'Open in new tab' : 'Open'}
          </F>
          <F id="hero:search" class="pill round" onSelect={() => openYouTube('#/search')} nav={{ up: toTiles, down: toCards }} aria-label="Search"><Icon name="search" /></F>
        </div>
      </div>

      <div class="rail cont">
        <h3>Continue watching</h3>
        <div class="track" style={{ transform: `translateX(calc(${-cardShift * CARD_STEP} * var(--u)))` }}>
          {history.length ? (
            history.map((v) => (
              <F key={v.id} id={'vid:' + v.id} class="card" onFocus={() => showVideo(v)} nav={{ up: 'hero:open' }}
                onSelect={() => playVideo({ id: v.id, start: v.pos, title: v.title, channel: v.channel })}>
                <img src={v.thumb} alt="" loading="lazy" />
                <span class="prog"><i style={{ width: `${Math.min(100, (v.pos / (v.dur || 1)) * 100)}%` }} /></span>
                <span class="t">{v.title}<span class="s">{v.channel || 'YouTube'}</span></span>
              </F>
            ))
          ) : (
            <div class="card empty-card">
              <span>Videos you watch on YouTube show up here, saved separately for each profile.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
