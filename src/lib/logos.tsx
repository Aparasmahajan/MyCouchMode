import { useState } from 'preact/hooks';

/** Simplified stand-in marks (viewBox 0 0 48 48), drawn white on the app colour.
 *  Swap for each service's official icon files before a public launch. */
const LOGO: Record<string, (c: string) => string> = {
  youtube: (c) => `<rect x="5" y="11" width="38" height="26" rx="8" fill="#fff"/><path d="M20.5 17.5v13l11-6.5z" fill="${c}"/>`,
  vzy: () => `<path d="M8 11h8.5L24 30.5 31.5 11H40L28.5 38h-9z" fill="#fff"/><circle cx="38" cy="36" r="3" fill="#fff" opacity=".7"/>`,
  hotstar: () => `<path d="M24 5c1.7 9.3 5.2 13.3 15 15-9.8 1.7-13.3 5.7-15 18-1.7-12.3-5.2-16.3-15-18 9.8-1.7 13.3-5.7 15-15z" fill="#fff"/><circle cx="37" cy="37" r="2.6" fill="#fff" opacity=".7"/>`,
  zee5: () => `<text x="24" y="29.5" text-anchor="middle" font-family="Sora, sans-serif" font-weight="700" font-size="14" fill="#fff" letter-spacing="-.5">ZEE5</text>`,
  sonyliv: () => `<text x="24" y="31" text-anchor="middle" font-family="Sora, sans-serif" font-weight="700" font-size="17" fill="#fff" letter-spacing="-.5">LIV</text><rect x="13" y="35" width="22" height="2.4" rx="1.2" fill="#fff" opacity=".7"/>`,
  crunchyroll: () => `<circle cx="24" cy="24" r="16" fill="none" stroke="#fff" stroke-width="3.5"/><text x="24" y="29" text-anchor="middle" font-family="Sora, sans-serif" font-weight="700" font-size="13" fill="#fff">CR</text>`,
  twitch: (c) => `<path d="M11 12 15 7h26v20l-8 8h-6l-5 5h-5v-5h-7z" fill="#fff"/><path d="M23 14v9M31 14v9" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>`,
  spotify: (c) => `<circle cx="24" cy="24" r="17" fill="#fff"/><path d="M14 19.5c7-2.4 14-1.8 20 1.5M15.5 25.5c5.5-1.8 11-1.3 15.5 1.2M17 31c4-1.2 8-.9 11.5.9" stroke="${c}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`,
};

export function Logo({ id, color }: { id: string; color: string }) {
  const draw = LOGO[id];
  return <svg viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: draw ? draw(color) : '' }} />;
}

/** Small line icons used across the TV UI and the remote. */
const ICON: Record<string, string> = {
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  sfx: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  pad: '<path d="M7 8h10a4 4 0 0 1 3.9 3.1l1 4.5a2.4 2.4 0 0 1-4.1 2.2L15.5 15h-7l-2.3 2.8a2.4 2.4 0 0 1-4.1-2.2l1-4.5A4 4 0 0 1 7 8z"/>',
  back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  menu: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  volup: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 12h6M18 9v6"/>',
  voldown: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 12h5"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  rew: '<path d="M11 19 2 12l9-7z" fill="currentColor" stroke="none"/><path d="M22 19l-9-7 9-7z" fill="currentColor" stroke="none"/>',
  ff: '<path d="m13 19 9-7-9-7z" fill="currentColor" stroke="none"/><path d="m2 19 9-7-9-7z" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  speed: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  cc: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17.5 10.2a2.2 2.2 0 1 0 0 3.6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  next: '<path d="M5 4l10 8-10 8z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
};

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON[name] || '' }} />
  );
}

/** Tile artwork for any site: built-in mark, the site's own icon, or its first letter. */
export function AppIcon({ app }: { app: { id: string; name: string; color: string; icon?: string } }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (LOGO[app.id]) return <Logo id={app.id} color={app.color} />;
  if (app.icon && broken !== app.icon) {
    return <img class="site-icon" src={app.icon} alt="" loading="lazy" referrerpolicy="no-referrer" onError={() => setBroken(app.icon!)} />;
  }
  return <svg viewBox="0 0 48 48" aria-hidden="true"><text x="24" y="32" text-anchor="middle" font-family="Sora, sans-serif" font-weight="700" font-size="24" fill="#fff">{(app.name || '?').charAt(0).toUpperCase()}</text></svg>;
}
