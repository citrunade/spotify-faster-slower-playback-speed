# Spotify Stretch

Chrome extension that plays the Spotify web player faster **at the original pitch** — the "sped-up edit" feel without the chipmunk voice and without the choppy sound of Chrome's own pitch keeping. Adds a bass boost and optional reverb.

How it works: the song is sped up with plain resampling (smooth, pitch goes up), the tab's sound is captured, and a music-grade pitch shifter (Signalsmith Stretch) brings the pitch back down by exactly the amount the speed raised it. Expect about 0.15 s of delay.

## Install

1. Turn off any other Spotify speed extension (they fight over the speed).
2. Open `chrome://extensions`, switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder (`C:\SpotifyStretch`).
4. Reload any Spotify tab that was already open.

## Use

1. Open https://open.spotify.com and play something.
2. Click the extension icon, press **Off** so it turns **On**.
3. Pick a speed: 0.5–2× (presets 0.75–0.9 slowed, 1.1–1.5 sped up), plus bass and reverb. Changes apply live and are remembered.
4. **Pitch**: shift up or down by up to 12 semitones (pitch stays original otherwise). **Tape mode** lets the pitch follow the speed instead: slowed sounds deeper, sped up sounds higher (classic "slowed + reverb" / nightcore). The pitch knob adds on top.
5. Press **On** again to go back to normal Spotify.

### Recently played

The web player has no track history, so the extension keeps one: every song that plays for a few seconds is added (last 200). Open it from the **Recently played** tab added next to **Queue** in Spotify's queue panel, or from the extension panel. Clicking a song starts it; you stay on the page you were on. Only songs played in the web player after installing are recorded.

While it is on, Chrome shows a "sharing this tab's audio" indicator — that is the capture. It needs to be switched on again after closing the tab or restarting Chrome.

## App window (starts by itself)

A separate window that looks like the Spotify app (no tabs, no address bar) and switches the extension on by itself, with no icon click. It uses its own Chrome profile, so you sign in to Spotify there once.

Normal Chrome only lets an extension capture a tab after you click it. The shortcut starts this profile with a Chrome switch that lifts that rule for this one extension only.

One-time setup:
1. Run `powershell -ExecutionPolicy Bypass -File setup-app-window.ps1`. It creates the **Spotify Stretch** shortcut (Desktop and Start menu) and a **Spotify Stretch - setup** shortcut.
2. Open **Spotify Stretch - setup**, go to `chrome://extensions`, turn on **Developer mode**, **Load unpacked** → `C:\SpotifyStretch`. Close that window.
3. Open **Spotify Stretch**, sign in to Spotify. To pin it, right-click the Start menu entry → Pin to taskbar.

In the player bar (next to the queue and volume buttons) there is a speed button, e.g. **1.25×**: green when on. Click it for the settings. Turning it **Off** there is remembered; turn it **On** again to resume auto-start.

The extension ID is tied to the folder path: if you move the folder, re-run the setup script with the new ID.

## Files

| File | Role |
|---|---|
| `page-rate.js` | Runs inside Spotify; forces the speed with pitch keeping off |
| `content.js` | Passes the speed from the extension to the page; speed button in the player bar |
| `history.js`, `history-render.js` | Recently played: records songs, queue-panel tab, play from history |
| `background.js` | Starts/stops capture, keeps speed and pitch shift in step |
| `offscreen.*`, `audio-chain.js` | Captured audio → pitch shift → bass → reverb → speakers |
| `popup.*` | Controls (toolbar popup, or panel inside the app window) |
| `setup-app-window.ps1` | Creates the app-window shortcuts |
| `lib/SignalsmithStretch.mjs` | Signalsmith Stretch 1.3.2 (MIT, © Geraint Luff / Signalsmith Audio), from npm `signalsmith-stretch` |
| `tests/test.html` | Self-test: serve the folder with `python -m http.server` and open `/tests/test.html` |
