const box = document.getElementById('ads');
document.getElementById('ver').textContent = 'Version ' + chrome.runtime.getManifest().version;
chrome.runtime.sendMessage({ type: 'status' }, (r) => { box.checked = !!(r && r.adblock); });
box.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'adblock', on: box.checked }, (r) => { box.checked = !!(r && r.on); });
});
