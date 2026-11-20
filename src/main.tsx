import { render } from 'preact';

const root = document.getElementById('app')!;

// After a new deploy, the offline copy (service worker) updates in the background and takes over.
// Reload once when that happens so the TV never keeps showing the old version.
// (Skipped on the very first visit, when there was no older version to replace.)
if ('serviceWorker' in navigator) {
  const hadOldVersion = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadOldVersion || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// The TV, the phone remote and the admin page are separate bundles, so a phone never downloads the TV UI (and vice versa).
if (location.pathname.startsWith('/remote')) {
  import('./remote/Remote').then(({ RemoteApp }) => render(<RemoteApp />, root));
} else if (location.pathname.startsWith('/admin')) {
  document.title = 'MCM Admin';
  import('./admin/Admin').then(({ AdminApp }) => render(<AdminApp />, root));
} else {
  import('./tv/App').then(({ TvApp }) => render(<TvApp />, root));
}
