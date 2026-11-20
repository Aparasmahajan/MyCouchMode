import '../styles/admin.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_APPS, LOCAL_KEY, MODE_LABEL, announceSiteChange, normalize, type AppDef, type AppMode } from '../lib/apps';
import { AppIcon, Icon } from '../lib/logos';
import { load, save } from '../lib/shared';

type Storage = 'sheets' | 'kv' | 'none' | 'local';
const PW_KEY = 'mcm.admin.pw';

const pwGet = () => { try { return sessionStorage.getItem(PW_KEY) || ''; } catch { return ''; } };
const pwSet = (v: string) => { try { v ? sessionStorage.setItem(PW_KEY, v) : sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ } };

export function AdminApp() {
  const [phase, setPhase] = useState<'login' | 'setup' | 'ready'>('login');
  const [storage, setStorage] = useState<Storage>('none');
  const [ytKey, setYtKey] = useState<boolean | null>(null);
  const [view, setView] = useState<'sites' | 'youtube'>('sites');

  // Re-use the password from this browser tab if there is one.
  // (With no saved password this still asks the server, so an unconfigured server goes straight to setup.)
  useEffect(() => { signIn(pwGet(), true); }, []);

  async function signIn(pw: string, silent = false): Promise<string | null> {
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: { 'x-admin-password': pw } });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { pwSet(pw); setStorage(d.storage === 'sheets' || d.storage === 'kv' ? d.storage : 'local'); setYtKey(!!d.youtube); setPhase('ready'); return null; }
      if (d.error === 'admin_not_configured') { setPhase('setup'); return null; }
      pwSet('');
      return silent ? null : 'Wrong password. Try again.';
    } catch {
      return 'Could not reach the server. Check the connection.';
    }
  }

  return (
    <div class="admin">
      <header class="a-top">
        <img src="/icon.svg" alt="" />
        <div><b>MCM Admin</b><span>Sites on the home screen</span></div>
        <span class="spacer" />
        {phase === 'ready' && <button class="btn ghost" onClick={() => { pwSet(''); setPhase('login'); }}>Sign out</button>}
      </header>
      {phase === 'login' && <Login onSubmit={signIn} />}
      {phase === 'setup' && <Setup onLocal={() => { setStorage('local'); setPhase('ready'); }} />}
      {phase === 'ready' && (
        <>
          <nav class="a-tabs" role="tablist">
            <button role="tab" aria-selected={view === 'sites'} onClick={() => setView('sites')}>Sites</button>
            <button role="tab" aria-selected={view === 'youtube'} onClick={() => setView('youtube')}>YouTube</button>
          </nav>
          {view === 'sites' ? <Sites storage={storage} ytKey={ytKey} /> : <YouTubeSettings storage={storage} onChange={setYtKey} />}
        </>
      )}
      <footer class="a-foot">MCM · My Couch Mode · by Paras Mahajan</footer>
    </div>
  );
}

function Login({ onSubmit }: { onSubmit: (pw: string) => Promise<string | null> }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main class="card narrow">
      <h1>Sign in</h1>
      <p class="muted">Enter the admin password set in Vercel as <code>ADMIN_PASSWORD</code>.</p>
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(await onSubmit(pw)); setBusy(false); }}>
        <label for="pw">Admin password</label>
        <input id="pw" type="password" autocomplete="current-password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
        {err && <p class="err">{err}</p>}
        <button class="btn primary" disabled={!pw || busy}>{busy ? 'Checking…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function Setup({ onLocal }: { onLocal: () => void }) {
  return (
    <main class="card narrow">
      <h1>Set up the admin page</h1>
      <p>No admin password is set on the server yet. To manage sites for every TV:</p>
      <ol class="steps">
        <li>In Vercel, open your project → <b>Settings → Environment Variables</b> and add <code>ADMIN_PASSWORD</code>.</li>
        <li>Connect storage: either a <b>Google Sheet</b> (add <code>GOOGLE_SHEET_ID</code>, <code>GOOGLE_SA_EMAIL</code>, <code>GOOGLE_SA_KEY</code>; see the README), or <b>Storage → Upstash for Redis</b> in Vercel.</li>
        <li>Redeploy, then reload this page.</li>
      </ol>
      <p class="muted">Or edit sites for this browser only. Useful for trying things out, or when the TV runs in this same browser.</p>
      <button class="btn" onClick={onLocal}>Edit on this device only</button>
    </main>
  );
}

/* ---------- site list ---------- */
function Sites({ storage, ytKey }: { storage: Storage; ytKey: boolean | null }) {
  const [list, setList] = useState<AppDef[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (storage === 'local') return setList(normalize(load(LOCAL_KEY, null)) || DEFAULT_APPS);
      try {
        const d = await (await fetch(`/api/sites?t=${Date.now()}`, { cache: 'no-store' })).json();
        setList(normalize(d.sites) || DEFAULT_APPS);
      } catch { setList(DEFAULT_APPS); }
    })();
  }, [storage]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!list) return <main class="card"><p class="muted">Loading sites…</p></main>;

  const update = (next: AppDef[]) => { setList(next); setDirty(true); setMsg(null); };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };

  async function saveAll() {
    setSaving(true);
    try {
      if (storage === 'local') {
        save(LOCAL_KEY, list);
      } else {
        const r = await fetch('/api/sites', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': pwGet() }, body: JSON.stringify({ sites: list }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error === 'storage_not_configured' ? 'Storage is not connected in Vercel yet (Google Sheet or Upstash).' : d.error === 'wrong_password' ? 'Your session expired. Sign in again.' : d.detail || d.error || 'Save failed.');
        try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
      }
      announceSiteChange();
      setDirty(false);
      setMsg({ text: storage === 'local' ? 'Saved on this device.' : storage === 'sheets' ? 'Saved to the Google Sheet ("Sites" tab). TVs pick it up within a minute of opening or waking.' : 'Saved. TVs pick up the change the next time they open or wake.' });
    } catch (e: any) {
      setMsg({ text: e.message || String(e), bad: true });
    }
    setSaving(false);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ app: 'mcm', version: 1, sites: list }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mcm-sites.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importJson(f: File) {
    try {
      const data = JSON.parse(await f.text());
      const next = normalize(Array.isArray(data) ? data : data.sites);
      if (!next) throw new Error();
      update(next);
      setMsg({ text: `Imported ${next.length} sites. Review them, then save.` });
    } catch {
      setMsg({ text: 'That file is not an MCM sites export.', bad: true });
    }
  }

  return (
    <main class="sites">
      <section class="bar">
        <span class={`pill-badge ${storage === 'sheets' || storage === 'kv' ? 'ok' : 'warn'}`}>
          {storage === 'sheets' ? 'Google Sheet · every TV' : storage === 'kv' ? 'Upstash · every TV' : 'This device only'}
        </span>
        {ytKey === false && <span class="pill-badge warn">YouTube search is off: add a key in the YouTube tab</span>}
        <span class="spacer" />
        <button class="btn ghost" onClick={exportJson}>Export</button>
        <button class="btn ghost" onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) importJson(f); (e.target as HTMLInputElement).value = ''; }} />
        <button class="btn ghost" onClick={() => update(DEFAULT_APPS)}>Reset to defaults</button>
        <button class="btn primary" disabled={!dirty || saving} onClick={saveAll}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
      </section>
      {msg && <p class={`banner${msg.bad ? ' bad' : ''}`} role="status">{msg.text}</p>}

      {editing === 'new' ? (
        <SiteForm ids={list.map((s) => s.id)} onCancel={() => setEditing(null)}
          onSave={(s) => { update([...list, s]); setEditing(null); setMsg({ text: `${s.name} added. Save to publish it.` }); }} />
      ) : (
        <button class="add-site" onClick={() => setEditing('new')}><Icon name="plus" /> Add a site</button>
      )}

      <ul class="list">
        {list.map((s, i) => (
          <li key={s.id} class={s.hidden ? 'is-hidden' : ''}>
            {editing === s.id ? (
              <SiteForm initial={s} ids={list.filter((x) => x.id !== s.id).map((x) => x.id)} onCancel={() => setEditing(null)}
                onSave={(n) => { update(list.map((x) => (x.id === s.id ? n : x))); setEditing(null); }} />
            ) : (
              <div class="row">
                <div class="order">
                  <button class="icon" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" /></button>
                  <button class="icon" aria-label={`Move ${s.name} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><Icon name="down" /></button>
                </div>
                <span class="tile" style={{ '--c': s.color } as any}><AppIcon app={s} /></span>
                <div class="meta">
                  <b>{s.name}</b>
                  <span class="url">{s.mode === 'youtube' ? 'Built-in YouTube player' : s.url}</span>
                  <span class="tags">
                    <span class={`tag ${MODE_LABEL[s.mode][0]}`}>{MODE_LABEL[s.mode][1]}</span>
                    {s.kids && <span class="tag">Kids</span>}
                    {s.hidden && <span class="tag">Hidden</span>}
                  </span>
                </div>
                <div class="actions">
                  <button class="btn sm" onClick={() => setEditing(s.id)}>Edit</button>
                  <button class="btn sm" onClick={() => update(list.map((x) => (x.id === s.id ? { ...x, hidden: !x.hidden } : x)))}>{s.hidden ? 'Show' : 'Hide'}</button>
                  {s.mode !== 'youtube' && (confirmDel === s.id
                    ? <button class="btn sm danger" onClick={() => { update(list.filter((x) => x.id !== s.id)); setConfirmDel(null); }}>Confirm delete</button>
                    : <button class="btn sm ghost" onClick={() => setConfirmDel(s.id)}>Delete</button>)}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

/* ---------- YouTube API key + region (stored server-side, never sent to TVs) ---------- */
interface YtStatus { source: 'admin' | 'env' | 'none'; keyHint: string; region: string; envKey: boolean }

function YouTubeSettings({ storage, onChange }: { storage: Storage; onChange: (on: boolean) => void }) {
  const [st, setSt] = useState<YtStatus | null>(null);
  const [key, setKey] = useState('');
  const [region, setRegion] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'remove'>('');
  const canSave = storage === 'sheets' || storage === 'kv';

  async function load() {
    try {
      const r = await fetch('/api/settings', { headers: { 'x-admin-password': pwGet() } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || (d.error === 'admin_not_configured' ? 'Set ADMIN_PASSWORD in Vercel to manage settings here.' : d.error || 'Could not load settings.'));
      setSt(d.youtube); setRegion(d.youtube.region || '');
      onChange(d.youtube.source !== 'none');
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
  }
  useEffect(() => { load(); }, []);

  async function save(remove = false) {
    setBusy(remove ? 'remove' : 'save'); setMsg(null);
    try {
      const body: Record<string, string> = { youtubeRegion: region };
      if (remove) body.youtubeKey = '';
      else if (key.trim()) body.youtubeKey = key.trim();
      const r = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': pwGet() }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || (d.error === 'storage_not_configured' ? 'Connect a Google Sheet or Upstash first; settings are stored there.' : d.error || 'Save failed.'));
      setKey('');
      setMsg({ text: remove ? 'Saved key removed.' : storage === 'sheets' ? 'Saved to the Google Sheet ("Settings" tab). Search uses it within 5 minutes.' : 'Saved. Search uses it within 5 minutes.' });
      await load();
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
    setBusy('');
  }

  async function test() {
    setBusy('test'); setMsg(null);
    try {
      const r = await fetch(`/api/yt-search?q=${encodeURIComponent('lofi music')}&t=${Date.now()}`);
      const d = await r.json().catch(() => ({}));
      if (r.status === 503) throw new Error('No key is set yet, so search is off.');
      if (!r.ok) throw new Error(`YouTube said: ${d.detail || d.error}. Check that "YouTube Data API v3" is enabled for this key and that the key is not restricted to websites.`);
      setMsg({ text: `Search works: ${d.items.length} results, for example “${d.items[0]?.title || '…'}”.` });
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
    setBusy('');
  }

  return (
    <main class="card yt-settings">
      <h1>YouTube search</h1>
      <p class="muted">The key stays on the server{storage === 'sheets' ? ' (in the private "Settings" tab of your Google Sheet)' : ''}. TVs and phones never see it. Search costs 100 of the 10,000 free daily units, so about 100 searches a day.</p>
      {st && (
        <p class={`banner${st.source === 'none' ? ' warn' : ''}`}>
          {st.source === 'admin' ? `Using the key saved here (${st.keyHint}).` : st.source === 'env' ? `Using YOUTUBE_API_KEY from Vercel (${st.keyHint}). A key saved here takes priority.` : 'No key yet, so YouTube search is off. Links sent from the phone still play.'}
        </p>
      )}
      {!canSave && <p class="banner warn">Settings are stored in your Google Sheet or Upstash, and neither is connected yet. Until then, set YOUTUBE_API_KEY in Vercel.</p>}
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label for="ytk">API key</label>
        <input id="ytk" type="password" autocomplete="off" spellcheck={false} placeholder={st?.keyHint ? `Leave empty to keep ${st.keyHint}` : 'AIza…'} value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} disabled={!canSave} />
        <label for="ytr">Search region (optional)</label>
        <input id="ytr" maxLength={2} placeholder="IN" value={region} onInput={(e) => setRegion((e.target as HTMLInputElement).value.toUpperCase())} disabled={!canSave} />
        <div class="form-actions">
          {st?.source === 'admin' && <button type="button" class="btn ghost" disabled={!!busy} onClick={() => save(true)}>{busy === 'remove' ? 'Removing…' : 'Remove saved key'}</button>}
          <button type="button" class="btn" disabled={!!busy} onClick={test}>{busy === 'test' ? 'Testing…' : 'Test search'}</button>
          <button class="btn primary" disabled={!canSave || !!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
      {msg && <p class={`banner${msg.bad ? ' bad' : ''}`} role="status">{msg.text}</p>}
    </main>
  );
}

/* ---------- add / edit form with one-click site check ---------- */
interface Check { embeddable: boolean; reason: string; blocked?: boolean }

function SiteForm({ initial, ids, onSave, onCancel }: { initial?: AppDef; ids: string[]; onSave: (s: AppDef) => void; onCancel: () => void }) {
  const [s, setS] = useState<AppDef>(initial || { id: '', name: '', color: '#3b5bff', mode: 'tab', url: '', desc: '', kids: false });
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isYouTube = s.mode === 'youtube';
  const set = (patch: Partial<AppDef>) => setS({ ...s, ...patch });

  async function runCheck() {
    if (!s.url) return;
    setChecking(true); setErr(null);
    try {
      const r = await fetch(`/api/site-check?url=${encodeURIComponent(s.url)}`, { headers: { 'x-admin-password': pwGet() } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || (d.error === 'wrong_password' ? 'Sign in again to check sites.' : 'Could not check that site.'));
      setS((cur) => ({
        ...cur,
        url: d.url,
        name: cur.name || d.name,
        desc: cur.desc || d.desc,
        color: initial ? cur.color : d.color,
        icon: d.icon || cur.icon,
        mode: d.embeddable ? 'frame' : 'tab',
      }));
      setCheck({ embeddable: d.embeddable, reason: d.reason, blocked: d.blocked });
    } catch (e: any) {
      setErr(e.message || String(e));
    }
    setChecking(false);
  }

  function submit(e: Event) {
    e.preventDefault();
    const name = s.name.trim();
    if (!name) return setErr('Give the site a name.');
    if (!isYouTube && !/^https?:\/\//i.test(s.url || '')) return setErr('The address must start with https://');
    let id = s.id;
    if (!id) {
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
      id = base;
      for (let n = 2; ids.includes(id); n++) id = `${base}-${n}`;
    }
    onSave({ ...s, id, name, desc: s.desc || (s.mode === 'frame' ? 'Opens inside MCM.' : 'Opens in a new tab.') });
  }

  return (
    <form class="site-form" onSubmit={submit}>
      <div class="sf-main">
        {!isYouTube && (
          <div class="url-row">
            <div class="grow">
              <label for="sf-url">Website address</label>
              <input id="sf-url" value={s.url} placeholder="https://www.example.com" inputMode="url" onInput={(e) => set({ url: (e.target as HTMLInputElement).value.trim() })} />
            </div>
            <button type="button" class="btn" disabled={!s.url || checking} onClick={runCheck}>{checking ? 'Checking…' : 'Check site'}</button>
          </div>
        )}
        {check && (
          <p class={`banner${check.embeddable ? '' : ' warn'}`}>
            {check.blocked ? 'The site blocked the automatic check (bot protection), so fill in the name and icon yourself. ' : ''}
            {check.embeddable ? 'Opens inside MCM. ' : 'Needs a new tab. '}{check.reason}
          </p>
        )}
        <div class="grid">
          <div>
            <label for="sf-name">Name on the tile</label>
            <input id="sf-name" value={s.name} maxLength={30} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
          </div>
          <div>
            <label for="sf-color">Tile colour</label>
            <div class="color-row">
              <input id="sf-color" type="color" value={s.color} onInput={(e) => set({ color: (e.target as HTMLInputElement).value })} />
              <code>{s.color}</code>
            </div>
          </div>
          {!isYouTube && (
            <div>
              <label for="sf-mode">How it opens</label>
              <select id="sf-mode" value={s.mode} onChange={(e) => set({ mode: (e.target as HTMLSelectElement).value as AppMode })}>
                <option value="frame">Inside MCM (site must allow embedding)</option>
                <option value="tab">New tab (works with every site)</option>
              </select>
            </div>
          )}
          <div>
            <label for="sf-icon">Icon image address (optional)</label>
            <input id="sf-icon" value={s.icon || ''} placeholder="https://…/icon.png" onInput={(e) => set({ icon: (e.target as HTMLInputElement).value.trim() || undefined })} />
          </div>
          <div class="span2">
            <label for="sf-desc">Short description</label>
            <input id="sf-desc" value={s.desc} maxLength={200} onInput={(e) => set({ desc: (e.target as HTMLInputElement).value })} />
          </div>
        </div>
        <label class="check"><input type="checkbox" checked={!!s.kids} onChange={(e) => set({ kids: (e.target as HTMLInputElement).checked })} /> Allowed on Kids profiles</label>
        {err && <p class="err">{err}</p>}
        <div class="form-actions">
          <button type="button" class="btn ghost" onClick={onCancel}>Cancel</button>
          <button class="btn primary">{initial ? 'Done' : 'Add to home screen'}</button>
        </div>
      </div>
      <aside class="preview" aria-label="Tile preview">
        <span class="label">Preview</span>
        <span class="tile big" style={{ '--c': s.color } as any}><AppIcon app={{ ...s, id: initial?.id || '_new', name: s.name || '?' }} /></span>
        <b>{s.name || 'Site name'}</b>
        <span class="muted">{MODE_LABEL[s.mode][1]}</span>
      </aside>
    </form>
  );
}
