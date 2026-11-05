# YouTube Faster / Slower Control

(Not affiliated with or endorsed by YouTube or Google.)

Chrome extension that plays YouTube faster or slower **at the original pitch**, without the choppy sound of the built-in speed setting. It uses the same sound engine as the Spotify version in the folder above: the video is sped up by plain resampling (smooth, pitch goes up), the tab's sound is captured, and a music-grade pitch shifter (Signalsmith Stretch) brings the pitch back down.

The pitch shifter needs about 0.15 s, so the sound runs slightly behind. To keep lips in sync, the **picture is held back by the same amount**: the real video keeps playing invisibly and a canvas on top shows each frame that much later.

## Install (for testing)

1. Open `chrome://extensions`, switch on **Developer mode**.
2. **Load unpacked** → pick this `youtube` folder.
3. Reload any YouTube tab that was already open.

## Use

1. Open a YouTube video, click the extension icon, press **Off** so it turns **On**.
2. Pick a speed (0.5–2×). Pitch, tape mode, bass, drum tail and reverb work as in the Spotify version; in tape mode the pitch slider is greyed out.
3. **Keep picture in sync** is on by default. If lips look early or late, use **Fine-tune** (±150 ms).
4. Ads play at normal speed without pitch correction; the chosen speed comes back after the ad.
5. Press **On** again to go back to normal YouTube.

## Limits

- Live streams can't run ahead of real time; sped-up playback there keeps catching up and stalling.
- Comments, captions and the player controls are not delayed; only the video picture is.

## Files

| File | Role |
|---|---|
| `page-rate.js` | Runs inside YouTube; forces the speed with pitch keeping off |
| `picture-delay.js` | Shows the video picture held back to match the sound |
| `content.js` | Passes speed and delay from the extension to the page; reports ads |
| `service-worker.js` | Starts/stops capture, keeps speed, picture delay and pitch shift in step |
| `offscreen.*`, `audio-chain.js`, `drum-tail-worklet.js`, `lib/` | Sound engine (copies of the Spotify version's files) |
| `popup.*` | Controls |
| `store/` | Chrome Web Store listing text, privacy policy, screenshot |
| `build-store.ps1` | Builds the zip to upload (`dist/`) |
