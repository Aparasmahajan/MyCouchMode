import { useEffect, useState } from 'preact/hooks';
import { F, focused, setFocus, useLayerKeys } from '../lib/nav';
import { textMode } from '../lib/input';
import { AppIcon } from '../lib/logos';
import { parseYouTubeId, recommended, searchYouTube, thumbOf, type SearchItem } from '../lib/youtube';
import { activeId, getHistory } from '../lib/store';
import { kidsMode, playVideo, query, searchSubmit, typeChar } from './state';

const KEYS = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');
type Status = 'idle' | 'loading' | 'done' | 'missing_key' | 'failed';

export function Search() {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [searched, setSearched] = useState('');
  const q = query.value.trim();
  const linkId = parseYouTubeId(q);

  useEffect(() => {
    textMode.value = true;
    return () => { textMode.value = false; };
  }, []);

  // Search only when asked (Enter on the query box, the Search key, or the phone's Go),
  // never on each keystroke: typing stays smooth and each search costs YouTube quota.
  const submit = () => { searchSubmit.value++; };
  useEffect(() => {
    if (!searchSubmit.value) return;
    const term = query.peek().trim();
    if (term.length < 2 || parseYouTubeId(term)) return;
    const ctrl = new AbortController();
    setStatus('loading');
    setSearched(term);
    searchYouTube(term, kidsMode(), ctrl.signal).then((r) => {
      if ('items' in r) {
        setItems(r.items);
        setStatus('done');
        if (r.items[0]) setTimeout(() => setFocus('res:' + r.items[0].id, true), 30); // like YouTube: jump to the results
      } else setStatus(r.error);
    }).catch(() => { /* aborted */ });
    return () => ctrl.abort();
  }, [searchSubmit.value]);

  // Typing again while on the results goes back to the query box.
  useEffect(() => {
    if ((focused.peek() || '').startsWith('res:') && q !== searched) setFocus('q:box', true);
  }, [q]);

  // Before searching, show recommendations: more from the channels you watched, then trending.
  const [recs, setRecs] = useState<SearchItem[] | null>(null);
  useEffect(() => {
    const watched = activeId.value ? getHistory(activeId.value).map((h) => h.id) : [];
    recommended(watched, kidsMode(), 10).then(setRecs);
  }, []);
  const scrollTo = (id: string) => document.querySelector(`[data-fid="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  useLayerKeys('search', (a) => {
    if (a === 'ok' && focused.value === 'q:box') { submit(); return true; }
    return false;
  });

  return (
    <section class="layer search" data-layer="search">
      <div class="search-left">
        <div class="ut-brand"><span class="ut-mark"><AppIcon app={{ id: 'utube', name: 'uTube', color: '#ff3d6e' }} /></span><b>uTube</b></div>
        <F id="q:box" class="query" isDefault onSelect={submit} aria-label="Search box. Type, then press Enter.">
          {query.value ? <>{query.value}<span class="caret" /></> : <span class="ph">Search uTube: type, then press Enter</span>}
        </F>
        <div class="osk">
          {KEYS.map((k) => (
            <F key={k} id={'key:' + k} class="key" onSelect={() => typeChar(k)}>{k}</F>
          ))}
          <F id="key:space" class="key wide" onSelect={() => typeChar(' ')}>Space</F>
          <F id="key:del" class="key wide" onSelect={() => typeChar('\b')}>Delete</F>
          <F id="key:clear" class="key wide" onSelect={() => (query.value = '')}>Clear</F>
          <F id="key:go" class="key wide go" onSelect={submit}>Search</F>
        </div>
        <p class="via">Faster: type on your phone remote and press Go, or type on a keyboard and press Enter.</p>
      </div>

      <div class="results">
        {linkId ? (
          <>
            <h4>YouTube link</h4>
            <F id="res:link" class="res" onSelect={() => playVideo({ id: linkId })}>
              <span class="rthumb"><img src={thumbOf(linkId)} alt="" /></span>
              <div><div class="t2">Play this video</div><div class="s2">{linkId}</div></div>
            </F>
          </>
        ) : status === 'missing_key' ? (
          <Note title="Search needs a YouTube API key">
            Add <code>YOUTUBE_API_KEY</code> in Vercel (Project → Settings → Environment Variables) and redeploy. Until then, send any YouTube link from your phone and it plays here.
          </Note>
        ) : status === 'failed' ? (
          <Note title="Search isn't working right now">Check the internet connection, or the daily YouTube quota may be used up. Links from your phone still play.</Note>
        ) : status === 'idle' && recs && recs.length ? (
          <>
            <h4>Recommended for you</h4>
            {recs.map((it) => (
              <F key={it.id} id={'res:' + it.id} class="res" onFocus={() => scrollTo('res:' + it.id)} onSelect={() => playVideo({ id: it.id, title: it.title, channel: it.channel, queue: recs })}>
                <span class="rthumb"><img src={it.thumb} alt="" loading="lazy" /></span>
                <div><div class="t2">{it.title}</div><div class="s2">{it.channel}</div></div>
              </F>
            ))}
          </>
        ) : status === 'idle' ? (
          <Note title={kidsMode() ? 'Kids search' : 'Search YouTube'}>
            {kidsMode() ? 'Type, then press Enter or Search. Results use YouTube’s strict safe search.' : 'Type, then press Enter or the Search key. On the phone, type and press Go.'}
          </Note>
        ) : (
          <>
            <h4>{status === 'loading' ? 'Searching…' : q !== searched ? `Press Enter to search for “${q}”` : items.length ? `Results for “${searched}”` : `Nothing found for “${searched}”`}</h4>
            {items.map((it) => (
              <F key={it.id} id={'res:' + it.id} class="res" onFocus={() => scrollTo('res:' + it.id)} onSelect={() => playVideo({ id: it.id, title: it.title, channel: it.channel, queue: items })}>
                <span class="rthumb"><img src={it.thumb} alt="" loading="lazy" /></span>
                <div><div class="t2">{it.title}</div><div class="s2">{it.channel}</div></div>
              </F>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function Note({ title, children }: { title: string; children: any }) {
  return (
    <div class="note">
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}
