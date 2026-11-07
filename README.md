# Quick Pin

Enter PINs and one-time codes **without clicking or typing**: hover over the digits of a dial pad to enter the PIN.

- Move the pointer into the pad, then rest on a key. After the *linger time* (600 ms by default)
  the digit registers. Keep resting on the key to enter the same digit again.
- Leave the pad through the **top, left or right** edge to submit the code.
  Leave through the **bottom** edge (the red ✕ strip) to cancel.

It ships as a browser extension for Chrome and Firefox (desktop only), plus a standalone demo page.

## Demo:

I am not clicking in this demo, just hovering.

<img width="1265" height="1010" alt="Peek 2026-11-06 20-11" src="https://github.com/user-attachments/assets/a6938474-dba4-4a61-8b1e-96af45916c49" />



## How the extension behaves

- **Off by default, on per page.** Nothing runs on any site until you click the Quick Pin toolbar
  button (or press **Alt+Shift+P**) on that tab. That grants temporary access to the current page
  only (`activeTab`). Click again to turn it off. Reloading or navigating away turns it off.
- Once on, it looks for one-time-code / PIN fields and shows the pad next to the best match. It
  keeps watching the page, so codes requested later in a single-page app are picked up too.
- The badge shows the state: grey **ON** = looking, blue **ON** = field found,
  red **–** = not supported on this device (no mouse), **!** = the browser doesn't allow
  extensions on this page.
- Submitting fills the field (or every box of a split code field) and hides the pad. Focus the
  field again to bring the pad back. **Esc** hides it.
- **Desktop only.** The pad is driven by hovering, so it won't start without a mouse or trackpad.
  The Firefox build doesn't declare Android support.
- **Preferences:** the linger time is set on the extension's options page (default 600 ms), which
  also has a pad to try it out.
  Chrome: right-click the toolbar icon → *Options*. Firefox: `about:addons` → Quick Pin → *Preferences*.
- No network access and no data collection. The only stored value is your linger time.

### What counts as a code field

A field is scored on several signals:

- `autocomplete="one-time-code"` (the standard hint, the strongest signal)
- a run of 4–8 side-by-side, one-character inputs (split "boxes")
- `name`/`id`/`placeholder`/`aria-label`/label text such as *otp, one-time, PIN, passcode,
  verification, 2FA, security code, authenticator…*
- numeric hints (`inputmode="numeric"`, `type="tel"`, digit `pattern`) and a `maxlength` of 4–8
- surrounding text like "enter the code we sent you"

Look-alikes are rejected: card security codes (`cc-*`, CVV/CVC), zip/postal, promo/coupon,
phone, email and ordinary password fields. Fields inside shadow DOM (open or closed) are searched, as are
iframes the browser lets the extension into (usually same-site ones).

Filling uses the native value setter plus `input`/`change` events, so React/Vue/Angular forms see
the change. Split boxes get a synthetic paste first (most widgets handle that), then each box is
filled individually as a fallback.

## Install locally (unsigned)

Get the extension files either way:

- **Download:** grab `quick-pin-chrome-*.zip` / `quick-pin-firefox-*.zip` from the
  [Releases](../../releases) page and unzip the Chrome one into a folder.
- **Build from source:** `./build.sh` (needs `bash` and `zip`). It produces `dist/chrome/`,
  `dist/firefox/` and a zip of each.

### Chrome / Chromium / Edge / Brave

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist/chrome` folder (or the unzipped Chrome download).
4. Optional: pin Quick Pin to the toolbar from the puzzle-piece menu.

It stays installed across restarts. To update, replace the folder and click the reload ↻ icon on
the extension's card. Change the shortcut at `chrome://extensions/shortcuts`.

### Firefox

Release builds of Firefox only install **signed** add-ons permanently, so there are two options.

**Temporary (any Firefox, removed when Firefox quits):**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `dist/firefox/manifest.json`
   (or the `quick-pin-firefox-*.zip` file directly).

**Permanent (Firefox Developer Edition, Nightly, ESR or unbranded builds only):**

1. Open `about:config` and set `xpinstall.signatures.required` to `false`.
2. Open `about:addons`, click the ⚙ gear → **Install Add-on From File…**, and choose
   `quick-pin-firefox-*.zip`. Renaming it to `.xpi` first also works.

Requires Firefox 121 or newer. Change the shortcut in `about:addons` → ⚙ → *Manage Extension Shortcuts*.

## Try it without installing

- `demo/index.html`: the pad on its own with a linger-time dial. Open it straight from disk.
- `demo/otp-test.html`: a page with several kinds of code fields and some look-alikes, for trying
  the extension's detection. It includes a field that appears after 3 seconds.

## Layout

```
src/            extension source (shared by both browsers)
  pad.js          the dial pad widget
  detect.js       code-field heuristics + filling
  content.js      injected on demand: finds fields, positions the pad
  background.js   toolbar button / shortcut → inject or toggle off
  options.*       preferences page (linger time + test pad)
manifests/      chrome.json and firefox.json (MV3)
icons/          toolbar/store icons (icon.svg is the source)
demo/           standalone demo and detection test page
build.sh        assembles dist/chrome and dist/firefox
```
