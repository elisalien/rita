// Fake Rita data for the desktop preview (never shipped in the APK).
// Browser: paste this file in the console on the preview page, then run
//   localStorage.setItem('rita', JSON.stringify(ritaDemo(60))); location.reload();
// Node:  node tools/demo_data.js 60 > demo.json
function ritaDemo(nDays) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const pad = n => String(n).padStart(2, '0');
  const hm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const clamp = v => Math.max(1, Math.min(5, Math.round(v)));
  const data = {
    v: 1, days: {}, moods: {}, takes: {}, crises: {},
    meds: [
      { id: 'mdemo1', name: 'Sertraline', dose: 50, unit: 'mg', col: 0, mode: 'daily', times: ['08:30'] },
      { id: 'mdemo2', name: 'Atarax', dose: 25, unit: 'mg', col: 2, mode: 'prn' },
    ],
    tagsx: [['xdemo', 'transports']],
  };
  const today = new Date();
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const k = key(d);
    const wake = 7 * 60 + rnd() * 90;
    const dose = wake + 20 + rnd() * 40;
    const rise = 40 + rnd() * 40, plateau = 100 + rnd() * 80, fall = 60 + rnd() * 60;
    const tags = [];
    if (rnd() < 0.25) tags.push('sommeil');
    if (rnd() < 0.2) tags.push('travail');
    if (rnd() < 0.12) tags.push('regles');
    const day = { mg: 20 };
    if (i > 0 || new Date().getHours() > 12) Object.assign(day, { wake: hm(wake), dose: hm(dose), peak: hm(dose + rise), drop: hm(dose + rise + plateau), zero: hm(dose + rise + plateau + fall) });
    if (rnd() < 0.08) { delete day.dose; delete day.peak; delete day.drop; delete day.zero; }
    if (tags.length) day.tags = tags;
    data.days[k] = day;
    const base = 3.4 - (tags.includes('sommeil') ? 1 : 0) + (i < nDays / 3 ? 0.4 : 0);
    const moods = [];
    for (const t of [9 * 60 + rnd() * 60, 13 * 60 + rnd() * 90, 17 * 60 + rnd() * 90, 21 * 60 + rnd() * 60]) {
      if (rnd() < 0.3) continue;
      const inDrop = day.drop && t > dose + rise + plateau && t < dose + rise + plateau + fall;
      const x = { t: hm(t), m: clamp(base + (rnd() - 0.5) * 2 - (inDrop ? 0.8 : 0)), e: clamp(base + (rnd() - 0.5) * 2 - (t > 18 * 60 ? 0.7 : 0)) };
      if (rnd() < 0.2) x.tags = [pick(['stress', 'social', 'fatigue', 'xdemo'])];
      moods.push(x);
    }
    if (moods.length) data.moods[k] = moods;
    const takes = [];
    if (rnd() < 0.85) takes.push({ t: hm(8.5 * 60 + rnd() * 40), med: 'mdemo1', dose: 50 });
    if (day.drop && rnd() < 0.18) {
      const t = dose + rise + plateau + rnd() * fall;
      const c = { id: 'cd' + i, t: hm(t), end: hm(t + 10 + rnd() * 40), i: clamp(2 + rnd() * 3.5),
        sym: ['coeur', pick(['souffle', 'tremble', 'pensees', 'oppress'])], why: [pick(['stress', 'travail', 'sommeil', 'bruit', 'rien'])],
        help: [pick(['respirer', 'marcher', 'eau'])] };
      if (rnd() < 0.4) { c.help.push('med:mdemo2'); takes.push({ t: c.t, med: 'mdemo2', dose: 25, cr: c.id }); }
      data.crises[k] = [c];
    }
    if (takes.length) data.takes[k] = takes.sort((a, b) => a.t.localeCompare(b.t));
  }
  return data;
}
if (typeof module !== 'undefined' && require.main === module) {
  process.stdout.write(JSON.stringify(ritaDemo(+(process.argv[2] || 60)), null, 1));
}
