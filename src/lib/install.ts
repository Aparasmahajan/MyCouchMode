import { signal } from '@preact/signals';

/**
 * "Install MCM as an app". Browsers let installed apps play video with sound without a click first,
 * so videos sent from the phone start with sound. The browser decides when installing is offered.
 */
let deferred: any = null;
export const canInstall = signal(false);
export const installed = signal(typeof matchMedia !== 'undefined' && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    canInstall.value = true;
  });
  window.addEventListener('appinstalled', () => { canInstall.value = false; installed.value = true; deferred = null; });
}

/** Must run from a key press or click on the TV (browsers refuse otherwise). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  try {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') { canInstall.value = false; deferred = null; }
    return outcome;
  } catch {
    return 'unavailable';
  }
}
