/* SVARAC アイコンリング — put the ring on your own icon, entirely in this browser.
   The picture is never uploaded: it is drawn onto a canvas here and saved from here. */
(function () {
  'use strict';
  const S = 1080;                     // output size (px), the ring's own size
  const MOVE = 12, ZOOM = 1.04;       // one tap of an arrow / zoom button
  const MIN_SCALE = 0.25, MAX_SCALE = 8;
  const $ = function (s) { return document.querySelector(s); };

  const fileIn = $('#file'), pickText = $('#pick-text'), errBox = $('#err');
  const stage = $('#stage'), view = $('#view'), empty = $('#empty'), roundBox = $('#round');
  const pad = $('#pad'), saveBtn = $('#save');
  const result = $('#result'), out = $('#out'), how = $('#how'), shareBtn = $('#share'), dl = $('#dl'), openA = $('#open');
  const vctx = view.getContext('2d');
  if (!vctx || !view.toDataURL) return;   // the page shows its "does not work here" notice

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isTouch = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  let ring = null, src = null;
  const st = { scale: 1, x: 0, y: 0 };    // scale: 1 = the picture just covers the square; x, y: offset of its centre (output px)
  let outUrl = '', outFile = null, raf = 0;

  /* ---------- drawing ---------- */
  function cover() { return Math.max(S / src.width, S / src.height); }
  function draw(ctx, size) {
    const k = size / S;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = src ? '#FFFFFF' : '#2A2422';
    ctx.fillRect(0, 0, size, size);
    if (src) {
      const sc = cover() * st.scale * k;
      const w = src.width * sc, h = src.height * sc;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, size / 2 + st.x * k - w / 2, size / 2 + st.y * k - h / 2, w, h);
    }
    if (ring) ctx.drawImage(ring, 0, 0, size, size);
    ctx.restore();
  }
  function fitCanvas() {
    const px = Math.max(240, Math.min(S, Math.round(view.clientWidth * (window.devicePixelRatio || 1))));
    if (view.width !== px) { view.width = px; view.height = px; }
    redraw();
  }
  function redraw() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; draw(vctx, view.width); });
  }

  /* ---------- state ---------- */
  function clamp() {
    st.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.scale));
    const lim = S * 0.6 * Math.max(1, st.scale);
    st.x = Math.min(lim, Math.max(-lim, st.x));
    st.y = Math.min(lim, Math.max(-lim, st.y));
  }
  function changed() {
    clamp();
    redraw();
    if (!result.hidden) result.hidden = true;   // the saved picture no longer matches: save again
  }
  function act(a) {
    if (!src) return;
    if (a === 'in') st.scale *= ZOOM;
    else if (a === 'out') st.scale /= ZOOM;
    else if (a === 'up') st.y -= MOVE;
    else if (a === 'down') st.y += MOVE;
    else if (a === 'left') st.x -= MOVE;
    else if (a === 'right') st.x += MOVE;
    else if (a === 'reset') { st.scale = 1; st.x = 0; st.y = 0; }
    changed();
  }
  function setReady(on) {
    stage.classList.toggle('has-img', on);
    empty.hidden = on;
    saveBtn.disabled = !on;
    Array.prototype.forEach.call(pad.querySelectorAll('button'), function (b) { b.disabled = !on; });
  }
  function showErr(msg) { errBox.hidden = !msg; errBox.textContent = msg || ''; }

  /* ---------- choosing a picture ---------- */
  function loadFile(file) {
    if (!file) return;
    showErr('');
    if (file.type && !/^image\//.test(file.type)) { showErr('画像ファイル（JPG・PNG など）を選んでください。'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { showErr('この画像は読み込めませんでした。別の画像でお試しください。'); return; }
      // keep a lighter copy (longest side 2160px) so moving it around stays smooth on phones
      const k = Math.min(1, 2160 / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const cx = c.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, c.width, c.height);
      src = c;
      st.scale = 1; st.x = 0; st.y = 0;
      setReady(true);
      pickText.textContent = '別の画像を選ぶ';
      result.hidden = true;
      redraw();
      stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      showErr('この画像は読み込めませんでした。JPG・PNG の画像でお試しください（iPhone の写真は「写真ライブラリ」から選べば大丈夫です）。');
    };
    img.src = url;
  }
  fileIn.addEventListener('change', function () { loadFile(fileIn.files && fileIn.files[0]); fileIn.value = ''; });
  empty.addEventListener('click', function () { fileIn.click(); });
  // PC: drop a picture on the preview, or paste one
  stage.addEventListener('dragover', function (e) { e.preventDefault(); stage.classList.add('is-over'); });
  stage.addEventListener('dragleave', function () { stage.classList.remove('is-over'); });
  stage.addEventListener('drop', function (e) {
    e.preventDefault(); stage.classList.remove('is-over');
    loadFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  document.addEventListener('paste', function (e) {
    const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
    if (f && /^image\//.test(f.type)) loadFile(f);
  });

  /* ---------- buttons: tap = one step, hold = keep going ---------- */
  let holdT = 0, holdI = 0, held = null;
  function stopHold() {
    clearTimeout(holdT); clearInterval(holdI); holdT = holdI = 0;
    if (held) { held.classList.remove('is-held'); held = null; }
  }
  pad.addEventListener('pointerdown', function (e) {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    const a = b.getAttribute('data-act');
    stopHold();
    act(a);
    if (a === 'reset') return;
    held = b; b.classList.add('is-held');
    holdT = setTimeout(function () { holdI = setInterval(function () { act(a); }, 50); }, 380);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { pad.addEventListener(t, stopHold); });
  window.addEventListener('blur', stopHold);
  pad.addEventListener('click', function (e) {   // keyboard (Enter / Space) only; pointers were handled above
    const b = e.target.closest('button[data-act]');
    if (b && e.detail === 0) act(b.getAttribute('data-act'));
  });
  pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- fingers / mouse on the preview: drag to move, pinch or wheel to zoom ---------- */
  const pts = {};
  let last = null;
  function unit() { return S / view.clientWidth; }
  function snapshot() {
    const ids = Object.keys(pts);
    if (!ids.length) return null;
    const a = pts[ids[0]], b = pts[ids[1]] || a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), n: ids.length };
  }
  view.addEventListener('pointerdown', function (e) {
    if (!src) return;
    view.setPointerCapture && view.setPointerCapture(e.pointerId);
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    last = snapshot();
  });
  view.addEventListener('pointermove', function (e) {
    if (!src || !pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    const now = snapshot();
    if (last && now && last.n === now.n) {
      st.x += (now.x - last.x) * unit();
      st.y += (now.y - last.y) * unit();
      if (now.n > 1 && last.d > 10) st.scale *= now.d / last.d;
      changed();
    }
    last = now;
  });
  function up(e) { delete pts[e.pointerId]; last = snapshot(); }
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', function (e) {
    if (!src) return;
    e.preventDefault();
    st.scale *= Math.exp(-e.deltaY * 0.0015);
    changed();
  }, { passive: false });

  roundBox.addEventListener('change', function () { stage.classList.toggle('is-round', roundBox.checked); });

  /* ---------- save ---------- */
  saveBtn.addEventListener('click', function () {
    if (!src || !ring) return;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    draw(c.getContext('2d'), S);
    // JPEG keeps the file small enough for every SNS (the picture has no transparent parts)
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    out.src = dataUrl;
    const done = function (blob) {
      if (outUrl) URL.revokeObjectURL(outUrl);
      outUrl = blob ? URL.createObjectURL(blob) : dataUrl;
      dl.href = outUrl;
      openA.href = outUrl;
      outFile = null;
      try { if (blob && window.File) outFile = new File([blob], 'svarac_icon.jpg', { type: 'image/jpeg' }); } catch (e) { outFile = null; }
      shareBtn.hidden = !(outFile && navigator.canShare && navigator.canShare({ files: [outFile] }));
      how.textContent = isIOS ? '下の画像を長押しして、「写真に保存」（または「写真に追加」）を選んでください。'
        : isTouch ? '下の画像を長押しして「画像をダウンロード」を選ぶと保存できます。'
        : '「ダウンロード」を押すと保存できます。画像を右クリックして保存することもできます。';
      result.hidden = false;
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (c.toBlob) c.toBlob(done, 'image/jpeg', 0.92); else done(null);
  });
  shareBtn.addEventListener('click', function () {
    if (!outFile) return;
    navigator.share({ files: [outFile] }).catch(function () { /* closed the share sheet */ });
  });

  /* ---------- start ---------- */
  ring = new Image();
  ring.onload = function () { redraw(); };
  ring.onerror = function () { showErr('リングの画像を読み込めませんでした。ページを再読み込みしてください。'); };
  ring.src = 'img/svarac_icon-ring.png';
  setReady(false);
  window.addEventListener('resize', fitCanvas);
  fitCanvas();
  window.RING_OK = true;
})();
