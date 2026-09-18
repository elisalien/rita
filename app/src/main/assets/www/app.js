(function () {
  'use strict';

  // In the APK, MainActivity exposes RitaBridge (SharedPreferences, shared with the widgets).
  // In a desktop browser we fall back to localStorage so the UI can be previewed.
  const Native = window.RitaBridge || null;
  const Charts = window.RitaCharts;

  const STEPS = [
    { key: 'wake', label: 'Réveil', noted: 'Réveil noté', sprite: 'sun', hint: 'je me lève', pal: ['#d9a54a', '#ffe08a', '#fff4cf'] },
    { key: 'dose', label: 'Prise', noted: 'Prise notée', sprite: 'pill', hint: 'ritaline avalée', pal: ['#d47c98', '#ffb8cb', '#ffe6ee'] },
    { key: 'peak', label: 'Pic', noted: 'Pic noté', sprite: 'star', hint: 'effet au max', pal: ['#7fb86a', '#bfe6a6', '#ebf8e2'] },
    { key: 'drop', label: 'Chute', noted: 'Chute notée', sprite: 'leaf', hint: 'ça redescend', pal: ['#d98b62', '#ffc9a3', '#ffeede'] },
    { key: 'zero', label: 'Zéro', noted: 'Zéro noté', sprite: 'moon', hint: 'plus aucun effet', pal: ['#9a84c9', '#d3c4f3', '#f1ebff'] },
  ];
  const BY = Object.fromEntries(STEPS.map(s => [s.key, s]));
  const SEGMENTS = [
    ['wake', 'dose', '#efe3d3'],
    ['dose', 'peak', '#ffb8cb'],
    ['peak', 'drop', '#bfe6a6'],
    ['drop', 'zero', '#ffc9a3'],
  ];
  const PHASE_COLORS = [[BY.dose.pal[0], '#ffb8cb'], [BY.peak.pal[0], '#bfe6a6'], [BY.drop.pal[0], '#ffc9a3']];
  const MOOD_WORDS = ['', 'très mal', 'pas top', 'bof', 'bien', 'super'];
  const ENERGY_WORDS = ['', 'à plat', 'faible', 'moyenne', 'bonne', 'à fond'];
  const MOOD_MERGE_MIN = 5; // a mood and an energy tapped within 5 min form one entry

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- storage ----------
  let data = load();
  let view = 'today';

  function load() {
    try {
      const raw = Native ? Native.load() : localStorage.getItem('rita');
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.days) { if (!d.moods) d.moods = {}; return d; }
    } catch (e) { /* fresh start */ }
    return { v: 1, days: {}, moods: {} };
  }

  function save() {
    const raw = JSON.stringify(data);
    if (Native) Native.save(raw);
    else try { localStorage.setItem('rita', raw); } catch (e) { /* preview only */ }
  }

  function day(key, create) {
    if (!data.days[key] && create) data.days[key] = {};
    return data.days[key] || {};
  }

  function prune(key) {
    const d = data.days[key];
    if (d && !STEPS.some(s => d[s.key]) && d.mg == null && !d.note) delete data.days[key];
  }

  // ---------- time ----------
  const pad = n => String(n).padStart(2, '0');
  const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const toMin = hm => { if (!hm) return null; const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const span = (a, b) => (a && b) ? (toMin(b) - toMin(a) + 1440) % 1440 : null;
  const addMin = (hm, d) => { const t = ((toMin(hm) + Math.round(d)) % 1440 + 1440) % 1440; return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
  const fmtHM = hm => hm ? (+hm.slice(0, 2)) + 'h' + hm.slice(3) : '--h--';
  const fmtDur = m => m == null ? '—' : m < 60 ? m + ' min' : Math.floor(m / 60) + 'h' + pad(m % 60);
  const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const dateLabel = k => dateOf(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  // After midnight, taps still belong to yesterday until its "zéro" is logged (until 5h).
  function activeKey() {
    const now = new Date();
    const k = keyOf(now);
    if (now.getHours() < 5 && !data.days[k]) {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const yd = data.days[keyOf(y)];
      if (yd && yd.dose && !yd.zero) return keyOf(y);
    }
    return k;
  }

  // ---------- stats ----------
  function stats(limit) {
    const keys = Object.keys(data.days).sort().reverse();
    const acc = { rise: [], plateau: [], fall: [], total: [], wait: [], toDrop: [] };
    let n = 0;
    for (const k of keys) {
      const d = data.days[k];
      if (!d.dose) continue;
      if (n >= limit) break;
      n++;
      const push = (arr, v) => { if (v != null) arr.push(v); };
      push(acc.rise, span(d.dose, d.peak));
      push(acc.plateau, span(d.peak, d.drop));
      push(acc.fall, span(d.drop, d.zero));
      push(acc.total, span(d.dose, d.zero));
      push(acc.wait, span(d.wake, d.dose));
      push(acc.toDrop, span(d.dose, d.drop));
    }
    const out = { n };
    for (const k in acc) out[k] = acc[k].length ? Math.round(avg(acc[k])) : null;
    out.totalMin = acc.total.length ? Math.min(...acc.total) : null;
    out.totalMax = acc.total.length ? Math.max(...acc.total) : null;
    out.totalN = acc.total.length;
    return out;
  }

  function lastMg(beforeKey) {
    const keys = Object.keys(data.days).sort().reverse();
    for (const k of keys) if (k < beforeKey && data.days[k].mg != null) return data.days[k].mg;
    return null;
  }

  // ---------- moods ----------
  const moodsOf = k => data.moods[k] || [];

  /** The entry still open for completion (tapped less than 5 min ago, one value missing), if any. */
  function openEntry() {
    const arr = moodsOf(keyOf(new Date()));
    const last = arr[arr.length - 1];
    if (!last || span(last.t, nowHM()) > MOOD_MERGE_MIN) return null;
    return (last.m == null || last.e == null) ? last : null;
  }

  /** Same rule as Store.logMood (Java): complete or correct the open entry, else start a new one. */
  function logMood(kind, v) {
    const k = keyOf(new Date());
    const arr = data.moods[k] || (data.moods[k] = []);
    const open = openEntry();
    if (open) open[kind] = v;
    else arr.push({ t: nowHM(), [kind]: v });
    save();
  }

  // Which Rita phase a time falls in: 0 avant, 1 montée, 2 plateau, 3 descente, 4 après.
  function phaseOf(d, t) {
    if (!d.dose) return null;
    const m = toMin(t), rel = x => (toMin(x) - toMin(d.dose) + 1440) % 1440;
    if (m < toMin(d.dose) && (!d.wake || m >= toMin(d.wake) - 60)) return 0;
    const r = rel(t);
    if (r > 20 * 60) return 0;
    if (!d.peak || r < rel(d.peak)) return 1;
    if (!d.drop || r < rel(d.drop)) return 2;
    if (!d.zero || r < rel(d.zero)) return 3;
    return 4;
  }

  function moodDayAvg(k) {
    const arr = moodsOf(k);
    const m = avg(arr.filter(x => x.m != null).map(x => x.m));
    const e = avg(arr.filter(x => x.e != null).map(x => x.e));
    return { m, e, n: arr.length };
  }

  // ---------- pixel art ----------
  const spriteCache = {};
  function spriteURL(name) {
    if (spriteCache[name]) return spriteCache[name];
    const s = window.SPRITES[name];
    const c = document.createElement('canvas');
    c.width = s.rows[0].length; c.height = s.rows.length;
    const g = c.getContext('2d');
    s.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = s.palette[ch];
      g.fillRect(x, y, 1, 1);
    }));
    return (spriteCache[name] = c.toDataURL());
  }
  const spr = (name, scale) => {
    const s = window.SPRITES[name];
    return `<img class="spr" alt="" src="${spriteURL(name)}" width="${s.rows[0].length * scale}" height="${s.rows.length * scale}">`;
  };

  function frameURI(D, W, L, C) {
    const rows = ['..DDDD..', '.DWWWWD.', 'DWLLLLWD', 'DWLCCLWD', 'DWLCCLWD', 'DWLLLLWD', '.DWWWWD.', '..DDDD..'];
    const col = { D, W, L, C };
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges">';
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch !== '.') svg += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col[ch]}"/>`;
    }));
    return `url("data:image/svg+xml,${encodeURIComponent(svg + '</svg>')}")`;
  }

  function installFrames() {
    const css = [
      `.f-wood{--frame:${frameURI('#a8806c', '#f2cda4', '#fde9cc', '#fffaf0')}}`,
      `.f-off{--frame:${frameURI('#cdb9a8', '#efe3d3', '#fffaf0', '#fffaf0')}}`,
      `.f-paper{--frame:${frameURI('#b99c8a', '#f5e3cc', '#fffaf0', '#fffaf0')}}`,
      `.f-mood{--frame:${frameURI('#cc6f8c', '#ffb8cb', '#ffe6ee', '#ffe6ee')}}`,
      `.f-energy{--frame:${frameURI('#c9a24e', '#ffe08a', '#fff4cf', '#fff4cf')}}`,
    ];
    for (const s of STEPS) {
      const [D, W, L] = s.pal;
      css.push(`.f-${s.key}{--frame:${frameURI(D, W, L, L)}}`);
    }
    const st = document.createElement('style');
    st.textContent = css.join('\n');
    document.head.appendChild(st);
  }

  function installClouds() {
    const box = $('.clouds');
    [[6, 3, 70, -8], [58, 3, 95, -40], [26, 4, 120, -75]].forEach(([top, scale, dur, delay]) => {
      const img = document.createElement('img');
      img.src = spriteURL('cloud');
      img.width = 16 * scale; img.height = 8 * scale;
      img.style.cssText = `top:${top}px;left:0;image-rendering:pixelated;animation-duration:${dur}s;animation-delay:${delay}s`;
      box.appendChild(img);
    });
  }

  // ---------- timeline bar ----------
  const T0 = 5 * 60, T1 = 23 * 60;
  function pos(hm, ref) {
    let m = toMin(hm);
    if (ref != null && m < toMin(ref)) m += 1440;       // crossed midnight
    return Math.max(0, Math.min(100, (m - T0) / (T1 - T0) * 100));
  }

  function barHTML(d, live) {
    const ref = d.wake || d.dose;
    let h = `<div class="bar${live ? ' live' : ''}"><div class="track">`;
    for (const [a, b, color] of SEGMENTS) {
      if (!d[a]) continue;
      let end = d[b], cls = 'seg';
      if (!end) {
        const later = STEPS.slice(STEPS.findIndex(s => s.key === b)).some(s => d[s.key]);
        if (later || !live) continue;
        end = nowHM(); cls += ' live';
      }
      const x0 = pos(d[a], ref), x1 = pos(end, ref);
      if (x1 > x0) h += `<div class="${cls}" style="left:${x0}%;width:${x1 - x0}%;background:${color}"></div>`;
    }
    for (const s of STEPS) {
      if (d[s.key]) h += `<div class="tick" style="left:${pos(d[s.key], ref)}%;background:${s.pal[0]}"></div>`;
    }
    if (live) h += `<div class="nowmark" style="left:${pos(nowHM(), ref)}%">&#9829;</div>`;
    h += '</div><div class="hours">';
    for (let t = 6; t <= 22; t += 4) h += `<span style="left:${(t * 60 - T0) / (T1 - T0) * 100}%">${t}h</span>`;
    return h + '</div></div>';
  }

  // ---------- today (rita) ----------
  function nextStep(d) {
    let last = -1;
    STEPS.forEach((s, i) => { if (d[s.key]) last = i; });
    return last + 1 < STEPS.length ? STEPS[last + 1].key : null;
  }

  function statusHTML(k, d, st) {
    const now = nowHM();
    const since = key => fmtDur(span(d[key], now));
    const pred = (a) => (d.dose && a != null) ? fmtHM(addMin(d.dose, a)) : null;
    const lines = [];
    if (d.zero) {
      lines.push('Journée bouclée !');
      const t = span(d.dose, d.zero);
      if (t != null) lines.push(`Effet total : ${fmtDur(t)} &#9829;`);
      else lines.push('Bravo pour aujourd\'hui &#9829;');
    } else if (d.drop) {
      lines.push(`Ça redescend depuis ${since('drop')}.`);
      const p = pred(st.total);
      lines.push(p ? `<span class="soft">Zéro prévu vers ${p}.</span>` : '<span class="soft">Touche Zéro quand plus rien.</span>');
    } else if (d.peak) {
      lines.push(`Au max depuis ${since('peak')} &#9733;`);
      const p = pred(st.toDrop);
      lines.push(p ? `<span class="soft">Chute prévue vers ${p}.</span>` : '<span class="soft">Touche Chute quand ça baisse.</span>');
    } else if (d.dose) {
      lines.push(`Prise il y a ${since('dose')}. Ça monte…`);
      const p = pred(st.rise);
      lines.push(p ? `<span class="soft">Pic prévu vers ${p}.</span>` : '<span class="soft">Touche Pic au plus fort.</span>');
    } else if (d.wake) {
      lines.push(`Debout depuis ${since('wake')}.`);
      lines.push('<span class="soft">Touche Prise quand tu l\'avales.</span>');
    } else {
      lines.push('Bon matin !');
      lines.push('<span class="soft">Touche Réveil en te levant.</span>');
    }
    return lines.map(l => `<p>${l}</p>`).join('');
  }

  function stepHint(s, d, st) {
    if (d[s.key]) {
      if (s.key === 'dose' && d.wake) return `${fmtDur(span(d.wake, d.dose))} après le réveil`;
      if (s.key === 'peak' && d.dose) return `montée : ${fmtDur(span(d.dose, d.peak))}`;
      if (s.key === 'drop' && d.peak) return `plateau : ${fmtDur(span(d.peak, d.drop))}`;
      if (s.key === 'zero' && d.dose) return `total : ${fmtDur(span(d.dose, d.zero))}`;
      return s.hint;
    }
    if (d.dose) {
      const a = { peak: st.rise, drop: st.toDrop, zero: st.total }[s.key];
      if (a != null) return `prévu ~${fmtHM(addMin(d.dose, a))}`;
    }
    return s.hint;
  }

  function renderHeader(k, d) {
    $('#date').textContent = dateLabel(k);
    const doseDays = Object.keys(data.days).filter(x => data.days[x].dose && x <= k).length;
    $('#daycount').innerHTML = d.dose ? `jour ${doseDays} de traitement &#9829;`
      : doseDays ? `${doseDays} jour${doseDays > 1 ? 's' : ''} noté${doseDays > 1 ? 's' : ''} &#9829;` : 'premier jour ? courage &#9829;';
  }

  function renderToday() {
    const k = activeKey();
    const d = day(k);
    const st = stats(14);
    renderHeader(k, d);
    $('#status').innerHTML = statusHTML(k, d, st);
    const next = nextStep(d);
    $('#steps').innerHTML = STEPS.map(s => {
      const done = !!d[s.key];
      const cls = done ? `f-${s.key}` : s.key === next ? `f-${s.key} next` : 'f-off off';
      return `<button class="step fr ${cls}" data-step="${s.key}">
        ${spr(s.sprite, 3)}
        <span class="txt"><span class="label">${s.label}</span><span class="hint">${esc(stepHint(s, d, st))}</span></span>
        <span class="time">${fmtHM(d[s.key])}</span>
      </button>`;
    }).join('');
    $('#today-bar').innerHTML = barHTML(d, true);
    const bits = [];
    bits.push(d.mg != null ? `dose : ${esc(d.mg)} mg` : 'dose : ? mg');
    bits.push(d.note ? esc(d.note) : 'ajouter une note');
    $('#today-extra').innerHTML = bits.join(' · ');
  }

  // ---------- humeur ----------
  function phaseBands(d) {
    const bands = [];
    [['dose', 'peak', '#ffe6ee'], ['peak', 'drop', '#ebf8e2'], ['drop', 'zero', '#ffeede']].forEach(([a, b, color]) => {
      if (!d[a]) return;
      const end = d[b] || (STEPS.slice(STEPS.findIndex(s => s.key === b)).some(s => d[s.key]) ? null : nowHM());
      if (!end) return;
      let from = toMin(d[a]), to = toMin(end);
      if (to < from) to += 1440;
      bands.push({ from, to, color });
    });
    return bands;
  }

  function renderMood() {
    const k = keyOf(new Date());
    renderHeader(activeKey(), day(activeKey()));
    const open = openEntry();
    const arr = moodsOf(k);
    let msg;
    if (open && open.e == null) msg = `Humeur notée : ${MOOD_WORDS[open.m]}.<br><span class="soft">Et ton énergie ?</span>`;
    else if (open && open.m == null) msg = `Énergie notée : ${ENERGY_WORDS[open.e]}.<br><span class="soft">Et ton humeur ?</span>`;
    else if (arr.length) {
      const last = arr[arr.length - 1];
      msg = `Dernière fois à ${fmtHM(last.t)} &#9829;<br><span class="soft">${arr.length} fois aujourd'hui. Reviens quand tu veux.</span>`;
    } else msg = 'Comment ça va ?<br><span class="soft">Touche une tête et une pile.</span>';
    $('#mood-status').innerHTML = `<p>${msg}</p>`;
    const row = (kind, prefix, words, cls) => [1, 2, 3, 4, 5].map(v => {
      const on = open && open[kind] === v;
      return `<button class="mood-btn fr ${on ? cls : 'f-off'}" data-kind="${kind}" data-v="${v}" aria-label="${words[v]}">${spr(prefix + v, 3)}</button>`;
    }).join('');
    $('#mood-row').innerHTML = row('m', 'mood', MOOD_WORDS, 'f-mood');
    $('#energy-row').innerHTML = row('e', 'bat', ENERGY_WORDS, 'f-energy');

    const d = day(k);
    const entries = arr.map(x => ({ min: toMin(x.t), m: x.m, e: x.e }));
    Charts.dayMood($('#mood-chart'), entries, phaseBands(d), toMin(nowHM()));
    $('#mood-list').innerHTML = arr.length ? arr.map((x, i) => `
      <button class="mood-item" data-i="${i}">
        <span class="t">${fmtHM(x.t)}</span>
        ${x.m != null ? spr('mood' + x.m, 2) : '<span class="nil"></span>'}
        ${x.e != null ? spr('bat' + x.e, 2) : '<span class="nil"></span>'}
        <span class="w">${[x.m != null ? MOOD_WORDS[x.m] : null, x.e != null ? 'énergie ' + ENERGY_WORDS[x.e] : null].filter(Boolean).join(' · ')}</span>
      </button>`).reverse().join('') : '<div class="empty">Rien encore aujourd\'hui.</div>';
  }

  // ---------- journal ----------
  function renderJournal() {
    const st = stats(14);
    const row = (color, k, sub, v, big) =>
      `<div class="avg-row${big ? ' big' : ''}">${color ? `<i style="background:${color}"></i>` : '<span>&#9829;</span>'}<span class="k">${k}${sub ? ` <small>${sub}</small>` : ''}</span><span class="v">${fmtDur(v)}</span></div>`;
    if (!st.n) {
      $('#averages').innerHTML = '<div class="ptitle">moyennes</div><div class="empty">Pas encore de données.<br>Note ta première journée &#9829;</div>';
    } else {
      let h = `<div class="ptitle">moyennes · ${st.n} jour${st.n > 1 ? 's' : ''}</div>`;
      h += row(null, 'durée totale', '', st.total, true);
      if (st.totalN > 1) h += `<div class="avg-row"><span class="k" style="color:var(--ink2)">entre ${fmtDur(st.totalMin)} et ${fmtDur(st.totalMax)}</span></div>`;
      h += row('#ffb8cb', 'montée', 'prise→pic', st.rise);
      h += row('#bfe6a6', 'plateau', 'pic→chute', st.plateau);
      h += row('#ffc9a3', 'descente', 'chute→zéro', st.fall);
      h += row('#efe3d3', 'attente', 'réveil→prise', st.wait);
      $('#averages').innerHTML = h;
    }
    renderCharts(st);

    const keys = [...new Set([...Object.keys(data.days), ...Object.keys(data.moods).filter(k => moodsOf(k).length)])].sort().reverse();
    const today = activeKey();
    $('#days').innerHTML = keys.map(k => {
      const d = day(k);
      const sum = [];
      if (d.dose && d.peak) sum.push(`pic +${fmtDur(span(d.dose, d.peak))}`);
      if (d.dose && d.zero) sum.push(`total ${fmtDur(span(d.dose, d.zero))}`);
      const md = moodDayAvg(k);
      const moodBit = md.n ? `<span class="day-mood">${md.m != null ? spr('mood' + Math.round(md.m), 1) : ''}${md.e != null ? spr('bat' + Math.round(md.e), 1) : ''}</span>` : '';
      if (!sum.length) sum.push(STEPS.filter(s => d[s.key]).map(s => s.label).join(', ') || (md.n ? `${md.n} humeur${md.n > 1 ? 's' : ''}` : 'vide'));
      return `<button class="day fr f-paper" data-day="${k}">
        <div class="day-head"><span>${dateLabel(k)}${k === today ? ' &#9829;' : ''}</span><span>${d.mg != null ? esc(d.mg) + ' mg' : ''}</span></div>
        ${barHTML(d, false)}
        <div class="day-sum">${moodBit}${sum.join(' · ')}</div>
        ${d.note ? `<div class="day-note">${esc(d.note)}</div>` : ''}
      </button>`;
    }).join('');
  }

  function renderCharts(st) {
    const shortLabel = k => String(+k.slice(8));
    const dosed = Object.keys(data.days).filter(k => data.days[k].dose).sort().slice(-14);
    const box = (id, show) => { $(id).closest('.panel').hidden = !show; return show; };

    if (box('#chart-dur', dosed.length > 0)) {
      Charts.durations($('#chart-dur'), dosed.map(k => {
        const d = data.days[k];
        return { label: shortLabel(k), rise: span(d.dose, d.peak), plateau: span(d.peak, d.drop), fall: span(d.drop, d.zero), total: span(d.dose, d.zero) };
      }), PHASE_COLORS);
    }
    if (box('#chart-curve', st.rise != null && st.plateau != null && st.fall != null)) {
      Charts.curve($('#chart-curve'), st, PHASE_COLORS);
    }
    const moodKeys = Object.keys(data.moods).filter(k => moodsOf(k).length).sort().slice(-14);
    if (box('#chart-moods', moodKeys.length > 0)) {
      Charts.moodDays($('#chart-moods'), moodKeys.map(k => ({ label: shortLabel(k), ...moodDayAvg(k) })));
    }
    const groups = [0, 1, 2, 3, 4].map(() => ({ m: [], e: [] }));
    for (const k of Object.keys(data.moods)) {
      const d = data.days[k];
      if (!d) continue;
      for (const x of moodsOf(k)) {
        const p = phaseOf(d, x.t);
        if (p == null) continue;
        if (x.m != null) groups[p].m.push(x.m);
        if (x.e != null) groups[p].e.push(x.e);
      }
    }
    const anyPhase = groups.some(g => g.m.length || g.e.length);
    if (box('#chart-phase', anyPhase)) {
      Charts.phases($('#chart-phase'), groups.map((g, i) => ({ sprite: ['sun', 'pill', 'star', 'leaf', 'moon'][i], m: avg(g.m), e: avg(g.e) })));
    }
  }

  function render() {
    if (view === 'today') renderToday();
    else if (view === 'mood') renderMood();
    else renderJournal();
  }

  // ---------- actions ----------
  let toastTimer = null;
  function toast(msg, undo) {
    $('#toast-msg').innerHTML = msg;
    $('#toast').hidden = false;
    const btn = $('#toast-undo');
    btn.hidden = !undo;
    btn.onclick = () => { hideToast(); undo && undo(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4500);
  }
  function hideToast() { $('#toast').hidden = true; }

  function hearts(el) {
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      const h = document.createElement('span');
      h.className = 'heartfx';
      h.innerHTML = '&#9829;';
      h.style.left = (r.left + r.width / 2 - 20 + i * 10) + 'px';
      h.style.top = (r.top + 8) + 'px';
      h.style.setProperty('--dx', ((i - 1.5) * 14) + 'px');
      h.style.animationDelay = (i * 70) + 'ms';
      document.body.appendChild(h);
      setTimeout(() => h.remove(), 1300);
    }
  }

  function logNow(key) {
    const k = activeKey();
    const d = day(k, true);
    const hadMg = d.mg != null;
    d[key] = nowHM();
    if (key === 'dose' && !hadMg) {
      const m = lastMg(k);
      if (m != null) d.mg = m;
    }
    save();
    render();
    const el = document.querySelector(`.step[data-step="${key}"]`);
    if (el) { el.classList.add('pop'); hearts(el); }
    toast(`${BY[key].noted} à ${fmtHM(d[key])} &#9829;`, () => {
      delete d[key];
      if (key === 'dose' && !hadMg) delete d.mg;
      prune(k); save(); render();
    });
  }

  // ---------- sheets ----------
  function openSheet(html, bind) {
    $('#sheet-box').innerHTML = html;
    $('#sheet').hidden = false;
    bind($('#sheet-box'));
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet-box').innerHTML = ''; }

  function openStepSheet(k, key) {
    const s = BY[key];
    const d = day(k);
    openSheet(`
      <div class="sh-title">${spr(s.sprite, 2)}<span>${s.label}</span></div>
      <div class="sh-sub">${dateLabel(k)}</div>
      <input id="sh-time" class="field" type="time" value="${d[key] || nowHM()}">
      <div class="sh-row">
        <button id="sh-now" class="btn fr f-off">maintenant</button>
        <button id="sh-clear" class="btn fr f-off danger">effacer</button>
      </div>
      <div class="sh-row">
        <button id="sh-cancel" class="btn fr f-off">annuler</button>
        <button id="sh-ok" class="btn fr f-${key}">ok &#9829;</button>
      </div>`, box => {
      box.querySelector('#sh-now').onclick = () => { box.querySelector('#sh-time').value = nowHM(); };
      box.querySelector('#sh-clear').onclick = () => { delete day(k)[key]; prune(k); save(); closeSheet(); render(); };
      box.querySelector('#sh-cancel').onclick = closeSheet;
      box.querySelector('#sh-ok').onclick = () => {
        const v = box.querySelector('#sh-time').value;
        if (v) { day(k, true)[key] = v; save(); }
        closeSheet(); render();
      };
    });
  }

  function openMoodSheet(k, i) {
    const x = moodsOf(k)[i];
    if (!x) return;
    const sel = { m: x.m, e: x.e };
    const pick = (kind, prefix) => [1, 2, 3, 4, 5].map(v =>
      `<button class="mood-btn small fr ${sel[kind] === v ? (kind === 'm' ? 'f-mood' : 'f-energy') : 'f-off'}" data-kind="${kind}" data-v="${v}">${spr(prefix + v, 2)}</button>`).join('');
    openSheet(`
      <div class="sh-title">${spr('mood' + (x.m || 3), 2)}<span>Humeur</span></div>
      <div class="sh-sub">${dateLabel(k)}</div>
      <input id="sh-time" class="field" type="time" value="${x.t}">
      <div class="pick-row" data-row="m">${pick('m', 'mood')}</div>
      <div class="pick-row" data-row="e">${pick('e', 'bat')}</div>
      <div class="sh-row">
        <button id="sh-del" class="btn fr f-off danger">supprimer</button>
        <button id="sh-cancel" class="btn fr f-off">annuler</button>
        <button id="sh-ok" class="btn fr f-mood">ok &#9829;</button>
      </div>`, box => {
      box.querySelectorAll('.pick-row .mood-btn').forEach(b => {
        b.onclick = () => {
          const kind = b.dataset.kind, v = +b.dataset.v;
          sel[kind] = sel[kind] === v ? null : v;
          box.querySelectorAll(`.mood-btn[data-kind="${kind}"]`).forEach(o => {
            const on = sel[kind] === +o.dataset.v;
            o.classList.toggle(kind === 'm' ? 'f-mood' : 'f-energy', on);
            o.classList.toggle('f-off', !on);
          });
        };
      });
      box.querySelector('#sh-cancel').onclick = closeSheet;
      box.querySelector('#sh-del').onclick = () => {
        moodsOf(k).splice(i, 1);
        if (!moodsOf(k).length) delete data.moods[k];
        save(); closeSheet(); render();
      };
      box.querySelector('#sh-ok').onclick = () => {
        const t = box.querySelector('#sh-time').value || x.t;
        const next = { t };
        if (sel.m != null) next.m = sel.m;
        if (sel.e != null) next.e = sel.e;
        const arr = moodsOf(k);
        if (next.m == null && next.e == null) arr.splice(i, 1); else arr[i] = next;
        arr.sort((a, b) => a.t.localeCompare(b.t));
        if (!arr.length) delete data.moods[k];
        save(); closeSheet(); render();
      };
    });
  }

  function openDaySheet(k) {
    const d = day(k);
    const mg = d.mg != null ? d.mg : (lastMg(k) ?? '');
    openSheet(`
      <div class="sh-title">${spr('pill', 2)}<span>${dateLabel(k)}</span></div>
      ${STEPS.map(s => `
        <div class="ed-row">
          ${spr(s.sprite, 2)}<span class="lbl">${s.label}</span>
          <input class="field small" type="time" data-k="${s.key}" value="${d[s.key] || ''}">
          <button class="x" data-clear="${s.key}">x</button>
        </div>`).join('')}
      <div class="ed-row"><span class="lbl">dose</span><input id="ed-mg" class="field small" type="number" inputmode="decimal" min="0" step="any" placeholder="mg" value="${esc(mg)}"><span class="x">mg</span></div>
      <div class="ed-row"><input id="ed-note" class="field small" type="text" maxlength="120" placeholder="note (sommeil, café, repas…)" value="${esc(d.note || '')}"></div>
      <div class="sh-row">
        <button id="sh-del" class="btn fr f-off danger">supprimer</button>
        <button id="sh-cancel" class="btn fr f-off">annuler</button>
        <button id="sh-ok" class="btn fr f-dose">ok &#9829;</button>
      </div>`, box => {
      box.querySelectorAll('[data-clear]').forEach(b => {
        b.onclick = () => { box.querySelector(`input[data-k="${b.dataset.clear}"]`).value = ''; };
      });
      box.querySelector('#sh-cancel').onclick = closeSheet;
      const del = box.querySelector('#sh-del');
      del.onclick = () => {
        if (del.dataset.armed) { delete data.days[k]; delete data.moods[k]; save(); closeSheet(); render(); return; }
        del.dataset.armed = '1';
        del.textContent = 'sûr ?';
      };
      box.querySelector('#sh-ok').onclick = () => {
        const nd = {};
        box.querySelectorAll('input[data-k]').forEach(i => { if (i.value) nd[i.dataset.k] = i.value; });
        const mgv = box.querySelector('#ed-mg').value.trim();
        if (mgv !== '' && !isNaN(+mgv)) nd.mg = +mgv;
        const note = box.querySelector('#ed-note').value.trim();
        if (note) nd.note = note;
        data.days[k] = nd;
        prune(k); save(); closeSheet(); render();
      };
    });
  }

  function openAddDay() {
    const y = new Date(); y.setDate(y.getDate() - 1);
    openSheet(`
      <div class="sh-title">${spr('sun', 2)}<span>Ajouter un jour</span></div>
      <input id="ad-date" class="field" type="date" value="${keyOf(y)}" max="${keyOf(new Date())}">
      <div class="sh-row">
        <button id="sh-cancel" class="btn fr f-off">annuler</button>
        <button id="sh-ok" class="btn fr f-peak">suivant</button>
      </div>`, box => {
      box.querySelector('#sh-cancel').onclick = closeSheet;
      box.querySelector('#sh-ok').onclick = () => {
        const v = box.querySelector('#ad-date').value;
        if (v) openDaySheet(v);
      };
    });
  }

  function exportData() {
    const raw = JSON.stringify(data, null, 1);
    if (Native) { Native.share(raw); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    a.download = 'rita-' + keyOf(new Date()) + '.json';
    a.click();
  }

  function openImport() {
    openSheet(`
      <div class="sh-title">${spr('cloud', 2)}<span>Importer</span></div>
      <div class="sh-sub">Colle ici un export Rita. Les jours déjà présents sont remplacés.</div>
      <textarea id="im-text" class="field" placeholder="{ &quot;days&quot;: … }"></textarea>
      <div class="sh-row">
        <button id="sh-cancel" class="btn fr f-off">annuler</button>
        <button id="sh-ok" class="btn fr f-peak">importer</button>
      </div>`, box => {
      box.querySelector('#sh-cancel').onclick = closeSheet;
      box.querySelector('#sh-ok').onclick = () => {
        try {
          const inc = JSON.parse(box.querySelector('#im-text').value);
          if (!inc || typeof inc.days !== 'object') throw new Error('format');
          const keyOk = k => /^\d{4}-\d\d-\d\d$/.test(k);
          let n = 0;
          for (const k in inc.days) if (keyOk(k)) { data.days[k] = inc.days[k]; n++; }
          for (const k in (inc.moods || {})) if (keyOk(k) && Array.isArray(inc.moods[k])) data.moods[k] = inc.moods[k];
          save(); closeSheet(); render();
          toast(`${n} jour${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''} &#9829;`);
        } catch (e) {
          box.querySelector('.sh-sub').textContent = 'Oups, ce texte n\'est pas un export Rita.';
        }
      };
    });
  }

  function setView(v) {
    view = v;
    $('#view-today').hidden = v !== 'today';
    $('#view-mood').hidden = v !== 'mood';
    $('#view-journal').hidden = v !== 'journal';
    document.querySelectorAll('.tab').forEach(t => {
      const on = t.dataset.view === v;
      t.classList.toggle('on', on);
      t.classList.toggle('f-wood', on);
      t.classList.toggle('f-off', !on);
    });
    window.scrollTo(0, 0);
    render();
  }

  // ---------- wiring ----------
  installFrames();
  installClouds();

  $('#steps').addEventListener('click', e => {
    const b = e.target.closest('.step');
    if (!b) return;
    const key = b.dataset.step;
    const k = activeKey();
    if (day(k)[key]) openStepSheet(k, key); else logNow(key);
  });
  $('#view-mood').addEventListener('click', e => {
    const b = e.target.closest('.mood-btn');
    if (b && !b.closest('.sheet')) {
      logMood(b.dataset.kind, +b.dataset.v);
      render();
      const again = document.querySelector(`#view-mood .mood-btn[data-kind="${b.dataset.kind}"][data-v="${b.dataset.v}"]`);
      if (again) { again.classList.add('pop'); hearts(again); }
      return;
    }
    const item = e.target.closest('.mood-item');
    if (item) openMoodSheet(keyOf(new Date()), +item.dataset.i);
  });
  $('#days').addEventListener('click', e => {
    const b = e.target.closest('.day');
    if (b) openDaySheet(b.dataset.day);
  });
  $('#today-extra').onclick = () => openDaySheet(activeKey());
  $('#add-day').onclick = openAddDay;
  $('#export').onclick = exportData;
  $('#import').onclick = openImport;
  $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
  document.querySelectorAll('.tab').forEach(t => { t.onclick = () => setView(t.dataset.view); });

  // Called by MainActivity.
  window.ritaRefresh = () => { data = load(); if ($('#sheet').hidden) render(); };
  window.ritaOpenStep = key => { setView('today'); if (BY[key]) openStepSheet(activeKey(), key); };
  window.ritaOpenView = v => { closeSheet(); setView(v === 'mood' ? 'mood' : v === 'journal' ? 'journal' : 'today'); };
  window.ritaBack = () => {
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    if (view !== 'today') { setView('today'); return true; }
    return false;
  };

  setInterval(() => { if (view !== 'journal' && $('#sheet').hidden) render(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.ritaRefresh(); });
  window.addEventListener('resize', () => { if (view !== 'today') render(); });
  render();
  // Charts draw text with the pixel font; redraw once it is ready.
  if (document.fonts) document.fonts.load('8px RitaPixel').then(() => render());
})();
