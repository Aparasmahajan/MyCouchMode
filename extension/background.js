/* MCM Companion — background service worker.
 * Remembers which tab runs MCM and which tab runs the app MCM opened,
 * relays phone-remote commands to that app tab, and brings MCM back on Home. */

const VERSION = chrome.runtime.getManifest().version;
const TV_UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36';

// Service workers sleep; keep the tab ids in session storage.
const get = () => chrome.storage.session.get(['mcmTab', 'appTab']);
const set = (v) => chrome.storage.session.set(v);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async response
});

async function handle(msg, sender) {
  const tabId = sender.tab && sender.tab.id;
  const st = await get();

  switch (msg && msg.type) {
    case 'mcm-hello':
      await set({ mcmTab: tabId });
      return { ok: true, version: VERSION, adblock: await adblockOn() };

    case 'open': {
      // Open (or reuse) one app tab next to MCM. No pop-up blocker, unlike window.open.
      if (!/^https?:\/\//i.test(msg.url || '')) return { ok: false, error: 'bad_url' };
      let tab = null;
      if (st.appTab) {
        try { tab = await chrome.tabs.update(st.appTab, { url: msg.url, active: true }); } catch { tab = null; }
      }
      if (!tab) tab = await chrome.tabs.create({ url: msg.url, active: true, openerTabId: tabId });
      await set({ mcmTab: tabId, appTab: tab.id });
      try { await chrome.windows.update(tab.windowId, { focused: true }); } catch { /* ignore */ }
      tellMcm(st.mcmTab || tabId, { type: 'away', on: true });
      return { ok: true };
    }

    case 'cmd':
      if (!st.appTab) return { ok: false, error: 'no_app_tab' };
      try { await chrome.tabs.sendMessage(st.appTab, msg.cmd); } catch { return { ok: false, error: 'app_tab_gone' }; }
      return { ok: true };

    case 'home':
      return goHome(st, msg.close === true);

    case 'adblock': {
      if (typeof msg.on === 'boolean') {
        await chrome.declarativeNetRequest.updateEnabledRulesets(msg.on ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] });
        await chrome.storage.local.set({ cosmetic: msg.on });
      }
      return { ok: true, on: await adblockOn() };
    }

    case 'yttv-tab': {
      // Keep this tab looking like a TV for every YouTube request, not only the first page load.
      const id = 100000 + tabId;
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [id],
        addRules: [{
          id, priority: 2,
          action: { type: 'modifyHeaders', requestHeaders: [{ header: 'user-agent', operation: 'set', value: TV_UA }] },
          condition: { tabIds: [tabId], requestDomains: ['youtube.com'] },
        }],
      });
      return { ok: true };
    }

    case 'status':
      return { ok: true, version: VERSION, adblock: await adblockOn(), mcm: !!st.mcmTab, app: !!st.appTab };
  }
  return { ok: false, error: 'unknown' };
}

async function goHome(st, close) {
  if (!st.mcmTab) return { ok: false, error: 'no_mcm_tab' };
  try {
    const tab = await chrome.tabs.update(st.mcmTab, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    await set({ mcmTab: null });
    return { ok: false, error: 'mcm_tab_gone' };
  }
  if (close && st.appTab) { try { await chrome.tabs.remove(st.appTab); } catch { /* already closed */ } }
  tellMcm(st.mcmTab, { type: 'away', on: false });
  return { ok: true };
}

async function adblockOn() {
  const ids = await chrome.declarativeNetRequest.getEnabledRulesets();
  return ids.includes('ads');
}

function tellMcm(tabId, msg) {
  if (tabId) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

// Keep MCM's "away" state right when the user switches tabs by hand.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const st = await get();
  if (!st.mcmTab) return;
  if (tabId === st.mcmTab) tellMcm(st.mcmTab, { type: 'away', on: false });
  else if (tabId === st.appTab) tellMcm(st.mcmTab, { type: 'away', on: true });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [100000 + tabId] }).catch(() => {});
  const st = await get();
  if (tabId === st.appTab) { await set({ appTab: null }); tellMcm(st.mcmTab, { type: 'away', on: false }); }
  if (tabId === st.mcmTab) await set({ mcmTab: null });
});
