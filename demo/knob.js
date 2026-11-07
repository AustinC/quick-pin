// Quick Pin — rotary dial for the linger time.
// QuickPinKnob.create(host, { value, min, max, onChange }) → { get(), set(ms) }
(() => {
  if (globalThis.QuickPinKnob) return;

  const CSS = `
  .qp-dial {
    --surface: #ffffff; --ink: #1b1e26; --ink-soft: #6b7180; --line: #dfe2e8;
    --accent: #3b6cf6; --accent-soft: rgba(59,108,246,.14);
    display: inline-flex; flex-direction: column; align-items: center; gap: 10px;
    user-select: none; -webkit-user-select: none;
  }
  @media (prefers-color-scheme: dark) {
    .qp-dial { --surface: #181b22; --ink: #e9ebf0; --ink-soft: #8a91a1; --line: #2a2f3a; --accent: #6d93ff; --accent-soft: rgba(109,147,255,.16); }
  }
  .qp-dial .knob { width: 132px; height: 132px; cursor: ns-resize; touch-action: none; outline: none; border-radius: 50%; }
  .qp-dial .knob:focus-visible { box-shadow: 0 0 0 3px var(--accent-soft); }
  .qp-dial .track { fill: none; stroke: var(--line); stroke-width: 8; stroke-linecap: round; }
  .qp-dial .fill { fill: none; stroke: var(--accent); stroke-width: 8; stroke-linecap: round; }
  .qp-dial .cap { fill: var(--surface); stroke: var(--line); stroke-width: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,.12)); }
  .qp-dial .tick { stroke: var(--accent); stroke-width: 3; stroke-linecap: round; }
  .qp-dial .ms { font: 600 15px ui-sans-serif, system-ui, sans-serif; fill: var(--ink); font-variant-numeric: tabular-nums; }
  .qp-dial .unit { font: 500 10px ui-sans-serif, system-ui, sans-serif; fill: var(--ink-soft); letter-spacing: .08em; }
  .qp-dial .preview { width: 30px; height: 30px; opacity: 0; transition: opacity .3s; }
  .qp-dial .preview.run { opacity: 1; }
  .qp-dial .preview .bg { fill: none; stroke: var(--line); stroke-width: 3; }
  .qp-dial .preview .fg {
    fill: none; stroke: var(--accent); stroke-width: 3; stroke-linecap: round;
    stroke-dasharray: 69.1; stroke-dashoffset: 69.1;
    transform: rotate(-90deg); transform-origin: center;
  }
  .qp-dial .preview.run .fg { animation: qp-previewFill var(--linger, 600ms) linear 4; }
  @keyframes qp-previewFill { to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) { .qp-dial .preview.run .fg { animation-duration: 1ms; } }`;

  const CX = 66, CY = 66, KR = 56, A0 = -135, A1 = 135;
  const polar = a => { const r = a * Math.PI / 180; return [CX + KR * Math.sin(r), CY - KR * Math.cos(r)]; };
  const arc = (a, b) => {
    const [x0, y0] = polar(a), [x1, y1] = polar(b);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${KR} ${KR} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  function create(host, opts = {}) {
    if (!document.querySelector('style[data-quick-pin-knob]')) {
      const s = document.createElement('style');
      s.setAttribute('data-quick-pin-knob', '');
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const MIN = opts.min || 120, MAX = opts.max || 2000;
    const wrap = document.createElement('div');
    wrap.className = 'qp-dial';
    wrap.innerHTML = `
      <svg class="knob" viewBox="0 0 132 132" role="slider" tabindex="0" aria-label="Linger time"
           aria-valuemin="${MIN}" aria-valuemax="${MAX}">
        <path class="track" d="${arc(A0, A1)}"/>
        <path class="fill"/>
        <circle class="cap" cx="66" cy="66" r="38"/>
        <line class="tick" x1="66" y1="66" x2="66" y2="34"/>
        <text class="ms" x="66" y="70" text-anchor="middle"></text>
        <text class="unit" x="66" y="84" text-anchor="middle">MS</text>
      </svg>
      <svg class="preview" viewBox="0 0 30 30" aria-hidden="true">
        <circle class="bg" cx="15" cy="15" r="11"/><circle class="fg" cx="15" cy="15" r="11"/>
      </svg>`;
    host.appendChild(wrap);
    const knob = wrap.querySelector('.knob');
    const fillArc = wrap.querySelector('.fill');
    const tickEl = wrap.querySelector('.tick');
    const msText = wrap.querySelector('.ms');
    const preview = wrap.querySelector('.preview');
    // After each adjustment, demo the linger speed four times, then fade the ring out.
    preview.querySelector('.fg').addEventListener('animationend', () => preview.classList.remove('run'));
    function runPreview() {
      preview.classList.remove('run'); void preview.getBoundingClientRect(); preview.classList.add('run');
    }

    // log scale so short times get finer control
    const toT = ms => Math.log(ms / MIN) / Math.log(MAX / MIN);
    const toMs = t => MIN * Math.pow(MAX / MIN, t);
    let t = toT(Math.min(MAX, Math.max(MIN, opts.value || 600)));
    let value = 0;

    function apply(notify) {
      t = Math.max(0, Math.min(1, t));
      value = Math.round(toMs(t) / 10) * 10;
      const a = A0 + (A1 - A0) * t;
      fillArc.setAttribute('d', t > 0.002 ? arc(A0, a) : '');
      tickEl.setAttribute('transform', `rotate(${a} ${CX} ${CY})`);
      msText.textContent = value;
      knob.setAttribute('aria-valuenow', value);
      wrap.style.setProperty('--linger', value + 'ms');
      if (notify) {
        runPreview();
        if (opts.onChange) opts.onChange(value);
      }
    }
    apply(false);

    let drag = null;
    knob.addEventListener('pointerdown', e => {
      knob.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, x: e.clientX, t };
      e.preventDefault();
    });
    knob.addEventListener('pointermove', e => {
      if (!drag) return;
      t = drag.t + ((drag.y - e.clientY) + (e.clientX - drag.x)) / 240;
      apply(true);
    });
    const stop = () => { drag = null; };
    knob.addEventListener('pointerup', stop);
    knob.addEventListener('pointercancel', stop);
    knob.addEventListener('wheel', e => { e.preventDefault(); t += (e.deltaY < 0 ? 1 : -1) * 0.025; apply(true); }, { passive: false });
    knob.addEventListener('keydown', e => {
      const step = { ArrowUp: .025, ArrowRight: .025, ArrowDown: -.025, ArrowLeft: -.025, PageUp: .1, PageDown: -.1 }[e.key];
      if (step) { e.preventDefault(); t += step; apply(true); }
      if (e.key === 'Home') { t = 0; apply(true); }
      if (e.key === 'End') { t = 1; apply(true); }
    });

    return {
      get: () => value,
      set(ms) { t = toT(Math.min(MAX, Math.max(MIN, ms))); apply(false); },
    };
  }

  globalThis.QuickPinKnob = { create };
})();
