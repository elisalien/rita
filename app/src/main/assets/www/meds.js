// Other treatments: data.meds = [{id, name, dose, unit, col, mode: 'daily'|'prn', times: ['08:00'], arch}]
// and data.takes['2026-09-28'] = [{t, med, dose, cr?}] (cr = id of the crisis this take belongs to).
window.RitaMeds = function (R) {
  'use strict';
  const { esc, spr } = R;

  const list = all => R.data.meds.filter(m => all || !m.arch);
  const byId = id => R.data.meds.find(m => m.id === id);
  const takesOf = k => R.data.takes[k] || [];
  const todayKey = () => R.keyOf(new Date());
  const doseText = (med, dose) => dose != null && dose !== '' ? `${dose} ${med.unit || ''}`.trim() : '';

  function log(med, k, t, extra) {
    const arr = R.data.takes[k] || (R.data.takes[k] = []);
    const x = Object.assign({ t, med: med.id }, extra || {});
    if (med.dose != null && x.dose == null) x.dose = med.dose;
    arr.push(x);
    arr.sort((a, b) => a.t.localeCompare(b.t));
    R.save();
    return x;
  }

  function unlog(k, x) {
    const arr = takesOf(k);
    const i = arr.indexOf(x);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) delete R.data.takes[k];
    R.save();
  }

  function status(med, k) {
    const taken = takesOf(k).filter(x => x.med === med.id);
    const times = med.times || [];
    if (med.mode === 'prn') {
      const last = taken[taken.length - 1];
      return {
        done: false, taken,
        hint: taken.length ? `si besoin · ${taken.length} fois, dernière ${R.fmtHM(last.t)}` : 'si besoin',
        right: taken.length ? 'x' + taken.length : '',
      };
    }
    const need = Math.max(1, times.length);
    const done = taken.length >= need;
    let hint;
    if (done) hint = 'pris à ' + taken.map(x => R.fmtHM(x.t)).join(', ');
    else hint = taken.length ? `pris ${taken.length} fois sur ${need}` : 'pas encore pris';
    const next = done ? null : times[taken.length];
    return { done, taken, hint, right: done ? '♥' : next ? R.fmtHM(next) : '' };
  }

  function renderToday(box) {
    const meds = list();
    if (!meds.length) {
      box.innerHTML = '<button class="extra fr f-off" data-manage="1">+ ajouter un autre traitement</button>';
    } else {
      const k = todayKey();
      box.innerHTML = `<div class="sub-head"><span class="ptitle">autres traitements</span><button class="plink" data-manage="1">gérer</button></div>`
        + meds.map(m => {
          const s = status(m, k);
          const dose = doseText(m, m.dose);
          return `<button class="med fr ${s.done ? 'f-med' + m.col : 'f-off'}${m.mode === 'prn' ? ' prn' : ''}" data-med="${m.id}">
            ${spr('caps' + m.col, 2)}
            <span class="txt"><span class="label">${esc(m.name)}${dose ? ` <small>${esc(dose)}</small>` : ''}</span><span class="hint">${esc(s.hint)}</span></span>
            <span class="time">${esc(s.right)}</span>
          </button>`;
        }).join('');
    }
    box.onclick = e => {
      if (e.target.closest('[data-manage]')) { openManage(); return; }
      const b = e.target.closest('.med');
      if (!b) return;
      const med = byId(b.dataset.med);
      const k = todayKey();
      if (med.mode !== 'prn' && status(med, k).done) { R.openDaySheet(k); return; }
      const x = log(med, k, R.nowHM());
      R.render();
      const el = document.querySelector(`.med[data-med="${med.id}"]`);
      if (el) R.hearts(el);
      R.toast(`${esc(med.name)} noté à ${R.fmtHM(x.t)} &#9829;`, () => { unlog(k, x); R.render(); });
    };
  }

  function openManage() {
    const meds = list(true);
    const row = m => `<button class="med fr ${m.arch ? 'f-off' : 'f-med' + m.col}" data-edit="${m.id}">
        ${spr('caps' + m.col, 2)}
        <span class="txt"><span class="label">${esc(m.name)}</span><span class="hint">${m.arch ? 'archivé' : m.mode === 'prn' ? 'si besoin' : (m.times || []).length ? 'tous les jours · ' + m.times.map(R.fmtHM).join(', ') : 'tous les jours'}</span></span>
        <span class="time">${esc(doseText(m, m.dose))}</span></button>`;
    R.openSheet(`
      <div class="sh-title">${spr('caps0', 2)}<span>Mes traitements</span></div>
      <div class="sh-sub">En plus de la Ritaline. Un tap sur un traitement dans l'onglet rita note la prise.</div>
      <div class="med-list">${meds.filter(m => !m.arch).map(row).join('') || '<div class="empty">Aucun pour l\'instant.</div>'}</div>
      ${meds.some(m => m.arch) ? `<div class="ptitle">archivés</div><div class="med-list">${meds.filter(m => m.arch).map(row).join('')}</div>` : ''}
      <div class="sh-row">
        <button id="sh-cancel" class="btn fr f-off">fermer</button>
        <button id="sh-new" class="btn fr f-peak">+ nouveau</button>
      </div>`, box => {
      box.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => openEdit(byId(b.dataset.edit)); });
      box.querySelector('#sh-cancel').onclick = () => { R.closeSheet(); R.render(); };
      box.querySelector('#sh-new').onclick = () => openEdit(null);
    });
  }

  function hasTakes(id) {
    return Object.values(R.data.takes).some(arr => arr.some(x => x.med === id));
  }

  function openEdit(med) {
    const used = new Set(list().map(m => m.col));
    const sel = med ? { ...med, times: [...(med.times || [])] }
      : { name: '', dose: null, unit: 'mg', col: [0, 1, 2, 3, 4, 5].find(c => !used.has(c)) ?? 0, mode: 'daily', times: [] };
    const timesHTML = () => [0, 1, 2].map(i =>
      `<input class="field small" type="time" data-time="${i}" value="${sel.times[i] || ''}">`).join('');
    R.openSheet(`
      <div class="sh-title">${spr('caps' + sel.col, 2)}<span>${med ? 'Modifier' : 'Nouveau traitement'}</span></div>
      <input id="md-name" class="field" type="text" maxlength="28" placeholder="nom" value="${esc(sel.name)}">
      <div class="ed-row"><span class="lbl">dose</span>
        <input id="md-dose" class="field small" type="number" inputmode="decimal" min="0" step="any" placeholder="?" value="${sel.dose ?? ''}">
        <input id="md-unit" class="field small unit" type="text" maxlength="8" value="${esc(sel.unit || '')}"></div>
      <div class="ptitle">couleur</div>
      <div class="pick-row" id="md-col">${[0, 1, 2, 3, 4, 5].map(c =>
        `<button class="mood-btn small fr ${sel.col === c ? 'f-med' + c : 'f-off'}" data-col="${c}">${spr('caps' + c, 2)}</button>`).join('')}</div>
      <div class="ptitle">quand</div>
      <div class="chips" id="md-mode">
        <button class="chip fr" data-mode="daily">tous les jours</button>
        <button class="chip fr" data-mode="prn">si besoin</button>
      </div>
      <div id="md-times-box"><div class="sh-sub tight">heures prévues (facultatif)</div><div class="times-row" id="md-times">${timesHTML()}</div></div>
      <div class="sh-row">
        ${med ? `<button id="md-arch" class="btn fr f-off">${med.arch ? 'réactiver' : 'archiver'}</button>` : ''}
        ${med && !hasTakes(med.id) ? '<button id="md-del" class="btn fr f-off danger">supprimer</button>' : ''}
      </div>
      <div class="sh-row">
        <button id="sh-cancel" class="btn fr f-off">annuler</button>
        <button id="sh-ok" class="btn fr f-peak">ok &#9829;</button>
      </div>`, box => {
      const paintMode = () => {
        box.querySelectorAll('[data-mode]').forEach(b => {
          b.classList.toggle('f-zero', b.dataset.mode === sel.mode);
          b.classList.toggle('f-off', b.dataset.mode !== sel.mode);
        });
        box.querySelector('#md-times-box').hidden = sel.mode === 'prn';
      };
      paintMode();
      box.querySelector('#md-mode').onclick = e => {
        const b = e.target.closest('[data-mode]');
        if (b) { sel.mode = b.dataset.mode; paintMode(); }
      };
      box.querySelector('#md-col').onclick = e => {
        const b = e.target.closest('[data-col]');
        if (!b) return;
        sel.col = +b.dataset.col;
        box.querySelectorAll('[data-col]').forEach(o => {
          const c = +o.dataset.col;
          o.className = `mood-btn small fr ${c === sel.col ? 'f-med' + c : 'f-off'}`;
        });
        box.querySelector('.sh-title img').src = R.spriteURL('caps' + sel.col);
      };
      box.querySelector('#sh-cancel').onclick = openManage;
      const arch = box.querySelector('#md-arch');
      if (arch) arch.onclick = () => { med.arch = !med.arch; if (!med.arch) delete med.arch; R.save(); openManage(); };
      const del = box.querySelector('#md-del');
      if (del) del.onclick = () => {
        if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'sûr ?'; return; }
        R.data.meds = R.data.meds.filter(m => m.id !== med.id);
        R.save(); openManage();
      };
      box.querySelector('#sh-ok').onclick = () => {
        const name = box.querySelector('#md-name').value.trim();
        if (!name) { box.querySelector('#md-name').focus(); return; }
        const dv = box.querySelector('#md-dose').value.trim();
        const out = med || { id: 'm' + R.uid() };
        out.name = name;
        if (dv !== '' && !isNaN(+dv)) out.dose = +dv; else delete out.dose;
        out.unit = box.querySelector('#md-unit').value.trim();
        out.col = sel.col;
        out.mode = sel.mode;
        const times = sel.mode === 'prn' ? [] : [...box.querySelectorAll('[data-time]')].map(i => i.value).filter(Boolean).sort();
        if (times.length) out.times = times; else delete out.times;
        if (!med) R.data.meds.push(out);
        R.save(); openManage();
      };
    });
  }

  return { list, byId, takesOf, log, unlog, status, renderToday, openManage, doseText };
};
