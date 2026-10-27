/* SVARAC 出演者提出ページ — shared helpers (API, name search, audio drop zones). */
(function () {
  'use strict';
  // older Safari lacks Promise#finally
  if (typeof Promise !== 'undefined' && !Promise.prototype.finally) {
    Promise.prototype.finally = function (fn) {
      return this.then(function (v) { return Promise.resolve(fn()).then(function () { return v; }); },
        function (e) { return Promise.resolve(fn()).then(function () { throw e; }); });
    };
  }
  const SV = (window.SV = window.SV || {});
  const cfg = window.SVARAC_ENTRY || {};
  SV.apiUrl = cfg.api || '';
  SV.ready = /^https?:\/\//.test(SV.apiUrl) || SV.apiUrl.charAt(0) === '/';
  SV.MAX_BYTES = 30 * 1024 * 1024;
  SV.AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'aif', 'aiff', 'flac', 'ogg', 'oga', 'opus', 'webm', 'mp4', 'caf', 'wma'];

  /* ---------- API ----------
     text/plain POST keeps the request "simple", so Apps Script needs no CORS preflight.
     Network trouble, timeouts and "busy / temporary error" answers are retried automatically;
     every write carries an id (sid) so a retry can never create a second copy. */
  function once(action, data, opt) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, opt.timeout || 180000) : 0;
    const mk = function (msg, retryable) { const e = new Error(msg); e.retryable = !!retryable; return e; };
    return fetch(SV.apiUrl, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: action }, data || {})),
      redirect: 'follow',
      signal: ctl ? ctl.signal : undefined,
    }).then(function (res) {
      return res.text().then(function (txt) {
        let json;
        try { json = JSON.parse(txt); } catch (e) { throw mk('通信に失敗しました（' + res.status + '）。少し待ってからもう一度お試しください', true); }
        if (!json || !json.ok) throw mk((json && json.error) || 'エラーが発生しました', json && json.retry);
        return json;
      });
    }, function (err) {
      if (err && err.name === 'AbortError') throw mk('時間がかかりすぎたため中断しました。電波の良いところでもう一度お試しください', true);
      throw mk('通信に失敗しました。電波の良いところでもう一度お試しください', true);
    }).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }
  SV.api = function (action, data, opt) {
    opt = opt || {};
    if (!SV.ready) return Promise.reject(new Error('受付の準備中です。しばらくしてからお試しください'));
    const max = opt.retries === undefined ? 2 : opt.retries;
    let n = 0;
    const go = function () {
      return once(action, data, opt).catch(function (err) {
        if (!err.retryable || n >= max) throw err;
        n++;
        if (opt.onRetry) opt.onRetry(n);
        return new Promise(function (r) { setTimeout(r, n === 1 ? 2000 : 5000); }).then(go);
      });
    };
    return go();
  };
  SV.sid = function (prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
    const s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  SV.stopAudio = function (root) {
    SV.$$('audio', root || document).forEach(function (a) { try { a.pause(); } catch (e) { /* ignore */ } });
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
  // remembered on this device only (drafts, "stay logged in"); never required for anything to work
  SV.local = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage full / private mode */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  SV.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  };
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      t.remove();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }
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
     Drag & drop, tap to choose, or paste; previews the sound and reads its length right away.
     Choosing or dropping several files at once hands the extras to opts.onExtra. */
  SV.dropzone = function (el, opts) {
    const id = 'f-' + opts.slot + '-' + Math.random().toString(36).slice(2, 7);
    el.classList.add('drop');
    el.innerHTML =
      '<div class="drop__h" hidden><span class="drop__no"></span><button type="button" class="linkbtn drop__rm" hidden>この欄を消す</button></div>' +
      '<div class="drop__pick">' +
        '<input class="drop__input sr" type="file" id="' + id + '"' + (opts.multiple ? ' multiple' : '') + ' accept="audio/*,.mp3,.wav,.m4a,.aac,.aif,.aiff,.flac,.ogg,.opus,.caf">' +
        '<label class="drop__zone" for="' + id + '">' + SV.icon.note +
          '<span class="drop__main">ここに音源をドラッグ＆ドロップ</span>' +
          '<span class="drop__sub">またはタップしてファイルを選択<br>mp3・wav・m4a など／1本30MBまで</span>' +
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
    const errEl = SV.$('.err', el), head = SV.$('.drop__h', el), noEl = SV.$('.drop__no', el), rmBtn = SV.$('.drop__rm', el);
    let file = null, url = '', duration = 0;

    function setErr(msg) { errEl.textContent = msg || ''; el.classList.toggle('is-invalid', !!msg); }
    function info() { infoEl.textContent = [SV.bytes(file.size), SV.dur(duration)].filter(Boolean).join('・'); }
    function check(f) {
      if (!SV.isAudio(f)) return '音声ファイル（mp3・wav・m4a など）を選んでください';
      if (f.size > SV.MAX_BYTES) return '30MBを超えるファイルは、下のギガファイル便の欄からご提出ください';
      return '';
    }
    function setFile(f) {
      if (f) { const bad = check(f); if (bad) { setErr(bad); return false; } }
      SV.stopAudio(el);
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
      return true;
    }
    function take(list) {
      list = Array.prototype.slice.call(list || []);
      if (!list.length) return;
      setFile(list[0]);
      if (list.length > 1 && opts.onExtra) opts.onExtra(list.slice(1));
    }
    audio.addEventListener('loadedmetadata', function () { duration = isFinite(audio.duration) ? audio.duration : 0; if (file) info(); });
    audio.addEventListener('error', function () { if (file) nop.hidden = false; });
    input.addEventListener('change', function () { const fs = input.files; take(fs); });
    fileBox.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.getAttribute('data-act') === 'clear') setFile(null);
      else input.click();
    });
    rmBtn.addEventListener('click', function () { if (opts.onRemove) opts.onRemove(); });
    ['dragenter', 'dragover'].forEach(function (t) {
      el.addEventListener(t, function (e) { e.preventDefault(); el.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      el.addEventListener(t, function (e) { e.preventDefault(); if (t === 'drop' || !el.contains(e.relatedTarget)) el.classList.remove('is-over'); });
    });
    el.addEventListener('drop', function (e) { take(e.dataTransfer && e.dataTransfer.files); });
    el.addEventListener('pointerenter', function () { SV._pasteTarget = api; });
    el.addEventListener('focusin', function () { SV._pasteTarget = api; });

    const api = {
      el: el,
      slot: opts.slot,
      file: function () { return file; },
      duration: function () { return duration; },
      url: function () { return url; },
      check: check,
      setFile: setFile,
      setErr: setErr,
      /* "2本目" etc. Shown only when the list has more than one */
      setNo: function (no, removable) {
        head.hidden = !no;
        noEl.textContent = no ? no + '本目' : '';
        rmBtn.hidden = !removable;
      },
    };
    return api;
  };

  /* ---------- a list of audio drop zones with "＋ 追加する" ---------- */
  SV.audioList = function (el, opts) {
    const max = opts.max || 5;
    el.classList.add('alist');
    el.innerHTML =
      '<div class="alist__h">' + SV.esc(opts.label) + (opts.required ? ' <span class="tag tag--req">必須</span>' : '') + '</div>' +
      '<div class="alist__prev" hidden></div>' +
      '<div class="alist__items"></div>' +
      '<button type="button" class="btn btn--line btn--sm alist__add">＋ ' + SV.esc(opts.addLabel || '追加する') + '</button>' +
      '<p class="hint alist__hint">複数ある場合は「＋追加する」で欄を増やせます（' + max + '本まで）。ファイルをまとめて選んでも入ります。</p>' +
      '<p class="err alist__err"></p>';
    const itemsEl = SV.$('.alist__items', el), addBtn = SV.$('.alist__add', el), errEl = SV.$('.alist__err', el), prev = SV.$('.alist__prev', el);
    const zones = [];

    function setErr(msg) { errEl.textContent = msg || ''; el.classList.toggle('is-invalid', !!msg); }
    function sync() {
      zones.forEach(function (z, i) { z.setNo(zones.length > 1 ? i + 1 : 0, zones.length > 1); });
      addBtn.hidden = zones.length >= max;
    }
    function changed(f) {
      setErr('');
      if (opts.onChange) opts.onChange(f);
    }
    function add() {
      if (zones.length >= max) return null;
      const box = document.createElement('div');
      itemsEl.appendChild(box);
      const z = SV.dropzone(box, {
        slot: opts.slot, multiple: true,
        onExtra: function (files) { addMany(files); },
        onRemove: function () { remove(z); },
        onChange: changed,
      });
      zones.push(z);
      sync();
      return z;
    }
    function addMany(files) {
      let skipped = 0;
      files.forEach(function (f) {
        if (!SV.isAudio(f)) { skipped++; return; }
        const z = zones.filter(function (x) { return !x.file(); })[0] || add();
        if (!z) { skipped++; return; }
        if (!z.setFile(f)) skipped++;
      });
      if (skipped) SV.toast(skipped + '件は入れられませんでした（' + max + '本まで・音声ファイル・1本30MBまで）');
    }
    function remove(z) {
      const i = zones.indexOf(z);
      if (i < 0) return;
      if (zones.length <= 1) { z.setFile(null); return; }
      z.setFile(null);
      zones.splice(i, 1);
      z.el.remove();
      sync();
      changed(null);
    }
    addBtn.addEventListener('click', function () {
      const z = add();
      if (z) { const lab = SV.$('.drop__zone', z.el); if (lab) lab.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
    add();

    return {
      el: el,
      zones: function () { return zones.slice(); },
      /* the zones that have a file, in order */
      items: function () {
        return zones.filter(function (z) { return z.file(); }).map(function (z) {
          return { file: z.file(), dur: z.duration(), url: z.url() };
        });
      },
      setErr: setErr,
      setPrevious: function (html) { prev.innerHTML = html || ''; prev.hidden = !html; },
    };
  };

  /* ---------- safety net ----------
     If something in our own scripts breaks, say so plainly and offer a reload and a way to reach the team. */
  SV.crash = function () {
    if (document.getElementById('sv-crash')) return;
    const d = document.createElement('div');
    d.id = 'sv-crash';
    d.className = 'crash';
    d.setAttribute('role', 'alert');
    d.innerHTML = '<p><b>ページの一部がうまく動いていません。</b><br>再読み込みしても直らない場合は、お手数ですが運営へDMでご連絡ください（入力途中の文字はこの端末に保存されています）。</p>' +
      '<button type="button" class="btn btn--gold btn--sm">再読み込み</button>';
    d.querySelector('button').addEventListener('click', function () { location.reload(); });
    document.body.appendChild(d);
  };
  window.addEventListener('error', function (e) {
    if (e && e.filename && e.filename.indexOf('/entry/') >= 0) SV.crash();
  });

  // paste an audio file (copied in Finder/Explorer) into the zone under the pointer, else the first empty one
  document.addEventListener('paste', function (e) {
    const zones = typeof SV._zones === 'function' ? SV._zones() : (SV._zones || []);
    if (!zones.length) return;
    const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
    if (!f || !SV.isAudio(f)) return;
    const visible = zones.filter(function (z) { return z.el.offsetParent !== null; });
    if (!visible.length) return;
    e.preventDefault();
    const t = visible.indexOf(SV._pasteTarget) >= 0 ? SV._pasteTarget : visible.filter(function (z) { return !z.file(); })[0];
    if (t) t.setFile(f);
    else SV.toast('空いている欄がありません。「＋追加する」で欄を増やしてから貼り付けてください');
  });
})();
