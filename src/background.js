// Quick Pin — background. Nothing runs on any page until the user clicks the toolbar
// button (or presses the shortcut). That click grants temporary access to the current tab
// only (activeTab), and we inject the content script into it. Clicking again turns it off.
const ext = globalThis.browser || globalThis.chrome;
const FILES = ['pad.js', 'detect.js', 'content.js'];
const frames = new Map(); // tabId → Map(frameId → status)

async function run(tabId, details) {
  try {
    return await ext.scripting.executeScript({ target: { tabId, allFrames: true }, ...details });
  } catch (e) {
    // Some frames may be off-limits; fall back to the top frame alone.
    return await ext.scripting.executeScript({ target: { tabId }, ...details });
  }
}

async function toggle(tab) {
  let probe;
  try {
    probe = await run(tab.id, { func: () => (globalThis.__quickPin ? globalThis.__quickPin.toggle() : 'absent') });
  } catch (e) {
    flash(tab.id); // restricted page (browser settings, extension stores, …)
    return;
  }
  const top = probe.find(r => r.frameId === 0) || probe[0];
  if (top && top.result === 'absent') await run(tab.id, { files: FILES });
}

function paint(tabId) {
  const vals = [...(frames.get(tabId) || new Map()).values()];
  let text = '', color = '#6b7180';
  if (vals.includes('found')) { text = 'ON'; color = '#1f45c8'; }
  else if (vals.includes('searching')) { text = 'ON'; }
  else if (vals.includes('unsupported')) { text = '–'; color = '#e0475b'; }
  ext.action.setBadgeText({ tabId, text });
  ext.action.setBadgeBackgroundColor({ tabId, color });
}

function flash(tabId) {
  ext.action.setBadgeBackgroundColor({ tabId, color: '#e0475b' });
  ext.action.setBadgeText({ tabId, text: '!' });
  setTimeout(() => paint(tabId), 1200);
}

ext.action.onClicked.addListener(tab => { toggle(tab).catch(e => console.warn('Quick Pin:', e)); });

ext.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.qp !== 'status' || !sender.tab) return;
  const t = sender.tab.id;
  if (!frames.has(t)) frames.set(t, new Map());
  frames.get(t).set(sender.frameId || 0, msg.status);
  paint(t);
});

ext.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') { frames.delete(tabId); paint(tabId); }
});
ext.tabs.onRemoved.addListener(tabId => frames.delete(tabId));
