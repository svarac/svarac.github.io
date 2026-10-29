/* SVARAC 提出管理 — guests, submission status, review, downloads, proxy entry and X contact shortcuts. */
(function () {
  'use strict';
  const SV = window.SV, $ = SV.$, $$ = SV.$$, esc = SV.esc;
  const app = $('#app');
  const KEY = 'svarac_admin_pw';
  const local = SV.local;
  const STATUS = ['', '新着', '再提出', '不備あり', 'OK'];
  const ST_LABEL = { '': '未提出', '新着': '未確認', '再提出': '再提出', '不備あり': '不備あり', 'OK': 'OK' };
  const ST_CLASS = { '': 'st-none', '新着': 'st-new', '再提出': 'st-re', '不備あり': 'st-ng', 'OK': 'st-ok' };
  const ST_ORDER = { '再提出': 0, '新着': 1, '不備あり': 2, '': 3, 'OK': 4 };
  const TPL = [['request', '依頼'], ['remind', 'リマインド'], ['ng', '不備連絡'], ['ok', '確認OK']];
  const KEYS = ['a', 'b', 'c', 'd'];

  let pw = SV.store.get(KEY) || local.get(KEY) || '';
  let D = null;                 // { guests, settings, links }
  const details = {};           // guestId -> guestDetail
  const blobs = {};             // fileId -> Promise<Blob>
  const filter = { status: 'all', date: 'all', q: '' };

  function A(action, data, opt) {
    return SV.api(action, Object.assign({ pw: pw }, data || {}), opt).catch(function (err) {
      if (/パスワードが違います/.test(err.message)) logout();
      throw err;
    });
  }
  function load() { return A('adminData').then(function (r) { D = r; return r; }); }
  function guestOf(id) { return (D.guests || []).filter(function (g) { return g.id === id; })[0]; }
  function asFlowGuest(g) {
    const s = g.sum || {};
    return { id: g.id, name: String(g.name), yomi: String(g.yomi), type: g.type, done: { quiz: !!s.quizAt, intro: !!s.intro, quizAudio: !!s.quizAudio, cm: !!s.cm, giga: !!s.giga } };
  }
  function logout() {
    pw = ''; D = null;
    SV.store.del(KEY); local.del(KEY);
    if (location.hash) location.hash = ''; else route();
  }
  function shortAt(at) { return at ? String(at).slice(5, 16) : ''; }
  function typeLabel(t) { return t === 'B' ? 'B ボイメのみ' : t === 'C' ? 'C CMのみ' : 'A クイズ案＋ボイメ'; }
  /* the audio fields a guest is asked for, plus any other kind they happen to have handed in */
  function audioSlots(g) {
    const s = g.sum || {};
    const all = [['intro', '自己紹介', s.intro], ['quizAudio', 'クイズ', s.quizAudio], ['cm', 'CM', s.cm]];
    return all.filter(function (x) { return x[2] || (g.type === 'C' ? x[0] === 'cm' : x[0] !== 'cm'); });
  }
  function stBadge(s) { s = s || ''; return '<span class="st ' + ST_CLASS[s] + '">' + ST_LABEL[s] + '</span>'; }
  const copy = SV.copy;
  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }
  function getBlob(fileId) {
    if (!blobs[fileId]) {
      blobs[fileId] = A('fileData', { fileId: fileId }, { timeout: 330000 }).then(function (r) {
        const bin = atob(r.data), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: r.mime || 'application/octet-stream' });
      }).catch(function (err) { delete blobs[fileId]; throw err; });
    }
    return blobs[fileId];
  }
  /* 名前_自己紹介.wav / 名前_クイズ1.wav, 名前_クイズ2.wav … (numbered only when there are several) */
  function dlName(g, label, fileName, no, count) {
    return SV.safeName(g.name) + '_' + label + (count > 1 ? no : '') + (SV.ext(fileName) ? '.' + SV.ext(fileName) : '');
  }
  function slotFiles(g, label, sl) {
    const files = (sl && sl.files) || [];
    return files.map(function (f, i) {
      return { id: f.id, name: f.name, size: f.size, dur: f.dur, label: label + (files.length > 1 ? (i + 1) : ''), dl: dlName(g, label, f.name, i + 1, files.length) };
    });
  }

  /* ---------- shell ---------- */
  function shell(opt, body) {
    const back = opt.back !== undefined
      ? '<a class="bar__back" href="' + opt.back + '">' + SV.icon.back + (opt.backLabel || '一覧') + '</a>'
      : '<img class="bar__logo" src="../assets/img/logo_svarac_mono-white.svg" alt="SVARAC" width="72" height="22">';
    app.innerHTML =
      '<header class="bar adm-bar">' + back + '<h1 class="bar__title">' + esc(opt.title || '提出管理') + '</h1>' +
        '<nav class="adm-bar__nav">' + (opt.hideSettings ? '' : '<a class="btn btn--ghost btn--sm" href="#settings">設定</a>') + '</nav>' +
      '</header>' +
      '<main class="wrap wrap--wide page">' + body + '</main>';
    window.scrollTo(0, 0);
  }
  function renderLoading() { shell({}, '<div class="loading"><span class="spin"></span>読み込んでいます…</div>'); }
  function renderError(err) {
    shell({}, '<p class="notice notice--err">' + esc(err.message) + '</p><div class="actions"><button class="btn btn--line btn--lg" id="retry">もう一度読み込む</button></div>');
    $('#retry').addEventListener('click', function () { D = null; route(); });
  }

  /* ---------- login ---------- */
  function renderLogin(msg) {
    app.innerHTML =
      '<main class="wrap adm-login">' +
        '<img src="../assets/img/logo_full.svg" alt="SVARAC" width="1309" height="507">' +
        '<h1>提出管理</h1>' +
        (SV.ready ? '' : '<p class="notice notice--err">config.js に受け皿のURLがまだ入っていません。</p>') +
        '<form class="card" novalidate>' +
          '<div class="field"><label for="pw">パスワード</label><input class="input" type="password" id="pw" autocomplete="current-password" required></div>' +
          '<label class="check"><input type="checkbox" id="keep">このブラウザでログインを保持する</label>' +
          '<p class="err" id="login-err">' + esc(msg || '') + '</p>' +
          '<button class="btn btn--red btn--lg btn--block" type="submit">ログイン</button>' +
        '</form>' +
      '</main>';
    const form = $('form', app), input = $('#pw'), err = $('#login-err');
    input.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const val = input.value;
      if (!val) { err.textContent = 'パスワードを入力してください'; return; }
      const btn = $('button[type=submit]', form);
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>確認中…';
      SV.api('login', { pw: val }).then(function () {
        pw = val;
        SV.store.set(KEY, val);
        if ($('#keep').checked) local.set(KEY, val);
        route();
      }, function (e2) {
        btn.disabled = false; btn.textContent = 'ログイン';
        err.textContent = e2.message;
      });
    });
  }

  /* ---------- list ---------- */
  function progChips(g) {
    const s = g.sum || {}, out = [];
    const chip = function (label, st) {
      const cls = st === 'ok' ? 'pc--ok' : st === 'giga' ? 'pc--giga' : 'pc--no';
      const mark = st === 'ok' ? '✓' : st === 'giga' ? 'ギガ' : '−';
      return '<span class="pc ' + cls + '">' + mark + ' ' + label + '</span>';
    };
    if ((g.type !== 'B' && g.type !== 'C') || s.quizAt) out.push(chip('クイズ案', s.quizAt ? 'ok' : 'no'));
    const n = function (sl) { return sl && sl.files && sl.files.length > 1 ? ' ×' + sl.files.length : ''; };
    audioSlots(g).forEach(function (x) {
      out.push(chip((x[0] === 'quizAudio' ? 'クイズ音源' : x[1] === 'CM' ? 'CM音源' : x[1]) + n(x[2]), x[2] ? 'ok' : s.giga ? 'giga' : 'no'));
    });
    return out.join('');
  }
  function matches(g) {
    const st = g.status || '';
    if (filter.status === 'todo' && !(st === '新着' || st === '再提出')) return false;
    if (filter.status !== 'all' && filter.status !== 'todo' && st !== filter.status) return false;
    if (filter.date !== 'all' && String(g.date) !== filter.date) return false;
    if (filter.q) {
      const q = SV.kana(filter.q);
      if (SV.kana(g.name).indexOf(q) < 0 && SV.kana(g.yomi).indexOf(q) < 0 && SV.kana(g.x).indexOf(q) < 0) return false;
    }
    return true;
  }
  function renderList() {
    const all = D.guests.slice().sort(function (a, b) {
      const d = ST_ORDER[a.status || ''] - ST_ORDER[b.status || ''];
      return d || (a.yomi < b.yomi ? -1 : a.yomi > b.yomi ? 1 : 0);
    });
    const dates = all.map(function (g) { return String(g.date); }).filter(function (d, i, arr) { return d && arr.indexOf(d) === i; }).sort();
    if (filter.date !== 'all' && dates.indexOf(filter.date) < 0) filter.date = 'all';
    const inDate = all.filter(function (g) { return filter.date === 'all' || String(g.date) === filter.date; });
    const count = function (fn) { return inDate.filter(fn).length; };
    const chips = [
      ['all', 'すべて', inDate.length],
      ['todo', '要確認', count(function (g) { return g.status === '新着' || g.status === '再提出'; })],
      ['不備あり', '不備あり', count(function (g) { return g.status === '不備あり'; })],
      ['', '未提出', count(function (g) { return !g.status; })],
      ['OK', 'OK', count(function (g) { return g.status === 'OK'; })],
    ];
    const errs = D.errors || [];
    shell({},
      (errs.length ? '<p class="notice notice--err" style="margin-bottom:16px">直近7日で、受け皿に想定外のエラーが' + errs.length + '件ありました（最新：' + esc(errs[0].at.slice(5, 16)) + '）。送れなかったゲストがいないか確認してください。くわしくはスプレッドシートの「エラー記録」シートにあります。</p>' : '') +
      '<div class="adm-head"><h2 class="adm-h">ゲスト一覧<small>' + all.length + '人</small></h2><a class="btn btn--gold" href="#new">＋ ゲストを登録</a></div>' +
      (all.length ? '<div class="adm-filters">' +
        '<div class="chips">' + chips.map(function (c) {
          return '<button type="button" class="chip" data-st="' + esc(c[0]) + '" aria-pressed="' + (filter.status === c[0]) + '">' + c[1] + ' <b>' + c[2] + '</b></button>';
        }).join('') + '</div>' +
        '<div class="adm-filter-row">' +
          '<select class="select" id="f-date" aria-label="回で絞り込み"><option value="all">すべての回</option>' + dates.map(function (d) {
            return '<option value="' + esc(d) + '"' + (filter.date === d ? ' selected' : '') + '>回 ' + esc(d) + '</option>';
          }).join('') + '</select>' +
          '<input class="input" type="search" id="f-q" placeholder="名前・読み・XのIDで探す" value="' + esc(filter.q) + '" aria-label="ゲストを探す">' +
        '</div></div>' +
        '<ul class="glist" id="glist"></ul>'
      : '<div class="empty-state"><p>まだゲストが登録されていません。</p><a class="btn btn--gold btn--lg" href="#new">＋ 最初のゲストを登録</a></div>'));
    if (!all.length) return;
    const listEl = $('#glist');
    function draw() {
      const rows = all.filter(matches);
      listEl.innerHTML = rows.length ? rows.map(function (g) {
        const s = g.sum || {};
        return '<li><a class="grow" href="#g/' + esc(g.id) + '">' +
          '<div class="grow__main">' +
            '<div class="grow__name">' + esc(g.name) + '<small>' + esc(g.yomi) + '</small></div>' +
            '<div class="grow__tags"><span class="pill pill--type">' + typeLabel(g.type) + '</span>' + (g.date ? '<span class="pill">回 ' + esc(g.date) + '</span>' : '') +
              (g.open === false || String(g.open).toUpperCase() === 'FALSE' ? '<span class="pill pill--warn">受付停止</span>' : '') + '</div>' +
            '<div class="prog">' + progChips(g) + '</div>' +
          '</div>' +
          '<div class="grow__side">' + stBadge(g.status) + (s.lastAt ? '<span class="grow__at">最終 ' + esc(shortAt(s.lastAt)) + '</span>' : '') + '</div>' +
        '</a></li>';
      }).join('') : '<li class="empty-state">該当するゲストはいません</li>';
    }
    draw();
    $$('.chip[data-st]').forEach(function (b) {
      b.addEventListener('click', function () {
        filter.status = b.getAttribute('data-st');
        $$('.chip[data-st]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        draw();
      });
    });
    $('#f-date').addEventListener('change', function (e) { filter.date = e.target.value; renderList(); });
    $('#f-q').addEventListener('input', function (e) { filter.q = e.target.value.trim(); draw(); });
  }

  /* ---------- detail ---------- */
  function fillTpl(key, g, memo) {
    const tpl = D.settings['tpl_' + key] || '';
    return tpl.replace(/\{名前\}/g, g.name)
      .replace(/\{URL\}/g, D.settings.url || '')
      .replace(/\{内容\}/g, g.type === 'B' ? 'ボイメ' : g.type === 'C' ? 'CMの音源' : 'クイズ案（2問）とボイメ')
      .replace(/\{メモ\}/g, memo || '（ここに修正してほしい内容）');
  }
  function defaultTpl(status) { return !status ? 'request' : status === '不備あり' ? 'ng' : status === 'OK' ? 'ok' : 'ok'; }

  function quizBlock(r) {
    return [1, 2].map(function (n) {
      const p = 'q' + n, ans = r[p + 'ans'];
      return '<div class="qv"><div class="qv__h"><span class="no">Q' + n + '</span>第' + n + '問</div>' +
        '<p class="qv__text">' + esc(r[p]) + '</p>' +
        '<ul class="opts">' + KEYS.map(function (k) {
          const q = { ans: ans };
          KEYS.forEach(function (x) { q[x] = r[p + x]; });
          return SV.quizOptHtml(q, k);
        }).join('') + '</ul></div>';
    }).join('') + (r.note ? '<div class="qnote"><b>備考・メッセージ</b>' + esc(r.note) + '</div>' : '');
  }
  function quizText(g, r) {
    return g.name + '\n' + [1, 2].map(function (n) {
      const p = 'q' + n;
      return '【第' + n + '問】' + r[p] + '\n' + KEYS.filter(function (k) { return !SV.isBlankChoice(r[p + k]); }).map(function (k) { return k.toUpperCase() + '. ' + r[p + k]; }).join('\n') + '\n正解：' + r[p + 'ans'];
    }).join('\n\n') + (r.note ? '\n\n備考：' + r.note : '');
  }
  function audioSlot(g, label, sl) {
    if (!sl) return '<div class="arow arow--none"><span class="arow__h">' + label + '</span><span class="empty">未提出</span></div>';
    return slotFiles(g, label, sl).map(function (f) {
      return '<div class="arow" data-file="' + esc(f.id) + '" data-name="' + esc(f.dl) + '">' +
        '<div class="arow__top"><span class="arow__h">' + esc(f.label) + '</span><span class="arow__info">' + esc([SV.dur(f.dur), SV.bytes(f.size), '提出 ' + shortAt(sl.at)].filter(Boolean).join('・')) + '</span></div>' +
        '<div class="arow__file">' + esc(f.name) + (sl.by === '管理者' ? '（代理入力）' : '') + '</div>' +
        '<div class="arow__player"></div>' +
        '<div class="arow__btns"><button type="button" class="btn btn--line btn--sm" data-act="play">▶ 試聴</button>' +
          '<button type="button" class="btn btn--line btn--sm" data-act="dl">DL（' + esc(f.dl) + '）</button>' +
          '<a class="btn btn--ghost btn--sm" href="https://drive.google.com/file/d/' + encodeURIComponent(f.id) + '/view" target="_blank" rel="noopener">ドライブで開く</a></div>' +
      '</div>';
    }).join('');
  }
  function histFiles(g, label, files) {
    return slotFiles(g, label, { files: files || [] }).map(function (f) {
      return '<div class="arow" data-file="' + esc(f.id) + '" data-name="' + esc(f.dl) + '"><div class="arow__top"><span class="arow__h">' + esc(f.label) + '</span></div>' +
        '<div class="arow__file">' + esc(f.name) + '</div><div class="arow__player"></div>' +
        '<div class="arow__btns"><button type="button" class="btn btn--line btn--sm" data-act="play">▶ 試聴</button><button type="button" class="btn btn--line btn--sm" data-act="dl">DL</button></div></div>';
    }).join('');
  }

  function renderDetail(id) {
    const g = guestOf(id);
    if (!g) { shell({ back: '#' }, '<p class="notice notice--err">このゲストは見つかりませんでした（削除された可能性があります）。</p>'); return; }
    const s = g.sum || {};
    const zipName = SV.safeName(g.name) + '_' + (g.date || D.settings.date) + '.zip';
    shell({ back: '#', title: g.name },
      '<section class="card"><div class="d-head"><div><h2 class="d-name">' + esc(g.name) + '</h2><p class="d-yomi">' + esc(g.yomi) + '</p></div>' +
        '<a class="btn btn--line btn--sm" href="#edit/' + esc(g.id) + '">編集</a></div>' +
        '<div class="d-tags"><span class="pill pill--type">' + typeLabel(g.type) + '</span>' + (g.date ? '<span class="pill">回 ' + esc(g.date) + '</span>' : '') +
          (g.open === false || String(g.open).toUpperCase() === 'FALSE' ? '<span class="pill pill--warn">受付停止中（候補に出ません）</span>' : '') + '</div>' +
        '<div class="prog" style="margin-top:10px">' + progChips(g) + '</div>' +
      '</section>' +

      '<section class="card" id="st-card"><h2 class="card__h">ステータス</h2>' +
        '<div class="seg seg--status" role="radiogroup" aria-label="ステータス">' + STATUS.map(function (k) {
          return '<label><input type="radio" name="st" value="' + esc(k) + '"' + ((g.status || '') === k ? ' checked' : '') + '><span>' + ST_LABEL[k] + '</span></label>';
        }).join('') + '</div>' +
        '<div class="field" style="margin-top:16px"><label for="memo">不備の内容・メモ <span class="tag tag--opt">任意</span></label>' +
          '<textarea class="textarea textarea--sm" id="memo" maxlength="2000">' + esc(g.memo) + '</textarea>' +
          '<p class="hint">「不備連絡」の文面の {メモ} にここが入ります。ゲストには見えません。</p></div>' +
        '<button type="button" class="btn btn--gold" id="st-save">ステータスとメモを保存</button>' +
      '</section>' +

      '<section class="card"><h2 class="card__h">X連絡</h2>' +
        (g.x ? '<p class="xline"><a href="https://x.com/' + encodeURIComponent(g.x) + '" target="_blank" rel="noopener">@' + esc(g.x) + '</a><span class="muted">プロフィールの「メッセージ」ボタンからDMできます</span></p>'
          : '<p class="notice">XのIDが未登録です。「編集」から登録するとXを開くボタンが使えます。</p>') +
        '<div class="tpl-btns">' + TPL.map(function (t) { return '<button type="button" class="chip" data-tpl="' + t[0] + '" aria-pressed="false">' + t[1] + '</button>'; }).join('') + '</div>' +
        '<textarea class="textarea" id="tpl-text" rows="9" aria-label="送る文面（編集できます）"></textarea>' +
        '<div class="row"><button type="button" class="btn btn--line" id="tpl-copy">文面をコピー</button>' +
          (g.x ? '<button type="button" class="btn btn--red" id="tpl-copyx">コピーしてXを開く</button>' : '') + '</div>' +
      '</section>' +

      '<section class="card" id="quiz-card"' + ((g.type === 'B' || g.type === 'C') && !s.quizAt ? ' hidden' : '') + '><div class="card__top"><h2 class="card__h">クイズ案</h2>' +
        '<a class="btn btn--line btn--sm" href="#proxy-quiz/' + esc(g.id) + '">代理入力・修正</a></div><div id="quiz-body"><div class="loading"><span class="spin"></span>読み込んでいます…</div></div></section>' +

      '<section class="card" id="voice-card"><div class="card__top"><h2 class="card__h">ボイメ</h2>' +
        '<a class="btn btn--line btn--sm" href="#proxy-voice/' + esc(g.id) + '">代理入力</a></div>' +
        audioSlots(g).map(function (x) { return audioSlot(g, x[1], x[2]); }).join('') +
        (s.giga ? '<div class="arow arow--giga"><div class="arow__top"><span class="arow__h">ギガファイル便</span><span class="arow__info">提出 ' + esc(shortAt(s.giga.at)) + '</span></div>' +
          '<p style="margin-top:6px"><a href="' + esc(s.giga.url) + '" target="_blank" rel="noopener">' + esc(s.giga.url) + '</a></p>' +
          '<p class="hint">ZIPには入りません。DLした音源を「代理入力」から入れると、ZIPに含められます。</p></div>' : '') +
        '<div id="voice-note"></div>' +
        '<div class="actions"><button type="button" class="btn btn--gold btn--lg btn--block" id="zip"' + (s.intro || s.quizAudio || s.cm ? '' : ' disabled') + '>ZIPでまとめてDL（' + esc(zipName) + '）</button></div>' +
        '<div id="voice-hist"></div>' +
      '</section>');

    // status
    $('#st-save').addEventListener('click', function () {
      const btn = this;
      const status = ($('input[name=st]:checked') || {}).value || '';
      const memo = $('#memo').value.trim();
      btn.disabled = true;
      A('setStatus', { id: g.id, status: status, memo: memo }).then(function () {
        g.status = status; g.memo = memo;
        SV.toast('保存しました（' + ST_LABEL[status] + '）');
        if (!tplDirty) pickTpl(defaultTpl(status));
      }, function (err) { SV.toast(err.message); }).finally(function () { btn.disabled = false; });
    });

    // X templates
    const tplText = $('#tpl-text');
    let tplKey = '', tplDirty = false;
    function pickTpl(key) {
      tplKey = key; tplDirty = false;
      $$('[data-tpl]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tpl') === key)); });
      tplText.value = fillTpl(key, g, $('#memo').value.trim());
    }
    $$('[data-tpl]').forEach(function (b) { b.addEventListener('click', function () { pickTpl(b.getAttribute('data-tpl')); }); });
    tplText.addEventListener('input', function () { tplDirty = true; });
    $('#memo').addEventListener('input', function () { if (tplKey === 'ng' && !tplDirty) tplText.value = fillTpl('ng', g, this.value.trim()); });
    pickTpl(defaultTpl(g.status));
    $('#tpl-copy').addEventListener('click', function () {
      copy(tplText.value).then(function () { SV.toast('コピーしました'); }, function () { SV.toast('コピーできませんでした。文面を長押ししてコピーしてください'); });
    });
    if ($('#tpl-copyx')) {
      $('#tpl-copyx').addEventListener('click', function () {
        // copy first (needs the page focused), then open X in a new tab within the same tap
        const done = copy(tplText.value);
        const a = document.createElement('a');
        a.href = 'https://x.com/' + encodeURIComponent(g.x);
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        done.then(function () { SV.toast('コピーしました。Xのメッセージに貼り付けてください'); }, function () { SV.toast('コピーできませんでした。文面を長押ししてコピーしてください'); });
      });
    }

    // audio play / download / zip
    $('#voice-card').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const row = btn.closest('[data-file]');
      const fileId = row.getAttribute('data-file'), name = row.getAttribute('data-name');
      const label = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>読み込み中…';
      getBlob(fileId).then(function (blob) {
        if (btn.getAttribute('data-act') === 'play') {
          const box = $('.arow__player', row);
          box.innerHTML = '<audio controls autoplay></audio>';
          $('audio', box).src = URL.createObjectURL(blob);
          btn.hidden = true;
        } else {
          save(blob, name);
        }
      }, function (err) { SV.toast(err.message); }).finally(function () { btn.disabled = false; btn.innerHTML = label; });
    });
    $('#zip').addEventListener('click', function () {
      const btn = this;
      if (!window.JSZip) { SV.toast('ZIPの部品を読み込めませんでした。ページを再読み込みしてください'); return; }
      const parts = slotFiles(g, '自己紹介', s.intro).concat(slotFiles(g, 'クイズ', s.quizAudio), slotFiles(g, 'CM', s.cm));
      const label = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>ZIPを作っています…（0/' + parts.length + '）';
      let got = 0;
      // one file at a time, so a big set doesn't hit Google with many large downloads at once
      parts.reduce(function (chain, f) {
        return chain.then(function (blobs) {
          return getBlob(f.id).then(function (b) {
            got++;
            btn.innerHTML = '<span class="spin"></span>ZIPを作っています…（' + got + '/' + parts.length + '）';
            return blobs.concat([b]);
          });
        });
      }, Promise.resolve([])).then(function (list) {
        const zip = new window.JSZip();
        list.forEach(function (blob, i) { zip.file(parts[i].dl, blob); });
        return zip.generateAsync({ type: 'blob', compression: 'STORE' });
      }).then(function (z) {
        save(z, zipName);
        if (audioSlots(g).some(function (x) { return !x[2]; })) SV.toast('揃っている音源だけでZIPにしました');
      }, function (err) { SV.toast(err.message); }).finally(function () { btn.disabled = false; btn.innerHTML = label; });
    });

    // submissions & history
    (details[id] ? Promise.resolve(details[id]) : A('guestDetail', { id: id }).then(function (r) { details[id] = r; return r; }))
      .then(function (det) {
        if (location.hash !== '#g/' + id) return;
        const qz = det.quizzes;
        $('#quiz-body').innerHTML = qz.length
          ? '<p class="meta">提出 ' + esc(qz[0].at) + '（' + esc(qz[0].by) + '）' + (qz.length > 1 ? '・' + qz.length + '回目の提出' : '') + '</p>' + quizBlock(qz[0]) +
            '<div class="row"><button type="button" class="btn btn--line btn--sm" id="quiz-copy">テキストでコピー</button></div>' +
            (qz.length > 1 ? '<details class="hist"><summary>過去の提出（' + (qz.length - 1) + '件）</summary>' + qz.slice(1).map(function (r) {
              return '<div class="hist__item"><p class="meta">提出 ' + esc(r.at) + '（' + esc(r.by) + '）</p>' + quizBlock(r) + '</div>';
            }).join('') + '</details>' : '')
          : '<p class="empty">まだ提出されていません。</p>';
        if ($('#quiz-copy')) $('#quiz-copy').addEventListener('click', function () {
          copy(quizText(g, qz[0])).then(function () { SV.toast('クイズ案をコピーしました'); });
        });
        const vs = det.voices;
        $('#voice-note').innerHTML = vs.length && vs[0].note ? '<div class="qnote"><b>備考・メッセージ（' + esc(shortAt(vs[0].at)) + '）</b>' + esc(vs[0].note) + '</div>' : '';
        $('#voice-hist').innerHTML = vs.length
          ? '<details class="hist"><summary>ボイメの提出履歴（' + vs.length + '件）</summary>' + vs.map(function (r) {
            return '<div class="hist__item"><p class="meta">提出 ' + esc(r.at) + '（' + esc(r.by) + '）</p>' +
              histFiles(g, '自己紹介', r.files && r.files.intro) + histFiles(g, 'クイズ', r.files && r.files.quiz) + histFiles(g, 'CM', r.files && r.files.cm) +
              (r.giga ? '<p style="margin-top:8px">ギガファイル便：<a href="' + esc(r.giga) + '" target="_blank" rel="noopener">' + esc(r.giga) + '</a></p>' : '') +
              (r.note ? '<div class="qnote"><b>備考・メッセージ</b>' + esc(r.note) + '</div>' : '') + '</div>';
          }).join('') + '</details>'
          : (s.intro || s.quizAudio || s.cm || s.giga ? '' : '<p class="empty" style="margin-top:12px">まだ提出されていません。</p>');
      }, function (err) {
        $('#quiz-body').innerHTML = '<p class="notice notice--err">' + esc(err.message) + '</p>';
      });
  }

  /* ---------- guest editor ---------- */
  function renderEditor(id) {
    const g = id ? guestOf(id) : null;
    if (id && !g) { location.hash = '#'; return; }
    const v = g || { name: '', yomi: '', x: '', type: 'A', date: D.settings.date, open: true };
    const isOpen = !(v.open === false || String(v.open).toUpperCase() === 'FALSE');
    shell({ back: g ? '#g/' + g.id : '#', backLabel: g ? '戻る' : '一覧', title: g ? 'ゲストを編集' : 'ゲストを登録' },
      '<form class="card" novalidate id="ed">' +
        '<div class="field"><label for="ed-name">名前（正式表記） <span class="tag tag--req">必須</span></label><input class="input" id="ed-name" maxlength="60" value="' + esc(v.name) + '"><p class="err"></p></div>' +
        '<div class="field"><label for="ed-yomi">読み <span class="tag tag--req">必須</span></label><input class="input" id="ed-yomi" maxlength="60" value="' + esc(v.yomi) + '" placeholder="ひらがなで（例：やまだはなこ）"><p class="hint">公開ページでは、この読みの1文字目から候補が出ます。</p><p class="err"></p></div>' +
        '<div class="field"><label for="ed-x">XのID <span class="tag tag--opt">任意</span></label><input class="input" id="ed-x" maxlength="200" value="' + esc(v.x) + '" placeholder="@なしで（プロフィールURLを貼ってもOK）" autocapitalize="off" autocomplete="off" spellcheck="false"></div>' +
        '<fieldset class="field"><legend>ゲスト内容 <span class="tag tag--req">必須</span></legend><div class="seg seg--ab">' +
          '<label><input type="radio" name="ed-type" value="A"' + (v.type !== 'B' && v.type !== 'C' ? ' checked' : '') + '><span>A<br>クイズ案＋ボイメ</span></label>' +
          '<label><input type="radio" name="ed-type" value="B"' + (v.type === 'B' ? ' checked' : '') + '><span>B<br>ボイメのみ</span></label>' +
          '<label><input type="radio" name="ed-type" value="C"' + (v.type === 'C' ? ' checked' : '') + '><span>C<br>CMのみ</span></label>' +
        '</div></fieldset>' +
        '<div class="field"><label for="ed-date">回</label><input class="input" id="ed-date" maxlength="20" value="' + esc(v.date) + '" inputmode="numeric" placeholder="例：1128"><p class="hint">ZIPの名前（ゲスト名_1128.zip）とドライブのフォルダ名に使います。</p></div>' +
        '<label class="check"><input type="checkbox" id="ed-open"' + (isOpen ? ' checked' : '') + '>受付中（公開ページの名前候補に出す）</label>' +
        '<p class="notice notice--err" id="ed-err" hidden></p>' +
        '<div class="actions">' + (g
          ? '<button type="submit" class="btn btn--red btn--lg btn--block" data-mode="save">保存する</button><button type="button" class="btn btn--line btn--block danger" id="ed-del">このゲストを削除</button>'
          : '<button type="submit" class="btn btn--red btn--lg btn--block" data-mode="open">登録する</button><button type="submit" class="btn btn--line btn--lg btn--block" data-mode="next">登録して、続けて入力</button>') +
        '</div>' +
      '</form>');
    const form = $('#ed'), err = $('#ed-err');
    let newId = g ? '' : SV.sid('g');
    if (!g) $('#ed-name').focus();
    let mode = 'save';
    $$('button[type=submit]', form).forEach(function (b) { b.addEventListener('click', function () { mode = b.getAttribute('data-mode'); }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const data = {
        id: g ? g.id : newId,
        name: $('#ed-name').value.trim(), yomi: $('#ed-yomi').value.trim(), x: $('#ed-x').value.trim(),
        type: ($('input[name=ed-type]:checked') || {}).value || 'A', date: $('#ed-date').value.trim(), open: $('#ed-open').checked,
      };
      const nf = $('#ed-name').closest('.field'), yf = $('#ed-yomi').closest('.field');
      nf.classList.toggle('is-invalid', !data.name); $('.err', nf).textContent = data.name ? '' : '名前を入力してください';
      yf.classList.toggle('is-invalid', !data.yomi); $('.err', yf).textContent = data.yomi ? '' : '読みを入力してください';
      if (!data.name || !data.yomi) return;
      const btns = $$('button', form);
      btns.forEach(function (b) { b.disabled = true; });
      err.hidden = true;
      A('saveGuest', { guest: data, create: !g }).then(function (r) {
        return load().then(function () { return r.guest; });
      }).then(function (saved) {
        if (mode === 'next') {
          newId = SV.sid('g');
          SV.toast('登録しました：' + saved.name);
          $('#ed-name').value = ''; $('#ed-yomi').value = ''; $('#ed-x').value = '';
          btns.forEach(function (b) { b.disabled = false; });
          $('#ed-name').focus();
          return;
        }
        delete details[saved.id];
        location.hash = '#g/' + saved.id;
      }, function (e2) {
        btns.forEach(function (b) { b.disabled = false; });
        err.hidden = false; err.textContent = e2.message;
      });
    });
    if ($('#ed-del')) {
      $('#ed-del').addEventListener('click', function () {
        if (!window.confirm('「' + g.name + '」を削除しますか？\n提出済みのクイズ案・音源は消えずに残り、「設定」の「削除したゲスト」からいつでも元に戻せます。')) return;
        A('deleteGuest', { id: g.id }).then(load).then(function () { SV.toast('削除しました'); location.hash = '#'; }, function (e2) { SV.toast(e2.message); });
      });
    }
  }

  /* ---------- proxy entry ---------- */
  function renderProxy(id, kind) {
    const g = guestOf(id);
    if (!g) { location.hash = '#'; return; }
    shell({ back: '#g/' + id, backLabel: '戻る', title: kind === 'quiz' ? 'クイズ案を代理入力' : 'ボイメを代理入力' },
      '<p class="lead">DMなど別の方法で受け取った内容をここから入れます。ゲストが提出したときと同じように保存され、履歴にも残ります。</p><div id="proxy"></div>');
    const box = $('#proxy');
    const opts = {
      guest: asFlowGuest(g), pw: pw,
      onDone: function () { delete details[id]; D = null; location.hash = '#g/' + id; },
    };
    if (kind === 'quiz') {
      box.innerHTML = '<div class="loading"><span class="spin"></span>読み込んでいます…</div>';
      (details[id] ? Promise.resolve(details[id]) : A('guestDetail', { id: id }).then(function (r) { details[id] = r; return r; }))
        .then(function (det) {
          if (det.quizzes.length) $('.lead').textContent = '前回の内容が入っています。直したいところだけ書き換えて保存できます（前の版も履歴に残ります）。';
          SV.QuizFlow(box, Object.assign(opts, { prefill: det.quizzes[0] || null }));
        }, function (err) { box.innerHTML = '<p class="notice notice--err">' + esc(err.message) + '</p>'; });
    } else {
      SV.VoiceFlow(box, opts);
    }
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    const st = D.settings;
    shell({ back: '#', title: '設定', hideSettings: true },
      '<form id="set" novalidate>' +
      '<section class="card"><h2 class="card__h">基本</h2>' +
        '<div class="field"><label for="set-date">回（初期値）</label><input class="input" id="set-date" maxlength="20" value="' + esc(st.date) + '" inputmode="numeric"><p class="hint">新しく登録するゲストの「回」に入ります。ZIP名「ゲスト名_1128」の1128の部分です。</p></div>' +
        '<div class="field"><label for="set-url">公開ページのURL</label><input class="input" id="set-url" type="url" value="' + esc(st.url) + '"><p class="hint">連絡文の {URL} に入ります。</p></div>' +
      '</section>' +
      '<section class="card"><h2 class="card__h">X連絡の文面</h2>' +
        '<p class="card__lead">{名前} {URL} {内容} {メモ} は自動で置き換わります。{内容} は「クイズ案（2問）とボイメ」「ボイメ」「CMの音源」のどれかになります。</p>' +
        TPL.map(function (t) {
          return '<div class="field"><label for="set-' + t[0] + '">' + t[1] + '</label><textarea class="textarea" id="set-' + t[0] + '" rows="7" maxlength="4000">' + esc(st['tpl_' + t[0]]) + '</textarea></div>';
        }).join('') +
      '</section>' +
      '<div class="actions"><button type="submit" class="btn btn--red btn--lg btn--block">設定を保存</button></div>' +
      '</form>' +
      '<section class="card" style="margin-top:var(--s4)"><h2 class="card__h">削除したゲスト</h2>' +
        ((D.trash || []).length
          ? '<ul class="glist">' + D.trash.map(function (t) {
            return '<li class="grow" style="align-items:center"><div class="grow__main"><div class="grow__name">' + esc(t.name) + '<small>' + esc(t.yomi) + '</small></div>' +
              '<span class="grow__at">削除 ' + esc(shortAt(t.deleted)) + '</span></div><button type="button" class="btn btn--line btn--sm" data-restore="' + esc(t.id) + '">元に戻す</button></li>';
          }).join('') + '</ul>'
          : '<p class="empty">ありません。</p>') +
      '</section>' +
      '<section class="card"><h2 class="card__h">データの保存先</h2><div class="links">' +
        '<a class="btn btn--line" href="' + esc(D.links.sheet) + '" target="_blank" rel="noopener">スプレッドシートを開く</a>' +
        '<a class="btn btn--line" href="' + esc(D.links.folder) + '" target="_blank" rel="noopener">音源フォルダ（ドライブ）を開く</a>' +
        '<a class="btn btn--line" href="../" target="_blank" rel="noopener">公開ページを開く</a>' +
      '</div></section>' +
      '<div class="actions"><button type="button" class="btn btn--ghost btn--block" id="logout">ログアウト</button></div>');
    $('#set').addEventListener('submit', function (e) {
      e.preventDefault();
      const data = { date: $('#set-date').value.trim(), url: $('#set-url').value.trim() };
      TPL.forEach(function (t) { data['tpl_' + t[0]] = $('#set-' + t[0]).value; });
      const btn = $('button[type=submit]', this);
      btn.disabled = true;
      A('saveSettings', { settings: data }).then(function (r) { D.settings = r.settings; SV.toast('保存しました'); }, function (err) { SV.toast(err.message); })
        .finally(function () { btn.disabled = false; });
    });
    $('#logout').addEventListener('click', logout);
    $$('[data-restore]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        A('restoreGuest', { id: b.getAttribute('data-restore') }).then(load).then(function () {
          SV.toast('元に戻しました');
          renderSettings();
        }, function (e2) { b.disabled = false; SV.toast(e2.message); });
      });
    });
  }

  /* ---------- router ---------- */
  function route() {
    if (!pw || !SV.ready) { renderLogin(); return; }
    if (!D) {
      renderLoading();
      load().then(route, function (err) { if (pw) renderError(err); });
      return;
    }
    const parts = location.hash.replace(/^#/, '').split('/');
    const view = parts[0], id = parts.slice(1).join('/');
    if (view === 'g' && id) renderDetail(id);
    else if (view === 'new') renderEditor(null);
    else if (view === 'edit' && id) renderEditor(id);
    else if (view === 'settings') renderSettings();
    else if (view === 'proxy-quiz' && id) renderProxy(id, 'quiz');
    else if (view === 'proxy-voice' && id) renderProxy(id, 'voice');
    else renderList();
  }
  window.addEventListener('hashchange', route);
  route();
})();
