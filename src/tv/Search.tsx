import { useEffect, useState } from 'preact/hooks';
import { F, focused, setFocus } from '../lib/nav';
import { textMode } from '../lib/input';
import { parseYouTubeId, searchYouTube, thumbOf, type SearchItem } from '../lib/youtube';
import { kidsMode, playVideo, query, typeChar } from './state';

const KEYS = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');
type Status = 'idle' | 'loading' | 'done' | 'missing_key' | 'failed';

export function Search() {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const q = query.value.trim();
  const linkId = parseYouTubeId(q);

  useEffect(() => {
    textMode.value = true;
    return () => { textMode.value = false; };
  }, []);

  useEffect(() => {
    if (q.length < 2 || linkId) { setStatus('idle'); setItems([]); return; }
    const ctrl = new AbortController();
    setStatus('loading');
    const t = setTimeout(async () => {
      try {
        const r = await searchYouTube(q, kidsMode(), ctrl.signal);
        if ('items' in r) { setItems(r.items); setStatus('done'); }
        else setStatus(r.error);
      } catch { /* aborted */ }
    }, 550);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  // If focus was on a result that disappeared, fall back to the keyboard.
  useEffect(() => {
    const f = focused.value || '';
    if (f.startsWith('res:') && !items.some((i) => 'res:' + i.id === f) && !(linkId && f === 'res:link')) setFocus('key:a', true);
  }, [items, linkId]);

  return (
    <section class="layer search" data-layer="search">
      <div class="search-left">
        <div class="query">
          {query.value ? <>{query.value}<span class="caret" /></> : <span class="ph">Search YouTube or paste a link from your phone</span>}
        </div>
        <div class="osk">
          {KEYS.map((k) => (
            <F key={k} id={'key:' + k} class="key" isDefault={k === 'a'} onSelect={() => typeChar(k)}>{k}</F>
          ))}
          <F id="key:space" class="key wide" onSelect={() => typeChar(' ')}>Space</F>
          <F id="key:del" class="key wide" onSelect={() => typeChar('\b')}>Delete</F>
          <F id="key:clear" class="key wide" onSelect={() => (query.value = '')}>Clear</F>
        </div>
        <p class="via">Faster: type on your phone remote, or just type on a keyboard.</p>
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
        ) : status === 'idle' ? (
          <Note title={kidsMode() ? 'Kids search' : 'Search YouTube'}>
            {kidsMode() ? 'Results use YouTube’s strict safe search.' : 'Type at least two letters.'}
          </Note>
        ) : (
          <>
            <h4>{status === 'loading' ? 'Searching…' : items.length ? `Results for “${q}”` : `Nothing found for “${q}”`}</h4>
            {items.slice(0, 5).map((it) => (
              <F key={it.id} id={'res:' + it.id} class="res" onSelect={() => playVideo({ id: it.id, title: it.title, channel: it.channel })}>
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
