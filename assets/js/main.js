/* SVARAC（スバラシー） — renders the page from data.json and runs the logo animations.
   An episode is "next" until its end time; after that it moves to the archive by itself. */
(function () {
  'use strict';
  const TZ = 'Asia/Tokyo';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- dates (always shown in Japan time)
  function parts(ms) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value; return o;
  }
  const md = (ms) => { const p = parts(ms); return `${p.month}.${p.day}`; };
  const ymd = (ms) => { const p = parts(ms); return `${p.year}.${p.month}.${p.day}`; };
  const dow = (ms) => new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, weekday: 'short' }).format(new Date(ms));
  const hm = (ms) => { const p = parts(ms); return `${p.hour}:${p.minute}`; };
  const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // ---------- demo content (open the page with ?demo to see every section filled)
  function demo() {
    const now = Date.now();
    const at21 = (days) => { const p = parts(now + days * 864e5); return `${p.year}-${p.month}-${p.day}T21:00:00+09:00`; };
    const sx = 'https://x.com/', ss = 'https://www.spooncast.net/';
    return {
      links: { x: sx, spoon: ss }, hashtag: 'スバラシー', defaultDurationMinutes: 90,
      episodes: [
        { no: 1, start: at21(-62), guests: [{ name: 'ゲストA' }, { name: 'ゲストB' }, { name: 'ゲストC' }, { name: 'ゲストD' }], preview: '（見本）記念すべき第1回。ゲスト4人を迎えて、大型企画をお届けしました。' },
        { no: 2, start: at21(-31), guests: [{ name: 'ゲストE' }, { name: 'ゲストF' }, { name: 'ゲストG' }, { name: 'ゲストH' }, { name: 'ゲストI' }], quizGuests: Array.from({ length: 12 }, (_, i) => `出題者${i + 1}`), preview: '（見本）トーク企画とクイズの二本立て。予想外の結末に、スタジオ（音声）は大混乱。' },
        { no: 3, start: at21(3), guests: [{ name: 'ゲストJ', x: sx, spoon: ss }, { name: 'ゲストK', x: sx, spoon: ss }, { name: 'ゲストL', x: sx }, { name: 'ゲストM', spoon: ss }], quizGuests: Array.from({ length: 40 }, (_, i) => `クイズゲスト${i + 1}`), preview: '（予告文の見本）今回はチーム対抗の大型企画。負けたチームには、ちょっとだけ毒のある罰ゲームが待っています。お楽しみに。' }
      ],
      staff: [
        { name: 'MC名', role: 'MC', x: sx, spoon: ss }, { name: 'アシスタント名', role: 'アシスタント', x: sx, spoon: ss },
        { name: 'アシスタント名', role: 'アシスタント', x: sx }, { name: 'スタッフ名', role: '企画・構成', x: sx, spoon: ss },
        { name: 'スタッフ名', role: 'デザイン', x: sx }, { name: 'スタッフ名', role: '映像', spoon: ss }
      ]
    };
  }

  // ---------- data
  let DATA = null, STATE = '';
  function normalise(d) {
    const dur = (d.defaultDurationMinutes || 90) * 60e3;
    const eps = (d.episodes || []).filter((e) => e && e.start && !isNaN(Date.parse(e.start))).map((e) => {
      const s = Date.parse(e.start), en = e.end && !isNaN(Date.parse(e.end)) ? Date.parse(e.end) : s + dur;
      const preview = String(e.preview || '');
      const n = [...preview.replace(/\n/g, '')].length;
      if (n > 100) console.warn(`第${e.no}回の予告文が100字を超えています（${n}字）`);
      return { ...e, s, en, preview, guests: e.guests || [], quizGuests: (e.quizGuests || []).map((q) => (typeof q === 'string' ? q : q && q.name)).filter(Boolean) };
    });
    return { ...d, eps, staff: d.staff || [], links: d.links || {} };
  }
  function split(now) {
    const next = DATA.eps.filter((e) => e.en > now).sort((a, b) => a.s - b.s)[0] || null;
    const past = DATA.eps.filter((e) => e.en <= now).sort((a, b) => b.s - a.s);
    return { next, past, onair: !!(next && next.s <= now) };
  }

  // ---------- Japanese line breaks: keep each phrase on one line (つかの間 is never split into つか / の間)
  const SEG = window.Intl && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
  const clen = (t) => [...t].length;
  function phrases(text) {
    const out = []; let glue = false;
    for (const { segment: s } of SEG.segment(text)) {
      const prev = out.length ? out[out.length - 1] : null;
      const attach = prev !== null && !/^\s+$/.test(prev) && !/^\s+$/.test(s) && (glue
        || /^[、。，．・！？!?」』）)］】〉》…,.:;]/.test(s)                                               // punctuation, closing brackets
        || (/^[ぁ-ゟ]+$/.test(s) && s !== 'お' && s !== 'ご' && !/[、。！？!?]$/.test(prev) && clen(prev) < 10) // particles, okurigana
        || (/[゠-ヿ]$/.test(prev) && /^[゠-ヿ]/.test(s))                                     // katakana split apart
        || (/[0-9０-９]$/.test(prev) && /^[一-鿿]/.test(s))                                           // 4人
        || (/[一-鿿々]$/.test(prev) && /^[一-鿿々]/.test(s) && clen(prev + s) <= 6));          // short kanji compounds
      if (attach) out[out.length - 1] += s; else out.push(s);
      glue = /[「『（(［【〈《]$/.test(s) || s === 'お' || s === 'ご';                                           // lean on the next word
    }
    return out;
  }
  const prose = (text) => String(text).split('\n').map((line) => (SEG && line
    ? phrases(line).map((w) => (/^\s+$/.test(w) ? ' ' : `<span class="nw">${esc(w)}</span>`)).join('')
    : esc(line))).join('<br>');

  // ---------- pieces
  const linkBtns = (o) => {
    const cls = 'btn btn--sm btn--line', a = [];
    if (o.x) a.push(`<a class="${cls}" href="${esc(o.x)}" target="_blank" rel="noopener" aria-label="${esc(o.name || '')}のX（新しいタブで開く）">X</a>`);
    if (o.spoon) a.push(`<a class="${cls}" href="${esc(o.spoon)}" target="_blank" rel="noopener" aria-label="${esc(o.name || '')}のSpoon（新しいタブで開く）">Spoon</a>`);
    return a.length ? `<span class="links">${a.join('')}</span>` : '';
  };
  const SITE = 'https://svarac.github.io/';
  const calTitle = (e) => e.calendarTitle || DATA.calendarTitle || 'SVARAC（スバラシー）';
  const calDetails = (e) => [e.preview, e.guests.length ? `ゲスト：${e.guests.map((g) => g.name).join('、')}` : e.guestNote ? `ゲスト：${e.guestNote}` : '', 'Spoonで配信', SITE].filter(Boolean).join('\n');
  // a short fingerprint so a changed episode never comes back from an old cache
  const tag = (o) => { let h = 0; for (const c of JSON.stringify(o)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
  function calendarLinks(e) {
    const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calTitle(e))}&dates=${utcStamp(e.s)}/${utcStamp(e.en)}&details=${encodeURIComponent(calDetails(e))}`;
    // iPhone Safari only offers "add to calendar" for a real .ics file on the server; tools/build_ics.py writes one per episode
    const ics = `cal/svarac-${e.no}.ics?v=${tag([calTitle(e), calDetails(e), e.s, e.en])}`;
    return { google, ics };
  }

  const listenUrl = (e) => (e && e.spoon) || DATA.links.spoon || '';

  // ---------- sections
  function renderTop(st) {
    const when = st.next ? `<b class="gold">${md(st.next.s)}</b>（${dow(st.next.s)}）${hm(st.next.s)}〜` : '';
    $('hero-next').innerHTML = st.onair ? 'いま配信中' : st.next ? `次回 ${when}` : '次回の配信は準備中';
    $('menu-next').innerHTML = st.onair ? 'いま配信中' : st.next ? `次回の配信 ${when.replace(' class="gold"', '')}` : '次回の配信は準備中です';
  }
  function renderNext(st) {
    const box = $('next-body'), e = st.next;
    if (!e) {
      box.innerHTML = `<div class="soon"><p class="soon__mark"><span class="gold">COMING</span> <span class="gold">SOON</span></p><p>日程が決まったら、ここでお知らせします。</p></div>`;
      return;
    }
    const cal = calendarLinks(e), listen = listenUrl(e);
    const left = `<div>
        ${e.no ? `<p class="next__no">第${esc(e.no)}回</p>` : ''}
        <p class="next__date"><span class="sr">${ymd(e.s)}</span><span class="next__md gold" aria-hidden="true">${md(e.s)}</span><span class="next__dow">（${dow(e.s)}）</span></p>
        <p class="next__time">${hm(e.s)}〜</p>
        ${st.onair ? `<p class="onair"><i aria-hidden="true"></i>いま配信中</p>`
          : `<div class="count"><p class="count__lead">配信開始まで</p><div class="count__row" role="timer" aria-label="配信開始までの残り時間">
              <span class="count__unit"><b class="gold" id="cd-d">0</b><span>日</span></span>
              <span class="count__unit"><b class="gold" id="cd-h">00</b><span>時間</span></span>
              <span class="count__unit"><b class="gold" id="cd-m">00</b><span>分</span></span>
              <span class="count__unit"><b class="gold" id="cd-s">00</b><span>秒</span></span></div></div>`}
      </div>`;
    // before the guests are announced, guestNote (e.g. 後日発表) stands in for the list
    const face = (g) => `<span class="guest__photo" aria-hidden="true">${g.photo ? `<img src="${esc(g.photo)}" alt="" loading="lazy">` : `<span class="gold">${esc([...String(g.name || '？')][0])}</span>`}</span>`;
    const guests = e.guests.length ? `<p class="next__label">ゲスト</p><ul class="guests">${e.guests.map((g) => `<li class="guest"><span class="guest__who">${face(g)}<span class="guest__name">${esc(g.name)}</span></span>${linkBtns(g)}</li>`).join('')}</ul>`
      : e.guestNote ? `<p class="next__label">ゲスト</p><p class="guests__note">${esc(e.guestNote)}</p>` : '';
    const quiz = e.quizGuests.length ? `<div class="quiz"><p class="next__label">クイズゲスト<span class="quiz__count">${e.quizGuests.length}名</span></p><ul class="quiz__list">${e.quizGuests.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
    const btns = st.onair
      ? (listen ? `<div class="btns"><a class="btn btn--lg btn--red" href="${esc(listen)}" target="_blank" rel="noopener">Spoonで聴く</a></div>` : '')
      : `<div class="btns"><a class="btn btn--lg btn--red" href="${cal.google}" target="_blank" rel="noopener">Googleカレンダーに追加</a>
          <a class="btn btn--lg btn--line" href="${cal.ics}">iPhoneなどのカレンダーに追加</a></div>`;
    box.innerHTML = left + `<div>${guests}${quiz}${e.preview ? `<p class="next__preview">${prose(e.preview)}</p>` : ''}${btns}</div>`;
    tick();
  }
  // the arrow buttons only appear when there are more people than fit in the row
  function syncStaffTools() {
    const vp = $('staff-viewport');
    $('staff').classList.toggle('is-scrollable', vp.scrollWidth > vp.clientWidth + 2);
    $('staff').classList.toggle('at-end', vp.scrollLeft + vp.clientWidth >= vp.scrollWidth - 4);
  }
  window.addEventListener('resize', () => requestAnimationFrame(syncStaffTools));
  $('staff-viewport').addEventListener('scroll', () => requestAnimationFrame(syncStaffTools), { passive: true });
  // "Maya（まい）": the reading in brackets is set smaller so the name stays on one line
  const personName = (n) => { const m = String(n || '').match(/^(.+?)\s*([（(][^（()）]+[）)])$/); return m ? `${esc(m[1])}<small class="member__kana">${esc(m[2])}</small>` : esc(n); };
  function renderStaff() {
    $('staff').hidden = DATA.staff.length === 0;
    requestAnimationFrame(syncStaffTools);
    $('staff-list').innerHTML = DATA.staff.map((m) => `<li class="member">
        <div class="member__photo">${m.photo ? `<img src="${esc(m.photo)}" alt="" loading="lazy">` : `<span class="gold" aria-hidden="true">${esc([...String(m.name || '？')][0])}</span>`}</div>
        <h3 class="member__name">${personName(m.name)}</h3>
        <p class="member__role">${esc(m.role || '')}</p>
        ${linkBtns(m)}
      </li>`).join('');
  }
  function renderArchive(st) {
    $('archive').hidden = st.past.length === 0;
    $('archive-list').innerHTML = st.past.map((e) => `<li class="ep">
        <div class="ep__head"><p class="ep__no gold">#${pad(e.no || '')}</p><p class="ep__date">${ymd(e.s)}<small>（${dow(e.s)}）</small></p></div>
        ${e.guests.length ? `<p class="ep__guests">ゲスト：${e.guests.map((g, i, a) => `<span class="nw">${esc(g.name)}${i < a.length - 1 ? '、' : ''}</span>`).join('')}</p>` : ''}
        ${e.quizGuests.length ? `<p class="ep__quiz">クイズゲスト：${e.quizGuests.map((n, i, a) => `<span class="nw">${esc(n)}${i < a.length - 1 ? '、' : ''}</span>`).join('')}</p>` : ''}
        ${e.preview ? `<p class="ep__preview">${prose(e.preview)}</p>` : ''}
      </li>`).join('');
  }
  function renderStatic() {
    const tag = (DATA.hashtag || 'スバラシー').replace(/^#/, '');
    $('share-btn').href = `https://x.com/intent/post?text=${encodeURIComponent('#' + tag + ' ')}`;
    const l = DATA.links;
    $('foot-links').innerHTML = [l.x ? `<a class="btn btn--sm btn--line" href="${esc(l.x)}" target="_blank" rel="noopener">X</a>` : '',
      l.spoon ? `<a class="btn btn--sm btn--line" href="${esc(l.spoon)}" target="_blank" rel="noopener">Spoon</a>` : ''].join('');
    $('menu-links').innerHTML = $('foot-links').innerHTML;
    $('year').textContent = parts(Date.now()).year;
  }
  function syncMenu() { document.querySelectorAll('.menu__list li[data-for]').forEach((li) => { li.hidden = $(li.dataset.for).hidden; }); }
  function render(force) {
    const st = split(Date.now());
    const key = `${st.next ? st.next.s : '-'}|${st.onair}|${st.past.length}`;
    if (!force && key === STATE) return false;
    STATE = key;
    renderTop(st); renderNext(st); renderArchive(st); syncMenu();
    return true;
  }
  function tick() {
    const st = split(Date.now());
    if (!st.next || st.onair) return;
    let r = Math.max(0, Math.floor((st.next.s - Date.now()) / 1000));
    const d = Math.floor(r / 86400); r -= d * 86400; const h = Math.floor(r / 3600); r -= h * 3600; const m = Math.floor(r / 60), s = r - m * 60;
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };
    set('cd-d', d); set('cd-h', pad(h)); set('cd-m', pad(m)); set('cd-s', pad(s));
  }

  // =====================================================================
  // motion: letters slam in, the title folds into the menu button,
  // section rules draw, the emblem fills with gold as you read.
  // =====================================================================
  const root = document.documentElement;
  // where the browser can tie animations to the scroll position itself (scroll-driven animations),
  // the title card's flight runs there, off the script's frame budget. Elsewhere script drives it.
  const SDA = !REDUCE && !/[?&]nosda\b/.test(location.search) && !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'));
  if (SDA) root.classList.add('sda');
  let L = null, ticking = false;
  const last = {};
  const put = (key, el, fn, v) => { if (last[key] !== v) { last[key] = v; fn(el, v); } };

  function measure() {
    const hero = document.querySelector('.hero'), logo = $('hero-logo'), stage = logo.parentElement, mb = $('menu-btn'), img = mb.querySelector('img');
    // layout boxes (offset*) ignore transforms, so this works mid-flight too
    const tw = img.offsetWidth * 1.08, th = tw * 507 / 1309;
    const tLeft = mb.offsetLeft + mb.clientLeft + img.offsetLeft, tMid = mb.offsetTop + mb.clientTop + img.offsetTop + img.offsetHeight / 2;
    L = { heroTop: hero.offsetTop, heroRun: Math.max(1, hero.offsetHeight - stage.offsetHeight),
      dx: tLeft - logo.offsetLeft, dy: tMid - th * 0.4 - logo.offsetTop, ds: tw / logo.offsetWidth,
      docH: root.scrollHeight, tlStart: 0, tlLen: 1 };
    const tl = $('archive');
    if (!tl.hidden) { const b = tl.getBoundingClientRect(); L.tlStart = b.top + window.scrollY - window.innerHeight * 0.7; L.tlLen = b.height * 0.8; }
    root.style.setProperty('--run', L.heroRun + 'px');
    logo.style.setProperty('--lg-dx', L.dx + 'px'); logo.style.setProperty('--lg-dy', L.dy + 'px'); logo.style.setProperty('--lg-ds', L.ds);
    for (const k in last) delete last[k];
  }
  function update() {
    ticking = false;
    if (!L) return;
    const y = window.scrollY, vh = window.innerHeight;
    const p = clamp((y - L.heroTop) / L.heroRun);
    const mo = clamp((p - 0.84) / 0.12);
    // only flips when a threshold is crossed: the sheen rests while the title moves, the corner buttons become reachable
    put('moving', root, (el, v) => el.classList.toggle('is-moving', v), p > 0.002);
    put('docked', root, (el, v) => el.classList.toggle('is-docked', v), mo > 0.01);
    if (!SDA) {
      const e = easeInOut(clamp(p / 0.92));
      const logo = $('hero-logo');
      put('lg', logo, (el, v) => { el.style.transform = v; }, `translate3d(${(e * L.dx).toFixed(1)}px,${(e * L.dy).toFixed(1)}px,0) scale(${(1 + (L.ds - 1) * e).toFixed(4)})`);
      put('lgo', logo, (el, v) => { el.style.opacity = v; }, (1 - mo).toFixed(3));
      put('lead', logo.parentElement, (el, v) => el.style.setProperty('--lead-o', v), (1 - clamp(p / 0.3)).toFixed(3));
      put('mbo', $('menu-btn'), (el, v) => el.style.setProperty('--mb-o', v), mo.toFixed(3));
    }
    // the emblem fills with gold
    const g = clamp((y - L.heroRun) / Math.max(1, L.docH - vh - L.heroRun));
    put('pg', $('progress-fill'), (el, v) => { el.style.transform = `scaleY(${v})`; }, g.toFixed(3));
    // the archive timeline draws itself
    put('tl', $('timeline-bar'), (el, v) => { el.style.transform = `scaleY(${v})`; }, clamp((y - L.tlStart) / Math.max(1, L.tlLen)).toFixed(3));
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  let relayoutQueued = false;
  function relayout() {
    if (REDUCE || relayoutQueued) return;
    relayoutQueued = true;
    requestAnimationFrame(() => { relayoutQueued = false; measure(); update(); });
  }

  // reveal: section rules draw, the finale logo assembles again
  function reveals() {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add(en.target.classList.contains('logo') ? 'is-on' : 'is-in'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px -18% 0px' });
    document.querySelectorAll('.sec, #finale-logo').forEach((el) => io.observe(el));
  }

  // staff arrows
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('.sec__tools .btn--icon'); if (!b) return;
    const vp = $('staff-viewport'); vp.scrollBy({ left: Number(b.dataset.dir) * vp.clientWidth * 0.8, behavior: REDUCE ? 'auto' : 'smooth' });
  });

  // menu
  const menu = $('menu'), mbtn = $('menu-btn');
  function openMenu() {
    menu.hidden = false; document.body.classList.add('menu-open'); mbtn.setAttribute('aria-expanded', 'true');
    const r = Math.hypot(window.innerWidth, window.innerHeight) + 40;
    requestAnimationFrame(() => menu.style.setProperty('--menu-r', r + 'px'));
    const first = menu.querySelector('a'); if (first) setTimeout(() => first.focus(), REDUCE ? 0 : 200);
  }
  function closeMenu(returnFocus) {
    document.body.classList.remove('menu-open'); mbtn.setAttribute('aria-expanded', 'false');
    menu.style.setProperty('--menu-r', '0px');
    setTimeout(() => { if (mbtn.getAttribute('aria-expanded') === 'false') menu.hidden = true; }, REDUCE ? 0 : 460);
    if (returnFocus) mbtn.focus();
  }
  mbtn.addEventListener('click', () => (mbtn.getAttribute('aria-expanded') === 'true' ? closeMenu(true) : openMenu()));
  document.addEventListener('keydown', (ev) => {
    if (mbtn.getAttribute('aria-expanded') !== 'true') return;
    if (ev.key === 'Escape') { closeMenu(true); return; }
    if (ev.key === 'Tab') {
      const f = [mbtn, ...menu.querySelectorAll('a')].filter((el) => el.offsetParent !== null);
      const i = f.indexOf(document.activeElement);
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
    }
  });
  // in-page links
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href').slice(1), el = id ? $(id) : null; if (!el) return;
    ev.preventDefault();
    if (mbtn.getAttribute('aria-expanded') === 'true') closeMenu(false);
    const top = id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({ top, behavior: REDUCE ? 'auto' : 'smooth' });
    if (id !== 'top') { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
  });

  async function boot() {
    let raw;
    if (/[?&]demo\b/.test(location.search)) raw = demo();
    else {
      try { raw = await (await fetch('data.json', { cache: 'no-store' })).json(); }
      catch (err) { console.error('data.json を読み込めませんでした', err); raw = {}; }
    }
    DATA = normalise(raw);
    renderStatic(); renderStaff(); render(true);
    $('hero-logo').classList.add('is-on');
    if (!REDUCE) {
      reveals(); relayout();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', relayout);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
      window.addEventListener('load', relayout);
    } else {
      document.querySelectorAll('.sec').forEach((s) => s.classList.add('is-in'));
    }
    setInterval(() => { if (render(false) && !REDUCE) relayout(); tick(); }, 1000);
  }
  boot();
})();
