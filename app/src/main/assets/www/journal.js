// Journal: sub-tabs (résumé, rita, humeur, crises, jours) over a chosen period.
window.RitaJournal = function (R) {
  'use strict';
  const { $, esc, spr, avg, fmt1, fmtDur, fmtHM, span, toMin } = R;
  const Charts = R.Charts;

  const SUBS = [['resume', 'bilan'], ['rita', 'rita'], ['humeur', 'humeur'], ['crises', 'crises'], ['jours', 'jours']];
  const PERIODS = [[7, '7 jours'], [30, '30 jours'], [0, 'tout']];
  const MOOD_BG = ['#fffaf0', '#c8d3f7', '#d6ddea', '#ffe8a8', '#c6ecc0', '#ffc2d4'];
  const PHASE_SPRITES = ['sun', 'pill', 'star', 'leaf', 'moon'];
  const PHASE_SHORT = ['avant', 'montée', 'plateau', 'descente', 'après'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  let sub = 'resume';
  let period = 30;
  let month = null; // 'YYYY-MM' shown in the calendar

  const today = () => R.keyOf(new Date());
  const shortLabel = k => (+k.slice(8)) + '/' + (+k.slice(5, 7));

  function allKeys() {
    const d = R.data;
    const ks = new Set(Object.keys(d.days));
    for (const f of ['moods', 'takes', 'crises']) for (const k in d[f]) if ((d[f][k] || []).length) ks.add(k);
    return [...ks].sort();
  }
  function sinceKey() {
    if (period) return R.shiftKey(today(), -(period - 1));
    return allKeys()[0] || today();
  }
  /** Every calendar day of the period, oldest first (at most one year). */
  function periodDays() {
    const out = [];
    let k = sinceKey();
    const end = today();
    if (R.dateOf(end) - R.dateOf(k) > 365 * 864e5) k = R.shiftKey(end, -364);
    while (k <= end) { out.push(k); k = R.shiftKey(k, 1); }
    return out;
  }
  const inPeriod = k => k >= sinceKey() && k <= today();

  function crisesIn() {
    const out = [];
    for (const k of Object.keys(R.data.crises).sort()) {
      if (!inPeriod(k)) continue;
      for (const c of R.data.crises[k]) out.push({ k, c, phase: R.phaseOf(R.day(k), c.t) });
    }
    return out;
  }

  function moodEntriesIn() {
    const out = [];
    for (const k of Object.keys(R.data.moods).sort()) {
      if (!inPeriod(k)) continue;
      const dt = R.day(k).tags || [];
      for (const x of R.moodsOf(k)) out.push({ k, x, tags: [...new Set([...dt, ...(x.tags || [])])], phase: R.phaseOf(R.day(k), x.t) });
    }
    return out;
  }

  // ---------- small HTML pieces ----------
  function bars(items, color) {
    if (!items.length) return '<div class="empty small">Rien encore.</div>';
    const max = Math.max(...items.map(i => i.v), 1);
    return '<div class="hbars">' + items.map(i => `<div class="hb">
      <span class="hb-l">${i.icon || ''}${esc(i.label)}</span>
      <span class="hb-t"><i style="width:${Math.max(4, i.v / max * 100)}%;background:${i.color || color}"></i></span>
      <span class="hb-v">${esc(i.text != null ? i.text : i.v)}</span></div>`).join('') + '</div>';
  }
  function countBy(list, keyFn) {
    const acc = {};
    for (const it of list) for (const k of keyFn(it) || []) acc[k] = (acc[k] || 0) + 1;
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }
  const tile = (big, small, icon) => `<div class="tile fr f-paper">${icon || ''}<span class="big">${big}</span><span class="small">${small}</span></div>`;
  const panel = (title, body, extra) => `<div class="panel fr f-wood"${extra || ''}><div class="ptitle">${title}</div>${body}</div>`;
  const legend = items => `<div class="legend">${items.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;

  // ---------- render ----------
  function render() {
    $('#jtabs').innerHTML = SUBS.map(([k, l]) => `<button class="chip fr ${k === sub ? 'f-wood on' : 'f-off'}" data-sub="${k}">${l}</button>`).join('');
    $('#jperiod').hidden = sub === 'jours';
    $('#jperiod').innerHTML = PERIODS.map(([p, l]) => `<button class="chip fr ${p === period ? 'f-zero' : 'f-off'}" data-period="${p}">${l}</button>`).join('');
    const body = $('#jbody');
    if (sub === 'resume') renderResume(body);
    else if (sub === 'rita') renderRita(body);
    else if (sub === 'humeur') renderHumeur(body);
    else if (sub === 'crises') renderCrises(body);
    else renderDays(body);
  }

  // ---------- résumé ----------
  function calendarHTML() {
    const t = today();
    if (!month) month = t.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7; // monday first
    const n = new Date(y, m, 0).getDate();
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="cal-d empty"></span>';
    for (let d = 1; d <= n; d++) {
      const k = `${y}-${R.pad(m)}-${R.pad(d)}`;
      const md = R.moodDayAvg(k);
      const bg = md.m != null ? MOOD_BG[Math.round(md.m)] : MOOD_BG[0];
      const cr = (R.data.crises[k] || []).length;
      const dose = !!R.day(k).dose;
      const takes = (R.data.takes[k] || []).length;
      const future = k > t;
      cells += `<button class="cal-d${k === t ? ' today' : ''}${future ? ' future' : ''}" data-day="${k}" style="background:${bg}"${future ? ' disabled' : ''}>
        <span class="n">${d}</span><span class="mk">${dose ? '<i class="mk-dose"></i>' : ''}${takes ? '<i class="mk-take"></i>' : ''}${cr ? '<i class="mk-cr"></i>'.repeat(Math.min(cr, 2)) : ''}</span></button>`;
    }
    const canNext = month < t.slice(0, 7);
    return `<div class="cal-head"><button class="btn small fr f-off" data-month="-1">&lt;</button>
        <span>${MONTHS[m - 1]} <small>${y}</small></span>
        <button class="btn small fr f-off" data-month="1"${canNext ? '' : ' disabled'}>&gt;</button></div>
      <div class="cal">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="cal-w">${d}</span>`).join('')}${cells}</div>
      <div class="legend cal-legend">
        <span class="faces">${[1, 2, 3, 4, 5].map(v => `<i style="background:${MOOD_BG[v]}"></i>`).join('')}humeur</span>
        <span><i class="mk-dose"></i>ritaline</span><span><i class="mk-take"></i>autre</span><span><i class="mk-cr"></i>crise</span>
      </div>`;
  }

  function renderResume(body) {
    const st = R.stats(999, sinceKey());
    const moods = moodEntriesIn().filter(e => e.x.m != null);
    const mAvg = avg(moods.map(e => e.x.m));
    const crises = crisesIn();
    const iAvg = avg(crises.filter(c => c.c.i).map(c => c.c.i));
    const noted = periodDays().filter(k => allKeys().includes(k)).length;
    const tiles = [
      tile(st.total != null ? fmtDur(st.total) : '—', 'effet moyen', spr('pill', 2)),
      tile(mAvg != null ? R.MOOD_WORDS[Math.round(mAvg)] : '—', 'humeur moyenne', spr('mood' + (mAvg != null ? Math.round(mAvg) : 3), 2)),
      tile(String(crises.length), (crises.length > 1 ? 'crises' : 'crise') + (iAvg ? ' · intensité ' + fmt1(iAvg) + '/5' : ''), spr('bolt', 2)),
      tile(String(noted), 'jours notés', spr('sun', 2)),
    ];
    const ins = insights();
    body.innerHTML = panel('mon calendrier', calendarHTML(), ' id="cal-panel"')
      + `<div class="tiles">${tiles.join('')}</div>`
      + panel('ce que je remarque', ins.length
        ? '<ul class="insights">' + ins.map(i => `<li>${spr(i.icon, 2)}<span>${i.text}</span></li>`).join('') + '</ul><p class="fine left">Des pistes à regarder, pas des certitudes.</p>'
        : '<div class="empty">Continue à noter, les constats arrivent après quelques jours &#9829;</div>');
  }

  /** Short sentences about patterns in the period. Each needs enough data to show. */
  function insights() {
    const out = [];
    const st = R.stats(999, sinceKey());
    if (st.totalN >= 3) {
      out.push({ icon: 'pill', text: `La Ritaline te fait effet <b>${fmtDur(st.total)}</b> en moyenne (entre ${fmtDur(st.totalMin)} et ${fmtDur(st.totalMax)}).` });
    }
    const crises = crisesIn();
    const withPhase = crises.filter(c => c.phase != null);
    if (withPhase.length >= 3) {
      const byP = [0, 0, 0, 0, 0];
      withPhase.forEach(c => byP[c.phase]++);
      const p = byP.indexOf(Math.max(...byP));
      if (byP[p] / withPhase.length >= 0.5) out.push({ icon: 'bolt', text: `<b>${byP[p]} crises sur ${withPhase.length}</b> arrivent ${R.PHASE_WORDS[p]} de la Ritaline.` });
    }
    if (crises.length >= 3) {
      const bins = new Array(8).fill(0);
      crises.forEach(c => bins[Math.floor(toMin(c.c.t) / 180)]++);
      const b = bins.indexOf(Math.max(...bins));
      if (bins[b] / crises.length >= 0.5) out.push({ icon: 'bolt', text: `Tes crises arrivent surtout <b>entre ${b * 3}h et ${b * 3 + 3}h</b>.` });
    }
    const why = countBy(crises, c => c.c.why);
    if (why.length && why[0][1] >= 2) out.push({ icon: 'leaf', text: `Raison la plus notée pour les crises : <b>${esc(R.Crises.whyLabel(why[0][0]))}</b> (${why[0][1]} fois).` });
    const help = countBy(crises, c => c.c.help);
    if (help.length && help[0][1] >= 2) out.push({ icon: 'star', text: `Ce qui t'aide le plus souvent : <b>${esc(R.Crises.helpLabel(help[0][0]))}</b> (${help[0][1]} fois).` });

    const moods = moodEntriesIn().filter(e => e.x.m != null);
    if (moods.length >= 6) {
      const all = avg(moods.map(e => e.x.m));
      const deltas = [];
      for (const [t] of countBy(moods, e => e.tags)) {
        const sel = moods.filter(e => e.tags.includes(t));
        if (sel.length >= 3) deltas.push([t, avg(sel.map(e => e.x.m)) - all]);
      }
      deltas.sort((a, b) => a[1] - b[1]);
      const lo = deltas[0], hi = deltas[deltas.length - 1];
      if (lo && lo[1] <= -0.5) out.push({ icon: 'mood2', text: `Humeur plus basse avec «&nbsp;${esc(R.tagLabel(lo[0]))}&nbsp;» (<b>${fmt1(lo[1])}</b> par rapport à d'habitude).` });
      if (hi && hi[1] >= 0.5) out.push({ icon: 'mood4', text: `Humeur plus haute avec «&nbsp;${esc(R.tagLabel(hi[0]))}&nbsp;» (<b>+${fmt1(hi[1])}</b>).` });
      const ph = [0, 1, 2, 3, 4].map(p => moods.filter(e => e.phase === p).map(e => e.x.m)).map(a => a.length >= 3 ? avg(a) : null);
      const valid = ph.map((v, p) => [v, p]).filter(([v]) => v != null).sort((a, b) => b[0] - a[0]);
      if (valid.length >= 2 && valid[0][0] - valid[valid.length - 1][0] >= 0.7) {
        const [bv, bp] = valid[0], [wv, wp] = valid[valid.length - 1];
        out.push({ icon: PHASE_SPRITES[bp], text: `Ton humeur est meilleure ${R.PHASE_WORDS[bp]} (${fmt1(bv)}) que ${R.PHASE_WORDS[wp]} (${fmt1(wv)}).` });
      }
    }
    const days = periodDays().map(k => R.moodDayAvg(k).m).filter(v => v != null);
    if (days.length >= 6) {
      const h = Math.floor(days.length / 2);
      const d = avg(days.slice(h)) - avg(days.slice(0, h));
      if (d >= 0.5) out.push({ icon: 'mood5', text: `Ton humeur remonte sur la fin de la période (<b>+${fmt1(d)}</b>).` });
      else if (d <= -0.5) out.push({ icon: 'mood2', text: `Ton humeur baisse un peu sur la fin de la période (<b>${fmt1(d)}</b>). Prends soin de toi &#9829;` });
    }
    for (const med of R.Meds.list().filter(m => m.mode !== 'prn')) {
      const ks = periodDays();
      const firstTake = Object.keys(R.data.takes).sort().find(k => R.data.takes[k].some(x => x.med === med.id));
      if (!firstTake) continue;
      const span = ks.filter(k => k >= firstTake);
      if (span.length < 3) continue;
      const taken = span.filter(k => (R.data.takes[k] || []).some(x => x.med === med.id)).length;
      out.push({ icon: 'caps' + med.col, text: `${esc(med.name)} : pris <b>${taken} jour${taken > 1 ? 's' : ''} sur ${span.length}</b>.` });
    }
    return out;
  }

  // ---------- rita ----------
  function renderRita(body) {
    const st = R.stats(999, sinceKey());
    const row = (color, k, sub, v, big) =>
      `<div class="avg-row${big ? ' big' : ''}">${color ? `<i style="background:${color}"></i>` : '<span>&#9829;</span>'}<span class="k">${k}${sub ? ` <small>${sub}</small>` : ''}</span><span class="v">${fmtDur(v)}</span></div>`;
    let avgs;
    if (!st.n) avgs = '<div class="empty">Pas encore de prise sur cette période.<br>Note ta première journée &#9829;</div>';
    else {
      avgs = row(null, 'durée totale', '', st.total, true);
      if (st.totalN > 1) avgs += `<div class="avg-row"><span class="k soft">entre ${fmtDur(st.totalMin)} et ${fmtDur(st.totalMax)}</span></div>`;
      avgs += row('#ffb8cb', 'montée', 'prise-pic', st.rise);
      avgs += row('#bfe6a6', 'plateau', 'pic-chute', st.plateau);
      avgs += row('#ffc9a3', 'descente', 'chute-zéro', st.fall);
      avgs += row('#efe3d3', 'attente', 'réveil-prise', st.wait);
      if (st.dose != null) avgs += `<div class="avg-row"><span class="k">prise vers</span><span class="v">${fmtHM(R.addMin('00:00', st.dose))}</span></div>`;
    }
    const dosed = Object.keys(R.data.days).filter(k => R.data.days[k].dose && inPeriod(k)).sort().slice(-60);
    const phaseLegend = legend([['#ffb8cb', 'montée'], ['#bfe6a6', 'plateau'], ['#ffc9a3', 'descente']]);
    body.innerHTML = panel(`moyennes · ${st.n} jour${st.n > 1 ? 's' : ''}`, avgs)
      + (dosed.length ? panel('durée d\'effet par jour', `<div id="chart-dur" class="chart-box"></div>${phaseLegend}`) : '')
      + (st.rise != null && st.plateau != null && st.fall != null ? panel('ta courbe type', '<div id="chart-curve" class="chart-box"></div>') : '')
      + medsPanel();
    if (dosed.length) {
      Charts.durations($('#chart-dur'), dosed.map(k => {
        const d = R.data.days[k];
        return { label: shortLabel(k), long: R.dateLabel(k), rise: span(d.dose, d.peak), plateau: span(d.peak, d.drop), fall: span(d.drop, d.zero), total: span(d.dose, d.zero) };
      }), R.PHASE_COLORS);
    }
    if ($('#chart-curve')) Charts.curve($('#chart-curve'), st, R.PHASE_COLORS);
  }

  function medsPanel() {
    const meds = R.Meds.list();
    if (!meds.length) return panel('autres traitements', '<button class="extra fr f-off" data-manage="1">+ ajouter un traitement</button>');
    const ks = periodDays().slice(-31);
    const rows = meds.map(m => {
      const days = ks.map(k => (R.data.takes[k] || []).filter(x => x.med === m.id).length);
      const n = days.reduce((a, b) => a + b, 0);
      const txt = m.mode === 'prn' ? `${n} prise${n > 1 ? 's' : ''} si besoin` : `pris ${days.filter(Boolean).length} jours sur ${ks.length}`;
      const pal = R.MED_PAL[m.col % R.MED_PAL.length];
      return `<div class="med-stat"><div class="ms-head">${spr('caps' + m.col, 2)}<span>${esc(m.name)}</span><span class="soft">${txt}</span></div>
        <div class="strip" style="grid-template-columns:repeat(${ks.length},minmax(0,22px))">${days.map((c, i) => `<i title="${ks[i]}" style="background:${c ? pal[1] : '#f4ebdd'};box-shadow:inset 0 0 0 1px ${c ? pal[0] : '#e2d3c2'}">${c > 1 ? c : ''}</i>`).join('')}</div></div>`;
    }).join('');
    return panel('autres traitements' + (ks.length < periodDays().length ? ' · 31 derniers jours' : ''), rows + '<button class="plink right" data-manage="1">gérer</button>');
  }

  // ---------- humeur ----------
  function renderHumeur(body) {
    const entries = moodEntriesIn();
    if (!entries.length) {
      body.innerHTML = panel('humeur', '<div class="empty">Pas d\'humeur notée sur cette période.<br>Passe par l\'onglet humeur &#9829;</div>');
      return;
    }
    const days = periodDays();
    const st = R.stats(999, sinceKey());
    body.innerHTML = panel('humeur et énergie jour par jour', `<div id="chart-trend" class="chart-box"></div>${legend([['#e0668c', 'humeur'], ['#d99a1e', 'énergie'], ['#9a84c9', 'crise']])}`
        + (days.length > 10 ? '<p class="fine left">Les points clairs sont les jours, la ligne est la moyenne sur ' + (days.length <= 31 ? '3' : '7') + ' jours.</p>' : ''))
      + panel('selon l\'heure de la journée', `<div id="chart-hours" class="chart-box"></div>${legend([['#e0668c', 'humeur'], ['#d99a1e', 'énergie'], ['#fde3ec', 'ritaline (moyenne)']])}`)
      + panel('selon la phase de la ritaline', phaseBars(entries))
      + panel('selon le contexte', contextBars(entries) + '<button class="plink right" data-tags="1">mes raisons</button>');
    Charts.moodTrend($('#chart-trend'), days.map(k => {
      const md = R.moodDayAvg(k);
      return { label: shortLabel(k), long: R.dateLabel(k), m: md.m, e: md.e, crises: (R.data.crises[k] || []).length };
    }), { m: R.MOOD_WORDS });
    const buckets = [];
    for (let h = 6; h < 24; h += 2) {
      const sel = entries.filter(e => { const m = toMin(e.x.t); return m >= h * 60 && m < (h + 2) * 60; });
      const ms = sel.filter(e => e.x.m != null).map(e => e.x.m), es = sel.filter(e => e.x.e != null).map(e => e.x.e);
      buckets.push({ from: h * 60, to: (h + 2) * 60, m: avg(ms), e: avg(es), n: sel.length });
    }
    Charts.hourProfile($('#chart-hours'), buckets, st.dose != null ? st : null);
  }

  function phaseBars(entries) {
    const rows = [0, 1, 2, 3, 4].map(p => {
      const sel = entries.filter(e => e.phase === p);
      const m = avg(sel.filter(e => e.x.m != null).map(e => e.x.m));
      const e = avg(sel.filter(e => e.x.e != null).map(e => e.x.e));
      return { p, m, e, n: sel.length };
    }).filter(r => r.n);
    if (!rows.length) return '<div class="empty small">Il faut des humeurs notées les jours de ritaline.</div>';
    return '<div class="hbars">' + rows.map(r => `<div class="hb two">
      <span class="hb-l">${spr(PHASE_SPRITES[r.p], 1)}${PHASE_SHORT[r.p]}</span>
      <span class="hb-t"><i style="width:${r.m != null ? r.m / 5 * 100 : 0}%;background:#e0668c"></i><i style="width:${r.e != null ? r.e / 5 * 100 : 0}%;background:#d99a1e"></i></span>
      <span class="hb-v">${r.m != null ? fmt1(r.m) : '—'}<small> ${r.e != null ? fmt1(r.e) : '—'}</small></span></div>`).join('') + '</div>';
  }

  function contextBars(entries) {
    const moods = entries.filter(e => e.x.m != null);
    const all = avg(moods.map(e => e.x.m));
    const allE = avg(entries.filter(e => e.x.e != null).map(e => e.x.e));
    const rows = [];
    for (const [t, n] of countBy(entries, e => e.tags)) {
      const sel = entries.filter(e => e.tags.includes(t));
      const m = avg(sel.filter(e => e.x.m != null).map(e => e.x.m));
      const e = avg(sel.filter(e => e.x.e != null).map(e => e.x.e));
      rows.push({ t, n, dm: m != null && all != null ? m - all : null, de: e != null && allE != null ? e - allE : null });
    }
    if (!rows.length) return '<div class="empty small">Ajoute des raisons à tes humeurs pour voir ce qui pèse.</div>';
    rows.sort((a, b) => (a.dm ?? 0) - (b.dm ?? 0));
    const sign = v => v == null ? '—' : (v > 0 ? '+' : '') + fmt1(v);
    return `<p class="fine left">Humeur par rapport à ta moyenne (${all != null ? fmt1(all) : '—'}). Barre à gauche&nbsp;: plus bas, à droite&nbsp;: plus haut.</p><div class="dvs">`
      + rows.map(r => {
        const w = r.dm == null ? 0 : Math.min(50, Math.abs(r.dm) / 2 * 50);
        return `<div class="dv${r.n < 3 ? ' few' : ''}"><span class="dv-l">${esc(R.tagLabel(r.t))} <small>${r.n}x</small></span>
          <span class="dv-t"><i class="${(r.dm || 0) < 0 ? 'neg' : 'pos'}" style="width:${w}%"></i></span>
          <span class="dv-v">${sign(r.dm)}<small> énergie ${sign(r.de)}</small></span></div>`;
      }).join('') + '</div>' + (rows.some(r => r.n < 3) ? '<p class="fine left">En clair&nbsp;: moins de 3 fois, à prendre avec des pincettes.</p>' : '');
  }

  // ---------- crises ----------
  function renderCrises(body) {
    const crises = crisesIn();
    if (!crises.length) {
      body.innerHTML = panel('crises', '<div class="empty">Aucune crise notée sur cette période &#9829;</div>');
      return;
    }
    const iAvg = avg(crises.filter(c => c.c.i).map(c => c.c.i));
    const durs = crises.map(c => span(c.c.t, c.c.end)).filter(v => v != null && v < 12 * 60);
    const tiles = [
      tile(String(crises.length), crises.length > 1 ? 'crises' : 'crise', spr('bolt', 2)),
      tile(iAvg ? fmt1(iAvg) + '/5' : '—', 'intensité moyenne' + (iAvg ? ' · ' + R.Crises.INTENSITY[Math.round(iAvg)] : ''), spr('anx' + (iAvg ? Math.round(iAvg) : 3), 2)),
      tile(durs.length ? fmtDur(Math.round(avg(durs))) : '—', 'durée moyenne', spr('moon', 2)),
      tile(String(new Set(crises.map(c => c.k)).size), 'jours avec crise', spr('sun', 2)),
    ];
    const byPhase = [0, 0, 0, 0, 0, 0];
    crises.forEach(c => byPhase[c.phase == null ? 5 : c.phase]++);
    const phaseItems = byPhase.map((v, p) => ({ label: p < 5 ? PHASE_SHORT[p] : 'sans ritaline', v, icon: p < 5 ? spr(PHASE_SPRITES[p], 1) : '' })).filter(i => i.v);
    const C = R.Crises;
    const top = (list, lab) => list.slice(0, 8).map(([k, v]) => ({ label: lab(k), v }));
    body.innerHTML = `<div class="tiles">${tiles.join('')}</div>`
      + panel('à quelle heure, à quel point', `<div id="chart-crises" class="chart-box"></div>${legend([['#fde3ec', 'ritaline (moyenne)']])}`)
      + panel('pendant la ritaline', bars(phaseItems, '#d3c4f3'))
      + panel('raisons possibles', bars(top(countBy(crises, c => c.c.why), C.whyLabel), '#d3c4f3'))
      + panel('symptômes', bars(top(countBy(crises, c => c.c.sym), C.symLabel), '#ffb3c1'))
      + panel('ce qui a aidé', bars(top(countBy(crises, c => c.c.help), C.helpLabel), '#bfe6a6'))
      + panel('toutes les crises', '<div class="crisis-list">' + crises.slice().reverse().map(({ k, c }) =>
        `<button class="crisis-item fr f-off" data-crisis="${c.id}">${spr('anx' + (c.i || 3), 2)}<span class="w">${R.dateLabel(k)} · ${fmtHM(c.t)}${c.end ? ' · ' + fmtDur(span(c.t, c.end)) : ''}${
          (c.why || []).length ? ' · ' + esc(c.why.map(C.whyLabel).join(', ')) : ''}</span></button>`).join('') + '</div>');
    const st = R.stats(999, sinceKey());
    Charts.crisisScatter($('#chart-crises'), crises.map(({ k, c }) => ({
      min: toMin(c.t), i: c.i,
      text: `${R.dateLabel(k)} ${fmtHM(c.t)} : ${c.i ? C.INTENSITY[c.i] : 'intensité ?'}${c.end ? ', ' + fmtDur(span(c.t, c.end)) : ''}${(c.why || []).length ? ' · ' + c.why.map(C.whyLabel).join(', ') : ''}`,
    })), st.dose != null ? st : null);
  }

  // ---------- jours ----------
  function dayCard(k, t) {
    const d = R.day(k);
    const sum = [];
    if (d.dose && d.peak) sum.push(`pic +${fmtDur(span(d.dose, d.peak))}`);
    if (d.dose && d.zero) sum.push(`total ${fmtDur(span(d.dose, d.zero))}`);
    const md = R.moodDayAvg(k);
    const moodBit = md.n ? `<span class="day-mood">${md.m != null ? spr('mood' + Math.round(md.m), 1) : ''}${md.e != null ? spr('bat' + Math.round(md.e), 1) : ''}</span>` : '';
    if (!sum.length) sum.push(R.STEPS.filter(s => d[s.key]).map(s => s.label).join(', ') || (md.n ? `${md.n} humeur${md.n > 1 ? 's' : ''}` : ''));
    const tags = [...(d.tags || [])];
    for (const x of R.moodsOf(k)) for (const tg of x.tags || []) if (!tags.includes(tg)) tags.push(tg);
    const takes = R.data.takes[k] || [];
    const crises = R.data.crises[k] || [];
    return `<button class="day fr f-paper" data-day="${k}">
      <div class="day-head"><span>${R.dateLabel(k)}${k === t ? ' &#9829;' : ''}</span><span>${d.mg != null ? esc(d.mg) + ' mg' : ''}</span></div>
      ${d.wake || d.dose || takes.length || crises.length ? R.barHTML(d, false, R.dayMarks(k)) : ''}
      <div class="day-sum">${moodBit}${sum.filter(Boolean).join(' · ')}</div>
      ${takes.length ? `<div class="day-takes">${takes.map(x => { const m = R.Meds.byId(x.med); return m ? `<span>${spr('caps' + m.col, 1)}${esc(m.name)} ${fmtHM(x.t)}</span>` : ''; }).join('')}</div>` : ''}
      ${crises.length ? `<div class="day-takes">${crises.map(c => `<span class="cr">${spr('anx' + (c.i || 3), 1)}crise ${fmtHM(c.t)}${c.end ? ' · ' + fmtDur(span(c.t, c.end)) : ''}</span>`).join('')}</div>` : ''}
      ${tags.length ? `<div class="day-tags">${R.tagWords(tags).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      ${d.note ? `<div class="day-note">${esc(d.note)}</div>` : ''}
      ${R.moodsOf(k).filter(x => x.n).map(x => `<div class="day-note">${fmtHM(x.t)} : ${esc(x.n)}</div>`).join('')}
      ${crises.filter(c => c.n).map(c => `<div class="day-note">crise ${fmtHM(c.t)} : ${esc(c.n)}</div>`).join('')}
    </button>`;
  }

  function renderDays(body) {
    const t = R.activeKey();
    const keys = allKeys().reverse();
    body.innerHTML = `<div class="days">${keys.map(k => dayCard(k, t)).join('') || '<div class="empty">Pas encore de jour noté.</div>'}</div>
      <div class="row">
        <button class="btn fr f-peak" data-add="1">+ un jour</button>
        <button class="btn fr f-off" data-manage="1">mes traitements</button>
        <button class="btn fr f-off" data-tags="1">mes raisons</button>
        <button class="btn fr f-off" data-export="1">exporter</button>
        <button class="btn fr f-off" data-import="1">importer</button>
      </div>
      <p class="fine">Tes données restent sur ton téléphone. Rien n'est envoyé nulle part.</p>`;
  }

  // ---------- wiring ----------
  function onClick(e) {
    const q = s => e.target.closest(s);
    let b;
    if ((b = q('[data-sub]'))) { sub = b.dataset.sub; render(); window.scrollTo(0, 0); return; }
    if ((b = q('[data-period]'))) { period = +b.dataset.period; render(); return; }
    if ((b = q('[data-month]'))) {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(y, m - 1 + +b.dataset.month, 1);
      month = d.getFullYear() + '-' + R.pad(d.getMonth() + 1);
      render();
      return;
    }
    if ((b = q('[data-crisis]'))) { R.Crises.openSheet(null, b.dataset.crisis); return; }
    if ((b = q('[data-day]'))) { R.openDaySheet(b.dataset.day); return; }
    if (q('[data-manage]')) { R.Meds.openManage(); return; }
    if (q('[data-tags]')) { R.openTagsSheet(); return; }
    if (q('[data-add]')) { R.openAddDay(); return; }
    if (q('[data-export]')) { R.exportData(); return; }
    if (q('[data-import]')) R.openImport();
  }
  document.getElementById('view-journal').addEventListener('click', onClick);

  return { render };
};
