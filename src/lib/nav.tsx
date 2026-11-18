import { signal } from '@preact/signals';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { sfx } from './sfx';

/**
 * Focus engine for a 10-foot UI.
 * Every focusable element has a stable id. Layers (home, search, player...) stack;
 * only the top layer receives input. Arrow/D-pad moves pick the nearest element in
 * that direction, unless an element declares an explicit neighbour.
 */
export type Dir = 'up' | 'down' | 'left' | 'right';
type Target = string | null | (() => string | null);
interface Handler {
  select?: () => void;
  focus?: () => void;
  nav?: Partial<Record<Dir, Target>>;
}

export const focused = signal<string | null>(null);
export const layers = signal<string[]>(['home']);
const handlers = new Map<string, Handler>();
const memo = new Map<string, string>();

export const topLayer = () => layers.value[layers.value.length - 1];
const layerEl = () => document.querySelector<HTMLElement>(`[data-layer="${topLayer()}"]`);

function items() {
  const el = layerEl();
  if (!el) return [];
  return [...el.querySelectorAll<HTMLElement>('[data-fid]')].filter((e) => e.offsetParent !== null || e.getClientRects().length > 0);
}
const exists = (id: string) => items().some((e) => e.dataset.fid === id);

export function setFocus(id: string | null, quiet = false) {
  if (!id || focused.value === id) return;
  focused.value = id;
  memo.set(topLayer(), id);
  handlers.get(id)?.focus?.();
  if (!quiet) sfx('move');
}

export function focusFirst(preferred?: string) {
  const list = items();
  const m = preferred || memo.get(topLayer());
  const pick =
    (m && list.find((e) => e.dataset.fid === m)) ||
    list.find((e) => e.dataset.fdefault !== undefined) ||
    list[0];
  if (pick) setFocus(pick.dataset.fid!, true);
}

/** Renders happen in a microtask; focus after the new layer is in the DOM. */
const later = (fn: () => void) => setTimeout(fn, 0);

export function pushLayer(name: string, focusId?: string) {
  if (topLayer() === name) return;
  layers.value = [...layers.value.filter((l) => l !== name), name];
  sfx('open');
  later(() => focusFirst(focusId));
}

export function popLayer() {
  if (layers.value.length <= 1) return false;
  layers.value = layers.value.slice(0, -1);
  later(() => focusFirst());
  return true;
}

export function resetLayers(stack: string[] = ['home'], focusId?: string) {
  layers.value = stack;
  later(() => focusFirst(focusId));
}

export function forget(layer: string) {
  memo.delete(layer);
}

export function move(dir: Dir) {
  const list = items();
  const curId = focused.value;
  const cur = list.find((e) => e.dataset.fid === curId);
  if (!cur) return focusFirst();

  const override = handlers.get(curId!)?.nav?.[dir];
  if (override !== undefined) {
    const t = typeof override === 'function' ? override() : override;
    if (t && exists(t)) return setFocus(t);
    if (t === null) return;
  }

  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - cx;
    const dy = b.top + b.height / 2 - cy;
    const along = { left: -dx, right: dx, up: -dy, down: dy }[dir];
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 2) continue;
    if ((dir === 'left' || dir === 'right') && across > Math.max(r.height, b.height) * 0.9) continue;
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) setFocus(best.dataset.fid!);
}

export function selectFocused() {
  const id = focused.value;
  if (!id) return;
  const h = handlers.get(id);
  if (h?.select) {
    sfx('ok');
    h.select();
  }
}

/* ---------- layer key handlers ----------
 * A layer (e.g. the player) can take input before normal focus navigation.
 * Return true when the action was handled. */
type KeyHandler = (action: string) => boolean;
const layerKeys = new Map<string, KeyHandler>();

export function handleLayerKey(action: string) {
  const h = layerKeys.get(topLayer());
  return h ? h(action) : false;
}

export function useLayerKeys(layer: string, fn: KeyHandler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h: KeyHandler = (a) => ref.current(a);
    layerKeys.set(layer, h);
    return () => { if (layerKeys.get(layer) === h) layerKeys.delete(layer); };
  }, [layer]);
}

/* ---------- <F>: a focusable element ---------- */
type FProps = Omit<JSX.HTMLAttributes<HTMLElement>, 'onSelect' | 'onFocus'> & {
  id: string;
  onSelect?: () => void;
  onFocus?: () => void;
  nav?: Handler['nav'];
  isDefault?: boolean;
  as?: 'div' | 'span' | 'button';
  children?: ComponentChildren;
};

export function F({ id, onSelect, onFocus, nav, isDefault, as = 'div', class: cls, children, ...rest }: FProps) {
  const ref = useRef<Handler>({});
  ref.current.select = onSelect;
  ref.current.focus = onFocus;
  ref.current.nav = nav;
  useEffect(() => {
    const h: Handler = {
      select: () => ref.current.select?.(),
      focus: () => ref.current.focus?.(),
      get nav() { return ref.current.nav; },
    };
    handlers.set(id, h);
    return () => { if (handlers.get(id) === h) handlers.delete(id); };
  }, [id]);

  const Tag = as as any;
  return (
    <Tag
      {...rest}
      data-fid={id}
      data-fdefault={isDefault ? '' : undefined}
      class={`${cls || ''}${focused.value === id ? ' is-focus' : ''}`}
      onClick={(e: MouseEvent) => {
        const layer = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-layer]')?.dataset.layer;
        if (layer !== topLayer()) return;
        setFocus(id, true);
        if (ref.current.select) { sfx('ok'); ref.current.select(); }
      }}
    >
      {children}
    </Tag>
  );
}
