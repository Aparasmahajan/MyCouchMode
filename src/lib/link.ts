import { signal, type Signal } from '@preact/signals';
import type { DataConnection, Peer as PeerT } from 'peerjs';
type PeerCtor = typeof import('peerjs').Peer;

/**
 * Phone <-> TV link.
 * - PeerJS (WebRTC data channel, free public signalling server): works across devices with no setup.
 * - BroadcastChannel: same-browser fallback, handy for testing the remote in a second tab (?local=1).
 */
export type Msg = { t: string; [k: string]: any };
export type LinkStatus = 'connecting' | 'ready' | 'connected' | 'lost' | 'not-found' | 'offline' | 'id-taken';

const peerId = (code: string) => `mcm-tv-${code.toLowerCase()}`;
const channelName = (code: string) => `mcm-${code.toUpperCase()}`;

export interface HostLink {
  status: Signal<LinkStatus>;
  phones: Signal<number>;
  send(m: Msg): void;
  close(): void;
}

/** TV side: accept any number of phones. */
export function host(code: string, onMsg: (m: Msg, reply: (r: Msg) => void) => void): HostLink {
  const status = signal<LinkStatus>('connecting');
  const phones = signal(0);
  const conns = new Set<DataConnection>();
  let localPhones = 0;
  let peer: PeerT | null = null;
  let closed = false;
  const count = () => (phones.value = conns.size + localPhones);

  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(channelName(code)) : null;
  if (bc) {
    bc.onmessage = (e) => {
      const m = e.data as Msg;
      if (!m || m.from !== 'phone') return;
      if (m.t === 'hello') { localPhones = 1; count(); }
      if (m.t === 'bye') { localPhones = 0; count(); }
      onMsg(m, (r) => bc.postMessage({ ...r, from: 'tv' }));
    };
  }

  // After a reload the signalling server can hold the old id for a little while,
  // so retry the same code before giving up on it (phones keep working with the same code).
  const start = (Peer: PeerCtor, attempt: number) => {
    if (closed) return;
    peer = new Peer(peerId(code), { debug: 0 });
    peer.on('open', () => (status.value = 'ready'));
    peer.on('connection', (conn) => {
      conn.on('open', () => { conns.add(conn); count(); });
      conn.on('data', (d) => onMsg(d as Msg, (r) => conn.open && conn.send(r)));
      const drop = () => { conns.delete(conn); count(); };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    peer.on('disconnected', () => {
      if (closed || peer?.destroyed) return;
      status.value = 'offline';
      setTimeout(() => !closed && !peer?.destroyed && peer?.reconnect(), 2000);
    });
    peer.on('error', (err: any) => {
      if (err?.type === 'unavailable-id') {
        peer?.destroy();
        if (attempt < 12) setTimeout(() => start(Peer, attempt + 1), 2500);
        else status.value = 'id-taken';
      } else if (err?.type === 'network' || err?.type === 'server-error') status.value = 'offline';
    });
  };
  import('peerjs').then(({ Peer }) => start(Peer, 0)).catch(() => (status.value = 'offline'));
  const release = () => peer?.destroy();
  window.addEventListener('pagehide', release);

  return {
    status,
    phones,
    send(m) {
      for (const c of conns) if (c.open) c.send(m);
      bc?.postMessage({ ...m, from: 'tv' });
    },
    close() {
      closed = true;
      window.removeEventListener('pagehide', release);
      bc?.close();
      peer?.destroy();
    },
  };
}

export interface PhoneLink {
  status: Signal<LinkStatus>;
  send(m: Msg): void;
  close(): void;
}

/** Phone side: connect to one TV by its code; retries if the link drops. */
export function join(code: string, local: boolean, onMsg: (m: Msg) => void): PhoneLink {
  const status = signal<LinkStatus>('connecting');
  let closed = false;

  if (local) {
    const bc = new BroadcastChannel(channelName(code));
    bc.onmessage = (e) => { if (e.data?.from === 'tv') { status.value = 'connected'; onMsg(e.data); } };
    const send = (m: Msg) => bc.postMessage({ ...m, from: 'phone' });
    send({ t: 'hello', name: 'This browser' });
    setTimeout(() => { if (status.value === 'connecting') status.value = 'not-found'; }, 2500);
    return { status, send, close() { send({ t: 'bye' }); bc.close(); } };
  }

  let peer: PeerT | null = null;
  let conn: DataConnection | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed || !peer || peer.destroyed) return;
    status.value = 'connecting';
    conn = peer.connect(peerId(code), { reliable: true });
    conn.on('open', () => {
      status.value = 'connected';
      conn!.send({ t: 'hello', name: deviceName() });
    });
    conn.on('data', (d) => onMsg(d as Msg));
    conn.on('close', () => { if (!closed) { status.value = 'lost'; schedule(); } });
  };
  const schedule = () => {
    if (retry) clearTimeout(retry);
    retry = setTimeout(connect, 2500);
  };

  import('peerjs').then(({ Peer }) => {
    if (closed) return;
    peer = new Peer({ debug: 0 });
    peer.on('open', connect);
    peer.on('error', (err: any) => {
      if (err?.type === 'peer-unavailable') { status.value = 'not-found'; schedule(); }
      else if (err?.type === 'network' || err?.type === 'server-error') { status.value = 'offline'; schedule(); }
    });
    peer.on('disconnected', () => { if (!closed) setTimeout(() => peer?.reconnect(), 2000); });
  }).catch(() => (status.value = 'offline'));

  return {
    status,
    send(m) { if (conn?.open) conn.send(m); },
    close() { closed = true; if (retry) clearTimeout(retry); peer?.destroy(); },
  };
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  return 'Browser';
}
