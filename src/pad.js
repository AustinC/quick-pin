// Quick Pin — hover-to-enter dial pad.
// QuickPinPad.create(host, { linger, compact, onSubmit, onCancel }) builds a pad inside `host`
// (which may live in a shadow root) and returns a small controller.
(() => {
  if (globalThis.QuickPinPad) return;

  const CSS = `
  .qp {
    --surface: #ffffff;
    --surface-2: #eef0f4;
    --ink: #1b1e26;
    --ink-soft: #6b7180;
    --line: #dfe2e8;
    --accent: #3b6cf6;
    --ok: #1f9d6b;
    --danger: #e0475b;
    --danger-soft: rgba(224,71,91,.12);
    --hit: #1f45c8;
    --hit-ink: #1f45c8;
    --shadow: 0 1px 2px rgba(20,24,40,.06), 0 12px 32px rgba(20,24,40,.10);
    --key: 76px;
    --gap: 20px;
    --digit-size: 32px;
    --entry-size: 28px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--ink);
    user-select: none; -webkit-user-select: none;
    display: inline-block;
    line-height: normal;
  }
  @media (prefers-color-scheme: dark) {
    .qp {
      --surface: #181b22;
      --surface-2: #20242d;
      --ink: #e9ebf0;
      --ink-soft: #8a91a1;
      --line: #2a2f3a;
      --accent: #6d93ff;
      --ok: #3ccf91;
      --danger: #ff6377;
      --danger-soft: rgba(255,99,119,.14);
      --hit: #3a5fd6;
      --hit-ink: #4c70e8;
      --shadow: 0 1px 2px rgba(0,0,0,.4), 0 16px 40px rgba(0,0,0,.45);
    }
  }
  .qp, .qp * { box-sizing: border-box; }
  .qp.qp-compact { --key: 56px; --gap: 13px; --digit-size: 26px; --entry-size: 23px; }

  /* live entry */
  .qp .dots { position: relative; height: 40px; margin: -8px 0 18px; display: flex; gap: 6px; align-items: center; justify-content: center; }
  .qp.qp-compact .dots { height: 30px; margin: -4px 0 12px; gap: 4px; }
  .qp .dot {
    display: inline-block; min-width: 1ch; text-align: center;
    font-size: var(--entry-size); font-weight: 500; font-variant-numeric: tabular-nums; line-height: 1;
    color: var(--hit-ink);
    animation: qp-dotIn .38s cubic-bezier(.2,.9,.3,1.5) both;
  }
  .qp .dots.idle::before {
    content: ""; position: absolute; left: 50%; top: 50%; width: 36px; height: 2px; margin: -1px 0 0 -18px;
    border-radius: 2px; background: var(--line);
  }
  .qp .dot.up   { animation: qp-dotUp .42s cubic-bezier(.5,0,.8,.4) forwards; animation-delay: calc(var(--i) * 30ms); color: var(--ok); }
  .qp .dot.down { animation: qp-dotDown .45s cubic-bezier(.5,0,.8,.4) forwards; animation-delay: calc(var(--i) * 30ms); color: var(--danger); }
  .qp .dot.gone { animation: qp-dotOut .22s ease-in forwards; }
  @keyframes qp-dotIn { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); } }
  @keyframes qp-dotUp { to { transform: translateY(-46px) scale(.6); opacity: 0; } }
  @keyframes qp-dotDown { to { transform: translateY(40px) scale(.5); opacity: 0; } }
  @keyframes qp-dotOut { to { transform: scale(0); opacity: 0; } }

  /* pad */
  .qp .pad {
    position: relative;
    padding: 26px 26px 58px;
    border-radius: 24px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    touch-action: none;
  }
  .qp.qp-compact .pad { padding: 18px 18px 46px; border-radius: 20px; }
  .qp .pad::before { /* top/left/right glow: leaving through them submits */
    content: ""; position: absolute; inset: -1px; border-radius: inherit; pointer-events: none;
    border: 2px solid var(--accent); border-bottom-color: transparent;
    opacity: 0; transition: opacity .3s;
    -webkit-mask: linear-gradient(#000 70%, transparent 92%); mask: linear-gradient(#000 70%, transparent 92%);
  }
  .qp .pad.active::before { opacity: .55; }
  .qp .pad.armed::before { opacity: 1; }

  .qp .grid {
    display: grid;
    grid-template-columns: repeat(3, var(--key));
    grid-auto-rows: var(--key);
    gap: var(--gap);
  }
  .qp .key {
    position: relative; width: var(--key); height: var(--key); border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface-2);
    font-size: var(--digit-size); font-weight: 300; font-variant-numeric: tabular-nums;
    color: var(--ink);
    transition: background .2s, color .2s;
  }
  .qp .key.fn { background: transparent; color: var(--ink-soft); }
  .qp .key.fn svg.icon { width: 30px; height: 30px; }
  .qp.qp-compact .key.fn svg.icon { width: 24px; height: 24px; }
  /* --c goes 0 → 1 as linger approaches registration: resting grey → blue */
  .qp .pad.active .key.hover { background: color-mix(in srgb, var(--hit) calc(var(--c, 0) * 20%), var(--surface-2)); transition: color .2s; }
  .qp .key svg.ring { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); transform: rotate(-90deg); pointer-events: none; }
  .qp .key svg.ring circle { fill: none; stroke: color-mix(in srgb, var(--hit) calc(var(--c, 0) * 100%), var(--surface-2)); stroke-width: 3; stroke-linecap: round; }
  .qp .key span, .qp .key svg.icon { position: relative; }
  .qp .key.hit { animation: qp-hit .36s ease-out; }
  .qp .key.hit span, .qp .key.hit svg.icon { animation: qp-hitDigit .42s ease-out; }
  .qp .key::after { /* ripple */
    content: ""; position: absolute; inset: 0; border-radius: 50%;
    border: 2px solid var(--hit); opacity: 0; pointer-events: none;
  }
  .qp .key.hit::after { animation: qp-ripple .55s ease-out; }
  @keyframes qp-hit { 0% { transform: scale(1); } 30% { transform: scale(.96); } 100% { transform: scale(1); } }
  @keyframes qp-hitDigit { 30% { color: var(--hit-ink); } }
  @keyframes qp-ripple { 0% { opacity: .35; transform: scale(1); } 100% { opacity: 0; transform: scale(1.22); } }

  /* cancel edge */
  .qp .cancel {
    position: absolute; left: 0; right: 0; bottom: 0; height: 44px;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
    border-radius: 0 0 24px 24px;
    background: linear-gradient(to bottom, transparent, var(--danger-soft));
    opacity: .35; transition: opacity .3s;
  }
  .qp.qp-compact .cancel { height: 36px; border-radius: 0 0 20px 20px; }
  .qp .cancel::after {
    content: ""; position: absolute; left: 22px; right: 22px; bottom: 0; height: 3px; border-radius: 3px 3px 0 0;
    background: var(--danger);
  }
  .qp .cancel svg { width: 26px; height: 26px; color: var(--danger); }
  .qp.qp-compact .cancel svg { width: 20px; height: 20px; }
  .qp .pad.armed .cancel { opacity: 1; }
  .qp .pad.armed .cancel svg { animation: qp-nudge 1.6s ease-in-out infinite; }
  @keyframes qp-nudge { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
  .qp .pad.cancelled { animation: qp-shake .28s ease-in-out; }
  @keyframes qp-shake { 35% { transform: translateX(-3px); } 70% { transform: translateX(2px); } }

  @media (prefers-reduced-motion: reduce) {
    .qp .pad.armed .cancel svg { animation: none; }
  }`;

  const R = 47, CIRC = 2 * Math.PI * R;
  const MAX_LEN = 12;
  const RING_DELAY_FRAC = 0.4, RING_DELAY_MAX = 260; // ms
  const ICON = p => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const FACE = {
    del: ICON('<path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>'),
  };
  const CANCEL_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5l8 8M16 5l-8 8"/><path d="M7 19l5 3 5-3"/></svg>`;

  function ensureStyle(root) {
    // Shadow roots (nodeType 11) get their own copy; documents get one in <head>.
    const target = root && root.nodeType === 11 ? root : document.head || document.documentElement;
    if (target.querySelector(':scope > style[data-quick-pin]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-quick-pin', '');
    s.textContent = CSS;
    target.appendChild(s);
  }

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function create(host, opts = {}) {
    const root = host.getRootNode();
    ensureStyle(root);
    const hitRoot = root && typeof root.elementFromPoint === 'function' ? root : document;

    let linger = opts.linger || 600;
    const wrap = el('div', 'qp' + (opts.compact ? ' qp-compact' : ''));
    const pad = el('div', 'pad');
    const dotsEl = el('div', 'dots idle');
    const grid = el('div', 'grid');
    const cancel = el('div', 'cancel');
    cancel.setAttribute('aria-hidden', 'true');
    cancel.innerHTML = CANCEL_SVG;
    pad.append(dotsEl, grid, cancel);
    wrap.appendChild(pad);

    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0'].forEach(d => {
      const k = el('div', 'key' + (FACE[d] ? ' fn ' + d : ''));
      k.dataset.d = d;
      k.innerHTML = `<svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}"
        stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg>${FACE[d] || `<span>${d}</span>`}`;
      k.ring = k.querySelector('circle');
      grid.appendChild(k);
    });
    host.appendChild(wrap);

    let active = false, entry = [], hoverKey = null, hoverStart = 0, repeating = false, raf = 0;

    // p: ring fill (0–1). f: fraction of the linger window elapsed (0–1).
    function setProgress(k, p, f = 0) {
      p = Math.max(0, Math.min(1, p));
      k.ring.style.strokeDashoffset = CIRC * (1 - p);
      // Colour holds at resting grey for the first half, then accelerates to blue.
      // Once a digit has registered, stay fully filled while the pointer remains.
      const u = repeating && k === hoverKey ? 1 : Math.max(0, (f - 0.5) / 0.5);
      k.style.setProperty('--c', (u * u).toFixed(3));
    }
    function setHover(k, now) {
      if (hoverKey === k) return;
      repeating = false;
      if (hoverKey) { hoverKey.classList.remove('hover'); setProgress(hoverKey, 0); }
      hoverKey = k;
      hoverStart = now;
      if (k) k.classList.add('hover');
    }
    const keyAt = (x, y) => {
      const t = hitRoot.elementFromPoint(x, y);
      return t && pad.contains(t) ? t.closest('.key') : null;
    };

    const liveDots = () => [...dotsEl.querySelectorAll('.dot:not(.up):not(.down):not(.gone)')];
    const renderDots = () => dotsEl.classList.toggle('idle', entry.length === 0);
    function retire(nodes, cls) {
      nodes.forEach((n, i) => {
        n.style.setProperty('--i', i);
        n.classList.add(cls);
        n.addEventListener('animationend', () => n.remove(), { once: true });
      });
    }
    function shake() {
      pad.classList.remove('cancelled'); void pad.offsetWidth; pad.classList.add('cancelled');
    }

    function register(k) {
      const d = k.dataset.d;
      if (d === 'del') {
        if (!entry.length) return;
        entry.pop();
        retire(liveDots().slice(-1), 'gone');
      } else {
        if (entry.length >= MAX_LEN) return;
        entry.push(d);
        const dot = el('span', 'dot');
        dot.textContent = d;
        dotsEl.appendChild(dot);
      }
      k.classList.remove('hit'); void k.offsetWidth; k.classList.add('hit');
      renderDots();
      pad.classList.toggle('armed', entry.length > 0);
    }

    function tick(now) {
      raf = 0;
      if (!active) return;
      if (hoverKey) {
        const elapsed = now - hoverStart;
        if (elapsed >= linger) {
          register(hoverKey);
          hoverStart = now;   // keep lingering → same digit registers again
          repeating = true;   // repeats show the ring right away
          setProgress(hoverKey, 0);
        } else {
          // On first contact the ring stays hidden for a beat, then fills over the
          // remaining time — registration still happens exactly at `linger`.
          const delay = repeating ? 0 : Math.min(RING_DELAY_MAX, linger * RING_DELAY_FRAC);
          setProgress(hoverKey, (elapsed - delay) / (linger - delay), elapsed / linger);
        }
      }
      raf = requestAnimationFrame(tick);
    }

    function begin(e) {
      active = true;
      entry = [];
      dotsEl.textContent = '';
      renderDots();
      pad.classList.add('active');
      pad.classList.remove('armed', 'cancelled');
      setHover(keyAt(e.clientX, e.clientY), performance.now());
      if (!raf) raf = requestAnimationFrame(tick);
      opts.onBegin && opts.onBegin();
    }

    function end(submit) {
      if (!active) return;
      active = false;
      setHover(null);
      pad.classList.remove('active', 'armed');
      const pin = entry.join('');
      entry = [];
      if (!pin) return;
      if (submit) {
        retire(liveDots(), 'up');
        opts.onSubmit && opts.onSubmit(pin);
      } else {
        retire(liveDots(), 'down');
        shake();
        opts.onCancel && opts.onCancel();
      }
      renderDots();
    }

    const onEnter = e => begin(e);
    const onMove = e => { if (active) setHover(keyAt(e.clientX, e.clientY), performance.now()); };
    const onLeave = e => {
      const r = pad.getBoundingClientRect();
      // Signed distance to each edge (negative = outside it); the smallest is the exit edge.
      const d = { top: e.clientY - r.top, bottom: r.bottom - e.clientY, left: e.clientX - r.left, right: r.right - e.clientX };
      const edge = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
      end(edge !== 'bottom');
    };
    const onHidden = () => { if (document.hidden) end(false); };
    pad.addEventListener('pointerenter', onEnter);
    pad.addEventListener('pointermove', onMove);
    pad.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onHidden);

    return {
      el: wrap,
      isActive: () => active,
      setLinger(ms) { linger = ms; },
      abort() { end(false); },
      destroy() {
        active = false;
        if (raf) cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onHidden);
        wrap.remove();
      },
    };
  }

  globalThis.QuickPinPad = { create, MAX_LEN };
})();
