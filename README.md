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
3. Pick a speed (slider or 1.1 / 1.2 / 1.25 / 1.3 / 1.5), bass and reverb. Changes apply live and are remembered.
4. Press **On** again to go back to normal Spotify.

While it is on, Chrome shows a "sharing this tab's audio" indicator — that is the capture. It needs to be switched on again after closing the tab or restarting Chrome.

## Files

| File | Role |
|---|---|
| `page-rate.js` | Runs inside Spotify; forces the speed with pitch keeping off |
| `content.js` | Passes the speed from the extension to the page |
| `background.js` | Starts/stops capture, keeps speed and pitch shift in step |
| `offscreen.*`, `audio-chain.js` | Captured audio → pitch shift → bass → reverb → speakers |
| `popup.*` | Controls |
| `lib/SignalsmithStretch.mjs` | Signalsmith Stretch 1.3.2 (MIT, © Geraint Luff / Signalsmith Audio), from npm `signalsmith-stretch` |
| `tests/test.html` | Self-test: serve the folder with `python -m http.server` and open `/tests/test.html` |
