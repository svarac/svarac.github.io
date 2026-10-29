/* SVARAC 出演者提出ページ — the two submission flows (edit → confirm → send → done).
   Used by the public page and, for proxy entry, by the admin page.
   Safety: drafts are kept on the device, leaving with unsent input asks first, sends are retried
   automatically and can never be stored twice, and if sending keeps failing the guest can copy
   everything they typed to send it by DM instead. */
(function () {
  'use strict';
  const SV = window.SV;
  const esc = SV.esc, $ = SV.$, $$ = SV.$$;
  let uidN = 0;
  const KEYS = ['a', 'b', 'c', 'd'];
  const DASH = 'ー';
  // a choice that is not used in a 2- or 3-choice question
  function isBlank(v) { return /^[ー\-－―‐—–−ｰ]+$/.test(String(v || '').trim()) || /^(なし|無し)$/.test(String(v || '').trim()); }
  function optHtml(q, k) {
    const K = k.toUpperCase(), on = q.ans === K, blank = isBlank(q[k]);
    return '<li class="' + (on ? 'is-ans' : '') + (blank ? ' is-blank' : '') + '"><span class="k">' + K + '</span><span>' + (blank ? 'ー（使わない）' : esc(q[k])) + '</span>' + (on ? '<span class="mark">正解</span>' : '') + '</li>';
  }
  SV.isBlankChoice = isBlank;
  SV.quizOptHtml = optHtml;
  const DRAFT_DAYS = 14;

  function tag(req) { return req ? '<span class="tag tag--req">必須</span>' : '<span class="tag tag--opt">任意</span>'; }

  function nameField(u, hint) {
    return '<section class="card" data-f="name">' +
      '<div class="field">' +
        '<label for="' + u + '-name">お名前 ' + tag(true) + '</label>' +
        '<div class="combo"><input class="input" id="' + u + '-name" placeholder="読みの1文字目を入力（例：や）" aria-describedby="' + u + '-name-hint"><span class="combo__ok">' + SV.icon.check.replace('<svg', '<svg width="14" height="14"') + '選択済み</span></div>' +
        '<p class="hint" id="' + u + '-name-hint">読みの1文字目を入れると候補が出ます。候補からお選びください。<br>' + hint + '候補に出てこない場合は、お手数ですが運営までご連絡ください。</p>' +
        '<p class="err"></p>' +
      '</div>' +
      '<div class="resub" hidden></div>' +
    '</section>';
  }

  function proxyBanner(g) {
    return '<div class="banner">代理入力：' + esc(g.name) + '（管理者として保存します）</div>';
  }

  function setFieldErr(field, msg) {
    if (!field) return;
    field.classList.toggle('is-invalid', !!msg);
    const e = $('.err', field);
    if (e) e.textContent = msg || '';
  }

  function syncSummary(root) {
    const box = $('.form-err', root);
    if (box && !box.hidden && !$('.is-invalid', root)) box.hidden = true;
  }

  function scrollToFirstError(root) {
    const bad = $('.is-invalid', root);
    if (!bad) return;
    bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const f = $('input:not([type=radio]):not([type=file]), textarea, input[type=radio]', bad) || $('.drop__input', bad);
    if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 350);
  }

  function views(root) {
    root.innerHTML = '<div class="v-edit"></div><div class="v-confirm" hidden></div><div class="v-done" hidden></div>';
    const v = { edit: $('.v-edit', root), confirm: $('.v-confirm', root), done: $('.v-done', root) };
    v.show = function (name) {
      // a hidden screen keeps playing its audio, so stop every preview whenever the screen changes
      SV.stopAudio(root);
      ['edit', 'confirm', 'done'].forEach(function (k) { v[k].hidden = k !== name; });
      window.scrollTo(0, 0);
    };
    return v;
  }

  /** asks before closing / reloading the tab while something is typed but not sent, or while sending */
  function leaveGuard() {
    const st = { dirty: false, busy: false, done: false };
    const h = function (e) {
      if (st.done || !(st.dirty || st.busy)) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', h);
    st.release = function () { st.done = true; window.removeEventListener('beforeunload', h); };
    return st;
  }

  /** what the guest typed, kept on this device so a reload or a closed tab loses nothing */
  function draftStore(kind, enabled) {
    const key = 'svarac_draft_' + kind;
    return {
      load: function () {
        if (!enabled) return null;
        const raw = SV.local.get(key);
        if (!raw) return null;
        try {
          const d = JSON.parse(raw);
          if (d && Date.now() - d.at < DRAFT_DAYS * 864e5) return d;
        } catch (e) { /* broken draft */ }
        SV.local.del(key);
        return null;
      },
      save: function (d) { if (enabled) { d.at = Date.now(); SV.local.set(key, JSON.stringify(d)); } },
      clear: function () { SV.local.del(key); },
    };
  }

  function restoredNotice(text) {
    return '<div class="notice restored">' + text + ' <button type="button" class="linkbtn" data-act="discard">消して最初から入力する</button></div>';
  }

  function confirmActions() {
    return '<div class="notice notice--err send-err" role="alert" hidden></div>' +
      '<div class="fallback" hidden>' +
        '<p class="fallback__h">何度試しても送れないときは</p>' +
        '<p class="fallback__t"></p>' +
        '<button type="button" class="btn btn--line btn--block" data-act="copy">入力内容をコピーする</button>' +
      '</div>' +
      '<div class="actions send-btns">' +
        '<button type="button" class="btn btn--red btn--lg btn--block" data-act="send">この内容で送信する</button>' +
        '<button type="button" class="btn btn--line btn--lg btn--block" data-act="edit">修正する</button>' +
      '</div>' +
      '<div class="sending" hidden><p class="progress" aria-live="polite">送信しています…</p><div class="bar-ind"><i></i></div><p class="hint sending__note">送信が終わるまで、このページを閉じずにお待ちください。</p></div>';
  }

  function sendingUI(box, fallback) {
    const err = $('.send-err', box), btns = $('.send-btns', box), sending = $('.sending', box), prog = $('.progress', box);
    const fb = $('.fallback', box);
    $('.fallback__t', fb).textContent = fallback.hint;
    $('[data-act="copy"]', fb).addEventListener('click', function () {
      SV.copy(fallback.text()).then(function () { SV.toast('コピーしました。運営へのDMに貼り付けてください'); },
        function () { SV.toast('コピーできませんでした。お手数ですが画面を撮影して運営へお送りください'); });
    });
    let fails = 0;
    return {
      start: function (msg) { err.hidden = true; btns.hidden = true; sending.hidden = false; prog.textContent = msg || '送信しています…'; },
      step: function (msg) { prog.textContent = msg; },
      retrying: function () { prog.textContent = '通信が不安定なため、自動でもう一度送っています…'; },
      fail: function (msg) {
        fails++;
        sending.hidden = true; btns.hidden = false; err.hidden = false;
        err.textContent = msg + '（入力内容はそのまま残っています）';
        fb.hidden = false;
        if (fails > 1) $('[data-act="send"]', box).textContent = 'もう一度送信する';
        err.scrollIntoView({ block: 'center' });
      },
    };
  }

  function doneView(v, msg, opts) {
    v.done.innerHTML = '<div class="done">' +
      '<div class="done__mark">' + SV.icon.check + '</div>' +
      '<p class="done__msg" tabindex="-1">' + msg + '</p>' +
      '<div class="actions">' + (opts.onDone
        ? '<button type="button" class="btn btn--line btn--lg btn--block" data-act="back">管理画面に戻る</button>'
        : '<a class="btn btn--line btn--lg btn--block" href="#top">トップに戻る</a>') + '</div>' +
    '</div>';
    const b = $('[data-act="back"]', v.done);
    if (b) b.addEventListener('click', opts.onDone);
    v.show('done');
    $('.done__msg', v.done).focus();
  }

  function guestPicker(v, opts, filter) {
    if (opts.guest) return { get: function () { return opts.guest; }, set: function () {} };
    const field = $('[data-f="name"]', v.edit);
    return SV.combobox($('.combo', field), {
      items: function () { return (opts.guests() || []).filter(filter); },
      onPick: function (g) {
        if (g) { setFieldErr($('.field', field), ''); syncSummary(v.edit); }
        if (opts.onGuest) opts.onGuest(g);
      },
    });
  }

  function findGuest(opts, id, filter) {
    return (opts.guests ? opts.guests() || [] : []).filter(function (g) { return g.id === id && filter(g); })[0] || null;
  }

  /* ================= クイズ案 ================= */
  SV.QuizFlow = function (root, opts) {
    const u = 'qz' + (++uidN);
    const v = views(root);
    const proxy = !!opts.guest;
    const guard = leaveGuard();
    const drafts = draftStore('quiz', !proxy);
    const isQuizGuest = function (g) { return g.type !== 'B' && g.type !== 'C' && g.type !== 'Z'; };
    let draftTimer = 0;

    function qBlock(n) {
      const p = u + '-q' + n;
      return '<section class="card" data-q="' + n + '">' +
        '<h2 class="card__h"><span class="no">Q' + n + '</span>第' + n + '問</h2>' +
        '<div class="field" data-f="text"><label for="' + p + '-text">クイズ内容 ' + tag(true) + '</label>' +
          '<textarea class="textarea" id="' + p + '-text" maxlength="2000" placeholder="問題文を入力してください"></textarea><p class="err"></p></div>' +
        '<fieldset class="field" data-f="opts"><legend>選択肢 ' + tag(true) + '</legend>' +
          '<p class="hint choices__hint">2択・3択の場合は、使わない選択肢に「ー」を入力してください（例：A・Bの2択なら、CとDに「ー」）。' +
            '<button type="button" class="linkbtn" data-act="dash">空いている欄を「ー」にする</button></p>' +
          '<div class="choices">' +
          KEYS.map(function (k) {
            const K = k.toUpperCase();
            return '<div class="choice" data-k="' + k + '"><label class="choice__k" for="' + p + '-' + k + '">' + K + '</label>' +
              '<input class="input" id="' + p + '-' + k + '" maxlength="300" placeholder="選択肢' + K + '"></div>';
          }).join('') +
        '</div><p class="err"></p></fieldset>' +
        '<fieldset class="field" data-f="ans"><legend>正解 ' + tag(true) + '</legend><div class="seg" role="radiogroup">' +
          KEYS.map(function (k) {
            const K = k.toUpperCase();
            return '<label><input type="radio" name="' + p + '-ans" value="' + K + '" aria-label="' + K + 'が正解"><span>' + K + '</span></label>';
          }).join('') +
        '</div><p class="err"></p></fieldset>' +
      '</section>';
    }

    v.edit.innerHTML = '<form novalidate>' +
      (proxy ? proxyBanner(opts.guest) : '<p class="lead">クイズを2問ご提出ください。選択肢はA〜D（2択・3択も可）、正解を1つ選んでください。<br>入力した内容はこの端末に自動で保存されます。</p>') +
      '<div class="restore-box"></div>' +
      '<div class="notice notice--err form-err" role="alert" hidden></div>' +
      (proxy ? '' : nameField(u, 'ボイメのみ・CMのみのご依頼の方は、クイズ案の提出は不要です。')) +
      qBlock(1) + qBlock(2) +
      '<section class="card"><div class="field" data-f="note"><label for="' + u + '-note">備考・メッセージ ' + tag(false) + '</label>' +
        '<textarea class="textarea textarea--sm" id="' + u + '-note" maxlength="2000" placeholder="補足や、運営へのメッセージがあればどうぞ"></textarea></div></section>' +
      '<div class="actions"><button type="submit" class="btn btn--red btn--lg btn--block">入力内容を確認する</button></div>' +
    '</form>';
    const form = $('form', v.edit);
    const formErr = $('.form-err', v.edit);

    const picker = guestPicker(v, Object.assign({}, opts, {
      onGuest: function (g) {
        const box = $('.resub', v.edit);
        if (box) {
          box.hidden = !(g && g.done && g.done.quiz);
          box.innerHTML = '<p class="notice">すでにクイズ案をご提出いただいています。もう一度送ると最新の内容に差し替わります（前回の内容も運営側で保管しています）。</p>';
        }
        saveDraftSoon();
      },
    }), isQuizGuest);

    function fill(r) {
      [1, 2].forEach(function (n) {
        const sec = $('[data-q="' + n + '"]', v.edit);
        $('textarea', sec).value = r['q' + n] || '';
        KEYS.forEach(function (k) { $('[data-k="' + k + '"] input', sec).value = r['q' + n + k] || ''; });
        const radio = $('input[value="' + (r['q' + n + 'ans'] || '') + '"]', sec);
        if (radio) radio.checked = true;
      });
      $('#' + u + '-note').value = r.note || '';
    }

    function collect() {
      return {
        guest: picker.get(),
        questions: [1, 2].map(function (n) {
          const sec = $('[data-q="' + n + '"]', v.edit);
          const q = { text: $('textarea', sec).value.trim(), ans: (($('input[type=radio]:checked', sec) || {}).value) || '' };
          KEYS.forEach(function (k) { q[k] = $('[data-k="' + k + '"] input', sec).value.trim(); });
          return q;
        }),
        note: $('#' + u + '-note').value.trim(),
      };
    }

    // --- drafts ---
    function saveDraftSoon() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () {
        if (guard.done) return;   // already sent: never bring the draft back
        const d = collect();
        const flat = { guestId: d.guest ? d.guest.id : '', note: d.note };
        let any = !!(d.guest || d.note);
        d.questions.forEach(function (q, i) {
          const p = 'q' + (i + 1);
          flat[p] = q.text; flat[p + 'ans'] = q.ans;
          KEYS.forEach(function (k) { flat[p + k] = q[k]; });
          if (q.text || q.ans || KEYS.some(function (k) { return q[k]; })) any = true;
        });
        guard.dirty = any;
        if (any) drafts.save(flat); else drafts.clear();
      }, 300);
    }
    form.addEventListener('input', saveDraftSoon);
    form.addEventListener('change', saveDraftSoon);

    if (opts.prefill) fill(opts.prefill);
    const saved = drafts.load();
    if (saved) {
      fill(saved);
      const g = saved.guestId ? findGuest(opts, saved.guestId, isQuizGuest) : null;
      if (g) picker.set(g);
      guard.dirty = true;
      const box = $('.restore-box', v.edit);
      box.innerHTML = restoredNotice('前回入力途中だった内容を復元しました。');
      $('[data-act="discard"]', box).addEventListener('click', function () {
        drafts.clear();
        form.reset();
        picker.set(null);
        guard.dirty = false;
        box.innerHTML = '';
      });
    }

    function validate(d) {
      let n = 0;
      const nf = $('[data-f="name"] .field', v.edit);
      if (nf) { setFieldErr(nf, d.guest ? '' : 'お名前を候補から選んでください'); if (!d.guest) n++; }
      d.questions.forEach(function (q, i) {
        const sec = $('[data-q="' + (i + 1) + '"]', v.edit);
        setFieldErr($('[data-f="text"]', sec), q.text ? '' : 'クイズ内容を入力してください');
        if (!q.text) n++;
        const empty = KEYS.filter(function (k) { return !q[k]; });
        const real = KEYS.filter(function (k) { return q[k] && !isBlank(q[k]); });
        KEYS.forEach(function (k) { $('[data-k="' + k + '"]', sec).classList.toggle('is-empty', !q[k]); });
        const optErr = empty.length
          ? '選択肢' + empty.map(function (k) { return k.toUpperCase(); }).join('・') + 'を入力してください（使わない選択肢には「ー」）'
          : real.length < 2 ? '選択肢は2つ以上入力してください' : '';
        setFieldErr($('[data-f="opts"]', sec), optErr);
        if (optErr) n++;
        const ansErr = !q.ans ? '正解をA〜Dから1つ選んでください'
          : isBlank(q[q.ans.toLowerCase()]) ? '正解に「ー」（使わない選択肢）が選ばれています。正解の選択肢を選んでください' : '';
        setFieldErr($('[data-f="ans"]', sec), ansErr);
        if (ansErr) n++;
      });
      formErr.hidden = !n;
      formErr.textContent = n ? '入力が足りない項目が' + n + 'か所あります。赤い表示のところをご確認ください。' : '';
      return !n;
    }

    form.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act="dash"]');
      if (!b) return;
      const f = b.closest('[data-f="opts"]');
      let filled = 0;
      KEYS.forEach(function (k) {
        const inp = $('[data-k="' + k + '"] input', f);
        if (!inp.value.trim()) { inp.value = DASH; filled++; }
      });
      if (!filled) { SV.toast('空いている選択肢はありません'); return; }
      form.dispatchEvent(new Event('input', { bubbles: true }));
      $$('.choice', f).forEach(function (ch) { if ($('input', ch).value.trim()) ch.classList.remove('is-empty'); });
      if (!$('.choice.is-empty', f)) setFieldErr(f, '');
      syncSummary(v.edit);
    });

    // clear an error as soon as the field is fixed
    form.addEventListener('input', function (e) {
      const f = e.target.closest('.field.is-invalid');
      if (!f) return;
      if (f.getAttribute('data-f') === 'opts') {
        const ch = e.target.closest('.choice');
        if (ch && e.target.value.trim()) ch.classList.remove('is-empty');
        if (!$('.choice.is-empty', f)) setFieldErr(f, '');
      } else if (f.getAttribute('data-f') !== 'name') setFieldErr(f, '');
      syncSummary(v.edit);
    });
    form.addEventListener('change', function (e) {
      if (e.target.type === 'radio') setFieldErr(e.target.closest('.field'), '');
      syncSummary(v.edit);
    });

    let data = null, sid = '', busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      data = collect();
      if (!validate(data)) { scrollToFirstError(v.edit); return; }
      showConfirm();
    });

    function asText(d) {
      return '【SVARAC クイズ案】\nお名前：' + d.guest.name + '\n\n' + d.questions.map(function (q, i) {
        return '■第' + (i + 1) + '問\n' + q.text + '\n' + KEYS.filter(function (k) { return !isBlank(q[k]); }).map(function (k) { return k.toUpperCase() + '. ' + q[k]; }).join('\n') + '\n正解：' + q.ans;
      }).join('\n\n') + (d.note ? '\n\n備考：' + d.note : '');
    }

    function showConfirm() {
      sid = SV.sid('q');   // the same id for every retry of this send, so it can only be stored once
      v.confirm.innerHTML =
        '<p class="lead">以下の内容で送信します。よろしければ「この内容で送信する」を押してください。</p>' +
        '<section class="card"><dl class="dl"><div><dt>お名前</dt><dd>' + esc(data.guest.name) + '</dd></div></dl></section>' +
        data.questions.map(function (q, i) {
          return '<section class="card"><h2 class="card__h"><span class="no">Q' + (i + 1) + '</span>第' + (i + 1) + '問</h2><dl class="dl">' +
            '<div><dt>クイズ内容</dt><dd>' + esc(q.text) + '</dd></div>' +
            '<div><dt>選択肢と正解</dt><dd><ul class="opts">' + KEYS.map(function (k) { return optHtml(q, k); }).join('') + '</ul></dd></div>' +
          '</dl></section>';
        }).join('') +
        '<section class="card"><dl class="dl"><div><dt>備考・メッセージ</dt><dd>' + (data.note ? esc(data.note) : '<span class="empty">なし</span>') + '</dd></div></dl></section>' +
        confirmActions();
      const ui = sendingUI(v.confirm, {
        hint: 'お手数ですが、下のボタンで入力内容をコピーして、運営へDMでお送りください。',
        text: function () { return asText(data); },
      });
      $('[data-act="edit"]', v.confirm).addEventListener('click', function () { v.show('edit'); });
      $('[data-act="send"]', v.confirm).addEventListener('click', function () {
        if (busy) return;
        busy = true; guard.busy = true;
        ui.start('送信しています…');
        SV.api('submitQuiz', { sid: sid, guestId: data.guest.id, questions: data.questions, note: data.note, pw: opts.pw }, { onRetry: ui.retrying })
          .then(function () {
            busy = false;
            clearTimeout(draftTimer);
            drafts.clear();
            guard.release();
            if (opts.onSubmitted) opts.onSubmitted(data.guest, 'quiz');
            doneView(v, proxy ? '代理入力で保存しました。' : 'ありがとうございます！<br>2日を目処にご連絡します。', opts);
          }, function (err) {
            busy = false; guard.busy = false;
            ui.fail(err.message);
          });
      });
      v.show('confirm');
    }
  };

  /* iPhone: a web page can't open Voice Memos, so show the way through the Files app */
  function voiceMemoHowto() {
    return '<details class="howto"><summary><span>「ボイスメモ」の録音を出す方法</span></summary><ol>' +
      '<li>「ボイスメモ」で提出する録音をタップ →「…」→「共有」→「“ファイル”に保存」→ 保存先（「このiPhone内」など）を選んで「保存」</li>' +
      '<li>このページに戻り、下の点線の枠をタップ →「ファイルを選択」</li>' +
      '<li>「最近使った項目」から保存した録音を選ぶ（右上の「選択」で、まとめて選ぶこともできます）</li>' +
      '</ol><p class="howto__note">「写真ライブラリ」「ビデオを撮る」は使いません。</p></details>';
  }

  /* ================= ボイメ ================= */
  SV.VoiceFlow = function (root, opts) {
    const u = 'vm' + (++uidN);
    const v = views(root);
    const proxy = !!opts.guest;
    const guard = leaveGuard();
    const drafts = draftStore('voice', !proxy);
    const anyGuest = function () { return true; };
    let draftTimer = 0;

    v.edit.innerHTML = '<form novalidate>' +
      (proxy ? proxyBanner(opts.guest) : '<p class="lead voice-lead"></p>') +
      '<div class="restore-box"></div>' +
      '<div class="notice notice--err form-err" role="alert" hidden></div>' +
      (proxy ? '' : nameField(u, '')) +
      '<section class="card" data-f="audio"><h2 class="card__h">音源</h2>' +
        '<p class="card__lead">ここに直接入れるか、下のギガファイル便の欄にURLを入れてください。</p>' +
        (SV.isIOS ? voiceMemoHowto() : '') +
        '<div data-slot="intro"></div><div data-slot="quiz"></div><div data-slot="cm"></div>' +
      '</section>' +
      '<section class="card"><h2 class="card__h">ギガファイル便で提出される方はこちら</h2>' +
        '<div class="field" data-f="giga"><label for="' + u + '-giga">ダウンロードページのURL ' + tag(false) + '</label>' +
          '<input class="input" id="' + u + '-giga" type="url" inputmode="url" autocomplete="off" placeholder="https://〇〇.gigafile.nu/…">' +
          '<p class="hint">※ 保存期間を<strong>100日</strong>に設定してください</p><p class="err"></p></div>' +
      '</section>' +
      '<section class="card"><div class="field"><label for="' + u + '-note">備考・メッセージ ' + tag(false) + '</label>' +
        '<textarea class="textarea textarea--sm" id="' + u + '-note" maxlength="2000" placeholder="補足や、運営へのメッセージがあればどうぞ"></textarea></div></section>' +
      '<div class="actions"><button type="submit" class="btn btn--red btn--lg btn--block">入力内容を確認する</button></div>' +
    '</form>';
    const form = $('form', v.edit), formErr = $('.form-err', v.edit), gigaIn = $('#' + u + '-giga'), noteIn = $('#' + u + '-note');
    // 自己紹介 1本・クイズ 5本まで（A/B のゲスト）／ CM 1本（C のゲスト）／ スタッフ（Z・代理入力のみ）は全部
    const ALL = [
      { slot: 'intro', label: '自己紹介', doneKey: 'intro', max: 1 },
      { slot: 'quiz', label: 'クイズ', doneKey: 'quizAudio', max: 5 },
      { slot: 'cm', label: 'CM', doneKey: 'cm', max: 1 },
    ];
    const lists = {};
    ALL.forEach(function (s) {
      lists[s.slot] = SV.audioList($('[data-slot="' + s.slot + '"]', v.edit), {
        slot: s.slot, label: s.label + 'の音源', addLabel: s.label + 'の音源を追加する', required: !proxy, max: s.max,
        onChange: function (f) {
          syncSummary(v.edit);
          if (f) guard.dirty = true;
        },
      });
    });

    let guest = opts.guest || null;
    let SLOTS = [];
    const isCM = function () { return !!(guest && guest.type === 'C'); };
    const isStaff = function () { return !!(guest && guest.type === 'Z'); };
    function layout() {
      SLOTS = ALL.filter(function (s) { return isStaff() || (isCM() ? s.slot === 'cm' : s.slot !== 'cm'); });
      ALL.forEach(function (s) { lists[s.slot].show(SLOTS.indexOf(s) >= 0); });
      const lead = $('.voice-lead', v.edit);
      if (lead) {
        lead.textContent = isCM() ? 'CMの音源をご提出ください。'
          : '「自己紹介」と「クイズ」の音源をご提出ください。CMのご依頼の方は、お名前を選ぶとCMの欄に切り替わります。';
      }
    }
    SV._zones = function () { return SLOTS.reduce(function (a, s) { return a.concat(lists[s.slot].zones()); }, []); };
    function showPrevious() {
      layout();
      SLOTS.forEach(function (s) {
        const has = guest && guest.done && guest.done[s.doneKey];
        lists[s.slot].setPrevious(has ? '<p class="notice">提出済みの音源があります。差し替える場合だけ選んでください（選んだ音源で、前回分がまるごと差し替わります）。</p>' : '');
      });
      const box = $('.resub', v.edit);
      if (box) {
        const any = guest && guest.done && (guest.done.intro || guest.done.quizAudio || guest.done.cm || guest.done.giga);
        box.hidden = !any;
        box.innerHTML = '<p class="notice">すでにボイメをご提出いただいています。差し替えたい音源だけ選んで送れば、その音源が最新版になります（前回分も運営側で保管しています）。</p>';
      }
    }
    const picker = guestPicker(v, Object.assign({}, opts, {
      onGuest: function (g) { guest = g; showPrevious(); saveDraftSoon(); },
    }), anyGuest);
    showPrevious();

    gigaIn.addEventListener('input', function () { setFieldErr($('[data-f="giga"]', v.edit), ''); SLOTS.forEach(function (s) { if (gigaIn.value.trim()) lists[s.slot].setErr(''); }); syncSummary(v.edit); });

    // --- drafts (name, URL and message; audio files have to be chosen again) ---
    function saveDraftSoon() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () {
        if (guard.done) return;   // already sent: never bring the draft back
        const g = picker.get(), giga = gigaIn.value.trim(), note = noteIn.value.trim();
        const any = !!(g || giga || note);
        guard.dirty = any || SLOTS.some(function (s) { return lists[s.slot].items().length; });
        if (any) drafts.save({ guestId: g ? g.id : '', giga: giga, note: note }); else drafts.clear();
      }, 300);
    }
    gigaIn.addEventListener('input', saveDraftSoon);
    noteIn.addEventListener('input', saveDraftSoon);
    const saved = drafts.load();
    if (saved) {
      gigaIn.value = saved.giga || '';
      noteIn.value = saved.note || '';
      const g = saved.guestId ? findGuest(opts, saved.guestId, anyGuest) : null;
      if (g) picker.set(g);
      guard.dirty = true;
      const box = $('.restore-box', v.edit);
      box.innerHTML = restoredNotice('前回入力途中だった内容（お名前・URL・備考）を復元しました。音源はもう一度選んでください。');
      $('[data-act="discard"]', box).addEventListener('click', function () {
        drafts.clear();
        gigaIn.value = ''; noteIn.value = '';
        picker.set(null);
        box.innerHTML = '';
      });
    }

    function collect() {
      const files = { intro: [], quiz: [], cm: [] };
      SLOTS.forEach(function (s) { files[s.slot] = lists[s.slot].items(); });   // only the fields shown for this guest
      return {
        guest: picker.get(),
        files: files,
        giga: gigaIn.value.trim(),
        note: noteIn.value.trim(),
      };
    }

    function validate(d) {
      let n = 0;
      const nf = $('[data-f="name"] .field', v.edit);
      if (nf) { setFieldErr(nf, d.guest ? '' : 'お名前を候補から選んでください'); if (!d.guest) n++; }
      const gf = $('[data-f="giga"]', v.edit);
      const gigaBad = d.giga && !/^https?:\/\/\S+$/i.test(d.giga);
      setFieldErr(gf, gigaBad ? 'URLは https:// から始まる形で入力してください' : '');
      if (gigaBad) n++;
      const done = (d.guest && d.guest.done) || {};
      const hasGiga = !!d.giga || !!done.giga;
      if (proxy) {
        if (!SLOTS.some(function (s) { return d.files[s.slot].length; }) && !d.giga && !d.note) {
          lists[SLOTS[0].slot].setErr('音源・ギガファイル便のURL・備考のどれかを入れてください');
          n++;
        }
      } else {
        SLOTS.forEach(function (s) {
          const ok = d.files[s.slot].length || done[s.doneKey] || hasGiga;
          lists[s.slot].setErr(ok ? '' : s.label + 'の音源を選んでください（ギガファイル便で提出する場合は、下の欄にURLを入れてください）');
          if (!ok) n++;
        });
      }
      formErr.hidden = !n;
      formErr.textContent = n ? '入力が足りない項目が' + n + 'か所あります。赤い表示のところをご確認ください。' : '';
      return !n;
    }

    let data = null, sid = '', busy = false;
    const mk = function () { return typeof WeakMap === 'function' ? new WeakMap() : new Map(); };
    const uploaded = mk(), fileSid = mk();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      data = collect();
      if (!validate(data)) { scrollToFirstError(v.edit); return; }
      showConfirm();
    });

    function audioRow(s) {
      const list = data.files[s.slot];
      const done = (data.guest && data.guest.done) || {};
      let body;
      if (list.length) {
        body = list.map(function (it, i) {
          return '<div class="confirm-audio">' + (list.length > 1 ? '<div class="drop__h">' + (i + 1) + '本目</div>' : '') +
            '<div class="drop__meta"><span class="drop__name">' + esc(it.file.name) + '</span><span class="drop__info">' + esc([SV.bytes(it.file.size), SV.dur(it.dur)].filter(Boolean).join('・')) + '</span></div>' +
            '<audio controls preload="metadata" src="' + esc(it.url) + '"></audio></div>';
        }).join('');
      } else if (data.giga) {
        body = 'ギガファイル便で提出';
      } else if (done[s.doneKey]) {
        body = '<span class="empty">前回ご提出の音源のまま</span>';
      } else if (done.giga) {
        body = '<span class="empty">前回のギガファイル便のまま</span>';
      } else {
        body = '<span class="empty">なし</span>';
      }
      return '<div><dt>' + s.label + 'の音源' + (list.length > 1 ? '（' + list.length + '本）' : '') + '</dt><dd class="drop">' + body + '</dd></div>';
    }

    function asText(d) {
      return '【SVARAC ボイメ】\nお名前：' + d.guest.name + SLOTS.map(function (s) {
        const l = d.files[s.slot];
        return '\n' + s.label + 'の音源：' + (l.length ? l.map(function (it) { return it.file.name; }).join('、') : (d.giga ? 'ギガファイル便' : 'なし'));
      }).join('') +
        (d.giga ? '\nギガファイル便：' + d.giga : '') + (d.note ? '\n備考：' + d.note : '');
    }

    function showConfirm() {
      sid = SV.sid('v');
      v.confirm.innerHTML =
        '<p class="lead">以下の内容で送信します。音源は再生して確認できます。</p>' +
        '<section class="card"><dl class="dl"><div><dt>お名前</dt><dd>' + esc(data.guest.name) + '</dd></div></dl></section>' +
        '<section class="card"><dl class="dl">' + SLOTS.map(audioRow).join('') +
          '<div><dt>ギガファイル便のURL</dt><dd>' + (data.giga ? esc(data.giga) : '<span class="empty">なし</span>') + '</dd></div>' +
          '<div><dt>備考・メッセージ</dt><dd>' + (data.note ? esc(data.note) : '<span class="empty">なし</span>') + '</dd></div>' +
        '</dl></section>' +
        (data.giga ? '<p class="notice">ギガファイル便の保存期間が<strong>100日</strong>になっているか、もう一度ご確認ください。</p>' : '') +
        confirmActions();
      const ui = sendingUI(v.confirm, {
        hint: 'お手数ですが、音源をギガファイル便にアップして上の欄にURLを入れて送るか、下のボタンで入力内容をコピーして運営へDMでご相談ください。',
        text: function () { return asText(data); },
      });
      $('[data-act="edit"]', v.confirm).addEventListener('click', function () { v.show('edit'); });
      $('[data-act="send"]', v.confirm).addEventListener('click', function () {
        SV.stopAudio(v.confirm);
        send(ui);
      });
      v.show('confirm');
    }

    function send(ui) {
      if (busy) return;
      busy = true; guard.busy = true;
      const todo = [];
      SLOTS.forEach(function (s) {
        const list = data.files[s.slot];
        list.forEach(function (it, i) { todo.push({ s: s, it: it, label: s.label + 'の音源' + (list.length > 1 ? '（' + (i + 1) + '本目）' : '') }); });
      });
      const total = todo.length + 1;
      ui.start(todo.length ? todo[0].label + 'を送信しています…（1/' + total + '）' : '送信しています…');
      const ids = { intro: [], quiz: [], cm: [] };
      let chain = Promise.resolve();
      todo.forEach(function (t, i) {
        chain = chain.then(function () {
          const f = t.it.file;
          ui.step(t.label + 'を送信しています…（' + (i + 1) + '/' + total + '）' + (f.size > 8 * 1024 * 1024 ? ' 大きいファイルは1分ほどかかります' : ''));
          const prev = uploaded.has(f) ? uploaded.get(f) : null;
          if (prev && prev.guestId === data.guest.id) { ids[t.s.slot].push({ fileId: prev.fileId, dur: t.it.dur }); return null; }
          if (!fileSid.has(f)) fileSid.set(f, SV.sid('u'));
          return SV.readBase64(f).then(function (b64) {
            return SV.api('upload', { sid: fileSid.get(f), guestId: data.guest.id, slot: t.s.slot, fileName: f.name, mime: f.type || '', data: b64, pw: opts.pw },
              { timeout: 330000, onRetry: ui.retrying });
          }).then(function (res) {
            uploaded.set(f, { guestId: data.guest.id, fileId: res.fileId });
            ids[t.s.slot].push({ fileId: res.fileId, dur: t.it.dur });
          });
        });
      });
      chain.then(function () {
        ui.step('仕上げています…（' + total + '/' + total + '）');
        const body = { sid: sid, guestId: data.guest.id, giga: data.giga, note: data.note, pw: opts.pw };
        SLOTS.forEach(function (s) { if (ids[s.slot].length) body[s.slot] = ids[s.slot]; });
        return SV.api('submitVoice', body, { onRetry: ui.retrying });
      }).then(function () {
        busy = false;
        clearTimeout(draftTimer);
        drafts.clear();
        guard.release();
        if (opts.onSubmitted) opts.onSubmitted(data.guest, 'voice', { intro: !!ids.intro.length, quizAudio: !!ids.quiz.length, cm: !!ids.cm.length, giga: !!data.giga });
        doneView(v, proxy ? '代理入力で保存しました。' : 'ありがとうございます！<br>不備がある場合はご連絡します。', opts);
      }, function (err) {
        busy = false; guard.busy = false;
        const big = todo.some(function (t) { return t.it.file.size > 15 * 1024 * 1024; });
        ui.fail(err.message + (big && err.retryable ? '。大きいファイルは、ギガファイル便での提出もご検討ください' : ''));
      });
    }
  };
})();
