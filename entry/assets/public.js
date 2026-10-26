/* SVARAC 出演者提出ページ — public page: top → クイズ案 / ボイメ. */
(function () {
  'use strict';
  const SV = window.SV, $ = SV.$, $$ = SV.$$;
  const top = $('#v-top'), formView = $('#v-form'), title = $('#form-title'), state = $('#form-state');
  const boxes = { quiz: $('#form-quiz'), voice: $('#form-voice') };
  const titles = { quiz: 'クイズ案提出', voice: 'ボイメ提出' };
  const flows = {};
  let guests = null, loading = null;

  $$('.big__arrow').forEach(function (el) { el.innerHTML = SV.icon.arrow; });
  $('.bar__icon').outerHTML = SV.icon.back;

  if (!SV.ready) {
    $$('.big').forEach(function (b) { b.setAttribute('aria-disabled', 'true'); b.removeAttribute('href'); });
    $('#top-note').textContent = '受付の準備中です。運営からのご案内をお待ちください。';
    return;
  }

  function load() {
    if (guests) return Promise.resolve(guests);
    if (!loading) {
      loading = SV.api('list').then(function (res) { guests = res.guests; return guests; })
        .catch(function (err) { loading = null; throw err; });
    }
    return loading;
  }
  load().catch(function () { /* shown when a form is opened */ });

  function build(kind) {
    const opts = {
      guests: function () { return guests || []; },
      onSubmitted: function (g, k, slots) {
        const me = (guests || []).filter(function (x) { return x.id === g.id; })[0];
        if (!me) return;
        if (k === 'quiz') me.done.quiz = true;
        else Object.keys(slots).forEach(function (s) { if (slots[s]) me.done[s] = true; });
        flows[k].finished = true;
      },
    };
    flows[kind] = { finished: false };
    if (kind === 'quiz') SV.QuizFlow(boxes.quiz, opts);
    else SV.VoiceFlow(boxes.voice, opts);
  }

  function route() {
    SV.stopAudio();
    const kind = location.hash === '#quiz' ? 'quiz' : location.hash === '#voice' ? 'voice' : '';
    // a finished form starts fresh next time
    Object.keys(flows).forEach(function (k) { if (flows[k].finished && k !== kind) { delete flows[k]; boxes[k].innerHTML = ''; } });
    if (!kind) {
      formView.hidden = true;
      top.hidden = false;
      document.title = '出演者さま提出ページ｜SVARAC（スバラシー）';
      window.scrollTo(0, 0);
      return;
    }
    top.hidden = true;
    formView.hidden = false;
    title.textContent = titles[kind];
    document.title = titles[kind] + '｜SVARAC（スバラシー）';
    boxes.quiz.hidden = boxes.voice.hidden = true;
    window.scrollTo(0, 0);
    if (guests) { show(kind); return; }
    state.innerHTML = '<div class="loading"><span class="spin"></span>読み込んでいます…</div>';
    load().then(function () { show(kind); }, function (err) {
      state.innerHTML = '<p class="notice notice--err">' + SV.esc(err.message) + '</p><div class="actions"><button type="button" class="btn btn--line btn--lg btn--block" id="retry">もう一度読み込む</button></div>';
      $('#retry').addEventListener('click', route);
    });
  }

  function show(kind) {
    state.innerHTML = '';
    if (!flows[kind]) build(kind);
    boxes[kind].hidden = false;
  }

  window.addEventListener('hashchange', route);
  route();
})();
