(function () {
  'use strict';

  // In the APK, MainActivity exposes RitaBridge (SharedPreferences, shared with the widgets).
  // In a desktop browser we fall back to localStorage so the UI can be previewed.
  const Native = window.RitaBridge || null;
  const Charts = window.RitaCharts;

  // Shared core for the feature modules (meds.js, crises.js, journal.js). They are loaded
  // before this file as factories and receive R once everything below is defined.
  const R = window.Rita = {};

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
  // Context chips ("raisons possibles"), shared by mood entries (x.tags), days (d.tags) and crises (c.why).
  // Keys are stored, labels shown. Custom ones live in data.tagsx, hidden ones in data.tagsHide.
  const TAGS = [
    ['fatigue', 'fatigue'], ['sommeil', 'mal dormi'], ['travail', 'travail'], ['stress', 'stress'],
    ['regles', 'règles'], ['douleur', 'douleur'], ['malade', 'malade'], ['social', 'social'], ['faim', 'pas mangé'],
    ['cafe', 'café'], ['bruit', 'foule/bruit'],
  ];

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- storage ----------
  let data = load();
  let view = 'today';

  function load() {
    try {
      const raw = Native ? Native.load() : localStorage.getItem('rita');
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.days) {
        for (const k of ['moods', 'takes', 'crises']) if (!d[k]) d[k] = {};
        if (!d.meds) d.meds = [];
        return d;
      }
    } catch (e) { /* fresh start */ }
    return { v: 1, days: {}, moods: {}, meds: [], takes: {}, crises: {} };
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
    if (d && !STEPS.some(s => d[s.key]) && d.mg == null && !d.note && !(d.tags && d.tags.length)) delete data.days[key];
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
  const shiftKey = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const fmt1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const uid = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

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
  /** Averages over the last `limit` dosed days, optionally only days >= since. */
  function stats(limit, since) {
    const keys = Object.keys(data.days).sort().reverse();
    const acc = { rise: [], plateau: [], fall: [], total: [], wait: [], toDrop: [], dose: [] };
    let n = 0;
    for (const k of keys) {
      const d = data.days[k];
      if (!d.dose) continue;
      if (since && k < since) break;
      if (n >= limit) break;
      n++;
      const push = (arr, v) => { if (v != null) arr.push(v); };
      push(acc.rise, span(d.dose, d.peak));
      push(acc.plateau, span(d.peak, d.drop));
      push(acc.fall, span(d.drop, d.zero));
      push(acc.total, span(d.dose, d.zero));
      push(acc.wait, span(d.wake, d.dose));
      push(acc.toDrop, span(d.dose, d.drop));
      push(acc.dose, toMin(d.dose));
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

  /** The entry just tapped (less than 5 min ago), complete or not: details can still be added inline. */
  function recentEntry() {
    const arr = moodsOf(keyOf(new Date()));
    const last = arr[arr.length - 1];
    return last && span(last.t, nowHM()) <= MOOD_MERGE_MIN ? last : null;
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
    if (!d || !d.dose) return null;
    const m = toMin(t), rel = x => (toMin(x) - toMin(d.dose) + 1440) % 1440;
    if (m < toMin(d.dose) && (!d.wake || m >= toMin(d.wake) - 60)) return 0;
    const r = rel(t);
    if (r > 20 * 60) return 0;
    if (!d.peak || r < rel(d.peak)) return 1;
    if (!d.drop || r < rel(d.drop)) return 2;
    if (!d.zero || r < rel(d.zero)) return 3;
    return 4;
  }
  const PHASE_WORDS = ['avant la prise', 'pendant la montée', 'au plateau', 'pendant la descente', 'après l\'effet'];

  function moodDayAvg(k) {
    const arr = moodsOf(k);
    const m = avg(arr.filter(x => x.m != null).map(x => x.m));
    const e = avg(arr.filter(x => x.e != null).map(x => x.e));
    return { m, e, n: arr.length };
  }

  // ---------- tags ----------
  function tagList() {
    const hide = data.tagsHide || [];
    return [...TAGS, ...(data.tagsx || [])].filter(([k]) => !hide.includes(k));
  }
  function tagLabel(k) {
    const f = TAGS.find(t => t[0] === k) || (data.tagsx || []).find(t => t[0] === k);
    return f ? f[1] : k;
  }
  const tagWords = tags => (tags || []).map(tagLabel);

  /** Adds a custom tag (or finds the existing one with that label) and returns its key. */
  function addTag(label) {
    label = (label || '').trim().replace(/\s+/g, ' ');
    if (!label) return null;
    const all = [...TAGS, ...(data.tagsx || [])];
    const f = all.find(t => t[1].toLowerCase() === label.toLowerCase());
    if (f) {
      if (data.tagsHide) data.tagsHide = data.tagsHide.filter(k => k !== f[0]);
      save();
      return f[0];
    }
    const k = 'x' + uid();
    (data.tagsx || (data.tagsx = [])).push([k, label]);
    save();
    return k;
  }

  function toggleTag(obj, tag, field) {
    field = field || 'tags';
    const tags = obj[field] || [];
    const i = tags.indexOf(tag);
    if (i >= 0) tags.splice(i, 1); else tags.push(tag);
    if (tags.length) obj[field] = tags; else delete obj[field];
  }

  /**
   * Fills `box` with toggle chips bound to sel[field]. `list` is [[key, label]]; chips already
   * selected but missing from the list (hidden tags) still show. With `addable`, a "+ autre" chip
   * turns into a field that creates a custom tag. `onChange` runs after each toggle.
   */
  function chipBox(box, sel, opt) {
    opt = opt || {};
    const field = opt.field || 'tags';
    const list = () => {
      const base = opt.list ? opt.list() : tagList();
      const on = sel[field] || [];
      const extra = on.filter(k => !base.some(t => t[0] === k)).map(k => [k, opt.label ? opt.label(k) : tagLabel(k)]);
      return [...base, ...extra];
    };
    const paint = () => {
      const on = sel[field] || [];
      box.innerHTML = list().map(([k, l]) =>
        `<button class="chip fr ${on.includes(k) ? (opt.cls || 'f-zero') : 'f-off'}" data-tag="${esc(k)}">${esc(l)}</button>`).join('')
        + (opt.addable === false ? '' : '<button class="chip fr f-off add" data-add="1">+ autre</button>');
    };
    box.onclick = e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        const inp = document.createElement('input');
        inp.className = 'field small chip-in';
        inp.maxLength = 24;
        inp.placeholder = 'nouvelle raison';
        add.replaceWith(inp);
        inp.focus();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          const k = addTag(inp.value);
          if (k && !(sel[field] || []).includes(k)) toggleTag(sel, k, field);
          paint();
          if (k && opt.onChange) opt.onChange();
        };
        inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); };
        inp.onblur = finish;
        return;
      }
      const b = e.target.closest('.chip');
      if (!b || !b.dataset.tag) return;
      toggleTag(sel, b.dataset.tag, field);
      paint();
      if (opt.onChange) opt.onChange();
    };
    paint();
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

  // Treatment colors, same order as CAPSULE_COLORS in tools/make_assets.py.
  const MED_PAL = [
    ['#6f8fc4', '#a9c4f5', '#dbe7ff'], ['#6fae67', '#b6e3a8', '#e2f6da'], ['#9a84c9', '#d3c4f3', '#f1ebff'],
    ['#c9a24e', '#ffe08a', '#fff4cf'], ['#d98b62', '#ffc9a3', '#ffeede'], ['#4f9e9a', '#9fdcd5', '#dcf5f2'],
  ];
  const CRISIS_PAL = ['#8a6fc0', '#d3c4f3', '#f1ebff'];

  function installFrames() {
    const css = [
      `.f-wood{--frame:${frameURI('#a8806c', '#f2cda4', '#fde9cc', '#fffaf0')}}`,
      `.f-off{--frame:${frameURI('#cdb9a8', '#efe3d3', '#fffaf0', '#fffaf0')}}`,
      `.f-paper{--frame:${frameURI('#b99c8a', '#f5e3cc', '#fffaf0', '#fffaf0')}}`,
      `.f-mood{--frame:${frameURI('#cc6f8c', '#ffb8cb', '#ffe6ee', '#ffe6ee')}}`,
      `.f-energy{--frame:${frameURI('#c9a24e', '#ffe08a', '#fff4cf', '#fff4cf')}}`,
      `.f-crise{--frame:${frameURI(CRISIS_PAL[0], CRISIS_PAL[1], CRISIS_PAL[2], CRISIS_PAL[2])}}`,
      `.f-anx{--frame:${frameURI('#c0607a', '#ffb3c1', '#ffe0e7', '#ffe0e7')}}`,
    ];
    for (const s of STEPS) {
      const [D, W, L] = s.pal;
      css.push(`.f-${s.key}{--frame:${frameURI(D, W, L, L)}}`);
    }
    MED_PAL.forEach(([D, W, L], i) => css.push(`.f-med${i}{--frame:${frameURI(D, W, L, L)}}`));
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

  /** Marks under the bar: other treatments (small squares) and crises (lilac bolts). */
  function dayMarks(k) {
    const marks = [];
    for (const x of data.takes[k] || []) {
      const med = R.Meds.byId(x.med);
      if (med) marks.push({ t: x.t, cls: 'mk-med', color: MED_PAL[med.col % MED_PAL.length][0] });
    }
    for (const c of data.crises[k] || []) marks.push({ t: c.t, cls: 'mk-crise', color: CRISIS_PAL[0] });
    return marks;
  }

  function barHTML(d, live, marks) {
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
    h += '</div>';
    if (marks && marks.length) {
      h += '<div class="marks">' + marks.map(m => `<i class="${m.cls}" style="left:${pos(m.t, ref)}%;background:${m.color}"></i>`).join('') + '</div>';
    }
    h += '<div class="hours">';
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
      if (s.key === 'dose' && d.wake) return `attente : ${fmtDur(span(d.wake, d.dose))}`;
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
    R.Meds.renderToday($('#meds'));
    $('#today-bar').innerHTML = barHTML(d, true, dayMarks(k));
    const bits = [];
    bits.push(d.mg != null ? `dose : ${esc(d.mg)} mg` : 'dose : ? mg');
    if (d.tags && d.tags.length) bits.push(esc(tagWords(d.tags).join(', ')));
    bits.push(d.note ? esc(d.note) : 'ajouter un détail');
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
    const recent = recentEntry();
    const low = recent && recent.m != null && recent.m <= 2;
    const arr = moodsOf(k);
    let msg;
    if (low && !open) msg = 'Aïe, courage &#9829;<br><span class="soft">Note ce qui pèse juste en dessous, si tu veux.</span>';
    else if (open && open.e == null) msg = `Humeur notée : ${MOOD_WORDS[open.m]}.<br><span class="soft">Et ton énergie ?</span>`;
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

    $('#mood-ctx').hidden = !recent;
    if (recent) {
      $('#mood-ctx-title').textContent = low ? 'qu\'est-ce qui pèse ?' : 'un détail à noter ?';
      chipBox($('#mood-ctx-chips'), recent, { onChange: save });
      $('#mood-ctx-note').textContent = recent.n ? recent.n : '+ écrire un mot';
    }

    R.Crises.renderPanel($('#crisis'));

    const d = day(k);
    const entries = arr.map(x => ({ min: toMin(x.t), m: x.m, e: x.e }));
    const crises = (data.crises[k] || []).map(c => ({ from: toMin(c.t), to: c.end ? toMin(c.end) : null, i: c.i }));
    Charts.dayMood($('#mood-chart'), entries, phaseBands(d), toMin(nowHM()), crises);
    $('#mood-list').innerHTML = arr.length ? arr.map((x, i) => `
      <button class="mood-item" data-i="${i}">
        <span class="t">${fmtHM(x.t)}</span>
        ${x.m != null ? spr('mood' + x.m, 2) : '<span class="nil"></span>'}
        ${x.e != null ? spr('bat' + x.e, 2) : '<span class="nil"></span>'}
        <span class="w">${esc([x.m != null ? MOOD_WORDS[x.m] : null, x.e != null ? 'énergie ' + ENERGY_WORDS[x.e] : null, ...tagWords(x.tags), x.n].filter(Boolean).join(' · '))}</span>
      </button>`).reverse().join('') : '<div class="empty">Rien encore aujourd\'hui.</div>';
  }

  function render() {
    if (view === 'today') renderToday();
    else if (view === 'mood') renderMood();
    else R.Journal.render();
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
    $('#sheet-box').scrollTop = 0;
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
    const sel = { m: x.m, e: x.e, tags: [...(x.tags || [])] };
    const pick = (kind, prefix) => [1, 2, 3, 4, 5].map(v =>
      `<button class="mood-btn small fr ${sel[kind] === v ? (kind === 'm' ? 'f-mood' : 'f-energy') : 'f-off'}" data-kind="${kind}" data-v="${v}">${spr(prefix + v, 2)}</button>`).join('');
    openSheet(`
      <div class="sh-title">${spr('mood' + (x.m || 3), 2)}<span>Humeur</span></div>
      <div class="sh-sub">${dateLabel(k)}</div>
      <input id="sh-time" class="field" type="time" value="${x.t}">
      <div class="pick-row" data-row="m">${pick('m', 'mood')}</div>
      <div class="pick-row" data-row="e">${pick('e', 'bat')}</div>
      <div class="chips" id="sh-chips"></div>
      <input id="sh-note" class="field small" type="text" maxlength="120" placeholder="un mot sur ce moment…" value="${esc(x.n || '')}">
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
      chipBox(box.querySelector('#sh-chips'), sel);
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
        if (sel.tags && sel.tags.length) next.tags = sel.tags;
        const note = box.querySelector('#sh-note').value.trim();
        if (note) next.n = note;
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
    const sel = { tags: [...(d.tags || [])] };
    const takes = (data.takes[k] || []).map(x => ({ ...x }));
    const crises = data.crises[k] || [];
    const takesHTML = () => takes.length ? takes.map((x, i) => {
      const med = R.Meds.byId(x.med);
      return `<div class="ed-row">${spr('caps' + (med ? med.col : 0), 2)}<span class="lbl wide">${esc(med ? med.name : '?')}${x.dose != null ? ' ' + esc(x.dose) + ' ' + esc(med ? med.unit : '') : ''}</span>
        <input class="field small" type="time" data-take="${i}" value="${x.t}"><button class="x" data-untake="${i}">x</button></div>`;
    }).join('') : '';
    openSheet(`
      <div class="sh-title">${spr('pill', 2)}<span>${dateLabel(k)}</span></div>
      ${STEPS.map(s => `
        <div class="ed-row">
          ${spr(s.sprite, 2)}<span class="lbl">${s.label}</span>
          <input class="field small" type="time" data-k="${s.key}" value="${d[s.key] || ''}">
          <button class="x" data-clear="${s.key}">x</button>
        </div>`).join('')}
      <div class="ed-row"><span class="lbl">dose</span><input id="ed-mg" class="field small" type="number" inputmode="decimal" min="0" step="any" placeholder="mg" value="${esc(mg)}"><span class="x">mg</span></div>
      ${R.Meds.list().length ? `<div class="ptitle">autres traitements</div><div id="ed-takes">${takesHTML()}</div>
        <div class="chips" id="ed-addtake">${R.Meds.list().map(m => `<button class="chip fr f-med${m.col}" data-med="${m.id}">+ ${esc(m.name)}</button>`).join('')}</div>` : ''}
      ${crises.length ? `<div class="ptitle">crises</div>${crises.map((c, i) => `<button class="crisis-item fr f-off" data-crisis="${i}">${spr('anx' + (c.i || 3), 2)}<span>${fmtHM(c.t)}${c.end ? ' · ' + fmtDur(span(c.t, c.end)) : ''}</span></button>`).join('')}` : ''}
      <div class="ptitle">contexte du jour</div>
      <div class="chips" id="ed-chips"></div>
      <div class="ed-row"><input id="ed-note" class="field small" type="text" maxlength="120" placeholder="note (sommeil, café, repas…)" value="${esc(d.note || '')}"></div>
      <div class="sh-row">
        <button id="sh-del" class="btn fr f-off danger">supprimer</button>
        <button id="sh-cancel" class="btn fr f-off">annuler</button>
        <button id="sh-ok" class="btn fr f-dose">ok &#9829;</button>
      </div>`, box => {
      box.querySelectorAll('[data-clear]').forEach(b => {
        b.onclick = () => { box.querySelector(`input[data-k="${b.dataset.clear}"]`).value = ''; };
      });
      chipBox(box.querySelector('#ed-chips'), sel);
      const takeBox = box.querySelector('#ed-takes');
      const syncTimes = () => box.querySelectorAll('input[data-take]').forEach(inp => { if (inp.value) takes[+inp.dataset.take].t = inp.value; });
      if (takeBox) {
        takeBox.onclick = e => {
          const b = e.target.closest('[data-untake]');
          if (!b) return;
          syncTimes();
          takes.splice(+b.dataset.untake, 1);
          takeBox.innerHTML = takesHTML();
        };
        box.querySelector('#ed-addtake').onclick = e => {
          const b = e.target.closest('[data-med]');
          if (!b) return;
          syncTimes();
          const med = R.Meds.byId(b.dataset.med);
          const t = k === keyOf(new Date()) ? nowHM() : (med.times && med.times[0]) || '12:00';
          const x = { t, med: med.id };
          if (med.dose != null) x.dose = med.dose;
          takes.push(x);
          takeBox.innerHTML = takesHTML();
        };
      }
      box.querySelectorAll('[data-crisis]').forEach(b => {
        b.onclick = () => R.Crises.openSheet(k, crises[+b.dataset.crisis].id);
      });
      box.querySelector('#sh-cancel').onclick = closeSheet;
      const del = box.querySelector('#sh-del');
      del.onclick = () => {
        if (del.dataset.armed) {
          delete data.days[k]; delete data.moods[k]; delete data.takes[k]; delete data.crises[k];
          save(); closeSheet(); render(); return;
        }
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
        if (sel.tags && sel.tags.length) nd.tags = sel.tags;
        data.days[k] = nd;
        if (takeBox) {
          syncTimes();
          takes.sort((a, b) => a.t.localeCompare(b.t));
          if (takes.length) data.takes[k] = takes; else delete data.takes[k];
        }
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

  /** Show, hide or delete the context chips. Hidden chips keep their label in the history. */
  function openTagsSheet() {
    const hide = new Set(data.tagsHide || []);
    const all = () => [...TAGS, ...(data.tagsx || [])];
    const rows = () => all().map(([k, l]) => `<button class="chip fr ${hide.has(k) ? 'f-off hidden-tag' : 'f-zero'}" data-tag="${esc(k)}">${esc(l)}</button>`).join('');
    openSheet(`
      <div class="sh-title">${spr('leaf', 2)}<span>Mes raisons</span></div>
      <div class="sh-sub">Touche une raison pour la cacher ou la remettre. Tu peux en ajouter depuis n'importe quelle liste avec « + autre ».</div>
      <div class="chips" id="tg-list">${rows()}</div>
      <div class="sh-row"><button id="sh-ok" class="btn fr f-peak">ok &#9829;</button></div>`, box => {
      box.querySelector('#tg-list').onclick = e => {
        const b = e.target.closest('[data-tag]');
        if (!b) return;
        const k = b.dataset.tag;
        if (hide.has(k)) hide.delete(k); else hide.add(k);
        box.querySelector('#tg-list').innerHTML = rows();
      };
      box.querySelector('#sh-ok').onclick = () => {
        if (hide.size) data.tagsHide = [...hide]; else delete data.tagsHide;
        save(); closeSheet(); render();
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
          for (const f of ['moods', 'takes', 'crises']) {
            for (const k in (inc[f] || {})) if (keyOk(k) && Array.isArray(inc[f][k])) data[f][k] = inc[f][k];
          }
          for (const m of inc.meds || []) {
            if (!m || !m.id) continue;
            const i = data.meds.findIndex(x => x.id === m.id);
            if (i >= 0) data.meds[i] = m; else data.meds.push(m);
          }
          for (const t of inc.tagsx || []) if (!(data.tagsx || []).some(x => x[0] === t[0])) (data.tagsx || (data.tagsx = [])).push(t);
          if (inc.tagsHide) data.tagsHide = [...new Set([...(data.tagsHide || []), ...inc.tagsHide])];
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

  // ---------- core for the modules ----------
  Object.defineProperty(R, 'data', { get: () => data });
  Object.assign(R, {
    STEPS, BY, PHASE_COLORS, PHASE_WORDS, MOOD_WORDS, ENERGY_WORDS, MED_PAL, CRISIS_PAL, Charts,
    $, esc, save, render, day, moodsOf, moodDayAvg, phaseOf, stats, activeKey, phaseBands,
    pad, nowHM, toMin, span, addMin, fmtHM, fmtDur, keyOf, dateOf, dateLabel, avg, shiftKey, fmt1, uid,
    tagList, tagLabel, tagWords, chipBox, toggleTag, spr, spriteURL, barHTML, dayMarks,
    openSheet, closeSheet, toast, hearts, openDaySheet, openAddDay, openTagsSheet, exportData, openImport,
  });
  R.Meds = window.RitaMeds(R);
  R.Crises = window.RitaCrises(R);
  R.Journal = window.RitaJournal(R);

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
    if (b && !b.closest('.sheet') && b.dataset.kind) {
      logMood(b.dataset.kind, +b.dataset.v);
      render();
      const again = document.querySelector(`#view-mood .mood-btn[data-kind="${b.dataset.kind}"][data-v="${b.dataset.v}"]`);
      if (again) { again.classList.add('pop'); hearts(again); }
      return;
    }
    const recent = recentEntry();
    if (e.target.closest('#mood-ctx-note') && recent) { openMoodSheet(keyOf(new Date()), moodsOf(keyOf(new Date())).length - 1); return; }
    const item = e.target.closest('.mood-item');
    if (item) openMoodSheet(keyOf(new Date()), +item.dataset.i);
  });
  $('#today-extra').onclick = () => openDaySheet(activeKey());
  $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
  document.querySelectorAll('.tab').forEach(t => { t.onclick = () => setView(t.dataset.view); });

  // Called by MainActivity.
  window.ritaRefresh = () => { data = load(); if ($('#sheet').hidden && !R.Crises.breathing()) render(); };
  window.ritaOpenStep = key => { setView('today'); if (BY[key]) openStepSheet(activeKey(), key); };
  window.ritaOpenView = v => {
    closeSheet();
    if (v === 'crise') { setView('mood'); R.Crises.start(); return; }
    setView(v === 'mood' ? 'mood' : v === 'journal' ? 'journal' : 'today');
  };
  window.ritaBack = () => {
    if (R.Crises.breathing()) { R.Crises.stopBreathing(); return true; }
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    if (view !== 'today') { setView('today'); return true; }
    return false;
  };

  setInterval(() => { if (view !== 'journal' && $('#sheet').hidden && !R.Crises.breathing()) render(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.ritaRefresh(); });
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth !== lastW && view !== 'today') { lastW = window.innerWidth; render(); } });
  // Desktop preview: ?view=crise|mood|journal opens that view directly.
  const qv = new URLSearchParams(location.search).get('view');
  if (qv && !Native) window.ritaOpenView(qv); else render();
  // Charts draw text with the pixel font; redraw once it is ready.
  if (document.fonts) document.fonts.load('8px RitaPixel').then(() => { if ($('#sheet').hidden) render(); });
})();
