// Picture delay: the processed sound comes out ~0.15 s late, so the picture is held back by
// the same amount. The real video keeps playing underneath, invisible; every new frame is
// copied into a small ring of canvases, and a canvas on top shows the frame from `delay` ms ago.
// Frames are copied (not kept as decoder frames), so the video decoder is never starved.
// eslint-disable-next-line no-unused-vars
class FsPictureDelay {
  constructor() {
    this.delay = null; // ms; null = off
    this.video = null;
    this.view = null; // the canvas shown on top
    this.ring = []; // { canvas, at } copies of recent frames, oldest first
    this.free = [];
    this.shown = null;
    this.raf = 0;
    this.failed = false;
    this.onFrame = this.onFrame.bind(this);
    this.tick = this.tick.bind(this);
    this.flush = this.flush.bind(this);
    const style = document.createElement('style');
    style.textContent = 'video.fs-delayed{opacity:0!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  setDelay(ms) {
    this.delay = ms == null || this.failed ? null : Math.max(0, ms);
    if (this.delay == null) this.detach();
    else this.track();
  }

  // The main player video (the largest one playing), or null.
  findVideo() {
    let best = null, area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width * r.height > area && v.readyState > 0) { best = v; area = r.width * r.height; }
    }
    return best;
  }

  track() {
    const v = this.findVideo();
    if (v && v !== this.video) this.attach(v);
    if (!this.watch) {
      // YouTube swaps or re-parents the video on navigation: re-check now and then.
      this.watch = setInterval(() => { if (this.delay != null) { const n = this.findVideo(); if (n && n !== this.video) this.attach(n); } }, 1000);
    }
  }

  attach(video) {
    this.detach(false);
    this.video = video;
    this.view = document.createElement('canvas');
    this.view.className = 'fs-picture';
    this.view.style.cssText = 'position:absolute;pointer-events:none;';
    video.after(this.view);
    video.addEventListener('seeking', this.flush);
    video.addEventListener('emptied', this.flush);
    video.requestVideoFrameCallback(this.onFrame);
    this.raf = requestAnimationFrame(this.tick);
  }

  detach(stopWatching = true) {
    if (stopWatching && this.watch) { clearInterval(this.watch); this.watch = null; }
    if (this.video) {
      this.video.classList.remove('fs-delayed');
      this.video.removeEventListener('seeking', this.flush);
      this.video.removeEventListener('emptied', this.flush);
    }
    this.view?.remove();
    cancelAnimationFrame(this.raf);
    this.video = this.view = this.shown = null;
    this.ring = []; this.free = [];
  }

  // After a seek the held frames belong to the old position: show the new one straight away.
  flush() {
    this.free.push(...this.ring);
    this.ring = [];
  }

  onFrame(now) {
    const v = this.video;
    if (!v || this.delay == null) return;
    try {
      const w = this.view.width, h = this.view.height;
      if (w && h) {
        const slot = this.free.pop() || { canvas: document.createElement('canvas') };
        if (slot.canvas.width !== w || slot.canvas.height !== h) { slot.canvas.width = w; slot.canvas.height = h; }
        slot.canvas.getContext('2d').drawImage(v, 0, 0, w, h);
        slot.at = now;
        this.ring.push(slot);
        // Never hold more than ~1 s of frames.
        while (this.ring.length > 90) this.free.push(this.ring.shift());
      }
    } catch (e) {
      // Protected video can't be copied: give up and show the real video.
      this.failed = true;
      this.setDelay(null);
      return;
    }
    v.requestVideoFrameCallback(this.onFrame);
  }

  tick() {
    const v = this.video, view = this.view;
    if (!v || !view) return;
    this.raf = requestAnimationFrame(this.tick);
    // Sit exactly where YouTube put the video, at screen resolution (capped at 1920 wide).
    if (view.parentElement !== v.parentElement) v.after(view);
    const cs = v.style;
    if (view.style.left !== cs.left) view.style.left = cs.left;
    if (view.style.top !== cs.top) view.style.top = cs.top;
    const cw = v.clientWidth, ch = v.clientHeight;
    if (view.style.width !== `${cw}px`) { view.style.width = `${cw}px`; view.style.height = `${ch}px`; }
    const scale = Math.min(devicePixelRatio || 1, 1920 / Math.max(1, cw));
    const w = Math.round(cw * scale), h = Math.round(ch * scale);
    if (view.width !== w || view.height !== h) { view.width = w; view.height = h; this.flush(); }

    const due = performance.now() - this.delay;
    // Drop frames that a newer due frame replaces.
    while (this.ring.length > 1 && this.ring[1].at <= due) this.free.push(this.ring.shift());
    const head = this.ring[0];
    if (head && head.at <= due) {
      if (head !== this.shown) {
        view.getContext('2d').drawImage(head.canvas, 0, 0);
        if (this.shown && !this.ring.includes(this.shown)) this.free.push(this.shown);
        this.shown = head;
        this.ring.shift();
        // Only hide the real video once there is a delayed frame to show instead.
        v.classList.add('fs-delayed');
      }
    }
  }
}
