/* SVARAC 出演者提出ページ — public page: choose your name → (クイズ案＋ボイメ: menu) → form.
   Routes:  #            top (name)
            #g/<id>      menu, only for guests asked for both
            #g/<id>/quiz, #g/<id>/voice   the forms (ボイメのみ・CMのみ go straight to voice) */
(function () {
  'use strict';
  const SV = window.SV, $ = SV.$, esc = SV.esc;
  const ME = 'svarac_me';   // the name last chosen on this device, offered again next time
  const top = $('#v-top'), formView = $('#v-form'), title = $('#form-title'), state = $('#form-state'), menu = $('#menu');
  const back = $('#bar-back'), backLabel = $('#bar-back-label');
  const boxes = { quiz: $('#form-quiz'), voice: $('#form-voice') };
  const who = $('#who'), whoIn = $('#who-name'), whoErr = $('#who-err'), whoState = $('#who-state'), whoGo = $('.who__go', who);
  const flows = {};   // kind -> { gid, api, finished }
  const refetched = {};
  let guests = null, loading = null;

  $('.bar__icon').outerHTML = SV.icon.back;
  $('.combo__ok', who).insertAdjacentHTML('afterbegin', SV.icon.check.replace('<svg', '<svg width="14" height="14"'));
  $('.who__arrow', who).innerHTML = SV.icon.arrow;

  if (!SV.ready) {
    whoState.innerHTML = '<p class="top__note">受付の準備中です。運営からのご案内をお待ちください。</p>';
    window.SV_OK = true;
    return;
  }

  const asksQuiz = function (g) { return g.type !== 'B' && g.type !== 'C'; };
  const byId = function (id) { return (guests || []).filter(function (g) { return g.id === id; })[0] || null; };
  const homeOf = function (g) { return asksQuiz(g) ? '#g/' + g.id : '#g/' + g.id + '/voice'; };

  function load() {
    if (guests) return Promise.resolve(guests);
    if (!loading) {
      loading = SV.api('list').then(function (res) { guests = res.guests; return guests; })
        .catch(function (err) { loading = null; throw err; });
    }
    return loading;
  }
  function loadError(err) {
    return '<p class="notice notice--err">' + esc(err.message) + '</p>' +
      '<div class="actions"><button type="button" class="btn btn--line btn--lg btn--block" data-act="retry">もう一度読み込む</button></div>' +
      '<div class="fallback"><p class="fallback__h">しばらくしても開けないときは</p><p class="fallback__t">お手数ですが、運営へDMでご連絡ください。クイズ案は文章で、音源はギガファイル便のURLでお送りいただければ大丈夫です。</p></div>';
  }

  /* ---------- top: name ---------- */
  const picker = SV.combobox($('.combo', who), {
    items: function () { return guests || []; },
    onPick: function (g) { if (g) setErr(''); },
  });
  function setErr(msg) {
    $('.field', who).classList.toggle('is-invalid', !!msg);
    whoErr.textContent = msg || '';
  }
  function prepareTop() {
    whoState.innerHTML = '';
    if (!guests) { whoIn.disabled = true; whoGo.disabled = true; whoIn.placeholder = '読み込んでいます…'; }
    load().then(function () {
      if (!whoIn.disabled) return;
      whoIn.disabled = false; whoGo.disabled = false;
      whoIn.placeholder = '読みの1文字目を入力（例：や）';
      const me = byId(SV.local.get(ME));
      if (me && !whoIn.value) picker.set(me);
    }, function (err) {
      whoIn.placeholder = '';
      whoState.innerHTML = loadError(err);
      $('[data-act="retry"]', whoState).addEventListener('click', prepareTop);
    });
  }
  who.addEventListener('submit', function (e) {
    e.preventDefault();
    let g = picker.get();
    if (!g) {   // typed the full name without tapping a suggestion
      g = (guests || []).filter(function (x) { return x.name === whoIn.value.trim(); })[0] || null;
      if (g) picker.set(g);
    }
    if (!g) { setErr('お名前を候補から選んでください'); whoIn.focus(); return; }
    SV.local.set(ME, g.id);
    whoIn.blur();   // closes the phone keyboard
    location.hash = homeOf(g);
  });

  /* ---------- menu (クイズ案＋ボイメ) ---------- */
  function showMenu(g) {
    const d = g.done || {};
    const voiceAll = (d.intro && d.quizAudio) || d.giga, voiceSome = d.intro || d.quizAudio;
    const badge = function (txt) { return txt ? '<span class="big__done">' + SV.icon.check.replace('<svg', '<svg width="14" height="14"') + txt + '</span>' : ''; };
    const item = function (kind, cls, label, sub, done) {
      return '<a class="big ' + cls + '" href="#g/' + esc(g.id) + '/' + kind + '"><span class="big__txt"><span class="big__title">' + label + '</span>' +
        '<span class="big__sub">' + sub + '</span></span>' + badge(done) + '<span class="big__arrow">' + SV.icon.arrow + '</span></a>';
    };
    menu.innerHTML =
      '<div class="me me--big"><span class="me__label">お名前</span><b class="me__name">' + esc(g.name) + '</b><span>さん</span><a class="me__change" href="#">選び直す</a></div>' +
      '<p class="lead">提出するものを選んでください。</p>' +
      '<div class="menu__btns">' +
        item('quiz', 'big--red', 'クイズ案提出', '2問・選択式（2〜4択）', d.quiz ? '提出済み' : '') +
        item('voice', 'big--gold', 'ボイメ提出', '自己紹介・クイズの音源', voiceAll ? '提出済み' : voiceSome ? '一部提出済み' : '') +
      '</div>' +
      (d.quiz || voiceSome || d.giga ? '<p class="hint menu__hint">提出済みのものも、もう一度送ると最新の内容に差し替わります。</p>' : '');
    menu.hidden = false;
  }

  /* ---------- forms ---------- */
  function doneLinks(g, kind) {
    if (!asksQuiz(g)) return [{ href: '#', label: 'トップに戻る' }];
    const d = g.done || {}, out = [];
    if (kind === 'quiz' && !((d.intro && d.quizAudio) || d.giga)) out.push({ href: '#g/' + g.id + '/voice', label: '続けてボイメを提出する', primary: true });
    if (kind === 'voice' && !d.quiz) out.push({ href: '#g/' + g.id + '/quiz', label: '続けてクイズ案を提出する', primary: true });
    out.push({ href: '#g/' + g.id, label: '提出メニューに戻る' });
    return out;
  }
  function build(kind, g) {
    const f = flows[kind] = { gid: g.id, finished: false, api: null };
    const opts = {
      guest: g,
      guests: function () { return guests || []; },
      doneLinks: function (k) { return doneLinks(g, k); },
      onSubmitted: function (sent, k, slots) {
        g.done = g.done || {};
        if (k === 'quiz') g.done.quiz = true;
        else Object.keys(slots).forEach(function (s) { if (slots[s]) g.done[s] = true; });
        f.finished = true;
      },
    };
    f.api = kind === 'quiz' ? SV.QuizFlow(boxes.quiz, opts) : SV.VoiceFlow(boxes.voice, opts);
  }
  function drop(kind) {
    const f = flows[kind];
    if (f && f.api && f.api.destroy) f.api.destroy();
    boxes[kind].innerHTML = '';
    delete flows[kind];
  }
  function showForm(kind, g) {
    if (flows[kind] && flows[kind].gid !== g.id) drop(kind);   // another name was chosen meanwhile
    if (!flows[kind]) build(kind, g);
    boxes[kind].hidden = false;
  }

  /* ---------- router ---------- */
  function setBar(href, label, text) {
    back.setAttribute('href', href);
    backLabel.textContent = label;
    title.textContent = text;
    document.title = text + '｜SVARAC（スバラシー）';
  }
  function route() {
    SV.stopAudio();
    const m = location.hash.match(/^#g\/([a-z0-9]+)(?:\/(quiz|voice))?$/);
    const kind = m ? m[2] || '' : '';
    // a finished form starts fresh next time
    Object.keys(flows).forEach(function (k) { if (flows[k].finished && k !== kind) drop(k); });
    window.scrollTo(0, 0);
    if (!m) {   // top (old links like #quiz / #voice land here too)
      formView.hidden = true;
      top.hidden = false;
      document.title = '出演者さま提出ページ｜SVARAC（スバラシー）';
      prepareTop();
      return;
    }
    top.hidden = true;
    formView.hidden = false;
    menu.hidden = true;
    boxes.quiz.hidden = boxes.voice.hidden = true;
    setBar('#', 'トップ', kind === 'quiz' ? 'クイズ案提出' : kind === 'voice' ? 'ボイメ提出' : '提出メニュー');
    if (!guests) {
      state.innerHTML = '<div class="loading"><span class="spin"></span>読み込んでいます…</div>';
      load().then(route, function (err) {
        state.innerHTML = loadError(err);
        $('[data-act="retry"]', state).addEventListener('click', route);
      });
      return;
    }
    state.innerHTML = '';
    const g = byId(m[1]);
    if (!g && !refetched[m[1]]) {   // registered after this page was opened? ask once more before saying no
      refetched[m[1]] = true;
      guests = null; loading = null;
      route();
      return;
    }
    if (!g) {
      state.innerHTML = '<p class="notice notice--err">このお名前では、いま受付していません。もう一度お名前を選んでください。それでも出てこない場合は、お手数ですが運営までご連絡ください。</p>' +
        '<div class="actions"><a class="btn btn--line btn--lg btn--block" href="#">お名前を選ぶ</a></div>';
      return;
    }
    if (!asksQuiz(g) && kind !== 'voice') { location.replace('#g/' + g.id + '/voice'); return; }
    if (!kind) { showMenu(g); return; }
    if (asksQuiz(g)) setBar('#g/' + g.id, '戻る', title.textContent);
    showForm(kind, g);
  }

  window.addEventListener('hashchange', route);
  route();
  window.SV_OK = true;
})();
