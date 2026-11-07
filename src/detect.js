// Quick Pin — heuristics for finding OTP / PIN inputs, and for filling them.
//
// QuickPinDetect.scan({ exclude }) → { candidates, roots }
//   candidates: [{ kind: 'single' | 'split', els: [HTMLInputElement…], score }], best first
//   roots: shadow roots discovered while scanning (so the caller can observe them)
// QuickPinDetect.fill(candidate, pin) → Promise
// QuickPinDetect.rect(candidate) → DOMRect-like union of the candidate's inputs
(() => {
  if (globalThis.QuickPinDetect) return;
  const ext = globalThis.browser || globalThis.chrome;

  // camelCase / snake_case / kebab-case → space separated lower case words
  const norm = s => String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.:[\]()/#]+/g, ' ')
    .toLowerCase();

  const STRONG = /\b(otp|one ?time|onetime|pin|pin ?code|passcode|pass code|verification|verify|verif|2fa|mfa|tfa|totp|two factor|2 ?step|two step|auth code|authentication code|authenticator|security code|sms code|confirmation code|access code|login code|sign ?in code)\b/;
  const WEAK = /\b(code|token|digit|digits)\b/;
  // Card security codes look exactly like OTPs; always reject them.
  const CARD = /\b(card|cvv|cvc|csc|cvn|cc|credit|debit|expiry|exp)\b/;
  // Other "codes" and common fields — only count against a field without a strong signal.
  const NEG = /\b(zip|postal|post ?code|promo|coupon|discount|gift|voucher|country|area|phone|mobile|tel|telephone|search|captcha|referral|invite|street|address|city|amount|qty|quantity|year|month|day|age|price|email|user ?name|password|name)\b/;
  const CONTEXT = /\b(otp|one ?time|verification|verify|2fa|two factor|2 ?step|two step|authenticat\w*|passcode|security code|pin|code (we|was) sent|sent (you )?a code|enter (the )?code|digit code)\b/;

  const OK_TYPES = new Set(['', 'text', 'tel', 'number', 'password']);

  function shadowOf(n) {
    try {
      if (ext && ext.dom && ext.dom.openOrClosedShadowRoot) return ext.dom.openOrClosedShadowRoot(n); // Chrome
    } catch (e) { /* not an element */ }
    return n.openOrClosedShadowRoot || n.shadowRoot || null; // Firefox exposes closed roots to extensions
  }

  function collect(root, exclude, inputs, roots) {
    for (const i of root.querySelectorAll('input')) inputs.push(i);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n === exclude) continue;
      const sr = shadowOf(n);
      if (sr) { roots.push(sr); collect(sr, exclude, inputs, roots); }
    }
  }

  const typeOf = el => (el.getAttribute('type') || '').toLowerCase();

  function visible(el) {
    if (el.disabled || typeOf(el) === 'hidden') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    if (r.right < 0 || r.left > innerWidth + 200) return false; // parked off-screen (honeypots)
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function attrText(el) {
    return norm(['name', 'id', 'placeholder', 'aria-label', 'title', 'autocomplete', 'data-testid', 'data-test', 'class']
      .map(a => el.getAttribute(a) || '').join(' '));
  }

  function labelText(el) {
    let t = '';
    try { if (el.labels) for (const l of el.labels) t += ' ' + l.textContent; } catch (e) { /* ignore */ }
    const ids = el.getAttribute('aria-labelledby');
    if (ids) {
      const r = el.getRootNode();
      for (const id of ids.split(/\s+/)) {
        const x = r.getElementById ? r.getElementById(id) : document.getElementById(id);
        if (x) t += ' ' + x.textContent;
      }
    }
    return norm(t.slice(0, 300));
  }

  function contextText(el) {
    let n = el.parentElement;
    for (let i = 0; n && i < 6; i++, n = n.parentElement) {
      const t = (n.textContent || '').trim();
      if (t.length >= 15) return norm(t.slice(0, 500));
    }
    return '';
  }

  const numeric = el => {
    const im = (el.getAttribute('inputmode') || '').toLowerCase();
    const p = el.getAttribute('pattern') || '';
    return im === 'numeric' || im === 'decimal' || typeOf(el) === 'tel' || typeOf(el) === 'number' || /\\d|0-9/.test(p);
  };

  function scoreSingle(el) {
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (ac.startsWith('cc-')) return -99;
    const text = attrText(el) + ' ' + labelText(el);
    let s = 0;
    if (ac.includes('one-time-code')) s += 10;
    const strong = STRONG.test(text);
    if (strong) s += 6;
    else if (WEAK.test(text)) s += 3;
    if (CARD.test(text)) s -= 12;
    else if (!strong && NEG.test(text)) s -= 8;
    if (numeric(el)) s += 2;
    const ml = el.maxLength;
    if (ml >= 4 && ml <= 8) s += 2;
    else if (ml > 20) s -= 2;
    if (s > 0 && CONTEXT.test(contextText(el))) s += 2;
    return s;
  }

  function ancestors(el, depth) {
    const out = new Set();
    for (let n = el.parentElement, i = 0; n && i < depth; i++, n = n.parentElement) out.add(n);
    return out;
  }

  // Do a and b look like neighbouring boxes of one split code field?
  function neighbours(a, b) {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > ra.height / 2) return false;
    if (rb.left <= ra.left || rb.left - ra.right > ra.width * 2.5) return false;
    const aa = ancestors(a, 4);
    for (const n of ancestors(b, 4)) if (aa.has(n)) return true;
    return false;
  }

  function scan({ exclude } = {}) {
    const inputs = [], roots = [];
    collect(document, exclude, inputs, roots);
    const usable = inputs.filter(i => OK_TYPES.has(typeOf(i)) && visible(i));

    // Split boxes: runs of 4–8 one-character inputs side by side.
    const boxes = usable.filter(i => i.maxLength === 1 || (numeric(i) && i.getBoundingClientRect().width <= 64));
    const groups = [];
    let run = [];
    for (const b of boxes) {
      if (run.length && neighbours(run[run.length - 1], b)) run.push(b);
      else { if (run.length) groups.push(run); run = [b]; }
    }
    if (run.length) groups.push(run);

    const candidates = [];
    const inGroup = new Set();
    for (const g of groups) {
      if (g.length < 4 || g.length > 8) continue;
      const text = g.map(i => attrText(i) + ' ' + labelText(i)).join(' ');
      if (CARD.test(text)) continue;
      let s = 7;
      if (STRONG.test(text) || WEAK.test(text)) s += 2;
      if (g.some(i => (i.getAttribute('autocomplete') || '').includes('one-time-code'))) s += 3;
      if (CONTEXT.test(contextText(g[0]))) s += 1;
      candidates.push({ kind: 'split', els: g, score: s });
      g.forEach(i => inGroup.add(i));
    }

    for (const i of usable) {
      if (inGroup.has(i)) continue;
      const s = scoreSingle(i);
      if (s >= 6) candidates.push({ kind: 'single', els: [i], score: s });
    }

    candidates.sort((a, b) => b.score - a.score);
    return { candidates, roots };
  }

  function setValue(el, v) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    // Use the native setter so frameworks that track `value` (React, etc.) see a real change.
    desc.set.call(el, v);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: v }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function fill(c, pin) {
    if (c.kind === 'single') {
      const el = c.els[0];
      el.focus();
      setValue(el, el.maxLength > 0 ? pin.slice(0, el.maxLength) : pin);
      return;
    }
    const els = c.els;
    const want = pin.slice(0, els.length);
    els[0].focus();
    // Most split-box widgets handle a pasted code themselves; try that first.
    let handled = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', want);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
      els[0].dispatchEvent(ev);
      handled = ev.defaultPrevented;
    } catch (e) { /* ClipboardEvent init unsupported */ }
    if (handled) {
      await wait(60);
      if (els.map(e => e.value).join('') === want) return;
    }
    els.forEach((el, i) => { el.focus(); setValue(el, want[i] || ''); });
    els[Math.max(0, want.length - 1)].focus();
  }

  function rect(c) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of c.els) {
      const x = el.getBoundingClientRect();
      l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom);
    }
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
  }

  globalThis.QuickPinDetect = { scan, fill, rect, scoreSingle };
})();
