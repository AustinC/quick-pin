// Quick Pin — background.
//
// Quick Pin is off everywhere until the user clicks the toolbar button on a site. That click
// asks the browser for access to that one site; once granted, the site is remembered
// (storage.local) and a content script is registered for it, so Quick Pin runs there on every
// visit — across browser restarts — until the user clicks the button there again.
const ext = globalThis.browser || globalThis.chrome;
const FILES = ['pad.js', 'detect.js', 'content.js'];
const ID_PREFIX = 'qp-site:';

let enabled = null;           // Set of site keys, once loaded
const frames = new Map();     // tabId → Map(frameId → status) for the badge

// ---------- sites ----------
function siteOf(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol === 'http:' || u.protocol === 'https:') return { key: u.hostname, pattern: `*://${u.hostname}/*` };
  if (u.protocol === 'file:') return { key: 'file', pattern: 'file:///*' };
  return null; // browser pages, extension stores, etc.
}
const patternFor = key => (key === 'file' ? 'file:///*' : `*://${key}/*`);
const scriptFor = key => ({ id: ID_PREFIX + key, matches: [patternFor(key)], js: FILES, runAt: 'document_idle', allFrames: true });

async function saveSites() {
  await ext.storage.local.set({ sites: [...enabled].sort() });
}

// Bring registered content scripts in line with the stored sites (and still-granted permissions).
// Runs whenever the background starts, which covers browser restarts.
async function sync() {
  const { sites = [] } = await ext.storage.local.get('sites');
  const valid = [];
  for (const key of sites) {
    if (await ext.permissions.contains({ origins: [patternFor(key)] })) valid.push(key);
  }
  enabled = new Set(valid);
  if (valid.length !== sites.length) await saveSites();

  const regs = (await ext.scripting.getRegisteredContentScripts()).filter(r => r.id.startsWith(ID_PREFIX));
  const want = new Set(valid.map(k => ID_PREFIX + k));
  const stale = regs.filter(r => !want.has(r.id)).map(r => r.id);
  if (stale.length) await ext.scripting.unregisterContentScripts({ ids: stale });
  const have = new Set(regs.map(r => r.id));
  const add = valid.filter(k => !have.has(ID_PREFIX + k)).map(scriptFor);
  if (add.length) await ext.scripting.registerContentScripts(add);
}
let ready = sync().catch(e => { console.warn('Quick Pin sync:', e); enabled = enabled || new Set(); });

async function enable(site, tab) {
  enabled.add(site.key);
  await saveSites();
  try { await ext.scripting.registerContentScripts([scriptFor(site.key)]); } catch (e) { /* already registered */ }
  // Start right away on the current page too.
  try { await ext.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: FILES }); }
  catch (e) { await ext.scripting.executeScript({ target: { tabId: tab.id }, files: FILES }).catch(() => {}); }
}

async function disable(site) {
  enabled.delete(site.key);
  await saveSites();
  try { await ext.scripting.unregisterContentScripts({ ids: [ID_PREFIX + site.key] }); } catch (e) { /* not registered */ }
  // Stop it in every open tab on that site, then give the site permission back.
  const tabs = await ext.tabs.query({ url: site.pattern }).catch(() => []);
  for (const t of tabs) {
    await ext.scripting.executeScript({
      target: { tabId: t.id, allFrames: true },
      func: () => globalThis.__quickPin && globalThis.__quickPin.stop(),
    }).catch(() => {});
    frames.delete(t.id);
    paint(t.id);
  }
  await ext.permissions.remove({ origins: [site.pattern] }).catch(() => {});
}

// ---------- toolbar button ----------
ext.action.onClicked.addListener(tab => {
  const site = siteOf(tab.url || '');
  if (!site) { flash(tab.id); return; }

  if (enabled && enabled.has(site.key)) {
    disable(site).catch(e => console.warn('Quick Pin:', e));
    return;
  }
  // permissions.request must be called synchronously inside the click handler.
  // If the site turns out to be enabled already (background just woke up), the request
  // resolves immediately without a prompt and the click turns it off instead.
  let req;
  try { req = ext.permissions.request({ origins: [site.pattern] }); }
  catch (e) { flash(tab.id); return; }
  req.then(async granted => {
    await ready;
    if (enabled.has(site.key)) return disable(site);
    if (granted) return enable(site, tab);
  }).catch(e => { console.warn('Quick Pin:', e); flash(tab.id); });
});

// The user can also revoke site access from the browser's extension settings.
ext.permissions.onRemoved.addListener(() => { ready = sync().catch(() => {}); });

// ---------- badge ----------
function paint(tabId) {
  const vals = [...(frames.get(tabId) || new Map()).values()];
  let text = '', color = '#6b7180';
  if (vals.includes('found')) { text = 'ON'; color = '#1f45c8'; }
  else if (vals.includes('searching')) { text = 'ON'; }
  else if (vals.includes('unsupported')) { text = '–'; color = '#e0475b'; }
  ext.action.setBadgeText({ tabId, text });
  ext.action.setBadgeBackgroundColor({ tabId, color });
  ext.action.setTitle({ tabId, title: text === 'ON' ? 'Quick Pin is on for this site (click to turn off)' : 'Quick Pin: turn on for this site' });
}

function flash(tabId) {
  ext.action.setBadgeBackgroundColor({ tabId, color: '#e0475b' });
  ext.action.setBadgeText({ tabId, text: '!' });
  setTimeout(() => paint(tabId), 1200);
}

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
