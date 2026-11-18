const box = document.getElementById('ads');
document.getElementById('ver').textContent = 'Version ' + chrome.runtime.getManifest().version;
chrome.runtime.sendMessage({ type: 'status' }, (r) => { box.checked = !!(r && r.adblock); });
box.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'adblock', on: box.checked }, (r) => { box.checked = !!(r && r.on); });
});

const yt = document.getElementById('yttv');
chrome.storage.local.get('yttvPad').then(({ yttvPad }) => { yt.checked = yttvPad !== false; });
yt.addEventListener('change', () => chrome.storage.local.set({ yttvPad: yt.checked }));
