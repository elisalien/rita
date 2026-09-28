// Pixel-art charts: drawn on a low-resolution canvas (1 unit = 2 CSS px) and scaled up without smoothing.
// Every chart registers "hit" points; a tap shows the nearest one in words under the chart.
(function () {
  'use strict';

  const INK = '#6b4f5c', INK2 = '#a58c98', GRID = '#efe3d3', PAPER = '#fffaf0';
  const MOOD = '#e0668c', ENERGY = '#d99a1e';
  const MOOD_L = '#f7c3d3', ENERGY_L = '#f3d99c';
  const ANX = ['', '#b9a4e6', '#f0a0b8', '#f07f98', '#e0607c', '#c03e5c'];
  const RITA_BG = '#fde3ec';

  const spriteCanvas = {};
  function sprite(name) {
    if (spriteCanvas[name]) return spriteCanvas[name];
    const s = window.SPRITES[name];
    const c = document.createElement('canvas');
    c.width = s.rows[0].length; c.height = s.rows.length;
    const g = c.getContext('2d');
    s.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = s.palette[ch];
      g.fillRect(x, y, 1, 1);
    }));
    return (spriteCanvas[name] = c);
  }

  function mount(el, h, draw, hint) {
    const w = Math.max(120, Math.floor(el.clientWidth / 2));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.className = 'chart';
    c.style.width = (w * 2) + 'px';
    c.style.height = (h * 2) + 'px';
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.font = '8px RitaPixel';
    g.textBaseline = 'alphabetic';
    const hits = [];
    draw(g, w, h, (x, y, text) => hits.push({ x, y, text }));
    el.innerHTML = '';
    el.appendChild(c);
    if (!hits.length) return;
    const cap = document.createElement('div');
    cap.className = 'chart-cap';
    cap.textContent = hint || 'touche pour voir le détail';
    el.appendChild(cap);
    let mark = null;
    c.onclick = e => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * w, y = (e.clientY - r.top) / r.height * h;
      let best = null, bd = Infinity;
      for (const p of hits) {
        const d = Math.abs(p.x - x) * 1.5 + Math.abs(p.y - y) * 0.5;
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) return;
      cap.textContent = best.text;
      cap.classList.add('on');
      if (mark) mark.remove();
      mark = document.createElement('i');
      mark.className = 'chart-mark';
      mark.style.left = (best.x / w * 100) + '%';
      el.insertBefore(mark, cap);
    };
  }

  const rect = (g, x, y, w, h, color) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  function text(g, s, x, y, color, align) {
    g.fillStyle = color || INK;
    const w = g.measureText(s).width;
    const ox = align === 'center' ? -Math.floor((w - 1) / 2) : align === 'right' ? -Math.round(w - 1) : 0;
    g.fillText(s, Math.round(x + ox), Math.round(y));
  }

  function line(g, x0, y0, x1, y1, color, dash) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    g.fillStyle = color;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    for (;;) {
      if (!dash || (n++ % 4) < 2) g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Two-pixel-thick line, for the main series. */
  function thick(g, x0, y0, x1, y1, color) {
    line(g, x0, y0, x1, y1, color);
    line(g, x0, y0 + 1, x1, y1 + 1, color);
  }

  function dot(g, x, y, color, big) {
    x = Math.round(x); y = Math.round(y);
    if (big) {
      rect(g, x - 2, y - 3, 5, 7, PAPER);
      rect(g, x - 3, y - 2, 7, 5, PAPER);
      rect(g, x - 2, y - 2, 5, 5, color);
      return;
    }
    rect(g, x - 1, y - 2, 3, 5, PAPER);
    rect(g, x - 2, y - 1, 5, 3, PAPER);
    rect(g, x - 1, y - 1, 3, 3, color);
  }
  const pip = (g, x, y, color) => rect(g, Math.round(x) - 1, Math.round(y) - 1, 2, 2, color);

  const fmtH = m => m < 60 ? m + 'min' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  const fmtD = m => m == null ? '?' : m < 60 ? m + ' min' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  const fmt1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');

  /** Pale Ritalin effect shape (0..1) at minute m of the clock, from average dose time and phases. */
  function ritaLevel(r, m) {
    if (!r || r.dose == null || r.rise == null || r.plateau == null || r.fall == null) return 0;
    const t = m - r.dose;
    if (t < 0) return 0;
    if (t <= r.rise) return t / r.rise;
    if (t <= r.rise + r.plateau) return 1;
    if (t <= r.rise + r.plateau + r.fall) return 1 - (t - r.rise - r.plateau) / r.fall;
    return 0;
  }
  function ritaBackdrop(g, x, top, bottom, left, right, T0, T1, rita) {
    if (!rita) return;
    for (let xx = Math.ceil(left); xx <= right; xx++) {
      const m = T0 + (xx - left) / (right - left) * (T1 - T0);
      const v = ritaLevel(rita, m);
      if (v <= 0) continue;
      const yy = Math.round(bottom - v * (bottom - top) * 0.9);
      rect(g, xx, yy, 1, bottom - yy, RITA_BG);
    }
  }

  // ---- effect duration per day: stacked bars (rise / plateau / fall) ----
  function durations(el, days, colors) {
    // days: [{label, long, rise, plateau, fall, total}] oldest first
    mount(el, 120, (g, w, h, hit) => {
      const left = 18, top = 12, bottom = h - 12, right = w - 2;
      const max = Math.max(60, ...days.map(d => d.total || (d.rise || 0) + (d.plateau || 0) + (d.fall || 0)));
      const hours = Math.ceil(max / 60);
      const y = m => bottom - (m / (hours * 60)) * (bottom - top);
      for (let t = 0; t <= hours; t++) {
        const yy = Math.round(y(t * 60));
        rect(g, left, yy, right - left, 1, GRID);
        text(g, t + 'h', left - 3, yy + 3, INK2, 'right');
      }
      const slot = (right - left) / Math.max(days.length, 1);
      const bw = Math.max(2, Math.min(16, Math.floor(slot) - 3));
      const every = Math.ceil(28 / slot);
      days.forEach((d, i) => {
        const x = Math.round(left + i * slot + (slot - bw) / 2);
        let acc = 0;
        [['rise', colors[0]], ['plateau', colors[1]], ['fall', colors[2]]].forEach(([k, col]) => {
          if (d[k] == null) return;
          const y0 = y(acc), y1 = y(acc + d[k]);
          rect(g, x, y1, bw, y0 - y1, col[1]);
          rect(g, x, y1, bw, 1, col[0]);
          acc += d[k];
        });
        const tot = d.total != null ? d.total : acc;
        if (slot >= 26 && tot) text(g, fmtH(tot), x + bw / 2, y(acc) - 3, INK, 'center');
        if ((days.length - 1 - i) % every === 0) text(g, d.label, x + bw / 2, h - 2, INK2, 'center');
        const parts = [d.rise != null && 'montée ' + fmtD(d.rise), d.plateau != null && 'plateau ' + fmtD(d.plateau), d.fall != null && 'descente ' + fmtD(d.fall)].filter(Boolean);
        hit(x + bw / 2, y(acc), `${d.long} : ${d.total != null ? 'total ' + fmtD(d.total) : 'journée pas bouclée'}${parts.length ? ' (' + parts.join(', ') + ')' : ''}`);
      });
      const totals = days.map(d => d.total).filter(v => v != null);
      if (totals.length > 1) {
        const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
        line(g, left, y(avg), right, y(avg), MOOD, true);
        text(g, 'moy ' + fmtH(avg), left + 2, y(avg) - 3, MOOD, 'left');
      }
    });
  }

  // ---- typical effect curve from averages ----
  function curve(el, st, colors) {
    mount(el, 92, (g, w, h, hit) => {
      const left = 4, right = w - 6, top = 22, bottom = h - 12;
      const total = st.rise + st.plateau + st.fall;
      const span = Math.ceil(total / 60) * 60 + 30;
      const x = m => left + (m / span) * (right - left);
      const yOf = m => {
        if (m <= st.rise) return m / st.rise;
        if (m <= st.rise + st.plateau) return 1;
        if (m <= total) return 1 - (m - st.rise - st.plateau) / st.fall;
        return 0;
      };
      for (let t = 0; t * 60 <= span; t++) {
        const xx = Math.round(x(t * 60));
        rect(g, xx, top - 4, 1, bottom - top + 5, GRID);
        if (t > 0) text(g, '+' + t + 'h', xx, h - 2, INK2, 'center');
      }
      rect(g, left, bottom + 1, right - left, 1, INK2);
      let prev = null;
      for (let xx = Math.ceil(x(0)); xx <= Math.floor(x(total)); xx++) {
        const m = (xx - left) / (right - left) * span;
        const v = yOf(m);
        const yy = Math.round(bottom - v * (bottom - top));
        const col = m < st.rise ? colors[0] : m < st.rise + st.plateau ? colors[1] : colors[2];
        rect(g, xx, yy, 1, bottom - yy + 1, col[1]);
        if (prev != null) line(g, xx - 1, prev, xx, yy, col[0]);
        prev = yy;
      }
      const pin = (name, m, label) => {
        g.drawImage(sprite(name), Math.round(x(m) - 8), Math.round(bottom - yOf(m) * (bottom - top) - 17));
        hit(x(m), bottom - yOf(m) * (bottom - top), label);
      };
      pin('pill', 0, 'prise');
      pin('star', st.rise, `pic : ${fmtD(st.rise)} après la prise`);
      pin('leaf', st.rise + st.plateau, `chute : ${fmtD(st.rise + st.plateau)} après la prise`);
      pin('moon', total, `zéro : ${fmtD(total)} après la prise`);
    });
  }

  // ---- mood & energy through one day, over the Rita phases and crises ----
  function dayMood(el, entries, bands, nowMin, crises) {
    // entries: [{min, m, e}] ; bands: [{from, to, color}] ; crises: [{from, to, i}] in minutes since midnight
    mount(el, 84, (g, w, h) => {
      const left = 4, right = w - 4, top = 6, bottom = h - 12;
      const T0 = 6 * 60, T1 = 24 * 60;
      const x = m => left + (Math.max(T0, Math.min(T1, m)) - T0) / (T1 - T0) * (right - left);
      const y = v => bottom - (v - 1) / 4 * (bottom - top);
      bands.forEach(b => rect(g, x(b.from), top - 2, Math.max(1, x(b.to) - x(b.from)), bottom - top + 4, b.color));
      for (let v = 1; v <= 5; v++) rect(g, left, Math.round(y(v)), right - left, 1, v === 3 ? '#e2d3c2' : GRID);
      (crises || []).forEach(c => {
        const x0 = x(c.from), x1 = x(c.to != null ? c.to : Math.min(nowMin, c.from + 30));
        rect(g, x0, top - 2, Math.max(2, x1 - x0), bottom - top + 4, 'rgba(154,132,201,.25)');
        rect(g, x0, bottom + 2, Math.max(2, x1 - x0), 2, ANX[c.i || 3]);
      });
      for (let t = 6; t < 24; t += 3) text(g, t + 'h', x(t * 60), h - 2, INK2, t === 6 ? 'left' : 'center');
      if (nowMin != null) line(g, x(nowMin), top - 2, x(nowMin), bottom + 2, '#ffb8cb', true);
      [['e', ENERGY], ['m', MOOD]].forEach(([k, col]) => {
        const pts = entries.filter(p => p[k] != null);
        for (let i = 1; i < pts.length; i++) line(g, x(pts[i - 1].min), y(pts[i - 1][k]), x(pts[i].min), y(pts[i][k]), col);
        pts.forEach(p => dot(g, x(p.min), y(p[k]), col));
      });
    });
  }

  /** Moving average over `win` points, skipping missing values. */
  function smooth(vals, win) {
    return vals.map((_, i) => {
      const a = vals.slice(Math.max(0, i - win + 1), i + 1).filter(v => v != null);
      return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    });
  }

  // ---- mood & energy day by day: pale daily dots + smoothed trend ----
  function moodTrend(el, days, words) {
    // days: [{label, long, m, e, crises}] oldest first, one per calendar day (values may be null)
    mount(el, 120, (g, w, h, hit) => {
      const left = 20, right = w - 6, top = 10, bottom = h - 16;
      const y = v => bottom - (v - 1) / 4 * (bottom - top);
      for (let v = 1; v <= 5; v++) {
        rect(g, left, Math.round(y(v)), right - left, 1, v === 3 ? '#e2d3c2' : GRID);
        g.drawImage(sprite('mood' + v), 0, Math.round(y(v) - 8));
      }
      const n = days.length;
      const x = i => n < 2 ? (left + right) / 2 : left + 4 + i * (right - left - 8) / (n - 1);
      const win = n <= 10 ? 1 : n <= 31 ? 3 : 7;
      const every = n < 2 ? 1 : Math.max(1, Math.ceil(30 / ((right - left - 8) / (n - 1))));
      days.forEach((d, i) => {
        if ((n - 1 - i) % every === 0) text(g, d.label, i === n - 1 && n > 1 ? right : x(i), h - 3, INK2, i === n - 1 && n > 1 ? 'right' : 'center');
        if (d.crises) rect(g, x(i) - 1, 2, 3, 3, '#9a84c9');
      });
      [['e', ENERGY, ENERGY_L], ['m', MOOD, MOOD_L]].forEach(([k, col, pale]) => {
        const raw = days.map(d => d[k]);
        if (win > 1) raw.forEach((v, i) => { if (v != null) pip(g, x(i), y(v), pale); });
        const sm = smooth(raw, win);
        let prev = null;
        sm.forEach((v, i) => {
          if (v == null || raw.slice(0, i + 1).every(r => r == null)) return;
          if (prev) thick(g, prev[0], prev[1], x(i), y(v), col);
          prev = [x(i), y(v)];
        });
        if (win === 1) raw.forEach((v, i) => { if (v != null) dot(g, x(i), y(v), col); });
      });
      days.forEach((d, i) => {
        const bits = [];
        if (d.m != null) bits.push('humeur ' + words.m[Math.round(d.m)] + ' (' + fmt1(d.m) + ')');
        if (d.e != null) bits.push('énergie ' + fmt1(d.e));
        if (d.crises) bits.push(d.crises + ' crise' + (d.crises > 1 ? 's' : ''));
        hit(x(i), d.m != null ? y(d.m) : bottom, d.long + ' : ' + (bits.join(' · ') || 'rien noté'));
      });
    });
  }

  // ---- mood & energy by hour of day, over the average Ritalin curve ----
  function hourProfile(el, buckets, rita) {
    // buckets: [{from, to, m, e, n}] in minutes ; rita: {dose, rise, plateau, fall} in minutes or null
    mount(el, 110, (g, w, h, hit) => {
      const left = 4, right = w - 4, top = 8, bottom = h - 12;
      const T0 = 6 * 60, T1 = 24 * 60;
      const x = m => left + (m - T0) / (T1 - T0) * (right - left);
      const y = v => bottom - (v - 1) / 4 * (bottom - top);
      ritaBackdrop(g, x, top, bottom, left, right, T0, T1, rita);
      for (let v = 1; v <= 5; v++) rect(g, left, Math.round(y(v)), right - left, 1, v === 3 ? '#e2d3c2' : GRID);
      for (let t = 6; t < 24; t += 3) text(g, t + 'h', x(t * 60), h - 2, INK2, t === 6 ? 'left' : 'center');
      [['e', ENERGY], ['m', MOOD]].forEach(([k, col]) => {
        let prev = null;
        buckets.forEach(b => {
          if (b[k] == null) { prev = null; return; }
          const xx = x((b.from + b.to) / 2), yy = y(b[k]);
          if (prev) thick(g, prev[0], prev[1], xx, yy, col);
          prev = [xx, yy];
        });
        buckets.forEach(b => { if (b[k] != null) dot(g, x((b.from + b.to) / 2), y(b[k]), col, true); });
      });
      buckets.forEach(b => {
        if (!b.n) return;
        hit(x((b.from + b.to) / 2), y(b.m != null ? b.m : 3),
          `${b.from / 60}h-${b.to / 60}h : ${b.m != null ? 'humeur ' + fmt1(b.m) : ''}${b.e != null ? ' · énergie ' + fmt1(b.e) : ''} (${b.n} fois)`);
      });
    });
  }

  // ---- crises by hour and intensity ----
  function crisisScatter(el, pts, rita) {
    // pts: [{min, i, text}] ; rita as in hourProfile
    mount(el, 110, (g, w, h, hit) => {
      const left = 20, right = w - 4, top = 8, bottom = h - 12;
      const T0 = 0, T1 = 24 * 60;
      const x = m => left + (m - T0) / (T1 - T0) * (right - left);
      const y = v => bottom - (v - 1) / 4 * (bottom - top);
      ritaBackdrop(g, x, top, bottom, left, right, T0, T1, rita);
      for (let v = 1; v <= 5; v++) {
        rect(g, left, Math.round(y(v)), right - left, 1, GRID);
        g.drawImage(sprite('anx' + v), 0, Math.round(y(v) - 8));
      }
      for (let t = 0; t <= 24; t += 6) text(g, t + 'h', x(t * 60), h - 2, INK2, t === 0 ? 'left' : t === 24 ? 'right' : 'center');
      const seen = {};
      pts.forEach(p => {
        const iv = p.i || 3;
        const key = Math.round(x(p.min) / 4) + ':' + iv;
        const off = (seen[key] = (seen[key] || 0) + 1) - 1;
        const xx = x(p.min) + (off % 2 ? 1 : -1) * Math.ceil(off / 2) * 4;
        dot(g, xx, y(iv), ANX[iv], true);
        hit(xx, y(iv), p.text);
      });
    });
  }

  window.RitaCharts = { durations, curve, dayMood, moodTrend, hourProfile, crisisScatter, MOOD, ENERGY, ANX };
})();
