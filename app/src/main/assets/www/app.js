(function () {
  'use strict';

  // In the APK, MainActivity exposes RitaBridge (SharedPreferences, shared with the widget).
  // In a desktop browser we fall back to localStorage so the UI can be previewed.
  const Native = window.RitaBridge || null;

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

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- storage ----------
  let data = load();
  let view = 'today';

  function load() {
    try {
      const raw = Native ? Native.load() : localStorage.getItem('rita');
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.days) return d;
    } catch (e) { /* fresh start */ }
    return { v: 1, days: {} };
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
    const acc = { rise: [], plateau: [], fall: [], total: [], wait: [], toPeak: [], toDrop: [] };
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
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
    const out = { n };
    for (const k in acc) out[k] = avg(acc[k]);
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

  // ---------- today ----------
  function nextStep(d) {
    let last = -1;
    STEPS.forEach((s, i) => { if (d[s.key]) last = i; });
    return last + 1 < STEPS.length ? STEPS[last + 1].key : null;
  }

  function statusHTML(k, d, st) {
    const now = nowHM();
    const since = key => fmtDur(span(d[key], now));
    const pred = (avg) => (d.dose && avg != null) ? fmtHM(addMin(d.dose, avg)) : null;
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
    const done = !!d[s.key];
    if (done) {
      if (s.key === 'dose' && d.wake) return `${fmtDur(span(d.wake, d.dose))} après le réveil`;
      if (s.key === 'peak' && d.dose) return `montée : ${fmtDur(span(d.dose, d.peak))}`;
      if (s.key === 'drop' && d.peak) return `plateau : ${fmtDur(span(d.peak, d.drop))}`;
      if (s.key === 'zero' && d.dose) return `total : ${fmtDur(span(d.dose, d.zero))}`;
      return s.hint;
    }
    if (d.dose) {
      const avg = { peak: st.rise, drop: st.toDrop, zero: st.total }[s.key];
      if (avg != null) return `prévu ~${fmtHM(addMin(d.dose, avg))}`;
    }
    return s.hint;
  }

  function renderToday() {
    const k = activeKey();
    const d = day(k);
    const st = stats(14);
    $('#date').textContent = dateLabel(k);
    const doseDays = Object.keys(data.days).filter(x => data.days[x].dose && x <= k).length;
    $('#daycount').innerHTML = d.dose ? `jour ${doseDays} de traitement &#9829;` : doseDays ? `${doseDays} jour${doseDays > 1 ? 's' : ''} noté${doseDays > 1 ? 's' : ''} &#9829;` : 'premier jour ? courage &#9829;';
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
    $('#today-bar').innerHTML = barHTML(d, k === keyOf(new Date()) || k === activeKey());
    const bits = [];
    bits.push(d.mg != null ? `dose : ${esc(d.mg)} mg` : 'dose : ? mg');
    bits.push(d.note ? esc(d.note) : 'ajouter une note');
    $('#today-extra').innerHTML = bits.join(' · ');
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
      if (st.totalN > 1) h += `<div class="avg-row"><span class="k soft" style="color:var(--ink2)">entre ${fmtDur(st.totalMin)} et ${fmtDur(st.totalMax)}</span></div>`;
      h += row('#ffb8cb', 'montée', 'prise→pic', st.rise);
      h += row('#bfe6a6', 'plateau', 'pic→chute', st.plateau);
      h += row('#ffc9a3', 'descente', 'chute→zéro', st.fall);
      h += row('#efe3d3', 'attente', 'réveil→prise', st.wait);
      $('#averages').innerHTML = h;
    }
    const keys = Object.keys(data.days).sort().reverse();
    if (!keys.length) { $('#days').innerHTML = ''; return; }
    const today = activeKey();
    $('#days').innerHTML = keys.map(k => {
      const d = data.days[k];
      const sum = [];
      if (d.dose && d.peak) sum.push(`pic +${fmtDur(span(d.dose, d.peak))}`);
      if (d.dose && d.zero) sum.push(`total ${fmtDur(span(d.dose, d.zero))}`);
      if (!sum.length) sum.push(STEPS.filter(s => d[s.key]).map(s => s.label).join(', ') || 'vide');
      return `<button class="day fr f-paper" data-day="${k}">
        <div class="day-head"><span>${dateLabel(k)}${k === today ? ' &#9829;' : ''}</span><span>${d.mg != null ? esc(d.mg) + ' mg' : ''}</span></div>
        ${barHTML(d, false)}
        <div class="day-sum">${sum.join(' · ')}</div>
        ${d.note ? `<div class="day-note">${esc(d.note)}</div>` : ''}
      </button>`;
    }).join('');
  }

  function render() {
    if (view === 'today') renderToday(); else renderJournal();
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
      h.style.left = (r.left + 30 + i * 10) + 'px';
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
        if (del.dataset.armed) { delete data.days[k]; save(); closeSheet(); render(); return; }
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
          let n = 0;
          for (const k in inc.days) if (/^\d{4}-\d\d-\d\d$/.test(k)) { data.days[k] = inc.days[k]; n++; }
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
  window.ritaRefresh = () => { data = load(); render(); };
  window.ritaOpenStep = key => { setView('today'); if (BY[key]) openStepSheet(activeKey(), key); };
  window.ritaBack = () => {
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    if (view !== 'today') { setView('today'); return true; }
    return false;
  };

  setInterval(() => { if (view === 'today' && $('#sheet').hidden) renderToday(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.ritaRefresh(); });
  render();
})();
