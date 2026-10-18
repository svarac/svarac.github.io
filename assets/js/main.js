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
        { no: 2, start: at21(-31), guests: [{ name: 'ゲストE' }, { name: 'ゲストF' }, { name: 'ゲストG' }, { name: 'ゲストH' }, { name: 'ゲストI' }], preview: '（見本）トーク企画とクイズの二本立て。予想外の結末に、スタジオ（音声）は大混乱。' },
        { no: 3, start: at21(3), guests: [{ name: 'ゲストJ', x: sx, spoon: ss }, { name: 'ゲストK', x: sx, spoon: ss }, { name: 'ゲストL', x: sx }, { name: 'ゲストM', spoon: ss }], preview: '（予告文の見本）今回はチーム対抗の大型企画。負けたチームには、ちょっとだけ毒のある罰ゲームが待っています。お楽しみに。' }
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
      if ([...preview].length > 100) console.warn(`第${e.no}回の予告文が100字を超えています（${[...preview].length}字）`);
      return { ...e, s, en, preview, guests: e.guests || [] };
    });
    return { ...d, eps, staff: d.staff || [], links: d.links || {} };
  }
  function split(now) {
    const next = DATA.eps.filter((e) => e.en > now).sort((a, b) => a.s - b.s)[0] || null;
    const past = DATA.eps.filter((e) => e.en <= now).sort((a, b) => b.s - a.s);
    return { next, past, onair: !!(next && next.s <= now) };
  }

  // ---------- pieces
  const linkBtns = (o) => {
    const cls = 'btn btn--sm btn--line', a = [];
    if (o.x) a.push(`<a class="${cls}" href="${esc(o.x)}" target="_blank" rel="noopener" aria-label="${esc(o.name || '')}のX（新しいタブで開く）">X</a>`);
    if (o.spoon) a.push(`<a class="${cls}" href="${esc(o.spoon)}" target="_blank" rel="noopener" aria-label="${esc(o.name || '')}のSpoon（新しいタブで開く）">Spoon</a>`);
    return a.length ? `<span class="links">${a.join('')}</span>` : '';
  };
  function calendarLinks(e) {
    const title = `SVARAC（スバラシー）${e.no ? `第${e.no}回` : ''}`;
    const details = [e.preview, e.guests.length ? `ゲスト：${e.guests.map((g) => g.name).join('、')}` : '', 'Spoonで配信', location.href.split(/[?#]/)[0]].filter(Boolean).join('\n');
    const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${utcStamp(e.s)}/${utcStamp(e.en)}&details=${encodeURIComponent(details)}`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SVARAC//LP//JA', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:svarac-${e.no || e.s}@svarac`, `DTSTAMP:${utcStamp(Date.now())}`, `DTSTART:${utcStamp(e.s)}`, `DTEND:${utcStamp(e.en)}`,
      `SUMMARY:${title}`, `DESCRIPTION:${details.replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')}`,
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return { google: g, ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics), file: `svarac-${e.no || 'next'}.ics` };
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
    const guests = e.guests.length ? `<p class="next__label">ゲスト</p><ul class="guests">${e.guests.map((g) => `<li class="guest"><span class="guest__name">${esc(g.name)}</span>${linkBtns(g)}</li>`).join('')}</ul>` : '';
    const btns = st.onair
      ? (listen ? `<div class="btns"><a class="btn btn--lg btn--red" href="${esc(listen)}" target="_blank" rel="noopener">Spoonで聴く</a></div>` : '')
      : `<div class="btns"><a class="btn btn--lg btn--red" href="${cal.google}" target="_blank" rel="noopener">Googleカレンダーに追加</a>
          <a class="btn btn--lg btn--line" href="${cal.ics}" download="${cal.file}">iPhoneなどのカレンダーに追加</a></div>`;
    box.innerHTML = left + `<div>${guests}${e.preview ? `<p class="next__preview">${esc(e.preview)}</p>` : ''}${btns}</div>`;
    tick();
  }
  // the arrow buttons only appear when there are more people than fit in the row
  function syncStaffTools() {
    const vp = $('staff-viewport');
    $('staff').classList.toggle('is-scrollable', vp.scrollWidth > vp.clientWidth + 2);
  }
  window.addEventListener('resize', () => requestAnimationFrame(syncStaffTools));
  function renderStaff() {
    $('staff').hidden = DATA.staff.length === 0;
    requestAnimationFrame(syncStaffTools);
    $('staff-list').innerHTML = DATA.staff.map((m) => `<li class="member">
        <div class="member__photo">${m.photo ? `<img src="${esc(m.photo)}" alt="" loading="lazy">` : `<span class="gold" aria-hidden="true">${esc([...String(m.name || '？')][0])}</span>`}</div>
        <h3 class="member__name">${esc(m.name)}</h3>
        <p class="member__role">${esc(m.role || '')}</p>
        ${linkBtns(m)}
      </li>`).join('');
  }
  function renderArchive(st) {
    $('archive').hidden = st.past.length === 0;
    $('archive-list').innerHTML = st.past.map((e) => `<li class="ep">
        <div class="ep__head"><p class="ep__no gold">#${pad(e.no || '')}</p><p class="ep__date">${ymd(e.s)}<small>（${dow(e.s)}）</small></p></div>
        ${e.guests.length ? `<p class="ep__guests">ゲスト：${e.guests.map((g, i, a) => `<span class="nw">${esc(g.name)}${i < a.length - 1 ? '、' : ''}</span>`).join('')}</p>` : ''}
        ${e.preview ? `<p class="ep__preview">${esc(e.preview)}</p>` : ''}
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
  let L = null, ticking = false;

  function measure() {
    const hero = document.querySelector('.hero'), logo = $('hero-logo'), mb = $('menu-btn');
    logo.style.setProperty('--lg-x', '0px'); logo.style.setProperty('--lg-y', '0px'); logo.style.setProperty('--lg-s', '1');
    const r = logo.getBoundingClientRect(), stage = logo.parentElement.getBoundingClientRect();
    mb.style.setProperty('--mb-o', 1); const tr = mb.querySelector('img').getBoundingClientRect(); mb.style.removeProperty('--mb-o');
    const tw = tr.width * 1.08, th = tw * 507 / 1309;
    L = { vh: window.innerHeight, heroTop: hero.offsetTop, heroRun: hero.offsetHeight - window.innerHeight,
      dx: tr.left - (r.left - stage.left), dy: tr.top + tr.height / 2 - th * 0.4 - (r.top - stage.top), ds: tw / r.width,
      tlStart: 0, tlLen: 1 };
    const tl = $('archive');
    if (!tl.hidden) { const b = tl.getBoundingClientRect(); L.tlStart = b.top + window.scrollY - L.vh * 0.7; L.tlLen = b.height * 0.8; }
  }
  function update() {
    ticking = false;
    if (!L) return;
    const y = window.scrollY;
    // the title card folds into the menu button
    const p = clamp((y - L.heroTop) / Math.max(1, L.heroRun));
    const e = easeInOut(clamp(p / 0.92));
    const logo = $('hero-logo');
    logo.style.setProperty('--lg-x', e * L.dx + 'px');
    logo.style.setProperty('--lg-y', e * L.dy + 'px');
    logo.style.setProperty('--lg-s', 1 + (L.ds - 1) * e);
    const mo = clamp((p - 0.84) / 0.12);
    logo.style.setProperty('--lg-o', 1 - mo);
    const mb = $('menu-btn'); mb.style.setProperty('--mb-o', mo); mb.style.setProperty('--mb-v', mo > 0.01 ? 'visible' : 'hidden');
    root.style.setProperty('--lead-o', 1 - clamp(p / 0.3));
    // the emblem fills with gold
    const max = document.documentElement.scrollHeight - L.vh;
    const g = clamp((y - L.heroRun) / Math.max(1, max - L.heroRun));
    $('progress-fill').style.transform = `scaleY(${g})`;
    root.style.setProperty('--pg-o', mo); root.style.setProperty('--mb-v', mo > 0.01 ? 'visible' : 'hidden');
    // the archive timeline draws itself
    root.style.setProperty('--tl', clamp((y - L.tlStart) / Math.max(1, L.tlLen)));
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  function relayout() { if (REDUCE) return; measure(); update(); }

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
