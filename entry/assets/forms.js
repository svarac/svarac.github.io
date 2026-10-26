/* SVARAC 出演者提出ページ — the two submission flows (edit → confirm → send → done).
   Used by the public page and, for proxy entry, by the admin page. */
(function () {
  'use strict';
  const SV = window.SV;
  const esc = SV.esc, $ = SV.$, $$ = SV.$$;
  let uidN = 0;
  const KEYS = ['a', 'b', 'c', 'd'];

  function tag(req) { return req ? '<span class="tag tag--req">必須</span>' : '<span class="tag tag--opt">任意</span>'; }

  function nameField(u, hint) {
    return '<section class="card" data-f="name">' +
      '<div class="field">' +
        '<label for="' + u + '-name">お名前 ' + tag(true) + '</label>' +
        '<div class="combo"><input class="input" id="' + u + '-name" placeholder="読みの1文字目を入力（例：や）" aria-describedby="' + u + '-name-hint"><span class="combo__ok">' + SV.icon.check.replace('<svg', '<svg width="14" height="14"') + '選択済み</span></div>' +
        '<p class="hint" id="' + u + '-name-hint">読みの1文字目を入れると候補が出ます。候補からお選びください。<br>' + hint + '</p>' +
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
      ['edit', 'confirm', 'done'].forEach(function (k) { v[k].hidden = k !== name; });
      window.scrollTo(0, 0);
    };
    return v;
  }

  function confirmActions() {
    return '<div class="notice notice--err send-err" role="alert" hidden></div>' +
      '<div class="actions send-btns">' +
        '<button type="button" class="btn btn--red btn--lg btn--block" data-act="send">この内容で送信する</button>' +
        '<button type="button" class="btn btn--line btn--lg btn--block" data-act="edit">修正する</button>' +
      '</div>' +
      '<div class="sending" hidden><p class="progress" aria-live="polite">送信しています…</p><div class="bar-ind"><i></i></div></div>';
  }

  function sendingUI(box) {
    const err = $('.send-err', box), btns = $('.send-btns', box), sending = $('.sending', box), prog = $('.progress', box);
    return {
      start: function (msg) { err.hidden = true; btns.hidden = true; sending.hidden = false; prog.textContent = msg || '送信しています…'; },
      step: function (msg) { prog.textContent = msg; },
      fail: function (msg) { sending.hidden = true; btns.hidden = false; err.hidden = false; err.textContent = msg + '（入力内容はそのまま残っています）'; err.scrollIntoView({ block: 'center' }); },
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

  function guestPicker(v, u, opts, filter) {
    if (opts.guest) return { get: function () { return opts.guest; } };
    const field = $('[data-f="name"]', v.edit);
    return SV.combobox($('.combo', field), {
      items: function () { return (opts.guests() || []).filter(filter); },
      onPick: function (g) {
        if (g) { setFieldErr($('.field', field), ''); syncSummary(v.edit); }
        if (opts.onGuest) opts.onGuest(g);
      },
    });
  }

  /* ================= クイズ案 ================= */
  SV.QuizFlow = function (root, opts) {
    const u = 'qz' + (++uidN);
    const v = views(root);
    const proxy = !!opts.guest;

    function qBlock(n) {
      const p = u + '-q' + n;
      return '<section class="card" data-q="' + n + '">' +
        '<h2 class="card__h"><span class="no">Q' + n + '</span>第' + n + '問</h2>' +
        '<div class="field" data-f="text"><label for="' + p + '-text">クイズ内容 ' + tag(true) + '</label>' +
          '<textarea class="textarea" id="' + p + '-text" maxlength="2000" placeholder="問題文を入力してください"></textarea><p class="err"></p></div>' +
        '<fieldset class="field" data-f="opts"><legend>選択肢 ' + tag(true) + '</legend><div class="choices">' +
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
      (proxy ? proxyBanner(opts.guest) : '<p class="lead">クイズを2問ご提出ください。選択肢はA〜Dの4つ、正解を1つ選んでください。</p>') +
      '<div class="notice notice--err form-err" role="alert" hidden></div>' +
      (proxy ? '' : nameField(u, 'ボイメのみのご依頼の方は、クイズ案の提出は不要です。')) +
      qBlock(1) + qBlock(2) +
      '<section class="card"><div class="field" data-f="note"><label for="' + u + '-note">備考・メッセージ ' + tag(false) + '</label>' +
        '<textarea class="textarea textarea--sm" id="' + u + '-note" maxlength="2000" placeholder="補足や、運営へのメッセージがあればどうぞ"></textarea></div></section>' +
      '<div class="actions"><button type="submit" class="btn btn--red btn--lg btn--block">入力内容を確認する</button></div>' +
    '</form>';
    const form = $('form', v.edit);
    const formErr = $('.form-err', v.edit);

    const picker = guestPicker(v, u, Object.assign({}, opts, {
      onGuest: function (g) {
        const box = $('.resub', v.edit);
        if (!box) return;
        box.hidden = !(g && g.done && g.done.quiz);
        box.innerHTML = '<p class="notice">すでにクイズ案をご提出いただいています。もう一度送ると最新の内容に差し替わります（前回の内容も運営側で保管しています）。</p>';
      },
    }), function (g) { return g.type !== 'B'; });

    if (opts.prefill) {
      const r = opts.prefill;
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

    function validate(d) {
      let n = 0;
      const nf = $('[data-f="name"] .field', v.edit);
      if (nf) { setFieldErr(nf, d.guest ? '' : 'お名前を候補から選んでください'); if (!d.guest) n++; }
      d.questions.forEach(function (q, i) {
        const sec = $('[data-q="' + (i + 1) + '"]', v.edit);
        setFieldErr($('[data-f="text"]', sec), q.text ? '' : 'クイズ内容を入力してください');
        if (!q.text) n++;
        const empty = KEYS.filter(function (k) { return !q[k]; });
        KEYS.forEach(function (k) { $('[data-k="' + k + '"]', sec).classList.toggle('is-empty', !q[k]); });
        setFieldErr($('[data-f="opts"]', sec), empty.length ? '選択肢' + empty.map(function (k) { return k.toUpperCase(); }).join('・') + 'を入力してください' : '');
        if (empty.length) n++;
        setFieldErr($('[data-f="ans"]', sec), q.ans ? '' : '正解をA〜Dから1つ選んでください');
        if (!q.ans) n++;
      });
      formErr.hidden = !n;
      formErr.textContent = n ? '入力が足りない項目が' + n + 'か所あります。赤い表示のところをご確認ください。' : '';
      return !n;
    }

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

    let data = null;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      data = collect();
      if (!validate(data)) { scrollToFirstError(v.edit); return; }
      showConfirm();
    });

    function showConfirm() {
      v.confirm.innerHTML =
        '<p class="lead">以下の内容で送信します。よろしければ「この内容で送信する」を押してください。</p>' +
        '<section class="card"><dl class="dl"><div><dt>お名前</dt><dd>' + esc(data.guest.name) + '</dd></div></dl></section>' +
        data.questions.map(function (q, i) {
          return '<section class="card"><h2 class="card__h"><span class="no">Q' + (i + 1) + '</span>第' + (i + 1) + '問</h2><dl class="dl">' +
            '<div><dt>クイズ内容</dt><dd>' + esc(q.text) + '</dd></div>' +
            '<div><dt>選択肢と正解</dt><dd><ul class="opts">' + KEYS.map(function (k) {
              const K = k.toUpperCase(), on = q.ans === K;
              return '<li class="' + (on ? 'is-ans' : '') + '"><span class="k">' + K + '</span><span>' + esc(q[k]) + '</span>' + (on ? '<span class="mark">正解</span>' : '') + '</li>';
            }).join('') + '</ul></dd></div>' +
          '</dl></section>';
        }).join('') +
        '<section class="card"><dl class="dl"><div><dt>備考・メッセージ</dt><dd>' + (data.note ? esc(data.note) : '<span class="empty">なし</span>') + '</dd></div></dl></section>' +
        confirmActions();
      const ui = sendingUI(v.confirm);
      $('[data-act="edit"]', v.confirm).addEventListener('click', function () { v.show('edit'); });
      $('[data-act="send"]', v.confirm).addEventListener('click', function () {
        ui.start('送信しています…');
        SV.api('submitQuiz', { guestId: data.guest.id, questions: data.questions, note: data.note, pw: opts.pw })
          .then(function () {
            if (opts.onSubmitted) opts.onSubmitted(data.guest, 'quiz');
            doneView(v, proxy ? '代理入力で保存しました。' : 'ありがとうございます！<br>2日を目処にご連絡します。', opts);
          })
          .catch(function (err) { ui.fail(err.message); });
      });
      v.show('confirm');
    }
  };

  /* ================= ボイメ ================= */
  SV.VoiceFlow = function (root, opts) {
    const u = 'vm' + (++uidN);
    const v = views(root);
    const proxy = !!opts.guest;

    v.edit.innerHTML = '<form novalidate>' +
      (proxy ? proxyBanner(opts.guest) : '<p class="lead">「自己紹介」と「クイズ」の音源をご提出ください。</p>') +
      '<div class="notice notice--err form-err" role="alert" hidden></div>' +
      (proxy ? '' : nameField(u, '')) +
      '<section class="card" data-f="audio"><h2 class="card__h">音源</h2>' +
        '<p class="card__lead">ここに直接入れるか、下のギガファイル便の欄にURLを入れてください。</p>' +
        '<div data-slot="intro"></div><div data-slot="quiz"></div>' +
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
    const SLOTS = [{ slot: 'intro', label: '自己紹介', doneKey: 'intro' }, { slot: 'quiz', label: 'クイズ', doneKey: 'quizAudio' }];
    const zones = {};
    SLOTS.forEach(function (s) {
      zones[s.slot] = SV.dropzone($('[data-slot="' + s.slot + '"]', v.edit), {
        slot: s.slot, label: s.label + 'の音源', required: !proxy,
        onChange: function () { if (zones[s.slot]) { zones[s.slot].setErr(''); syncSummary(v.edit); } },
      });
    });
    SV._zones = SLOTS.map(function (s) { return zones[s.slot]; });

    let guest = opts.guest || null;
    function showPrevious() {
      SLOTS.forEach(function (s) {
        const has = guest && guest.done && guest.done[s.doneKey];
        zones[s.slot].setPrevious(has ? '<p class="notice">提出済みの音源があります。差し替える場合だけ選んでください。</p>' : '');
      });
      const box = $('.resub', v.edit);
      if (box) {
        const any = guest && guest.done && (guest.done.intro || guest.done.quizAudio || guest.done.giga);
        box.hidden = !any;
        box.innerHTML = '<p class="notice">すでにボイメをご提出いただいています。差し替えたい音源だけ選んで送れば、その音源が最新版になります（前回分も運営側で保管しています）。</p>';
      }
    }
    const picker = guestPicker(v, u, Object.assign({}, opts, {
      onGuest: function (g) { guest = g; showPrevious(); },
    }), function () { return true; });
    showPrevious();

    gigaIn.addEventListener('input', function () { setFieldErr($('[data-f="giga"]', v.edit), ''); SLOTS.forEach(function (s) { if (gigaIn.value.trim()) zones[s.slot].setErr(''); }); syncSummary(v.edit); });

    function collect() {
      return {
        guest: picker.get(),
        files: { intro: zones.intro.file(), quiz: zones.quiz.file() },
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
        if (!d.files.intro && !d.files.quiz && !d.giga && !d.note) {
          zones.intro.setErr('音源・ギガファイル便のURL・備考のどれかを入れてください');
          n++;
        }
      } else {
        SLOTS.forEach(function (s) {
          const ok = d.files[s.slot] || done[s.doneKey] || hasGiga;
          zones[s.slot].setErr(ok ? '' : s.label + 'の音源を選んでください（ギガファイル便で提出する場合は、下の欄にURLを入れてください）');
          if (!ok) n++;
        });
      }
      formErr.hidden = !n;
      formErr.textContent = n ? '入力が足りない項目が' + n + 'か所あります。赤い表示のところをご確認ください。' : '';
      return !n;
    }

    let data = null;
    const uploaded = typeof WeakMap === 'function' ? new WeakMap() : new Map();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      data = collect();
      if (!validate(data)) { scrollToFirstError(v.edit); return; }
      showConfirm();
    });

    function audioRow(s) {
      const f = data.files[s.slot], z = zones[s.slot];
      const done = (data.guest && data.guest.done) || {};
      let body;
      if (f) {
        body = '<div class="drop__meta"><span class="drop__name">' + esc(f.name) + '</span><span class="drop__info">' + esc([SV.bytes(f.size), SV.dur(z.duration())].filter(Boolean).join('・')) + '</span></div>' +
          '<audio controls preload="metadata" src="' + esc(z.url()) + '"></audio>';
      } else if (data.giga) {
        body = 'ギガファイル便で提出';
      } else if (done[s.doneKey]) {
        body = '<span class="empty">前回ご提出の音源のまま</span>';
      } else if (done.giga) {
        body = '<span class="empty">前回のギガファイル便のまま</span>';
      } else {
        body = '<span class="empty">なし</span>';
      }
      return '<div><dt>' + s.label + 'の音源</dt><dd class="drop">' + body + '</dd></div>';
    }

    function showConfirm() {
      v.confirm.innerHTML =
        '<p class="lead">以下の内容で送信します。音源は再生して確認できます。</p>' +
        '<section class="card"><dl class="dl"><div><dt>お名前</dt><dd>' + esc(data.guest.name) + '</dd></div></dl></section>' +
        '<section class="card"><dl class="dl">' + SLOTS.map(audioRow).join('') +
          '<div><dt>ギガファイル便のURL</dt><dd>' + (data.giga ? esc(data.giga) : '<span class="empty">なし</span>') + '</dd></div>' +
          '<div><dt>備考・メッセージ</dt><dd>' + (data.note ? esc(data.note) : '<span class="empty">なし</span>') + '</dd></div>' +
        '</dl></section>' +
        (data.giga ? '<p class="notice">ギガファイル便の保存期間が<strong>100日</strong>になっているか、もう一度ご確認ください。</p>' : '') +
        confirmActions();
      const ui = sendingUI(v.confirm);
      $('[data-act="edit"]', v.confirm).addEventListener('click', function () {
        $$('audio', v.confirm).forEach(function (a) { a.pause(); });
        v.show('edit');
      });
      $('[data-act="send"]', v.confirm).addEventListener('click', function () {
        $$('audio', v.confirm).forEach(function (a) { a.pause(); });
        send(ui);
      });
      v.show('confirm');
    }

    function send(ui) {
      const todo = SLOTS.filter(function (s) { return data.files[s.slot]; });
      const total = todo.length + 1;
      ui.start(todo.length ? todo[0].label + 'の音源を送信しています…（1/' + total + '）' : '送信しています…');
      const ids = {};
      let chain = Promise.resolve();
      todo.forEach(function (s, i) {
        chain = chain.then(function () {
          const f = data.files[s.slot];
          ui.step(s.label + 'の音源を送信しています…（' + (i + 1) + '/' + total + '）' + (f.size > 8 * 1024 * 1024 ? ' 大きいファイルは1分ほどかかります' : ''));
          if (uploaded.has(f) && uploaded.get(f).guestId === data.guest.id) { ids[s.slot] = uploaded.get(f).fileId; return null; }
          return SV.readBase64(f).then(function (b64) {
            return SV.api('upload', { guestId: data.guest.id, slot: s.slot, fileName: f.name, mime: f.type || '', data: b64, pw: opts.pw }, { timeout: 330000 });
          }).then(function (res) {
            uploaded.set(f, { guestId: data.guest.id, fileId: res.fileId });
            ids[s.slot] = res.fileId;
          });
        });
      });
      chain.then(function () {
        ui.step('仕上げています…（' + total + '/' + total + '）');
        const body = { guestId: data.guest.id, giga: data.giga, note: data.note, pw: opts.pw };
        SLOTS.forEach(function (s) { if (ids[s.slot]) body[s.slot] = { fileId: ids[s.slot], dur: zones[s.slot].duration() }; });
        return SV.api('submitVoice', body);
      }).then(function () {
        if (opts.onSubmitted) opts.onSubmitted(data.guest, 'voice', { intro: !!ids.intro, quizAudio: !!ids.quiz, giga: !!data.giga });
        doneView(v, proxy ? '代理入力で保存しました。' : 'ありがとうございます！<br>不備がある場合はご連絡します。', opts);
      }).catch(function (err) { ui.fail(err.message); });
    }
  };
})();
