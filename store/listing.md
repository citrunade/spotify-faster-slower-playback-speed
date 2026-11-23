# Chrome Web Store listing

Copy these into the Developer Dashboard (https://chrome.google.com/webstore/devconsole).

## Store listing tab

**Name** (from the manifest): Spotify Faster / Slower Control + Recently Played

**Summary** (from the manifest, 132 characters max):
Speed up or slow down the Spotify web player at the original pitch, plus a Recently played list. Not affiliated with Spotify.

**Category**: Entertainment

**Language**: English

**Description**:

Play the Spotify web player faster or slower without the chipmunk voice and without the choppy, warbling sound of normal speed changers.

Plus a Recently played list, which the web player doesn't have: every song you play, newest first, right next to Spotify's queue. Play any of them again, add it to the queue or like it in one click.

How it sounds this good: the song is sped up the smooth way (like a record spun faster), then a music-grade pitch shifter brings the pitch back to the original. Nothing is chopped up, so drums and held notes stay clean.

Features
• Speed from 0.5× to 2×, with one-click presets (0.75 to 1.5)
• Original pitch at any speed, or shift the pitch up or down yourself
• Tape mode: pitch follows speed for the classic "slowed + reverb" or nightcore sound
• Bass boost, reverb and drum tail (drum hits ring out longer)
• Per-song settings: give any song its own speed and sound, used every time it plays
• Speed button right in Spotify's player bar
• Recently played: a history tab in Spotify's queue panel, with play, add to queue, like, go to album, artist and song radio
• Settings are remembered

How to use
1. Open open.spotify.com and play something.
2. Click the extension icon (or press Alt+Shift+S) to turn it on. Click it again to turn it off.
3. Click the speed button that appears in Spotify's player bar to pick a speed. Changes apply live.

While it's on, Chrome shows that the tab's audio is being shared: that is how the extension processes the sound. Expect about 0.15 s of audio delay.

Privacy: everything stays on your computer. No accounts, no tracking, no data sent anywhere.

Not affiliated with, endorsed by or sponsored by Spotify. Spotify is a trademark of Spotify AB.

**Icon**: icons/128.png

**Screenshots** (1280×800): store/screenshot-1.png, store/screenshot-2.png

## Privacy practices tab

**Single purpose**:
Change the playback speed and pitch of the Spotify web player, and add audio effects (bass, reverb, drum tail) to it.

**Permission justifications**:

- tabCapture: Captures the Spotify tab's sound after the user switches the extension on, so it can be pitch-corrected and played back at the chosen speed without the chipmunk effect. Audio is processed live and never recorded or sent anywhere.
- offscreen: Runs the audio processing (pitch shifter, bass, reverb, drum tail) in an offscreen document, because service workers cannot process audio.
- storage: Saves the user's settings (speed, pitch, effects) and the local Recently played list.
- contextMenus: Adds one item to the right-click menu on Spotify pages, "Faster / Slower: smooth sound in this tab". Chrome counts a click on it, like a click on the toolbar icon, as the user's permission to process that tab's sound.
- Host permission (https://open.spotify.com/*): Sets the playback speed on Spotify's player, adds a speed button to the player bar, and records and replays the user's Recently played songs. The extension runs on no other site.

**Remote code**: No, I am not using remote code. (The pitch shifter is bundled WebAssembly inside the package.)

**Data usage**: leave every data type unticked. Nothing is collected: settings and Recently played stay on the user's device and are never sent anywhere.

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**: publish store/privacy-policy.md somewhere public (for example a GitHub Gist or GitHub Pages) and paste its link. Optional: the extension collects no data, so leave this empty unless a reviewer asks for one.

## Package

Run `powershell -ExecutionPolicy Bypass -File build-store.ps1` and upload the zip it creates in `dist/`.
