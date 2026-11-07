const ext = globalThis.browser || globalThis.chrome;
const DEFAULT_LINGER = 600;

const slider = document.getElementById('linger');
const out = document.getElementById('lingerOut');
const output = document.getElementById('output');
const outVal = document.getElementById('outVal');

const pad = QuickPinPad.create(document.getElementById('padHost'), {
  linger: DEFAULT_LINGER,
  onSubmit(pin) {
    outVal.textContent = pin;
    output.classList.remove('flash'); void output.offsetWidth; output.classList.add('flash');
    clearTimeout(output.t);
    output.t = setTimeout(() => output.classList.remove('flash'), 1400);
  },
});

function show(ms) {
  slider.value = ms;
  out.textContent = ms + ' ms';
  pad.setLinger(ms);
}

function save(ms) {
  show(ms);
  ext.storage.local.set({ linger: ms });
}

Promise.resolve(ext.storage.local.get('linger')).then(v => show((v && v.linger) || DEFAULT_LINGER));
slider.addEventListener('input', () => save(+slider.value));
document.getElementById('reset').addEventListener('click', () => save(DEFAULT_LINGER));
