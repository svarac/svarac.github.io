/* SVARAC 出演者提出ページ — shared helpers (API, name search, audio drop zones). */
(function () {
  'use strict';
  const SV = (window.SV = window.SV || {});
  const cfg = window.SVARAC_ENTRY || {};
  SV.apiUrl = cfg.api || '';
  SV.ready = /^https?:\/\//.test(SV.apiUrl) || SV.apiUrl.charAt(0) === '/';
  SV.MAX_BYTES = 30 * 1024 * 1024;
  SV.AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'aif', 'aiff', 'flac', 'ogg', 'oga', 'opus', 'webm', 'mp4', 'caf', 'wma'];

  /* ---------- API ----------
     text/plain POST keeps the request "simple", so Apps Script needs no CORS preflight. */
  SV.api = function (action, data, opt) {
    opt = opt || {};
    if (!SV.ready) return Promise.reject(new Error('受付の準備中です。しばらくしてからお試しください'));
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, opt.timeout || 180000) : 0;
    return fetch(SV.apiUrl, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: action }, data || {})),
      redirect: 'follow',
      signal: ctl ? ctl.signal : undefined,
    }).then(function (res) {
      return res.text().then(function (txt) {
        let json;
        try { json = JSON.parse(txt); } catch (e) { throw new Error('通信に失敗しました（' + res.status + '）。もう一度お試しください'); }
        if (!json.ok) throw new Error(json.error || 'エラーが発生しました');
        return json;
      });
    }, function (err) {
      if (err && err.name === 'AbortError') throw new Error('時間がかかりすぎたため中断しました。電波の良いところでもう一度お試しください');
      throw new Error('通信に失敗しました。電波の良いところでもう一度お試しください');
    }).finally(function () { clearTimeout(timer); });
  };

  /* ---------- small utils ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  SV.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  SV.$ = function (sel, root) { return (root || document).querySelector(sel); };
  SV.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  SV.kana = function (s) {
    return String(s || '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/[\s・･.,、。]/g, '');
  };
  SV.bytes = function (n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  };
  SV.dur = function (sec) {
    sec = Number(sec);
    if (!isFinite(sec) || sec <= 0) return '';
    const s = Math.round(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  SV.ext = function (name) {
    const m = String(name || '').match(/\.([A-Za-z0-9]{1,5})$/);
    return m ? m[1].toLowerCase() : '';
  };
  SV.isAudio = function (file) {
    return /^audio\//.test(file.type || '') || SV.AUDIO_EXT.indexOf(SV.ext(file.name)) >= 0;
  };
  SV.safeName = function (s) {
    return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'noname';
  };
  SV.readBase64 = function (file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
      r.onerror = function () { reject(new Error('ファイルを読み込めませんでした。もう一度選び直してください')); };
      r.readAsDataURL(file);
    });
  };
  SV.toast = function (msg) {
    let t = document.getElementById('sv-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sv-toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.hidden = true; }, 2400);
  };
  SV.store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  SV.icon = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  };

  /* ---------- name combobox ----------
     Suggests from the first character of the reading (hiragana/katakana treated alike) or the name. */
  SV.combobox = function (wrap, opts) {
    const input = SV.$('input', wrap);
    const list = document.createElement('ul');
    list.className = 'combo__list';
    list.id = input.id + '-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(list);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('autocomplete', 'off');
    let items = [], active = -1, picked = null;

    function match(q) {
      const all = opts.items();
      if (!q) return [];
      const head = [], rest = [];
      all.forEach(function (g) {
        const y = SV.kana(g.yomi), n = SV.kana(g.name);
        if (y.indexOf(q) === 0 || n.indexOf(q) === 0) head.push(g);
        else if (y.indexOf(q) > 0 || n.indexOf(q) > 0) rest.push(g);
      });
      return head.concat(rest).slice(0, 8);
    }
    function render() {
      const q = SV.kana(input.value);
      items = match(q);
      active = items.length ? 0 : -1;
      if (!q || (picked && picked.name === input.value)) { close(); return; }
      list.innerHTML = items.length
        ? items.map(function (g, i) {
          return '<li class="combo__opt" role="option" id="' + list.id + '-' + i + '" data-i="' + i + '" aria-selected="' + (i === active) + '"><b>' + SV.esc(g.name) + '</b><small>' + SV.esc(g.yomi) + '</small></li>';
        }).join('')
        : '<li class="combo__none" role="presentation">一致する名前がありません。読みをひらがなで入れてみてください</li>';
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-activedescendant', active >= 0 ? list.id + '-' + active : '');
    }
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function setActive(i) {
      if (!items.length) return;
      active = (i + items.length) % items.length;
      SV.$$('.combo__opt', list).forEach(function (li, j) { li.setAttribute('aria-selected', String(j === active)); });
      input.setAttribute('aria-activedescendant', list.id + '-' + active);
      const el = document.getElementById(list.id + '-' + active);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
    function pick(g) {
      picked = g;
      input.value = g ? g.name : '';
      wrap.classList.toggle('is-picked', !!g);
      close();
      opts.onPick(g);
    }
    input.addEventListener('input', function () {
      if (picked && input.value !== picked.name) { picked = null; wrap.classList.remove('is-picked'); opts.onPick(null); }
      render();
    });
    input.addEventListener('focus', function () { if (!picked) render(); });
    input.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(); else setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { if (!list.hidden && items[active]) { e.preventDefault(); pick(items[active]); } }
      else if (e.key === 'Escape') { close(); }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        close();
        if (!picked) {
          const exact = opts.items().filter(function (g) { return g.name === input.value.trim(); })[0];
          if (exact) pick(exact);
        }
      }, 150);
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) {
      const li = e.target.closest('.combo__opt');
      if (li) pick(items[Number(li.getAttribute('data-i'))]);
    });
    return {
      get: function () { return picked; },
      set: function (g) { pick(g); },
    };
  };

  /* ---------- audio drop zone ----------
     Drag & drop, tap to choose, or paste; previews the sound and reads its length right away. */
  SV.dropzone = function (el, opts) {
    const id = 'f-' + opts.slot + '-' + Math.random().toString(36).slice(2, 7);
    el.classList.add('drop');
    el.innerHTML =
      '<div class="drop__h">' + SV.esc(opts.label) + (opts.required ? ' <span class="tag tag--req">必須</span>' : '') + '</div>' +
      '<div class="drop__prev" hidden></div>' +
      '<div class="drop__pick">' +
        '<input class="drop__input sr" type="file" id="' + id + '" accept="audio/*,.mp3,.wav,.m4a,.aac,.aif,.aiff,.flac,.ogg,.opus,.caf">' +
        '<label class="drop__zone" for="' + id + '">' + SV.icon.note +
          '<span class="drop__main">ここに音源をドラッグ＆ドロップ</span>' +
          '<span class="drop__sub">またはタップしてファイルを選択<br>mp3・wav・m4a など／30MBまで</span>' +
        '</label>' +
      '</div>' +
      '<div class="drop__file" hidden>' +
        '<div class="drop__meta"><span class="drop__name"></span><span class="drop__info"></span></div>' +
        '<audio controls preload="metadata"></audio>' +
        '<p class="hint drop__nop" hidden>このブラウザでは試聴できない形式ですが、このまま提出できます。</p>' +
        '<div class="drop__actions"><button type="button" class="btn btn--line btn--sm" data-act="change">別のファイルにする</button><button type="button" class="btn btn--ghost btn--sm" data-act="clear">取り消す</button></div>' +
      '</div>' +
      '<p class="err" id="' + id + '-err"></p>';
    const input = SV.$('.drop__input', el), pickBox = SV.$('.drop__pick', el), fileBox = SV.$('.drop__file', el);
    const audio = SV.$('audio', el), nameEl = SV.$('.drop__name', el), infoEl = SV.$('.drop__info', el), nop = SV.$('.drop__nop', el);
    const errEl = SV.$('.err', el), prev = SV.$('.drop__prev', el);
    let file = null, url = '', duration = 0;

    function setErr(msg) { errEl.textContent = msg || ''; el.classList.toggle('is-invalid', !!msg); }
    function info() { infoEl.textContent = [SV.bytes(file.size), SV.dur(duration)].filter(Boolean).join('・'); }
    function setFile(f) {
      if (f && !SV.isAudio(f)) { setErr('音声ファイル（mp3・wav・m4a など）を選んでください'); return; }
      if (f && f.size > SV.MAX_BYTES) { setErr('30MBを超えるファイルは、下のギガファイル便の欄からご提出ください'); return; }
      if (url) URL.revokeObjectURL(url);
      file = f || null; url = ''; duration = 0;
      setErr('');
      pickBox.hidden = !!file;
      fileBox.hidden = !file;
      nop.hidden = true;
      if (file) {
        url = URL.createObjectURL(file);
        audio.src = url;
        nameEl.textContent = file.name;
        info();
      } else {
        audio.removeAttribute('src');
        input.value = '';
      }
      if (opts.onChange) opts.onChange(file);
    }
    audio.addEventListener('loadedmetadata', function () { duration = isFinite(audio.duration) ? audio.duration : 0; if (file) info(); });
    audio.addEventListener('error', function () { if (file) nop.hidden = false; });
    input.addEventListener('change', function () { if (input.files && input.files[0]) setFile(input.files[0]); });
    fileBox.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.getAttribute('data-act') === 'clear') setFile(null);
      else input.click();
    });
    ['dragenter', 'dragover'].forEach(function (t) {
      el.addEventListener(t, function (e) { e.preventDefault(); el.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      el.addEventListener(t, function (e) { e.preventDefault(); if (t === 'drop' || !el.contains(e.relatedTarget)) el.classList.remove('is-over'); });
    });
    el.addEventListener('drop', function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setFile(f);
    });
    el.addEventListener('pointerenter', function () { SV._pasteTarget = api; });
    el.addEventListener('focusin', function () { SV._pasteTarget = api; });

    const api = {
      el: el,
      slot: opts.slot,
      file: function () { return file; },
      duration: function () { return duration; },
      url: function () { return url; },
      setFile: setFile,
      setErr: setErr,
      setPrevious: function (html) { prev.innerHTML = html || ''; prev.hidden = !html; },
    };
    return api;
  };
  // paste an audio file (copied in Finder/Explorer) into the zone under the pointer, else the first empty one
  document.addEventListener('paste', function (e) {
    const zones = SV._zones || [];
    if (!zones.length) return;
    const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
    if (!f || !SV.isAudio(f)) return;
    const visible = zones.filter(function (z) { return z.el.offsetParent !== null; });
    if (!visible.length) return;
    e.preventDefault();
    const t = visible.indexOf(SV._pasteTarget) >= 0 ? SV._pasteTarget : visible.filter(function (z) { return !z.file(); })[0] || visible[0];
    t.setFile(f);
  });
})();
