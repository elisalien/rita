// Anxiety attacks: data.crises['2026-09-28'] = [{id, t, end, i (1..5), sym: [], why: [], help: [], n}].
// `why` shares its keys with the context chips; `help` may hold 'med:<id>', which also logs a take (cr = crisis id).
window.RitaCrises = function (R) {
  'use strict';
  const { esc, spr } = R;

  const SYMPTOMS = [
    ['coeur', 'coeur qui bat'], ['souffle', 'souffle court'], ['tremble', 'tremblements'], ['vertige', 'vertiges'],
    ['nausee', 'nausée'], ['oppress', 'oppression'], ['pensees', 'pensées qui tournent'], ['irreel', 'irréel'],
    ['chaud', 'chaud/froid'], ['pleurs', 'pleurs'],
  ];
  const HELPS = [
    ['respirer', 'respirer'], ['marcher', 'marcher'], ['eau', 'eau froide'], ['parler', 'parler à quelqu\'un'],
    ['isoler', 'm\'isoler'], ['musique', 'musique'], ['dormir', 'dormir'],
  ];
  const INTENSITY = ['', 'légère', 'moyenne', 'forte', 'très forte', 'énorme'];
  const OPEN_MAX = 180; // a crisis without an end older than 3 h is no longer "en cours"

  const symLabel = k => (SYMPTOMS.find(s => s[0] === k) || [k, k])[1];
  const whyLabel = k => k === 'rien' ? 'rien de précis' : R.tagLabel(k);
  function helpLabel(k) {
    if (k.startsWith('med:')) { const m = R.Meds.byId(k.slice(4)); return m ? m.name : 'traitement'; }
    return (HELPS.find(s => s[0] === k) || [k, k])[1];
  }
  const helpList = () => [...HELPS, ...R.Meds.list().map(m => ['med:' + m.id, m.name])];
  const whyList = () => [...R.tagList(), ['rien', 'rien de précis']];

  const crisesOf = k => R.data.crises[k] || [];
  function find(id) {
    for (const k in R.data.crises) {
      const c = crisesOf(k).find(x => x.id === id);
      if (c) return { k, c };
    }
    return null;
  }

  /** The crisis still running (no end, started less than 3 h ago), today or just before midnight. */
  function openCrisis() {
    const today = R.keyOf(new Date());
    for (const k of [today, R.shiftKey(today, -1)]) {
      const arr = crisesOf(k);
      const last = arr[arr.length - 1];
      if (!last || last.end) continue;
      const elapsed = k === today ? R.toMin(R.nowHM()) - R.toMin(last.t) : 1440 - R.toMin(last.t) + R.toMin(R.nowHM());
      if (elapsed >= 0 && elapsed <= OPEN_MAX) return { k, c: last, elapsed };
    }
    return null;
  }

  function start() {
    if (openCrisis()) { R.render(); return; }
    const k = R.keyOf(new Date());
    const c = { id: 'c' + R.uid(), t: R.nowHM() };
    (R.data.crises[k] || (R.data.crises[k] = [])).push(c);
    R.save();
    R.render();
    R.toast(`Crise notée à ${R.fmtHM(c.t)}. Ça va passer &#9829;`, () => { remove(k, c.id); R.render(); });
  }

  function remove(k, id) {
    const arr = crisesOf(k).filter(c => c.id !== id);
    if (arr.length) R.data.crises[k] = arr; else delete R.data.crises[k];
    const takes = (R.data.takes[k] || []).filter(x => x.cr !== id);
    if (takes.length) R.data.takes[k] = takes; else delete R.data.takes[k];
    R.save();
  }

  /** Where the crisis falls in the Ritalin day, in words. */
  function contextLine(k, c) {
    const bits = [];
    const d = R.day(k);
    const p = R.phaseOf(d, c.t);
    if (p != null) {
      const since = R.span(d.dose, c.t);
      bits.push(R.PHASE_WORDS[p] + (p > 0 && since != null && since < 20 * 60 ? ` (${R.fmtDur(since)} après la prise)` : ''));
    } else bits.push('sans ritaline notée ce jour-là');
    const md = R.moodDayAvg(k);
    if (md.m != null) bits.push('humeur du jour : ' + R.MOOD_WORDS[Math.round(md.m)]);
    return bits.join(' · ');
  }

  function renderPanel(box) {
    const open = openCrisis();
    const k = R.keyOf(new Date());
    if (open) {
      const c = open.c;
      box.innerHTML = `<div class="panel fr f-crise crisis-live">
        <div class="sub-head"><span class="ptitle">crise en cours · ${R.fmtDur(open.elapsed)}</span>${spr('bolt', 2)}</div>
        <div class="soft-line">Ça va passer. C'est fort comment ?</div>
        <div class="pick-row">${[1, 2, 3, 4, 5].map(v =>
          `<button class="mood-btn fr ${c.i === v ? 'f-anx' : 'f-off'}" data-anx="${v}" aria-label="${INTENSITY[v]}">${spr('anx' + v, 3)}</button>`).join('')}</div>
        <div class="sh-row">
          <button class="btn fr f-crise" data-breathe="1">respirer</button>
          <button class="btn fr f-off" data-end="1">c'est passé</button>
        </div>
      </div>`;
    } else {
      const today = crisesOf(k);
      box.innerHTML = `<button class="crisis-btn fr f-off" data-start="1">${spr('bolt', 3)}
          <span class="txt"><span class="label">crise d'angoisse</span><span class="hint">un tap note le début</span></span></button>`
        + today.map(c => `<button class="crisis-item fr f-off" data-open="${c.id}">${spr('anx' + (c.i || 3), 2)}
          <span class="w">${R.fmtHM(c.t)}${c.end ? ' · ' + R.fmtDur(R.span(c.t, c.end)) : ''}${c.i ? ' · ' + INTENSITY[c.i] : ''}${
            (c.why || []).length ? ' · ' + esc(c.why.map(whyLabel).join(', ')) : ' · + détails'}</span></button>`).join('');
    }
    box.onclick = e => {
      if (e.target.closest('[data-start]')) { start(); return; }
      const anx = e.target.closest('[data-anx]');
      if (anx && open) { open.c.i = +anx.dataset.anx; R.save(); R.render(); return; }
      if (e.target.closest('[data-breathe]')) { startBreathing(); return; }
      if (e.target.closest('[data-end]') && open) {
        open.c.end = R.nowHM();
        R.save(); R.render();
        openSheet(open.k, open.c.id);
        return;
      }
      const item = e.target.closest('[data-open]');
      if (item) openSheet(k, item.dataset.open);
    };
  }

  function openSheet(k, id) {
    const f = find(id);
    if (!f) return;
    k = f.k;
    const c = f.c;
    const sel = { i: c.i, sym: [...(c.sym || [])], why: [...(c.why || [])], help: [...(c.help || [])] };
    R.openSheet(`
      <div class="sh-title">${spr('bolt', 2)}<span>Crise</span></div>
      <div class="sh-sub">${R.dateLabel(k)} · ${esc(contextLine(k, c))}</div>
      <div class="ed-row"><span class="lbl">début</span><input id="cr-t" class="field small" type="time" value="${c.t}"></div>
      <div class="ed-row"><span class="lbl">fin</span><input id="cr-end" class="field small" type="time" value="${c.end || ''}"><button class="x" id="cr-now">là</button></div>
      <div class="ptitle">intensité <span id="cr-iw" class="soft">${sel.i ? INTENSITY[sel.i] : ''}</span></div>
      <div class="pick-row" id="cr-i">${[1, 2, 3, 4, 5].map(v =>
        `<button class="mood-btn small fr ${sel.i === v ? 'f-anx' : 'f-off'}" data-v="${v}">${spr('anx' + v, 2)}</button>`).join('')}</div>
      <div class="ptitle">symptômes</div><div class="chips" id="cr-sym"></div>
      <div class="ptitle">raisons possibles</div><div class="chips" id="cr-why"></div>
      <div class="ptitle">ce qui a aidé</div><div class="chips" id="cr-help"></div>
      <input id="cr-note" class="field small" type="text" maxlength="160" placeholder="un mot sur ce moment…" value="${esc(c.n || '')}">
      <div class="sh-row">
        <button id="sh-del" class="btn fr f-off danger">supprimer</button>
        <button id="sh-cancel" class="btn fr f-off">annuler</button>
        <button id="sh-ok" class="btn fr f-crise">ok &#9829;</button>
      </div>`, box => {
      box.querySelector('#cr-i').onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        const v = +b.dataset.v;
        sel.i = sel.i === v ? null : v;
        box.querySelectorAll('#cr-i [data-v]').forEach(o => {
          o.classList.toggle('f-anx', +o.dataset.v === sel.i);
          o.classList.toggle('f-off', +o.dataset.v !== sel.i);
        });
        box.querySelector('#cr-iw').textContent = sel.i ? INTENSITY[sel.i] : '';
      };
      box.querySelector('#cr-now').onclick = () => { box.querySelector('#cr-end').value = R.nowHM(); };
      R.chipBox(box.querySelector('#cr-sym'), sel, { field: 'sym', list: () => SYMPTOMS, label: symLabel, addable: false, cls: 'f-anx' });
      R.chipBox(box.querySelector('#cr-why'), sel, { field: 'why', list: whyList, label: whyLabel, cls: 'f-crise' });
      R.chipBox(box.querySelector('#cr-help'), sel, { field: 'help', list: helpList, label: helpLabel, addable: false, cls: 'f-peak' });
      box.querySelector('#sh-cancel').onclick = () => { R.closeSheet(); R.render(); };
      const del = box.querySelector('#sh-del');
      del.onclick = () => {
        if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'sûr ?'; return; }
        remove(k, c.id); R.closeSheet(); R.render();
      };
      box.querySelector('#sh-ok').onclick = () => {
        c.t = box.querySelector('#cr-t').value || c.t;
        const end = box.querySelector('#cr-end').value;
        if (end) c.end = end; else delete c.end;
        for (const f of ['i', 'sym', 'why', 'help']) {
          const v = sel[f];
          if (v == null || (Array.isArray(v) && !v.length)) delete c[f]; else c[f] = v;
        }
        const n = box.querySelector('#cr-note').value.trim();
        if (n) c.n = n; else delete c.n;
        crisesOf(k).sort((a, b) => a.t.localeCompare(b.t));
        syncTakes(k, c);
        R.save(); R.closeSheet(); R.render();
      };
    });
  }

  /** Keeps one take per treatment ticked in "ce qui a aidé", at the crisis time. */
  function syncTakes(k, c) {
    const want = (c.help || []).filter(h => h.startsWith('med:')).map(h => h.slice(4));
    let takes = (R.data.takes[k] || []).filter(x => x.cr !== c.id || want.includes(x.med));
    for (const id of want) {
      const med = R.Meds.byId(id);
      if (!med) continue;
      const x = takes.find(t => t.cr === c.id && t.med === id);
      if (x) continue;
      const nx = { t: c.t, med: id, cr: c.id };
      if (med.dose != null) nx.dose = med.dose;
      takes.push(nx);
    }
    takes.sort((a, b) => a.t.localeCompare(b.t));
    if (takes.length) R.data.takes[k] = takes; else delete R.data.takes[k];
  }

  // ---------- breathing: 5 s in, 5 s out (cohérence cardiaque) ----------
  let breathTimer = null;
  function startBreathing() {
    const el = document.getElementById('breath');
    el.innerHTML = `<div class="breath-sky"></div>
      <img class="breath-cloud" alt="" src="${R.spriteURL('cloud')}">
      <div class="breath-word">inspire…</div>
      <div class="breath-count"></div>
      <button class="btn fr f-wood breath-stop">ça va mieux</button>`;
    el.hidden = false;
    const t0 = Date.now();
    const word = el.querySelector('.breath-word'), count = el.querySelector('.breath-count');
    const tick = () => {
      const s = (Date.now() - t0) / 1000;
      word.textContent = (Math.floor(s / 5) % 2) ? 'expire…' : 'inspire…';
      const n = Math.floor(s / 10);
      count.textContent = n ? `${n} respiration${n > 1 ? 's' : ''}` : '';
    };
    tick();
    breathTimer = setInterval(tick, 250);
    el.querySelector('.breath-stop').onclick = stopBreathing;
  }
  function stopBreathing() {
    clearInterval(breathTimer);
    const el = document.getElementById('breath');
    el.hidden = true;
    el.innerHTML = '';
    R.render();
  }
  const breathing = () => !document.getElementById('breath').hidden;

  return {
    SYMPTOMS, HELPS, INTENSITY, symLabel, whyLabel, helpLabel, crisesOf, openCrisis,
    start, renderPanel, openSheet, startBreathing, stopBreathing, breathing,
  };
};
