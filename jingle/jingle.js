/* SVARAC ジングル応募 — record (or choose) a shout and a 5-second piece, fit an icon in the circle, confirm, send.
   Talks to the same Google Apps Script as /entry/ (actions jingleInfo / jingleCheck / jingleUpload / jingleSubmit). */
(function () {
  'use strict';
  const SV = window.SV, $ = SV.$, $$ = SV.$$, esc = SV.esc;
  const TERMS = '2026-11-18';                 // the version of the 使用許可 text the person agreed to (kept with each entry)
  const PAGE = 'https://svarac.github.io/jingle/';
  const DRAFT = 'svarac_jingle_draft';
  const MAX_REC = 60;                         // a recording stops by itself after this many seconds
  const LONG = 7;                             // a 5秒インパクト longer than this gets a gentle note (it can still be sent)
  const VIEWS = ['v-form', 'v-confirm', 'v-done', 'v-closed'];
  const canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));

  function show(id) { VIEWS.forEach(function (v) { $('#' + v).hidden = v !== id; }); window.scrollTo(0, 0); }
  const mmss = function (sec) { sec = Math.max(0, Math.floor(sec || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const secs = function (d) { return (Math.round((d || 0) * 10) / 10).toFixed(1) + '秒'; };

  /* ---------- recording: plain PCM from the microphone, saved as WAV (opens in any editor) ---------- */
  function toWav(chunks, len, rate) {
    const buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
    const w = function (o, s) { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * 2, true);
    let o = 44;
    chunks.forEach(function (c) {
      for (let i = 0; i < c.length; i++) { const s = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
    });
    return new Blob([buf], { type: 'audio/wav' });
  }
  let liveRec = null;   // only one microphone at a time
  function startRec(onLevel) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();   // made inside the tap, so iPhone lets it run
    const chunks = []; let len = 0, stream = null, src = null, proc = null, stopped = false;
    // voice as it is: no echo cancelling, noise suppression or automatic volume (the jingle is edited afterwards)
    const ready = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
      if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); throw new Error('cancel'); }
      stream = s;
      return ctx.resume ? ctx.resume() : null;
    }).then(function () {
      src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = function (e) {
        if (stopped) return;
        const d = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(d)); len += d.length;
        let pk = 0, sum = 0;
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; sum += d[i] * d[i]; }
        onLevel(Math.sqrt(sum / d.length), pk, len / ctx.sampleRate);
      };
      src.connect(proc); proc.connect(ctx.destination);   // the processor writes nothing back, so nothing is heard
    });
    const api = {
      ready: ready,
      stop: function () {
        stopped = true;
        try { if (proc) proc.disconnect(); if (src) src.disconnect(); } catch (e) { /* already gone */ }
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        const rate = ctx.sampleRate;
        try { ctx.close(); } catch (e) { /* already closed */ }
        if (liveRec === api) liveRec = null;
        return { blob: len ? toWav(chunks, len, rate) : null, dur: len / rate };
      },
    };
    if (liveRec) liveRec.stop();
    liveRec = api;
    return api;
  }

  /* ---------- a voice field: record here, or choose a file ---------- */
  function voice(el, opt) {
    el.innerHTML =
      '<div class="vo__modes" role="group" aria-label="音声の出し方">' +
        '<button type="button" class="vo__mode" data-m="rec" aria-pressed="true">その場で録音</button>' +
        '<button type="button" class="vo__mode" data-m="file" aria-pressed="false">ファイルを選ぶ</button>' +
      '</div><div class="vo__rec"></div><div class="vo__file" hidden></div>';
    const recBox = $('.vo__rec', el), fileBox = $('.vo__file', el);
    const dz = SV.dropzone(fileBox, { slot: opt.slot, onChange: function () { changed(); } });
    let mode = 'rec', got = null, R = null, timer = 0, clipped = 0;

    function changed() { if (opt.onChange) opt.onChange(); }
    function setMode(m) {
      if (R) stopRec();
      mode = m;
      $$('.vo__mode', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === m)); });
      recBox.hidden = m !== 'rec'; fileBox.hidden = m !== 'file';
      if (m !== 'rec') SV.stopAudio(recBox);
      changed();
    }
    function idle(msg, warn) {
      SV.stopAudio(recBox);
      recBox.innerHTML = canRec
        ? '<div class="rec"><button type="button" class="rec__go" data-a="start"><span class="rec__dot" aria-hidden="true"></span><span>タップして録音</span></button>' +
            '<p class="rec__msg' + (warn ? ' rec__msg--warn' : '') + '">' + esc(msg || 'ボタンを押すとすぐに録音が始まります。マイクの使用を許可してください') + '</p></div>'
        : '<div class="rec"><p class="rec__msg rec__msg--warn">このブラウザでは録音できません。SafariやChromeで開き直すか「ファイルを選ぶ」から送ってください</p></div>';
    }
    function recording() {
      recBox.innerHTML =
        '<div class="rec is-on"><button type="button" class="rec__go" data-a="stop"><span class="rec__dot" aria-hidden="true"></span><span>止める</span></button>' +
        '<p class="rec__time" aria-live="off">0:00</p><div class="rec__meter" aria-hidden="true"><i></i></div>' +
        '<p class="rec__msg">録音中です。言い終わったら「止める」を押してください</p></div>';
    }
    function done() {
      const long = opt.long && got.dur > opt.long;
      recBox.innerHTML =
        '<div class="rec rec__done"><div class="rec__meta"><span>録音した音声</span><small>' + secs(got.dur) + '</small></div>' +
        '<audio controls preload="metadata" src="' + got.url + '"></audio>' +
        (clipped > 3 ? '<p class="rec__msg rec__msg--warn">音が割れているかもしれません。スマホやマイクから少し離れて録り直すとよくなります</p>' : '') +
        (long ? '<p class="rec__msg rec__msg--warn vo__long">少し長めです。声の部分が5秒くらいになるように録るのがおすすめです（このままでも送れます）</p>' : '') +
        '<div class="rec__btns"><button type="button" class="btn btn--line btn--sm" data-a="start">録り直す</button><button type="button" class="btn btn--ghost btn--sm" data-a="clear">消す</button></div></div>';
    }
    function startRec_() {
      if (got) { URL.revokeObjectURL(got.url); got = null; changed(); }
      clipped = 0;
      recording();
      const tEl = $('.rec__time', recBox), bar = $('.rec__meter i', recBox);
      R = startRec(function (rms, pk, sec) {
        if (pk > .985) clipped++;
        requestAnimationFrame(function () {
          if (!R) return;
          bar.style.width = Math.min(100, Math.round(Math.sqrt(rms) * 160)) + '%';
          tEl.textContent = mmss(sec);
        });
        if (sec >= MAX_REC) setTimeout(stopRec, 0);
      });
      R.ready.catch(function (err) {
        if (!R || (err && err.message === 'cancel')) return;
        R.stop(); R = null;
        const name = err && err.name;
        idle(name === 'NotAllowedError' || name === 'SecurityError'
          ? 'マイクが使えませんでした。ブラウザの設定でマイクを許可するか「ファイルを選ぶ」から送ってください'
          : name === 'NotFoundError' ? 'マイクが見つかりませんでした。「ファイルを選ぶ」から送ってください'
          : '録音を始められませんでした。もう一度押すか「ファイルを選ぶ」から送ってください', true);
      });
    }
    function stopRec() {
      if (!R) return;
      const r = R.stop(); R = null;
      if (!r.blob || r.dur < .3) { idle('うまく録音できませんでした。もう一度お試しください', true); return; }
      got = { blob: r.blob, dur: r.dur, url: URL.createObjectURL(r.blob) };
      done(); changed();
    }
    recBox.addEventListener('click', function (e) {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.getAttribute('data-a');
      if (a === 'start') startRec_();
      else if (a === 'stop') stopRec();
      else if (a === 'clear') { if (got) URL.revokeObjectURL(got.url); got = null; idle(); changed(); }
    });
    $$('.vo__mode', el).forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-m')); }); });
    idle();
    if (!canRec) setMode('file');

    return {
      dz: dz,
      busy: function () { return !!R; },
      stop: stopRec,
      /* what will be sent: { blob, name, dur, how, url } or null */
      value: function () {
        if (mode === 'rec') return got ? { blob: got.blob, name: opt.slot + '.wav', dur: got.dur, how: 'rec', url: got.url } : null;
        const f = dz.file();
        return f ? { blob: f, name: f.name, dur: dz.duration(), how: 'file', url: dz.url() } : null;
      },
      reset: function () { if (R) { R.stop(); R = null; } if (got) URL.revokeObjectURL(got.url); got = null; dz.setFile(null); idle(); setMode(canRec ? 'rec' : 'file'); },
    };
  }

  /* ---------- the icon: drop, paste or choose an image, then fit the face in the circle ---------- */
  function iconPicker(el, onChange) {
    const id = 'ic-' + Math.random().toString(36).slice(2, 7);
    const canRead = !!(navigator.clipboard && navigator.clipboard.read);
    el.classList.add('ic');
    el.innerHTML =
      '<div class="ic__pick"><input class="ic__input sr" type="file" id="' + id + '" accept="image/*">' +
        '<label class="ic__zone" for="' + id + '">' + SV.icon.image +
          '<span class="drop__main"><span class="only-mouse">画像をドラッグ＆ドロップ</span><span class="only-touch">タップして画像を選ぶ</span></span>' +
          '<span class="drop__sub"><span class="only-mouse">クリックして選ぶ／コピーした画像の貼り付け（⌘V・Ctrl+V）もできます</span><span class="only-touch">SpoonやXのアイコン画像を選んでください</span></span>' +
        '</label>' +
        (canRead ? '<div class="drop__actions"><button type="button" class="btn btn--line btn--sm" data-a="paste">コピーした画像を貼り付ける</button></div>' : '') +
      '</div>' +
      '<div class="ic__edit" hidden>' +
        '<div class="ic__stage" aria-label="アイコンの位置合わせ（ドラッグで動かせます）"><img alt=""><span class="ic__mask" aria-hidden="true"></span></div>' +
        '<label class="ic__zoom"><span aria-hidden="true">小</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="画像の大きさ"><span aria-hidden="true">大</span></label>' +
        '<p class="hint">ドラッグで位置を、スライダーで大きさを合わせて<br>顔が丸の真ん中に来るようにしてください</p>' +
        '<div class="drop__actions"><button type="button" class="btn btn--line btn--sm" data-a="change">別の画像にする</button></div>' +
      '</div>';
    const input = $('.ic__input', el), pick = $('.ic__pick', el), edit = $('.ic__edit', el);
    const stage = $('.ic__stage', el), img = $('img', stage), zoom = $('input[type=range]', el);
    let src = null, W = 0, H = 0, base = 1, z = 1, ox = 0, oy = 0;

    const S = function () { return stage.clientWidth || 260; };
    function clamp() {
      const s = S(), dw = W * base * z, dh = H * base * z;
      ox = Math.min(0, Math.max(s - dw, ox)); oy = Math.min(0, Math.max(s - dh, oy));
    }
    function paint() { clamp(); img.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + (base * z) + ')'; }
    function zoomTo(nz, cx, cy) {
      nz = Math.min(4, Math.max(1, nz));
      const s = S(); cx = cx === undefined ? s / 2 : cx; cy = cy === undefined ? s / 2 : cy;
      const k = nz / z;
      ox = cx - (cx - ox) * k; oy = cy - (cy - oy) * k; z = nz;
      zoom.value = String(z); paint();
    }
    function load(file) {
      if (!file || !/^image\//.test(file.type || '')) { SV.toast('画像ファイルを選んでください'); return; }
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = function () {
        if (src) URL.revokeObjectURL(src);
        src = url; W = im.naturalWidth; H = im.naturalHeight;
        img.src = url; img.style.width = W + 'px'; img.style.height = H + 'px';
        pick.hidden = true; edit.hidden = false;
        const s = S(); base = Math.max(s / W, s / H); z = 1; zoom.value = '1';
        ox = (s - W * base) / 2; oy = (s - H * base) / 2;
        paint(); onChange();
      };
      im.onerror = function () { URL.revokeObjectURL(url); SV.toast('この画像は読み込めませんでした。JPGかPNGの画像を選んでください'); };
      im.src = url;
    }
    input.addEventListener('change', function () { if (input.files && input.files[0]) load(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) { el.addEventListener(t, function (e) { e.preventDefault(); el.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { el.addEventListener(t, function (e) { e.preventDefault(); if (t === 'drop' || !el.contains(e.relatedTarget)) el.classList.remove('is-over'); }); });
    el.addEventListener('drop', function (e) { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) load(f); });
    el.addEventListener('click', function (e) {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.getAttribute('data-a') === 'change') input.click();
      else if (b.getAttribute('data-a') === 'paste') {
        navigator.clipboard.read().then(function (items) {
          for (const it of items) {
            const t = it.types.filter(function (x) { return /^image\//.test(x); })[0];
            if (t) return it.getType(t).then(function (blob) { load(new File([blob], 'paste.' + t.split('/')[1], { type: t })); });
          }
          SV.toast('コピーされた画像が見つかりませんでした');
        }).catch(function () { SV.toast('貼り付けできませんでした。画像を選んでください'); });
      }
    });
    // paste anywhere on the page (an image never goes into the text boxes anyway)
    document.addEventListener('paste', function (e) {
      const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      if (!f || !/^image\//.test(f.type || '') || $('#v-form').hidden) return;
      e.preventDefault(); load(f);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // drag to move, pinch or wheel to zoom
    const pts = {}; let pinch = 0;
    stage.addEventListener('pointerdown', function (e) { stage.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; });
    stage.addEventListener('pointermove', function (e) {
      const p = pts[e.pointerId]; if (!p) return;
      const ids = Object.keys(pts);
      if (ids.length === 1) { ox += e.clientX - p.x; oy += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; paint(); return; }
      p.x = e.clientX; p.y = e.clientY;
      const a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), r = stage.getBoundingClientRect();
      if (pinch) zoomTo(z * d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch = d;
    });
    const up = function (e) { delete pts[e.pointerId]; pinch = 0; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function (e) { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomTo(z * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    zoom.addEventListener('input', function () { zoomTo(Number(zoom.value)); });
    stage.addEventListener('keydown', function (e) {
      const step = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[e.key];
      if (step) { e.preventDefault(); ox += step[0]; oy += step[1]; paint(); }
    });
    stage.tabIndex = 0;

    function draw(size) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'), k = size / S();
      g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, ox * k, oy * k, W * base * z * k, H * base * z * k);
      return c;
    }
    return {
      has: function () { return !!src; },
      /* the square crop (600px JPEG) and a small preview for lists (128px) */
      export: function () {
        const big = draw(600), thumb = draw(128).toDataURL('image/jpeg', 0.82);
        return new Promise(function (resolve) { big.toBlob(function (b) { resolve({ blob: b, thumb: thumb, url: URL.createObjectURL(b) }); }, 'image/jpeg', 0.9); });
      },
      reset: function () { if (src) URL.revokeObjectURL(src); src = null; img.removeAttribute('src'); pick.hidden = false; edit.hidden = true; },
    };
  }

  /* ---------- the form ---------- */
  const F = { name: $('#f-name'), x: $('#f-x'), giga: $('#f-giga'), note: $('#f-note') };
  const consentBtn = $('#f-consent');
  function setErr(key, msg) {
    const e = $('#f-' + key + '-err'); if (e) e.textContent = msg || '';
    const fl = $('#fl-' + key); if (fl) fl.classList.toggle('is-invalid', !!msg);
    const inp = F[key]; if (inp) inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  const icon = iconPicker($('#f-icon'), function () { setErr('icon', ''); });
  const shout = voice($('#f-shout'), { slot: 'shout', onChange: function () { setErr('shout', ''); } });
  const impact = voice($('#f-impact'), { slot: 'impact', long: LONG, onChange: function () { setErr('impact', ''); } });
  SV._zones = function () { return [shout.dz, impact.dz]; };   // pasting an audio file goes to the zone under the pointer
  consentBtn.addEventListener('click', function () {
    const on = consentBtn.getAttribute('aria-pressed') !== 'true';
    consentBtn.setAttribute('aria-pressed', String(on));
    if (on) setErr('consent', '');
  });

  // remember the typed text on this device (files can't be kept)
  try {
    const d = JSON.parse(SV.local.get(DRAFT) || '{}');
    Object.keys(F).forEach(function (k) { if (d[k] && !F[k].value) F[k].value = d[k]; });
  } catch (e) { /* no draft */ }
  Object.keys(F).forEach(function (k) {
    F[k].addEventListener('input', function () {
      if (k === 'x' && /^[@＠]/.test(F.x.value)) F.x.value = F.x.value.replace(/^[@＠]+/, '');   // the @ is already shown in front
      setErr(k, '');
      const d = {}; Object.keys(F).forEach(function (j) { d[j] = F[j].value; });
      SV.local.set(DRAFT, JSON.stringify(d));
    });
  });

  function normX(v) {
    return String(v || '').trim().replace(/^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\//i, '').replace(/^[@＠]+/, '').replace(/[/?#].*$/, '');
  }
  function validate() {
    const bad = [];
    const name = F.name.value.trim();
    if (!name) { setErr('name', 'Spoonでの活動名を入力してください'); bad.push(F.name); } else setErr('name', '');
    const x = normX(F.x.value);
    if (!x) { setErr('x', 'XのIDを入力してください'); bad.push(F.x); }
    else if (!/^[A-Za-z0-9_]{1,15}$/.test(x)) { setErr('x', 'XのIDを確認してください（英数字とアンダーバー、15文字まで）'); bad.push(F.x); }
    else { setErr('x', ''); F.x.value = x; }
    if (!icon.has()) { setErr('icon', 'アイコンの画像を選んでください'); bad.push($('#f-icon')); } else setErr('icon', '');
    const giga = F.giga.value.trim();
    if (giga && !/^https?:\/\/\S+$/i.test(giga)) { setErr('giga', 'URLを確認してください（https:// から始まるURL）'); bad.push(F.giga); } else setErr('giga', '');
    if (shout.busy() || impact.busy()) {
      setErr(shout.busy() ? 'shout' : 'impact', '録音中です。「止める」を押してから進んでください'); bad.push($(shout.busy() ? '#f-shout' : '#f-impact'));
    } else if (!shout.value() && !giga) { setErr('shout', '「スバラシー！」を録音するか、音声ファイルを選んでください'); bad.push($('#f-shout')); } else setErr('shout', '');
    if (consentBtn.getAttribute('aria-pressed') !== 'true') { setErr('consent', '使用許可の内容をご確認のうえ「使用を許可します」を押してください'); bad.push(consentBtn); } else setErr('consent', '');
    $('#form-err').textContent = bad.length ? '入力内容を確認してください（' + bad.length + '件）' : '';
    if (bad.length) {
      const first = bad[0];
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (first.focus) setTimeout(function () { first.focus({ preventScroll: true }); }, 300);
    }
    return !bad.length;
  }

  /* ---------- confirm & send ---------- */
  let pending = null;   // what is about to be sent, with one id per file so a retry never stores a second copy
  $('#jf').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) return;
    const btn = $('#jf button[type=submit]');
    btn.disabled = true;
    icon.export().then(function (ic) {
      btn.disabled = false;
      if (pending && pending.icon && pending.icon.url) URL.revokeObjectURL(pending.icon.url);
      pending = {
        sid: SV.sid('j'), name: F.name.value.trim(), x: normX(F.x.value), giga: F.giga.value.trim(), note: F.note.value.trim(),
        icon: Object.assign(ic, { sid: SV.sid('ji') }),
        shout: shout.value(), impact: impact.value(), ids: {},
      };
      if (pending.shout) pending.shout.sid = SV.sid('js');
      if (pending.impact) pending.impact.sid = SV.sid('jm');
      renderReview();
      $('#send-err').textContent = '';
      show('v-confirm');
    }, function () { btn.disabled = false; SV.toast('アイコンを用意できませんでした。もう一度お試しください'); });
  });
  function audioRow(label, v) {
    return '<div><dt>' + label + '</dt><dd>' + (v
      ? '<audio controls preload="metadata" src="' + v.url + '"></audio><span class="jg-review__file">' + (v.how === 'rec' ? '録音' : esc(v.name)) + (v.dur ? '・' + secs(v.dur) : '') + '</span>'
      : '<span class="jg-review__none">なし</span>') + '</dd></div>';
  }
  function renderReview() {
    const p = pending;
    $('#review').innerHTML =
      '<div><dt>アイコン</dt><dd><img class="jg-review__icon" src="' + p.icon.url + '" alt="アイコンの見え方"></dd></div>' +
      '<div><dt>Spoonでの活動名</dt><dd>' + esc(p.name) + '</dd></div>' +
      '<div><dt>XのID</dt><dd>@' + esc(p.x) + '</dd></div>' +
      audioRow('「スバラシー！」シャウト', p.shout) +
      audioRow('5秒インパクト', p.impact) +
      (p.giga ? '<div><dt>ギガファイル便のURL</dt><dd>' + esc(p.giga) + '</dd></div>' : '') +
      (p.note ? '<div><dt>備考</dt><dd>' + esc(p.note) + '</dd></div>' : '') +
      '<div><dt>使用許可</dt><dd>許可します</dd></div>';
  }
  $('#back').addEventListener('click', function () { SV.stopAudio($('#v-confirm')); show('v-form'); });

  function upload(kind, v, name) {
    const p = pending;
    if (p.ids[kind]) return Promise.resolve(p.ids[kind]);
    return SV.readBase64(v.blob).then(function (data) {
      return SV.api('jingleUpload', { sid: v.sid, kind: kind, fileName: name, mime: v.blob.type || '', data: data }, { timeout: 300000 });
    }).then(function (r) { p.ids[kind] = r.fileId; return r.fileId; });
  }
  let sending = false;
  $('#send').addEventListener('click', function () {
    if (sending || !pending) return;
    sending = true;
    SV.stopAudio($('#v-confirm'));
    const p = pending, btn = $('#send'), back = $('#back');
    const steps = 2 + (p.shout ? 1 : 0) + (p.impact ? 1 : 0);
    let n = 0;
    const step = function () { n++; btn.innerHTML = '<span class="spin"></span>送信中…（' + Math.min(n, steps) + '/' + steps + '）'; };
    btn.disabled = true; back.disabled = true; $('#send-err').textContent = '';
    step();
    SV.api('jingleCheck', { x: p.x })
      .then(function () { return upload('icon', p.icon, 'icon.jpg'); })
      .then(function () { if (!p.shout) return null; step(); return upload('shout', p.shout, p.shout.name); })
      .then(function () { if (!p.impact) return null; step(); return upload('impact', p.impact, p.impact.name); })
      .then(function () {
        step();
        const f = function (kind, v) { return v ? { fileId: p.ids[kind], dur: v.dur || 0, how: v.how } : null; };
        return SV.api('jingleSubmit', {
          sid: p.sid, name: p.name, x: p.x, giga: p.giga, note: p.note, consent: true, terms: TERMS,
          icon: { fileId: p.ids.icon, thumb: p.icon.thumb }, shout: f('shout', p.shout), impact: f('impact', p.impact),
        });
      })
      .then(function () {
        SV.local.del(DRAFT);
        const text = 'SVARAC（スバラシー）のジングルに声を応募しました！\n#スバラシー\n' + PAGE;
        $('#share').href = 'https://x.com/intent/post?text=' + encodeURIComponent(text);
        show('v-done');
      }, function (err) {
        $('#send-err').textContent = err.message || '送信できませんでした。もう一度お試しください';
      })
      .finally(function () { sending = false; btn.disabled = false; back.disabled = false; btn.textContent = 'この内容で送信する'; });
  });

  $('#again').addEventListener('click', function () {
    icon.reset(); shout.reset(); impact.reset();
    F.giga.value = ''; F.note.value = '';
    consentBtn.setAttribute('aria-pressed', 'false');
    pending = null;
    show('v-form');
  });

  // a gentle "leave this page?" while something recorded or chosen hasn't been sent
  window.addEventListener('beforeunload', function (e) {
    if ($('#v-done').hidden && (icon.has() || shout.value() || impact.value())) { e.preventDefault(); e.returnValue = ''; }
  });

  // closed?
  if (SV.ready) {
    SV.api('jingleInfo', {}, { retries: 1, timeout: 20000 }).then(function (r) { if (r && r.open === false) show('v-closed'); }, function () { /* the form still works; sending will say so */ });
  }
})();
