# Chrome Web Store listing: YouTube Faster / Slower Control

Copy these into the Developer Dashboard (https://chrome.google.com/webstore/devconsole).

## Store listing tab

**Name** (from the manifest): YouTube Faster / Slower Control

**Summary** (from the manifest, 132 characters max):
Speed up or slow down YouTube at the original pitch, with smooth, non-choppy sound and the picture kept in sync. Not affiliated with YouTube.

**Category**: Entertainment

**Language**: English

**Description**:

Watch YouTube faster or slower without the warbling, choppy sound of the built-in speed setting, and without the chipmunk voice.

How it sounds this good: the video is sped up the smooth way (like a record spun faster), then a music-grade pitch shifter brings the pitch back to the original. Nothing is chopped up, so music, voices and drums stay clean. That processing takes about 0.15 s, so the picture is held back by the same amount and lips stay in sync.

Features
• Speed from 0.5× to 2×, with one-click presets
• Original pitch at any speed, or shift the pitch up or down yourself
• Tape mode: pitch follows speed for the classic "slowed + reverb" or nightcore sound
• Picture kept in sync with the sound, with a fine-tune slider
• Bass boost, reverb and drum tail (drum hits ring out longer)
• Ads play at normal speed
• Works in theater mode, fullscreen and when the next video starts

How to use
1. Open a YouTube video.
2. Click the extension icon and switch it On.
3. Pick a speed. Changes apply live.

While it's on, Chrome shows that the tab's audio is being shared: that is how the extension processes the sound.

Privacy: everything stays on your computer. No accounts, no tracking, no data sent anywhere.

Not affiliated with, endorsed by or sponsored by YouTube or Google. YouTube is a trademark of Google LLC.

**Icon**: icons/128.png

**Screenshots** (1280×800): store/screenshot-1.png

## Privacy practices tab

**Single purpose**:
Change the playback speed and pitch of YouTube videos with smooth sound, keeping the picture in sync, and add audio effects (bass, reverb, drum tail).

**Permission justifications**:

- tabCapture: Captures the YouTube tab's sound after the user switches the extension on, so it can be pitch-corrected and played back at the chosen speed without the chipmunk effect. Audio is processed live and never recorded or sent anywhere.
- offscreen: Runs the audio processing (pitch shifter, bass, reverb, drum tail) in an offscreen document, because service workers cannot process audio.
- storage: Saves the user's settings (speed, pitch, picture sync, effects).
- Host permissions (www.youtube.com, m.youtube.com, music.youtube.com): Sets the playback speed on the video and shows the video picture slightly delayed so it stays in sync with the processed sound. The extension runs on no other site.

**Remote code**: No, I am not using remote code. (The pitch shifter is bundled WebAssembly inside the package.)

**Data usage**: leave every data type unticked. Nothing is collected: settings stay on the user's device and are never sent anywhere.

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**: publish store/privacy-policy.md somewhere public (for example a GitHub Gist or GitHub Pages) and paste its link. Fill in the contact email first.

## Package

Run `powershell -ExecutionPolicy Bypass -File build-store.ps1` in this folder and upload the zip it creates in `dist/`.
