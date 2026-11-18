import { render } from 'preact';

const root = document.getElementById('app')!;

// The TV, the phone remote and the admin page are separate bundles, so a phone never downloads the TV UI (and vice versa).
if (location.pathname.startsWith('/remote')) {
  import('./remote/Remote').then(({ RemoteApp }) => render(<RemoteApp />, root));
} else if (location.pathname.startsWith('/admin')) {
  document.title = 'MCM Admin';
  import('./admin/Admin').then(({ AdminApp }) => render(<AdminApp />, root));
} else {
  import('./tv/App').then(({ TvApp }) => render(<TvApp />, root));
}
