// Quick Pin — content script. Runs only on sites the user has turned Quick Pin on for
// (by clicking the toolbar button there). The background script registers it for those
// sites and calls __quickPin.stop() when a site is turned off.
(() => {
  if (globalThis.__quickPin) return globalThis.__quickPin.status();

  const ext = globalThis.browser || globalThis.chrome;
  const Pad = globalThis.QuickPinPad, Detect = globalThis.QuickPinDetect;

  // The widget is driven by hovering, so it needs a mouse: desktop only.
  const desktop =
    matchMedia('(any-hover: hover) and (any-pointer: fine)').matches &&
    !(navigator.userAgentData && navigator.userAgentData.mobile) &&
    !/Android|Mobi|iPhone|iPad/i.test(navigator.userAgent);

  const HOST_CSS = `
    :host { all: initial; }
    .float {
      position: fixed; top: 0; left: 0;
      opacity: 0; pointer-events: none;
      transition: opacity .18s ease;
      will-change: transform;
    }
    .float.show { opacity: 1; pointer-events: auto; }`;

  let on = false, status = 'off', lastReport = 0;
  let host, shadow, floatEl, pad, target = null;
  let observer, scanTimer = 0, posRaf = 0, filling = false, linger = 600;
  const observed = new WeakSet();
  const dismissed = new WeakSet(); // first input of candidates the user has finished with

  function report(s, force) {
    const now = Date.now();
    if (s === status && !(force && now - lastReport > 1500)) return;
    status = s;
    lastReport = now;
    try {
      const p = ext.runtime.sendMessage({ qp: 'status', status: s });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* extension reloaded */ }
  }

  // ---------- scanning ----------
  function scanSoon(delay = 400) {
    if (!on || scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, delay);
  }

  function deepActive() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }

  const sameCand = (a, b) => a && b && a.els.length === b.els.length && a.els.every((e, i) => e === b.els[i]);

  function scan() {
    if (!on) return;
    const { candidates, roots } = Detect.scan({ exclude: host });
    for (const r of roots) observe(r);
    const focused = deepActive();
    const pick =
      candidates.find(c => c.els.includes(focused)) ||
      candidates.find(c => sameCand(c, target)) ||
      candidates[0] || null;
    setTarget(pick);
    report(pick ? 'found' : 'searching', true);
  }

  function observe(root) {
    if (observed.has(root)) return;
    observed.add(root);
    observer.observe(root, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['type', 'autocomplete', 'inputmode', 'maxlength', 'name', 'id', 'style', 'class', 'hidden', 'disabled'],
    });
  }

  // Ignore mutations caused by our own overlay host.
  const ours = r => r.target === host ||
    (r.type === 'childList' && r.addedNodes.length + r.removedNodes.length > 0 &&
     [...r.addedNodes, ...r.removedNodes].every(n => n === host));

  function onMutations(records) {
    if (records.every(ours)) return;
    scanSoon();
  }

  // ---------- showing / positioning ----------
  function setTarget(c) {
    if (sameCand(c, target)) { target = c; return; }
    if (pad && pad.isActive()) return; // never yank the pad away mid-entry
    target = c;
    if (c && !dismissed.has(c.els[0])) show(); else hide();
  }

  function show() {
    floatEl.classList.add('show');
    position(true);
    if (!posRaf) posRaf = requestAnimationFrame(loop);
  }

  function hide() {
    floatEl.classList.remove('show');
    if (posRaf) { cancelAnimationFrame(posRaf); posRaf = 0; }
  }

  function loop() {
    posRaf = 0;
    if (!on || !target) return;
    if (!target.els.every(e => e.isConnected)) { target = null; hide(); scanSoon(0); return; }
    position(false);
    posRaf = requestAnimationFrame(loop);
  }

  let lastPos = '';
  function position(force) {
    if (!target || (!force && pad.isActive())) return; // don't move under the pointer
    const r = Detect.rect(target);
    const w = floatEl.offsetWidth, h = floatEl.offsetHeight, m = 16;
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    let x, y;
    if (r.right + m + w <= vw - 8) x = r.right + m;                 // right of the field
    else if (r.left - m - w >= 8) x = r.left - m - w;               // left of it
    else x = Math.min(vw - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    if (x === r.right + m || x === r.left - m - w) y = r.top + r.height / 2 - h / 2;
    else y = r.bottom + 12 + h <= vh - 8 ? r.bottom + 12 : r.top - 12 - h; // below, else above
    y = Math.min(vh - h - 8, Math.max(8, y));
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (key !== lastPos) {
      lastPos = key;
      floatEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  // ---------- events ----------
  async function onSubmit(pin) {
    const c = target;
    if (!c) return;
    filling = true;
    try { await Detect.fill(c, pin); } finally {
      dismissed.add(c.els[0]);
      setTimeout(() => { filling = false; }, 150);
      setTimeout(() => { if (target === c) hide(); }, 420);
    }
  }

  function onFocus(e) {
    if (filling) return;
    const el = e.composedPath()[0];
    if (target && target.els.includes(el) && dismissed.has(target.els[0])) {
      dismissed.delete(target.els[0]);
      show();
    }
    scanSoon(50);
  }

  function onKey(e) {
    if (e.key === 'Escape' && target && floatEl.classList.contains('show')) {
      if (pad.isActive()) pad.abort();
      dismissed.add(target.els[0]);
      hide();
    }
  }

  function onStorage(changes, area) {
    if (area === 'local' && changes.linger && changes.linger.newValue) {
      linger = changes.linger.newValue;
      pad && pad.setLinger(linger);
    }
  }

  // ---------- on / off ----------
  function activate() {
    if (!desktop) { report('unsupported'); return status; }
    on = true;

    host = document.createElement('quick-pin-overlay');
    host.style.cssText = 'all:initial; position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'closed' });
    const st = document.createElement('style');
    st.textContent = HOST_CSS;
    floatEl = document.createElement('div');
    floatEl.className = 'float';
    shadow.append(st, floatEl);
    (document.body || document.documentElement).appendChild(host);
    pad = Pad.create(floatEl, { compact: true, linger, onSubmit });

    try {
      const p = ext.storage.local.get('linger');
      const apply = v => { if (v && v.linger) { linger = v.linger; pad && pad.setLinger(linger); } };
      if (p && p.then) p.then(apply, () => {}); else ext.storage.local.get('linger', apply);
      ext.storage.onChanged.addListener(onStorage);
    } catch (e) { /* storage unavailable */ }

    observer = new MutationObserver(onMutations);
    observe(document.documentElement);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('keydown', onKey, true);
    scan();
    return status;
  }

  function deactivate() {
    on = false;
    clearTimeout(scanTimer); scanTimer = 0;
    hide();
    observer && observer.disconnect();
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('keydown', onKey, true);
    try { ext.storage.onChanged.removeListener(onStorage); } catch (e) { /* ignore */ }
    pad && pad.destroy();
    host && host.remove();
    host = shadow = floatEl = pad = target = null;
    report('off');
    delete globalThis.__quickPin;
    return 'off';
  }

  globalThis.__quickPin = {
    stop: () => (on ? deactivate() : status),
    status: () => status,
  };
  return activate();
})();
