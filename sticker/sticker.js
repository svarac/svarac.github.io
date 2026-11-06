/* SVARAC ステッカー（内部向け）— put a GUEST / CREW / MC tape on your own icon, entirely in this browser.
   The picture is never uploaded: it is drawn onto a canvas here and saved from here.
   CREW and MC stay hidden until the "© 2026 SVARAC" line at the bottom is tapped five times in a row;
   after that they stay available in this browser. */
(function () {
  'use strict';
  const S = 1080;                       // output size (px)
  const MOVE = 12, ZOOM = 1.04, TILT = Math.PI / 90;   // one tap of a button (12px, 4%, 2°)
  const MIN_SCALE = 0.25, MAX_SCALE = 8;
  const SK_MIN = S * 0.12, SK_MAX = S * 1.2;            // sticker width limits
  const SK_HOME = { x: S * 0.22, y: S * 0.66, w: S * 0.34, rot: -6 * Math.PI / 180 };   // lower left, where the ring's label sat
  const UNLOCK_KEY = 'svarac.sticker.unlocked', TAPS = 5, TAP_GAP = 1500;
  const $ = function (s) { return document.querySelector(s); };

  const fileIn = $('#file'), pickText = $('#pick-text'), errBox = $('#err');
  const stage = $('#stage'), view = $('#view'), empty = $('#empty'), roundBox = $('#round'), ringBox = $('#with-ring');
  const pad = $('#pad'), tilt = $('#tilt'), saveBtn = $('#save');
  const result = $('#result'), out = $('#out'), how = $('#how'), shareBtn = $('#share'), dl = $('#dl'), openA = $('#open');
  const toast = $('#toast'), secret = $('#secret');
  const vctx = view.getContext('2d');
  if (!vctx || !view.toDataURL) return;   // the page shows its "does not work here" notice

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isTouch = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  let src = null, ring = null;
  const tapes = {};                     // kind -> loaded image
  let kind = 'guest', target = 'sticker';
  const st = { scale: 1, x: 0, y: 0 };  // the picture: scale 1 = just covers the square; x, y = offset of its centre
  const sk = Object.assign({}, SK_HOME); // the sticker: centre, width, tilt (output px / radians)
  let outUrl = '', outFile = null, raf = 0, grabbing = false;

  /* ---------- drawing ---------- */
  function tape() { return tapes[kind] && tapes[kind].complete && tapes[kind].naturalWidth ? tapes[kind] : null; }
  function skH() { const t = tape(); return t ? sk.w * t.naturalHeight / t.naturalWidth : sk.w * 0.37; }
  function cover() { return Math.max(S / src.width, S / src.height); }
  function draw(ctx, size, preview) {
    const k = size / S;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = src ? '#FFFFFF' : '#2A2422';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (src) {
      const sc = cover() * st.scale * k;
      const w = src.width * sc, h = src.height * sc;
      ctx.drawImage(src, size / 2 + st.x * k - w / 2, size / 2 + st.y * k - h / 2, w, h);
    }
    if (ringBox.checked && ring && ring.complete && ring.naturalWidth) ctx.drawImage(ring, 0, 0, size, size);
    const t = tape();
    if (t && src) {
      const w = sk.w * k, h = skH() * k;
      ctx.translate(sk.x * k, sk.y * k);
      ctx.rotate(sk.rot);
      ctx.drawImage(t, -w / 2, -h / 2, w, h);
      if (preview && grabbing) {           // only on screen, while it is being moved
        ctx.strokeStyle = '#FFC21A'; ctx.lineWidth = Math.max(2, 3 * k * (S / 540)); ctx.setLineDash([10, 8]);
        ctx.strokeRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12);
      }
    }
    ctx.restore();
  }
  function fitCanvas() {
    const px = Math.max(240, Math.min(S, Math.round(view.clientWidth * (window.devicePixelRatio || 1))));
    if (view.width !== px) { view.width = px; view.height = px; }
    redraw();
  }
  function redraw() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; draw(vctx, view.width, true); });
  }

  /* ---------- state ---------- */
  function clamp() {
    st.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.scale));
    const lim = S * 0.6 * Math.max(1, st.scale);
    st.x = Math.min(lim, Math.max(-lim, st.x));
    st.y = Math.min(lim, Math.max(-lim, st.y));
    sk.w = Math.min(SK_MAX, Math.max(SK_MIN, sk.w));
    sk.x = Math.min(S, Math.max(0, sk.x));        // its centre stays on the picture, so it can never get lost
    sk.y = Math.min(S, Math.max(0, sk.y));
    sk.rot = Math.max(-Math.PI, Math.min(Math.PI, sk.rot));
  }
  function changed() {
    clamp();
    redraw();
    if (!result.hidden) result.hidden = true;     // the saved picture no longer matches: save again
  }
  function act(a) {
    if (!src) return;
    const s = target === 'sticker';
    if (a === 'in') { if (s) sk.w *= ZOOM; else st.scale *= ZOOM; }
    else if (a === 'out') { if (s) sk.w /= ZOOM; else st.scale /= ZOOM; }
    else if (a === 'up') { if (s) sk.y -= MOVE; else st.y -= MOVE; }
    else if (a === 'down') { if (s) sk.y += MOVE; else st.y += MOVE; }
    else if (a === 'left') { if (s) sk.x -= MOVE; else st.x -= MOVE; }
    else if (a === 'right') { if (s) sk.x += MOVE; else st.x += MOVE; }
    else if (a === 'ccw' && s) sk.rot -= TILT;
    else if (a === 'cw' && s) sk.rot += TILT;
    else if (a === 'reset') { if (s) Object.assign(sk, SK_HOME); else { st.scale = 1; st.x = 0; st.y = 0; } }
    changed();
  }
  function syncButtons() {
    const on = !!src;
    Array.prototype.forEach.call(pad.querySelectorAll('button'), function (b) { b.disabled = !on; });
    Array.prototype.forEach.call(tilt.querySelectorAll('button'), function (b) { b.disabled = !on || target !== 'sticker'; });
  }
  function setReady(on) {
    stage.classList.toggle('has-img', on);
    empty.hidden = on;
    saveBtn.disabled = !on;
    syncButtons();
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
      // keep a lighter copy (longest side 2160px) so moving things around stays smooth on phones
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

  /* ---------- which sticker, ring, what the buttons move ---------- */
  document.addEventListener('change', function (e) {
    const el = e.target;
    if (el.name === 'kind') { kind = el.value; changed(); }
    else if (el.name === 'target') { target = el.value; syncButtons(); }
    else if (el === ringBox) changed();
    else if (el === roundBox) stage.classList.toggle('is-round', roundBox.checked);
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

  /* ---------- fingers / mouse on the preview ----------
     A gesture that starts on the sticker moves it (two fingers: size and tilt); anywhere else moves the picture. */
  const pts = {};
  let last = null, grab = null;
  function unit() { return S / view.clientWidth; }
  function toOut(e) {
    const r = view.getBoundingClientRect();
    return { x: (e.clientX - r.left) * S / r.width, y: (e.clientY - r.top) * S / r.height };
  }
  function onSticker(p) {
    if (!tape()) return false;
    const dx = p.x - sk.x, dy = p.y - sk.y, c = Math.cos(-sk.rot), s = Math.sin(-sk.rot);
    const lx = dx * c - dy * s, ly = dx * s + dy * c, pad = 18;
    return Math.abs(lx) <= sk.w / 2 + pad && Math.abs(ly) <= skH() / 2 + pad;
  }
  function snapshot() {
    const ids = Object.keys(pts);
    if (!ids.length) return null;
    const a = pts[ids[0]], b = pts[ids[1]] || a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), n: ids.length };
  }
  view.addEventListener('pointerdown', function (e) {
    if (!src) return;
    view.setPointerCapture && view.setPointerCapture(e.pointerId);
    if (!Object.keys(pts).length) {
      grab = onSticker(toOut(e)) ? 'sticker' : 'photo';
      grabbing = grab === 'sticker';
      const radio = document.getElementById(grab === 'sticker' ? 't-sticker' : 't-photo');   // the buttons follow what was touched last
      if (!radio.checked) { radio.checked = true; target = grab; syncButtons(); }
      redraw();
    }
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    last = snapshot();
  });
  view.addEventListener('pointermove', function (e) {
    if (!src || !pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    const now = snapshot();
    if (last && now && last.n === now.n) {
      const dx = (now.x - last.x) * unit(), dy = (now.y - last.y) * unit();
      if (grab === 'sticker') {
        sk.x += dx; sk.y += dy;
        if (now.n > 1 && last.d > 10) { sk.w *= now.d / last.d; sk.rot += now.ang - last.ang; }
      } else {
        st.x += dx; st.y += dy;
        if (now.n > 1 && last.d > 10) st.scale *= now.d / last.d;
      }
      changed();
    }
    last = now;
  });
  function up(e) {
    delete pts[e.pointerId];
    last = snapshot();
    if (!last) { grab = null; grabbing = false; redraw(); }
  }
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', function (e) {
    if (!src) return;
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0015);
    if (onSticker(toOut(e))) { if (e.shiftKey) sk.rot += e.deltaY * 0.002; else sk.w *= f; }   // Shift + wheel tilts it
    else st.scale *= f;
    changed();
  }, { passive: false });

  /* ---------- save ---------- */
  saveBtn.addEventListener('click', function () {
    if (!src) return;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    draw(c.getContext('2d'), S, false);
    const name = 'svarac_icon_' + kind + '.jpg';
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    out.src = dataUrl;
    const done = function (blob) {
      if (outUrl) URL.revokeObjectURL(outUrl);
      outUrl = blob ? URL.createObjectURL(blob) : dataUrl;
      dl.href = outUrl; dl.download = name;
      openA.href = outUrl;
      outFile = null;
      try { if (blob && window.File) outFile = new File([blob], name, { type: 'image/jpeg' }); } catch (e) { outFile = null; }
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

  /* ---------- the hidden switch: tap "© 2026 SVARAC" five times in a row ---------- */
  let toastT = 0;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.classList.remove('is-on'); }, 2600);
  }
  function isUnlocked() { try { return localStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { return false; } }
  function reveal(animate) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-secret]'), function (li) {
      li.hidden = false;
      if (animate) li.classList.add('is-new');
    });
  }
  let taps = 0, lastTap = 0;
  secret.addEventListener('click', function () {
    if (!document.querySelector('[data-secret][hidden]')) return;   // already open
    const now = Date.now();
    taps = now - lastTap < TAP_GAP ? taps + 1 : 1;
    lastTap = now;
    if (taps < TAPS) return;
    taps = 0;
    try { localStorage.setItem(UNLOCK_KEY, '1'); } catch (e) { /* private mode: open for this visit only */ }
    reveal(true);
    say('CREW と MC が選べるようになりました');
    document.querySelector('.kinds').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---------- start ---------- */
  ['guest', 'crew', 'mc'].forEach(function (k) {
    const im = new Image();
    im.onload = redraw;
    im.src = 'img/' + k + '.png';
    tapes[k] = im;
  });
  ring = new Image();
  ring.onload = redraw;
  ring.onerror = function () { ringBox.disabled = true; };
  ring.src = '../ring/img/svarac_icon-ring.png';
  if (isUnlocked()) reveal(false);
  setReady(false);
  window.addEventListener('resize', fitCanvas);
  fitCanvas();
  window.STICKER_OK = true;
})();
