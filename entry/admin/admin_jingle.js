/* SVARAC 提出管理 — ジングル応募 (/jingle/): the list, listening, status (採用 shows on the top page), memo, downloads, 受付 on/off. */
(function () {
  'use strict';
  const SV = window.SV, $ = SV.$, $$ = SV.$$, esc = SV.esc;
  const ST = ['新着', '採用候補', '採用', '不採用', '取り下げ'];
  const ST_CLASS = { '新着': 'st-new', '採用候補': 'st-re', '採用': 'st-ok', '不採用': 'st-none', '取り下げ': 'st-ng' };
  const filter = { st: 'all', q: '' };
  let J = null;   // { open, rows, ssUrl, folderUrl }

  const shortAt = function (at) { return at ? String(at).slice(5, 16) : ''; };
  const secs = function (d) { return d ? (Math.round(Number(d) * 10) / 10).toFixed(1) + '秒' : ''; };
  const xUrl = function (x) { return 'https://x.com/' + encodeURIComponent(String(x || '').replace(/^@/, '')); };
  const files = function (r) {
    return [['shoutId', 'shoutName', 'スバラシー'], ['impactId', 'impactName', '5秒'], ['iconId', 'iconName', 'アイコン']]
      .filter(function (k) { return r[k[0]]; })
      .map(function (k) { return { id: String(r[k[0]]), dl: k[2] + '/' + (r[k[1]] || (SV.safeName(r.name) + '_' + k[2])) }; });
  };
  function matches(r) {
    if (filter.st !== 'all' && r.status !== filter.st) return false;
    if (!filter.q) return true;
    const q = SV.kana(filter.q);
    return SV.kana(r.name).indexOf(q) >= 0 || SV.kana(r.x).indexOf(q) >= 0;
  }

  function audioCell(r, kind, label) {
    const id = r[kind + 'Id'];
    if (!id) return '<div class="arow arow--none"><span class="arow__h">' + label + '</span><span class="muted">なし</span></div>';
    return '<div class="arow"><div class="arow__top"><span class="arow__h">' + label + '</span><span class="arow__info">' +
        esc([secs(r[kind + 'Dur']), r[kind + 'How']].filter(Boolean).join('・')) + '</span></div>' +
      '<div class="arow__file">' + esc(r[kind + 'Name']) + '</div>' +
      '<div class="arow__player" data-player="' + esc(id) + '"></div>' +
      '<div class="arow__btns"><button type="button" class="btn btn--line btn--sm" data-play="' + esc(id) + '">▶ 聞く</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-dl="' + esc(id) + '" data-name="' + esc(r[kind + 'Name']) + '">ダウンロード</button></div></div>';
  }
  function card(r) {
    return '<li class="jrow" data-id="' + esc(r.id) + '">' +
      '<div class="jrow__head">' +
        '<span class="ava ava--lg">' + (r.thumb ? '<img src="' + esc(r.thumb) + '" alt="">' : esc([...String(r.name || '？')][0])) + '</span>' +
        '<div class="jrow__who"><div class="grow__name">' + esc(r.name) + '</div>' +
          '<div class="xline"><a href="' + xUrl(r.x) + '" target="_blank" rel="noopener">' + esc(r.x) + '</a><span class="grow__at">' + esc(shortAt(r.at)) + '</span></div></div>' +
        '<span class="st ' + (ST_CLASS[r.status] || 'st-none') + '">' + esc(r.status || '新着') + '</span>' +
      '</div>' +
      audioCell(r, 'shout', '「スバラシー！」') + audioCell(r, 'impact', '5秒インパクト') +
      (r.giga ? '<div class="arow arow--giga"><div class="arow__h">ギガファイル便</div><a href="' + esc(r.giga) + '" target="_blank" rel="noopener">' + esc(r.giga) + '</a></div>' : '') +
      (r.note ? '<p class="qnote"><b>備考</b>' + esc(r.note) + '</p>' : '') +
      '<div class="jrow__edit">' +
        '<div class="field"><label for="st-' + esc(r.id) + '">ステータス</label><select class="select" id="st-' + esc(r.id) + '" data-k="status">' +
          ST.map(function (s) { return '<option' + (s === (r.status || '新着') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
          (r.status === '採用' ? '<p class="hint">トップページの「ジングル」欄に載っています（' + esc(shortAt(r.adoptAt)) + ' 採用）</p>' : '') +
          (r.status === '取り下げ' ? '<p class="hint">このXのIDでは応募ページから送信できません</p>' : '') + '</div>' +
        '<div class="field"><label for="used-' + esc(r.id) + '">使った回</label><input class="input" id="used-' + esc(r.id) + '" data-k="used" value="' + esc(r.used) + '" placeholder="例：第2回 オープニング"></div>' +
        '<div class="field"><label for="memo-' + esc(r.id) + '">メモ</label><textarea class="textarea textarea--sm" id="memo-' + esc(r.id) + '" data-k="memo">' + esc(r.memo) + '</textarea></div>' +
      '</div>' +
      '<div class="jrow__foot"><button type="button" class="btn btn--ghost btn--sm" data-zip-one>この人のファイルをZIPでDL</button>' +
        '<button type="button" class="linkbtn danger-link" data-del>この応募を削除</button></div>' +
    '</li>';
  }

  function render() {
    const A = window.SVA;
    if (!J) {
      A.shell({ title: 'ジングル応募', back: '#', backLabel: 'ゲスト一覧', hideJingle: true }, '<div class="loading"><span class="spin"></span>読み込んでいます…</div>');
      A.api('jingleAdmin').then(function (r) { J = r; if (location.hash === '#jingle') render(); }, function (err) { if (location.hash === '#jingle') A.renderError(err); });
      return;
    }
    const rows = J.rows || [];
    const count = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
    const chips = [['all', 'すべて', rows.length]].concat(ST.map(function (s) { return [s, s, count(s)]; }));
    A.shell({ title: 'ジングル応募', back: '#', backLabel: 'ゲスト一覧', hideJingle: true },
      '<div class="adm-head"><h2 class="adm-h">ジングル応募<small>' + rows.length + '件</small></h2><div class="adm-head__btns">' +
        '<button type="button" class="btn ' + (J.open ? 'btn--gold' : 'btn--line') + '" id="j-open" aria-pressed="' + J.open + '">' + (J.open ? '受付中' : '受付を停止中') + '</button>' +
        '<button type="button" class="btn btn--line" id="j-zip">表示中をZIPでDL</button></div></div>' +
      '<p class="hint" style="margin:-6px 0 14px">' + (J.open ? '応募ページで受け付けています。押すと受付を止めます（トップページのバナーも消えます）' : '応募ページは「受け付けていません」と表示中です。押すと受付を再開します') +
        '　<a href="' + esc(J.ssUrl) + '" target="_blank" rel="noopener">スプレッドシート</a>・<a href="' + esc(J.folderUrl) + '" target="_blank" rel="noopener">音源フォルダ</a>・<a href="../../jingle/" target="_blank" rel="noopener">応募ページ</a></p>' +
      '<div class="adm-filters"><div class="chips">' + chips.map(function (c) {
        return '<button type="button" class="chip" data-st="' + esc(c[0]) + '" aria-pressed="' + (filter.st === c[0]) + '">' + c[1] + ' <b>' + c[2] + '</b></button>';
      }).join('') + '</div>' +
      '<input class="input" type="search" id="j-q" placeholder="活動名・XのIDで探す" value="' + esc(filter.q) + '" aria-label="応募を探す"></div>' +
      '<p class="hint" style="margin-bottom:12px">「採用」にすると、トップページの「ジングル」欄にアイコンと名前が採用した順で載ります。「取り下げ」にした人のXのIDでは応募できなくなります。</p>' +
      '<ul class="glist" id="jlist"></ul>');
    const listEl = $('#jlist');
    let shown = [];
    function draw() {
      shown = rows.filter(matches);
      listEl.innerHTML = shown.length ? shown.map(card).join('') : '<li class="empty-state">' + (rows.length ? '該当する応募はありません' : 'まだ応募はありません') + '</li>';
      $('#j-zip').hidden = !shown.length;
    }
    draw();
    function recount() {
      $$('.chip[data-st]').forEach(function (b) {
        const st = b.getAttribute('data-st');
        $('b', b).textContent = st === 'all' ? rows.length : count(st);
      });
    }
    $$('.chip[data-st]').forEach(function (b) {
      b.addEventListener('click', function () { filter.st = b.getAttribute('data-st'); $$('.chip[data-st]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); draw(); });
    });
    $('#j-q').addEventListener('input', function (e) { filter.q = e.target.value.trim(); draw(); });
    $('#j-open').addEventListener('click', function (e) {
      const btn = e.currentTarget; btn.disabled = true;
      A.api('jingleSetOpen', { open: !J.open }).then(function (r) { J.open = r.open; SV.toast(r.open ? '受付を再開しました' : '受付を停止しました'); render(); }, function (err) { btn.disabled = false; SV.toast(err.message); });
    });
    $('#j-zip').addEventListener('click', function (e) {
      const parts = []; shown.forEach(function (r) { files(r).forEach(function (f) { parts.push(f); }); });
      A.zipFiles(parts, 'ジングル応募_' + (filter.st === 'all' ? 'すべて' : filter.st) + '.zip', e.currentTarget).catch(function (err) { SV.toast(err.message); });
    });

    listEl.addEventListener('click', function (e) {
      const li = e.target.closest('.jrow'); if (!li) return;
      const r = rows.filter(function (x) { return x.id === li.getAttribute('data-id'); })[0]; if (!r) return;
      const play = e.target.closest('[data-play]'), dl = e.target.closest('[data-dl]');
      if (play) {
        const id = play.getAttribute('data-play'), box = $('[data-player="' + id + '"]', li);
        play.disabled = true; play.innerHTML = '<span class="spin"></span>読み込み中…';
        A.getBlob(id).then(function (b) {
          SV.stopAudio(document);
          box.innerHTML = '<audio controls autoplay src="' + URL.createObjectURL(b) + '"></audio>';
          play.remove();
        }, function (err) { play.disabled = false; play.textContent = '▶ 聞く'; SV.toast(err.message); });
      } else if (dl) {
        dl.disabled = true;
        A.getBlob(dl.getAttribute('data-dl')).then(function (b) { A.save(b, dl.getAttribute('data-name')); }, function (err) { SV.toast(err.message); }).finally(function () { dl.disabled = false; });
      } else if (e.target.closest('[data-zip-one]')) {
        A.zipFiles(files(r), SV.safeName(r.name) + '_ジングル応募.zip', e.target.closest('[data-zip-one]')).catch(function (err) { SV.toast(err.message); });
      } else if (e.target.closest('[data-del]')) {
        if (!window.confirm('「' + r.name + '」さんの応募を削除しますか？\n音源とアイコンはドライブのゴミ箱に移ります（30日以内なら戻せます）。')) return;
        A.api('jingleDelete', { id: r.id }).then(function () { J.rows = rows.filter(function (x) { return x !== r; }); SV.toast('削除しました'); render(); }, function (err) { SV.toast(err.message); });
      }
    });
    // status saves right away; 使った回 and メモ save when you leave the box
    listEl.addEventListener('change', function (e) {
      const k = e.target.getAttribute('data-k'); if (!k) return;
      const li = e.target.closest('.jrow'), id = li.getAttribute('data-id');
      const r = rows.filter(function (x) { return x.id === id; })[0]; if (!r) return;
      const val = e.target.value;
      if (k === 'status' && val === '取り下げ' && !window.confirm('「取り下げ」にすると、このXのID（' + r.x + '）では今後応募できなくなります。よろしいですか？')) { e.target.value = r.status; return; }
      const data = { id: id }; data[k] = val;
      e.target.disabled = true;
      A.api('jingleSave', data).then(function (res) {
        Object.assign(r, res.row);
        SV.toast(k === 'status' ? (val === '採用' ? '採用にしました（トップページに載ります）' : 'ステータスを「' + val + '」にしました') : '保存しました');
        if (k === 'status') { const keep = window.scrollY; li.outerHTML = card(r); window.scrollTo(0, keep); recount(); }
      }, function (err) { e.target.value = r[k] || ''; SV.toast(err.message); }).finally(function () { e.target.disabled = false; });
    });
  }

  window.SVJ = { render: render };
  window.addEventListener('hashchange', function () { if (location.hash !== '#jingle') J = null; });   // fresh list each time the page is opened
})();
