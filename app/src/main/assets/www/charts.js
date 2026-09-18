// Pixel-art charts: drawn on a low-resolution canvas (1 unit = 2 CSS px) and scaled up without smoothing.
(function () {
  'use strict';

  const INK = '#6b4f5c', INK2 = '#a58c98', GRID = '#efe3d3', PAPER = '#fffaf0';
  const MOOD = '#e0668c', ENERGY = '#d99a1e';

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

  function mount(el, h, draw) {
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
    draw(g, w, h);
    el.innerHTML = '';
    el.appendChild(c);
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
    if (![x0, y0, x1, y1].every(Number.isFinite)) { console.warn('chart line skipped', x0, y0, x1, y1); return; }
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

  function dot(g, x, y, color) {
    x = Math.round(x); y = Math.round(y);
    rect(g, x - 1, y - 2, 3, 5, PAPER);
    rect(g, x - 2, y - 1, 5, 3, PAPER);
    rect(g, x - 1, y - 1, 3, 3, color);
  }

  const fmtH = m => m < 60 ? m + 'min' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');

  // ---- 1. effect duration per day: stacked bars (rise / plateau / fall) ----
  function durations(el, days, colors) {
    // days: [{label, rise, plateau, fall, total}] oldest first
    mount(el, 96, (g, w, h) => {
      const left = 18, top = 6, bottom = h - 12, right = w - 2;
      const max = Math.max(60, ...days.map(d => d.total || (d.rise || 0) + (d.plateau || 0) + (d.fall || 0)));
      const hours = Math.ceil(max / 60);
      const y = m => bottom - (m / (hours * 60)) * (bottom - top);
      for (let t = 0; t <= hours; t++) {
        const yy = Math.round(y(t * 60));
        rect(g, left, yy, right - left, 1, GRID);
        text(g, t + 'h', left - 3, yy + 3, INK2, 'right');
      }
      const slot = (right - left) / Math.max(days.length, 1);
      const bw = Math.max(3, Math.min(12, Math.floor(slot) - 3));
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
        if (slot >= 10 || i % 2 === days.length % 2) text(g, d.label, x + bw / 2, h - 2, INK2, 'center');
      });
      const totals = days.map(d => d.total).filter(v => v != null);
      if (totals.length) {
        const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
        line(g, left, y(avg), right, y(avg), MOOD, true);
        text(g, 'moy ' + fmtH(avg), right, y(avg) - 3, MOOD, 'right');
      }
    });
  }

  // ---- 2. typical effect curve from averages ----
  function curve(el, st, colors) {
    mount(el, 92, (g, w, h) => {
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
      const pin = (name, m) => g.drawImage(sprite(name), Math.round(x(m) - 8), Math.round(bottom - yOf(m) * (bottom - top) - 17));
      pin('pill', 0);
      pin('star', st.rise);
      pin('leaf', st.rise + st.plateau);
      pin('moon', total);
    });
  }

  // ---- 3. mood & energy through one day, over the Rita phases ----
  function dayMood(el, entries, bands, nowMin) {
    // entries: [{min, m, e}] ; bands: [{from, to, color}] in minutes since midnight
    mount(el, 84, (g, w, h) => {
      const left = 4, right = w - 4, top = 6, bottom = h - 12;
      const T0 = 6 * 60, T1 = 24 * 60;
      const x = m => left + (Math.max(T0, Math.min(T1, m)) - T0) / (T1 - T0) * (right - left);
      const y = v => bottom - (v - 1) / 4 * (bottom - top);
      bands.forEach(b => rect(g, x(b.from), top - 2, Math.max(1, x(b.to) - x(b.from)), bottom - top + 4, b.color));
      for (let v = 1; v <= 5; v++) rect(g, left, Math.round(y(v)), right - left, 1, v === 3 ? '#e2d3c2' : GRID);
      for (let t = 6; t < 24; t += 3) text(g, t + 'h', x(t * 60), h - 2, INK2, t === 6 ? 'left' : 'center');
      if (nowMin != null) line(g, x(nowMin), top - 2, x(nowMin), bottom + 2, '#ffb8cb', true);
      [['e', ENERGY], ['m', MOOD]].forEach(([k, col]) => {
        const pts = entries.filter(p => p[k] != null);
        for (let i = 1; i < pts.length; i++) line(g, x(pts[i - 1].min), y(pts[i - 1][k]), x(pts[i].min), y(pts[i][k]), col);
        pts.forEach(p => dot(g, x(p.min), y(p[k]), col));
      });
    });
  }

  // ---- 4. mood & energy per day (averages) ----
  function moodDays(el, days) {
    // days: [{label, m, e}] oldest first, values 1..5 or null
    mount(el, 104, (g, w, h) => {
      const left = 20, right = w - 6, top = 10, bottom = h - 14;
      const y = v => bottom - (v - 1) / 4 * (bottom - top);
      for (let v = 1; v <= 5; v++) {
        rect(g, left, Math.round(y(v)), right - left, 1, GRID);
        g.drawImage(sprite('mood' + v), 0, Math.round(y(v) - 8));
      }
      const x = i => days.length < 2 ? (left + right) / 2 : left + 4 + i * (right - left - 8) / (days.length - 1);
      days.forEach((d, i) => {
        if (days.length <= 10 || i % 2 === (days.length - 1) % 2) text(g, d.label, x(i), h - 3, INK2, 'center');
      });
      [['e', ENERGY], ['m', MOOD]].forEach(([k, col]) => {
        let prev = null;
        days.forEach((d, i) => {
          if (d[k] == null) return;
          if (prev) line(g, prev[0], prev[1], x(i), y(d[k]), col);
          prev = [x(i), y(d[k])];
        });
        days.forEach((d, i) => { if (d[k] != null) dot(g, x(i), y(d[k]), col); });
      });
    });
  }

  // ---- 5. average mood & energy per Rita phase ----
  function phases(el, groups) {
    // groups: [{sprite, m, e, n}] (5 phases)
    mount(el, 96, (g, w, h) => {
      const left = 4, right = w - 4, top = 8, bottom = h - 22;
      const slot = (right - left) / groups.length;
      const y = v => bottom - (v / 5) * (bottom - top);
      for (let v = 1; v <= 5; v++) rect(g, left, Math.round(y(v)), right - left, 1, GRID);
      groups.forEach((gr, i) => {
        const cx = left + i * slot + slot / 2;
        const bw = Math.max(3, Math.min(9, Math.floor(slot / 2) - 3));
        [['m', MOOD, -bw - 1], ['e', ENERGY, 1]].forEach(([k, col, dx]) => {
          if (gr[k] == null) { rect(g, cx + dx, bottom - 1, bw, 1, GRID); return; }
          const yy = y(gr[k]);
          rect(g, cx + dx, yy, bw, bottom - yy, col);
          rect(g, cx + dx + 1, yy + 1, 1, Math.max(0, bottom - yy - 2), 'rgba(255,255,255,.45)');
        });
        rect(g, left, bottom, right - left, 1, INK2);
        g.drawImage(sprite(gr.sprite), Math.round(cx - 8), h - 18);
      });
    });
  }

  window.RitaCharts = { durations, curve, dayMood, moodDays, phases, MOOD, ENERGY };
})();
