/* Calcule, numerotare și date pentru șabloanele .docx — folosit de pagină și testat separat */
(function (root) {
  const L = {};
  const n = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  L.n = n;
  L.round2 = (x) => Math.round(x * 100) / 100;
  L.fmt = (x, dec) => {
    const v = n(x);
    const d = dec ?? (Math.abs(v - Math.round(v)) > 0.004 ? 2 : 0);
    return v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  L.eur = (x) => L.fmt(x) + ' €';
  L.pct = (x) => (n(x) * 100).toLocaleString('ro-RO', { maximumFractionDigits: 2 }) + '%';
  const LUNI = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iunie', 'Iulie', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LUNI_LUNG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  L.LUNI = LUNI;
  const rev = (s) => s.split('').reverse().join('');
  /* nr înreg.: fiecare pereche din AAMMZZ inversată, apoi /secvență-ZZ Lună AAAA (ex. 31.10.2026 → 620113/1-31 Oct 2026) */
  L.nrInreg = (iso, seq) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return rev(y.slice(2)) + rev(m) + rev(d) + '/' + (seq || 1) + '-' + d + ' ' + LUNI[+m - 1] + ' ' + y;
  };
  L.dataRo = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return d + '.' + m + '.' + y; };
  L.dataLunga = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return (+d) + ' ' + LUNI_LUNG[+m - 1] + ' ' + y; };
  L.uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  L.FIRME = { arhideea: 'SC ATELIER ARHIDEEA SRL', bia: 'BIA Oprea Cristian Daniel' };

  L.calcZone = (zone, tva, cota) => {
    const c = cota ?? 21;
    const t = { mp: 0, arh: 0, rel: 0, exp: 0, rez: 0, inst: 0, inv: 0 };
    (zone || []).forEach((z) => {
      const mp = n(z.mp);
      t.mp += mp; t.arh += mp * n(z.arh); t.rel += mp * n(z.rel); t.exp += mp * n(z.exp);
      t.rez += mp * n(z.rez); t.inst += mp * n(z.inst); t.inv += mp * n(z.cost);
    });
    t.prestator = t.arh + t.rel;               // ce intră în contractul de arhitectură
    t.colab = t.exp + t.rez + t.inst;          // contractate direct de beneficiar
    t.total = t.prestator + t.colab;
    const f = (on) => (on ? 1 + c / 100 : 1);
    t.arhTva = t.arh * f(tva?.arh); t.relTva = t.rel * f(tva?.arh);
    t.rezTva = t.rez * f(tva?.rez); t.instTva = t.inst * f(tva?.inst); t.expTva = t.exp * f(tva?.rez);
    t.totalTva = t.arhTva + t.relTva + t.rezTva + t.instTva + t.expTva;
    t.prestatorTva = t.arhTva + t.relTva;
    return t;
  };

  /* Discount doar la arhitectură: sumă fixă (dacă e trecută) sau procent din arhitectură */
  L.discVal = (o, arh) => { const d = o.disc || {}; const sum = n(d.sum); if (sum > 0) return Math.min(sum, arh); const p = n(d.pct); return p > 0 ? arh * Math.min(p, 100) / 100 : 0; };
  L.applyDisc = (t, o) => {
    const cota = n(o.cotaTva || 21); const D = L.discVal(o, t.arh); t.arhBrut = t.arh; t.disc = D;
    if (!D) return t;
    const f = o.tva?.arh ? 1 + cota / 100 : 1;
    t.arh -= D; t.prestator -= D; t.total -= D;
    if (t.arhTva !== undefined) t.arhTva = t.arh * f;
    t.prestatorTva -= D * f; t.totalTva -= D * f;
    return t;
  };
  /* Totaluri pentru o ofertă (orice tip), cu discountul aplicat */
  L.totals = (o) => {
    const t = L.totalsBrut(o);
    if (t.arh === undefined) t.arh = t.prestator;
    return L.applyDisc(t, o);
  };
  L.totalsBrut = (o) => {
    const cota = n(o.cotaTva || 21);
    const fx = (o.moneda === 'RON' && n(o.curs)) ? 1 / n(o.curs) : 1;
    if (o.tip === 'ore') {
      const ore = (o.ore || []).reduce((s, r) => s + n(r.ore), 0);
      const v = (o.ore || []).reduce((s, r) => s + n(r.ore) * n(r.tarif), 0) * fx;
      const tv = o.tva?.arh ? v * (1 + cota / 100) : v;
      return { tip: 'ore', ore, prestator: v, colab: 0, total: v, totalTva: tv, prestatorTva: tv, inv: 0, mp: 0 };
    }
    if (o.tip === 'forfetar') {
      const v = (o.forfetar || []).reduce((s, r) => s + n(r.cost), 0) * fx;
      const tv = o.tva?.arh ? v * (1 + cota / 100) : v;
      return { tip: 'forfetar', prestator: v, colab: 0, total: v, totalTva: tv, prestatorTva: tv, inv: 0, mp: 0 };
    }
    const t = L.calcZone(o.zone, o.tva, cota); t.tip = 'mp'; return t;
  };
  /* Onorariul de arhitectură care contează după contractare: calculul final dacă există, altfel oferta */
  L.arhFinal = (o) => {
    if (o.tip === 'mp' && o.final && (o.final.zone || []).length) return L.applyDisc(L.calcZone(o.final.zone, o.tva, o.cotaTva), o).prestator;
    if (o.contract && o.contract.onorariu !== undefined && o.contract.onorariu !== '' && o.contract.onorariu !== null && isFinite(parseFloat(o.contract.onorariu))) return n(o.contract.onorariu);
    return L.totals(o).prestator;
  };
  L.esteContractata = (o) => !!(o.contract && o.contract.nr) || ['contractată', 'finalizată', 'în lucru'].includes(o.status);

  L.DEF = {
    etapeMp: [
      { den: 'Avans', desc: 'Informatii preliminare, fezabilitate', pct: 10, cond: 'inceperea proiectului', durata: '' },
      { den: 'Ante-proiect (SF)', desc: 'Preluarea datelor\nStabilirea temei de proiectare\nPropuneri de volumetrie si amplasament', pct: 30, cond: 'la finalizarea solutiei de arhitectura', durata: 'Variabila – in medie 90 zile de la semnarea contractului si achitarea avansului' },
      { den: 'Proiect pentru autorizatia de construire (DTAC)', desc: 'Realizarea documentatiei pentru autorizatia de construire pe baza solutiei stabilite la faza anterioara.\nCuprinde proiectul de arhitectura, rezistenta (infrastructura) cu verificare la cerinta A, instalatii faza DTAC cu verificare la cerintele It, Ie, Is', pct: 20, cond: 'la finalizarea documentatiei', durata: '45 de zile de la finalizarea si achitarea fazei 1' },
      { den: 'Proiect Tehnic (PT)', desc: 'Realizarea proiectului tehnic pe baza solutiei stabilite la faza anterioara.\nCuprinde proiectul de arhitectura (plan alei si accese, planuri mobilate, cantitati si suprafete, detalii unde este cazul), rezistenta (suprastructura), instalatii faza PT', pct: 40, cond: 'la finalizarea documentatiei', durata: '45 de zile de la finalizarea si achitarea fazei 2' },
    ],
    etapeAlte: [
      { den: 'Avans', desc: '', pct: 50, cond: 'la semnarea contractului', durata: '' },
      { den: 'La predarea documentatiei', desc: '', pct: 50, cond: 'la predare', durata: '' },
    ],
    noteMp: [
      'Tarifele pentru rezistenta si instalatii prezentate in oferta sunt cu titlu de bugetare, se vor contracta de catre beneficiar proiectele cu colaboratorii externi, sub coordonarea proiectantului general',
      'Onorariul final se calculeaza pe baza tarifului/mp si a suprafetei desfasurate finale a proiectului.',
      'Oferta include deplasari in santier ale arhitectului si/ sau inginerilor la fazele determinante stabilite prin proiect. Alte deplasari se vor tarifa separat in functie de durata.',
      'Termenele de livrare ale fazelor nu sunt conditionate de si nu implica termene de obtinere a avizelor.',
    ],
    noteOre: [
      'Consumul orar a fost estimat pe baza complexitatii proiectului si a experientei anterioare. Decontarea se va face in functie de timpul consumat efectiv, pe baza unui raport lunar si a tarifului orar.',
      'In situatia in care se preconizeaza depasirea numarului de ore estimat, beneficiarul va fi notificat in avans.',
    ],
    noteForf: ['Termenele de livrare nu sunt conditionate de si nu implica termene de obtinere a avizelor.'],
    excluseMp: [
      'Verificarea proiectului de arhitectura la cerintele B,C,D,E,F',
      'Proiecte pentru instalatii ventilatie (proiectarea poate fi asumata direct de furnizor)',
      'Proiect de amenajare interioara ( culori/finisaje etc)',
      'Proiect de executie pentru mobilier',
      'Proiecte racorduri la utilitati',
      'Alte studii ,lucrari sau taxe ( topo, geo, taxa AC, taxe avize, studiu nZeb, studiu pentru utilizarea mijloacelor alternative)',
      'Studiile si calculele detaliate pentru eficienta energetica',
    ],
    excluseAlte: ['Alte studii, lucrari sau taxe (topo, geo, taxa AC, taxe avize, alte studii necesare pentru avizare si neprecizate in momentul ofertarii)'],
    plata: 'Plata se va face in lei la cursul BNR din ziua facturarii conform esalonarii stabilite de comun acord la inceperea proiectului. Aceasta oferta este valabila 30 de zile de la data emiterii.',
  };

  L.ofertaNoua = (settings, tip) => {
    const s = settings || {};
    const t = tip || 'mp';
    const today = new Date();
    const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const firma = s.firmaImplicita || 'bia';
    return {
      id: L.uid('o_'), nr: '', data: iso, clientId: '', clientNume: '', obiectiv: 'Locuință unifamilială', localitate: '', adresa: '',
      firma, tip: t, status: 'ciornă',
      zone: [
        { den: 'Zona 1', mp: 150, arh: n(s.tarifArh ?? 25), rel: 0, exp: 0, rez: n(s.tarifRez ?? 7), inst: n(s.tarifInst ?? 4), cost: n(s.costMp ?? 1200) },
        { den: 'Zona 2', mp: 20, arh: 10, rel: 0, exp: 0, rez: n(s.tarifRez ?? 7), inst: n(s.tarifInst ?? 4), cost: 300 },
      ],
      existent: false,
      ore: [{ den: 'Studiu de solutie (modelare 3D, propuneri)', ore: 20, tarif: n(s.tarifOrar ?? 40) }],
      forfetar: [{ den: 'Proiect arhitectura', desc: '', cost: 1000, durata: '30 zile' }],
      etape: JSON.parse(JSON.stringify(t === 'mp' ? L.DEF.etapeMp : L.DEF.etapeAlte)),
      tva: { arh: firma === 'arhideea', rez: true, inst: true }, cotaTva: 21,
      estimari: '', note: (t === 'mp' ? L.DEF.noteMp : t === 'ore' ? L.DEF.noteOre : L.DEF.noteForf).join('\n'),
      excluse: (t === 'mp' ? L.DEF.excluseMp : L.DEF.excluseAlte).join('\n'),
      plata: L.DEF.plata, noteInterne: '', final: null, contract: null, sursa: 'app',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
  };

  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  L.lines = lines;
  const tvaFraza = (o) => (o.firma === 'arhideea' && o.tva?.arh)
    ? 'La serviciile de arhitectura se aplica TVA ' + (o.cotaTva || 21) + '%; la celelalte specialitati se poate aplica TVA in functie de colaboratorii externi.'
    : 'Nu se percepe TVA la serviciile de arhitectura, la celelalte specialitati se poate aplica TVA in functie de colaboratorii externi.';

  L.clientEticheta = (o) => o.clientNume || '';
  L.obiectivComplet = (o) => [o.obiectiv, L.clientEticheta(o), o.localitate, o.adresa].filter(Boolean).join(', ');

  /* ---------- date pentru șablonul de ofertă */
  L.dataOferta = (o, settings) => {
    const t = L.totals(o);
    const tb = L.totalsBrut(o); // tabelele arată valorile înainte de discount
    const isMp = o.tip === 'mp';
    const tva = o.tva || {};
    const cota = n(o.cotaTva || 21);
    const estim = [];
    if (isMp) {
      const z1 = (o.zone || [])[0];
      const zs = (o.zone || []).filter((z) => n(z.mp) > 0);
      zs.forEach((z, i) => {
        const den = String(z.den || '').trim();
        const generic = /^(casa\s+)?zona\s*\d+$/i.test(den) || !den;
        let what;
        if (generic && i === 0) what = 'suprafata desfasurata ' + String(o.obiectiv || 'constructie').toLowerCase() + ' – zona 1';
        else if (generic) what = 'zona ' + (i + 1) + ' – terase acoperite, logii, garaje';
        else what = 'suprafata desfasurata ' + den.toLowerCase();
        estim.push((i === 0 ? 'Suprafata de cca ' : 'cca ') + L.fmt(z.mp) + ' mp ( ' + what + ')');
      });
      if (z1 && n(z1.cost)) estim.push('costul / mp al constructiei (finalizata, fara mobilier, racorduri, imprejmuire ) ' + L.fmt(z1.cost) + ' euro (fara TVA)');
    }
    lines(o.estimari).forEach((x) => estim.push(x));
    const note = [];
    if (t.disc) {
      const d = o.disc || {}; const pctTxt = n(d.sum) > 0 ? '' : ' (' + L.fmt(d.pct) + '%)';
      note.push('Discount la proiectul de arhitectura' + pctTxt + (d.motiv ? ' – ' + d.motiv : '') + ': -' + L.eur(t.disc) + '. Onorariul pentru arhitectura' + (t.rel ? ' (inclusiv releveu)' : '') + ' devine ' + L.eur(t.prestator) + ' fara TVA' + (o.tva?.arh ? ' / ' + L.eur(t.prestatorTva) + ' cu TVA' : '') + '.');
    }
    if (isMp) note.push(tvaFraza(o));
    else note.push(o.tva?.arh ? 'Sumele nu includ TVA ' + cota + '%.' : 'Sumele nu includ TVA.');
    lines(o.note).forEach((x) => note.push(x));
    const ex = o.existent || (o.zone || []).some((z) => n(z.rel) || n(z.exp));
    const zoneEx = (o.zone || []).filter((z) => n(z.rel) || n(z.exp)).map((z) => ({
      den: z.den, mp: L.fmt(z.mp), rel: L.fmt(z.rel), exp: L.fmt(z.exp), tot: L.eur(n(z.mp) * (n(z.rel) + n(z.exp))),
    }));
    const etape = (o.etape || []).map((e, i) => ({
      nr: (o.etape[0] && /avans/i.test(o.etape[0].den)) ? (i === 0 ? '-' : String(i)) : String(i + 1),
      den: e.den, desc: e.desc || '', durata: e.durata || '',
      pctTxt: (n(e.pct) ? L.fmt(e.pct) + '%' : '') + (e.cond ? ' / ( ' + e.cond + ')' : '') + (!isMp && n(e.pct) ? '\n' + L.eur(t.prestator * n(e.pct) / 100) : ''),
    }));
    const tvaLbl = (tva.arh || tva.rez || tva.inst) ? 'Total cu TVA (unde se aplica)' : 'Total (fara TVA)';
    const totalGeneralTxt = isMp
      ? L.eur(t.total) + ' fara TVA' + (t.totalTva !== t.total ? ' / ' + L.eur(t.totalTva) + ' cu TVA unde se aplica' : '') + ' — din care arhitectura' + (t.rel ? ' + releveu' : '') + ' ' + L.eur(t.prestator)
      : '';
    return {
      nrInreg: o.nr || '', obiectiv_complet: L.obiectivComplet(o),
      titlu_financiar: isMp ? 'Oferta financiara proiect arhitectura/rezistenta/instalatii' : 'Oferta financiara',
      areEstimari: estim.length > 0, intro_estimari: 'La redactarea ofertei ne-am bazat pe urmatoarele estimari :', estimari: estim,
      isMp, isOre: o.tip === 'ore', isForf: o.tip === 'forfetar',
      zone: (o.zone || []).map((z) => ({ den: z.den, mp: L.fmt(z.mp), arh: L.fmt(z.arh), rez: L.fmt(z.rez), inst: L.fmt(z.inst) })),
      mpTot: L.fmt(t.mp), arhTot: L.eur(tb.arh), rezTot: L.eur(t.rez), instTot: L.eur(t.inst),
      invTot: t.inv ? L.eur(t.inv) : '-',
      arhPct: t.inv ? L.pct(tb.arh / t.inv) : '', rezPct: t.inv ? L.pct(t.rez / t.inv) : '', instPct: t.inv ? L.pct(t.inst / t.inv) : '',
      tvaRandLabel: tvaLbl, arhTva: L.eur(tb.arhTva), rezTva: L.eur(t.rezTva), instTva: L.eur(t.instTva),
      areExistent: ex && zoneEx.length > 0, zoneEx, relTot: L.eur(t.rel), expTot: L.eur(t.exp), relExpTot: L.eur(n(t.rel) + n(t.exp)),
      totalGeneralTxt,
      ore: (o.ore || []).map((r, i) => ({ nr: i + 1, den: r.den, ore: L.fmt(r.ore), tarif: L.fmt(r.tarif), cost: L.eur(n(r.ore) * n(r.tarif)) })),
      oreTot: L.fmt(t.ore || 0), oreCostTot: L.eur(tb.total) + (t.disc ? ' (după discount: ' + L.eur(t.total) + ')' : ''),
      forfetar: (o.forfetar || []).map((r, i) => ({ nr: i + 1, den: r.den, desc: r.desc || '', cost: L.eur(r.cost), durata: r.durata || '' })),
      forfTot: L.eur(tb.total) + (t.disc ? ' (după discount: ' + L.eur(t.total) + ')' : ''),
      note, areEtape: etape.length > 0, etape,
      titluEtape: isMp ? 'Defalcare pe etape' : 'Esalonarea platilor',
      areExcluse: lines(o.excluse).length > 0, excluse: lines(o.excluse),
      plataTxt: o.plata || L.DEF.plata,
      semnatura: (settings && settings.semnatura) || 'Arh. Cristian Oprea',
    };
  };

  /* ---------- date pentru șablonul de contract */
  const blank = (v, w) => (String(v || '').trim() || '_'.repeat(w || 14));
  L.firmaDate = (settings, firma) => {
    const f = ((settings || {}).firme || {})[firma] || {};
    return f;
  };
  L.dataContract = (o, settings) => {
    const c = o.contract || {};
    const b = c.ben || {};
    const isMp = o.tip === 'mp';
    const f = L.firmaDate(settings, o.firma);
    const firmaNume = f.nume || L.FIRME[o.firma];
    const cuTva = o.firma === 'arhideea' && !!o.tva?.arh;
    const cota = n(o.cotaTva || 21);
    const zonele = isMp && o.final && (o.final.zone || []).length && c.dinFinal ? o.final.zone : o.zone;
    const t = isMp ? L.applyDisc(L.calcZone(zonele, o.tva, cota), o) : L.totals(o);
    const onor = t.prestator;
    const ex = isMp && (o.existent || (zonele || []).some((z) => n(z.exp) || n(z.rel)));
    const rel = isMp && (zonele || []).some((z) => n(z.rel));
    const benNume = b.tip === 'PJ' ? (b.denumire || o.clientNume) : (b.nume || o.clientNume);
    const benParte = b.tip === 'PJ'
      ? `${String(benNume).toUpperCase()}, cu sediul în ${blank(b.sediu, 40)}, înscrisă la Registrul Comerțului sub nr. ${blank(b.regCom)}, CUI ${blank(b.cui)}, cont ${blank(b.iban, 24)}${b.banca ? ' deschis la ' + b.banca : ''}, reprezentată prin ${blank(b.reprez, 20)}, în calitate de ${blank(b.calitate, 12)}, denumită în continuare BENEFICIARUL.`
      : `${String(benNume).toUpperCase()}, cu domiciliul în ${blank(b.domiciliu, 46)}, CNP ${blank(b.cnp, 23)}, act de identitate seria ${blank(b.ciSerie, 4)} nr. ${blank(b.ciNr, 10)}, tel. ${blank(b.tel)}, e-mail ${blank(b.email, 22)}, denumit în continuare BENEFICIARUL.`;
    const firmaParte = f.parte || (o.firma === 'arhideea'
      ? 'SC ATELIER ARHIDEEA SRL, cu sediul în Brașov, str. Lămâiței nr. 87, înscrisă la Registrul Comerțului sub nr. J08/139/2010, CUI RO26478085, cont RO60BTRLRONCRT0575508501 – Banca Transilvania, tel. 0721 242312, reprezentată prin arh. Cristian Oprea, administrator, denumită în continuare PRESTATORUL'
      : `BIROUL INDIVIDUAL DE ARHITECTURĂ OPREA CRISTIAN DANIEL, cu sediul în ${blank(f.sediu, 30)}, CIF ${blank(f.cif)}, cont ${blank(f.iban, 24)}${f.banca ? ' – ' + f.banca : ''}, tel. 0721 242312, reprezentat prin arh. Cristian Oprea, titular, denumit în continuare PRESTATORUL`);
    const colab = [];
    if (isMp) {
      if (t.exp) colab.push({ den: 'Expertiză tehnică construcție existentă', val: L.fmt(t.exp), obs: 'Expert tehnic atestat' });
      if (t.rez) colab.push({ den: 'Proiect rezistență DTAC + PT + verificare A', val: L.fmt(t.rez), obs: 'Se poate aplica TVA, după caz' });
      if (t.inst) colab.push({ den: 'Proiect instalații DTAC + PT + verificare It, Ie, Is', val: L.fmt(t.inst), obs: 'Se poate aplica TVA, după caz' });
    }
    const colabTxt = [t.rez ? 'rezistență' : '', t.inst ? 'instalații' : ''].filter(Boolean).join(', ') || 'rezistență, instalații';
    const etape = o.etape || [];
    const avans = etape[0] && /avans/i.test(etape[0].den);
    const etapeC = etape.map((e, i) => ({ nr: avans ? (i === 0 ? '–' : String(i)) : String(i + 1), den: e.den, desc: e.desc || '', durata: e.durata || '' }));
    if (isMp) etapeC.push({ nr: String(etapeC.length - (avans ? 0 : -1)), den: 'Asistență tehnică la execuție', desc: 'Participarea arhitectului la fazele determinante stabilite prin proiect\nParticiparea la recepția la terminarea lucrărilor', durata: 'Pe durata execuției (inclusă în onorariu)' });
    const esal = etape.map((e) => ({ den: e.den, pct: L.fmt(e.pct) + '%', suma: L.fmt(onor * n(e.pct) / 100), cond: e.cond ? e.cond.charAt(0).toUpperCase() + e.cond.slice(1) : '' }));
    const cereri = isMp ? [
      ...(rel ? ['releveul construcției existente și preluarea datelor de temă;'] : ['preluarea datelor de temă;']),
      'ante-proiectul (studiu de fezabilitate / soluție de arhitectură);',
      'proiectul de arhitectură pentru autorizarea executării lucrărilor de construire (DTAC) și proiectul tehnic de arhitectură (PT), cu detalii unde este cazul;',
      'coordonarea tehnică a proiectului complex (arhitectură / rezistență / instalații), proiectele de specialitate' + (ex ? ' și expertiza tehnică' : '') + ' fiind contractate direct de Beneficiar;',
      'asistență tehnică din partea proiectantului la fazele determinante ale execuției.',
    ] : (o.tip === 'ore' ? o.ore : o.forfetar).map((r) => r.den + ';');
    const livr = o.tip === 'ore'
      ? (o.ore || []).map((r, i) => ({ nr: i + 1, den: r.den, desc: L.fmt(r.ore) + ' ore estimate × ' + L.fmt(r.tarif) + ' EUR/oră, decontare după timpul efectiv lucrat', costTxt: L.fmt(n(r.ore) * n(r.tarif)), obs: 'estimat' }))
      : (o.forfetar || []).map((r, i) => ({ nr: i + 1, den: r.den, desc: r.desc || '', costTxt: L.fmt(r.cost), obs: r.durata || '' }));
    const z1 = (zonele || [])[0];
    const costTxt = isMp && t.inv ? `Cost estimat al construcției (finalizată, fără mobilier, racorduri, împrejmuire): cca ${L.fmt(z1 && z1.cost)} EUR/mp fără TVA, respectiv cca ${L.fmt(t.inv)} EUR fără TVA pentru întreaga investiție.` : '';
    const ampl = [c.amplasament || [o.localitate, o.adresa].filter(Boolean).join(', ') || '______________', c.cf ? 'CF nr. ' + c.cf : '', c.nrCad ? 'nr. cad. ' + c.nrCad : ''].filter(Boolean).join(', ');
    const regim = c.regim || {};
    const excl = lines(o.excluse);
    if (isMp) excl.unshift('Proiectele de rezistență și instalații, verificarea acestora' + (ex ? ' și expertiza tehnică' : '') + ' (contractate direct de Beneficiar);');
    return {
      cNr: c.nr || '____', cAn: (c.data || o.data || '').slice(0, 4) || String(new Date().getFullYear()),
      cData: c.data ? L.dataRo(c.data) : '____.____.' + new Date().getFullYear(),
      firmaHeader: f.header || (o.firma === 'arhideea' ? 'SC ATELIER ARHIDEEA SRL  |  J08/139/2010  |  CUI 26478085    Tel. 0721-242312' : 'BIA OPREA CRISTIAN DANIEL  |  Tel. 0721-242312  |  cristian.oprea@arhideea.ro'),
      firmaParte, benParte,
      investitie: c.investitie || o.obiectiv || '', amplasament: ampl, tipDoc: isMp ? 'de arhitectură' : '',
      areColab: colab.length > 0, colabTxt, colab, colabTot: L.fmt(t.colab || 0),
      ex, rel, isMp, isLista: !isMp, cuTva,
      oNr: o.nr || '______', oData: L.dataRo(o.data),
      benReprez: b.tip === 'PJ' ? (b.reprez || '______________') : benNume, benTel: blank(b.tel), benEmail: blank(b.email, 22),
      costTxt, pctInvTxt: isMp && t.inv ? `Onorariul Prestatorului reprezintă cca ${L.pct(onor / t.inv)} din valoarea estimată a investiției (${L.fmt(t.inv)} EUR fără TVA).` : '',
      cereri, etapeC, livrabile: livr,
      zone: (zonele || []).map((z) => ({ den: z.den, regim: regim[z.den] || '', mp: L.fmt(z.mp), arh: L.fmt(z.arh), rel: n(z.rel) ? L.fmt(z.rel) : '–', totZ: L.fmt(n(z.mp) * (n(z.arh) + n(z.rel))) })),
      mpTot: L.fmt(t.mp || 0), arhTot: L.fmt(t.arh || onor), relTot: L.fmt(t.rel || 0), onorTot: L.fmt(onor),
      tvaLabel: cuTva ? 'TVA ' + cota + '%' : 'TVA', tvaVal: cuTva ? L.fmt(onor * cota / 100) : 'neaplicabil',
      tvaTotLabel: cuTva ? 'inclusiv TVA' : '', onorTva: L.fmt(cuTva ? onor * (1 + cota / 100) : onor),
      esal, excluseC: excl,
      benSig: String(benNume).toUpperCase(), firmaSig: firmaNume, benScurt: benNume, firmaScurt: o.firma === 'arhideea' ? 'Atelier Arhideea' : 'BIA Oprea Cristian Daniel',
      firmaSigReprez: o.firma === 'arhideea' ? 'prin arh. Cristian Oprea, administrator' : 'arh. Cristian Oprea, titular',
    };
  };

  /* ---------- contract-cadru și anexe */
  L.bani = (v, mon) => mon === 'RON' ? L.fmt(v, 2) + ' lei' : '€ ' + L.fmt(v, 2);
  L.dataCadru = (c) => {
    const cd = c.cadru || {};
    const lines = [c.cnp ? (c.tip === 'PJ' ? 'CUI ' : 'CNP ') + c.cnp + (c.regCom ? '; ' + c.regCom : '') : (c.regCom || ''), c.iban || '', c.adresa || '', c.email || '', c.tel || ''].filter(Boolean);
    while (lines.length < 5) lines.push('');
    return { cadruNr: cd.nr || '____', cadruData: cd.data ? L.dataRo(cd.data) : '____', benDen: String(c.nume || '').toUpperCase(), benL1: lines[0], benL2: lines[1], benL3: lines[2], benL4: lines[3], benL5: lines[4], benSig: c.nume || '' };
  };
  L.dataAnexa = (o, c) => {
    const a = o.anexa || {}; const cd = (c && c.cadru) || {}; const mon = o.moneda === 'RON' ? 'RON' : 'EUR';
    let linii, oreTot = '', tot = 0;
    if (o.tip === 'forfetar') {
      linii = (o.forfetar || []).map((r, i) => ({ faza: String(i + 1), den: r.den + (r.desc ? ' – ' + r.desc : ''), ore: '', tarif: '', total: L.bani(r.cost, mon) }));
      tot = (o.forfetar || []).reduce((s, r) => s + n(r.cost), 0);
    } else {
      linii = (o.ore || []).map((r, i) => ({ faza: r.faza || String(i + 1), den: r.den, ore: L.fmt(r.ore), tarif: L.bani(r.tarif, mon), total: L.bani(n(r.ore) * n(r.tarif), mon) }));
      tot = (o.ore || []).reduce((s, r) => s + n(r.ore) * n(r.tarif), 0);
      oreTot = L.fmt((o.ore || []).reduce((s, r) => s + n(r.ore), 0));
    }
    return {
      anexaNr: String(a.nr || '01').padStart(2, '0'), anexaData: L.dataRo(a.data), cadruNr: cd.nr || '____', cadruData: cd.data ? L.dataRo(cd.data) : '',
      obiect: a.obiect || o.obiectiv || '', linii, oreTot, totTxt: L.bani(tot, mon),
      notaPret: mon === 'RON' ? 'Preturile nu contin TVA.' : 'Plata se va face in lei, la cursul BNR din ziua emiterii facturii. Preturile nu contin TVA.',
      benSig: (c && c.nume) || o.clientNume || '',
    };
  };


  /* ===== Project Info pentru Archicad (ROtemplate 29) ===== */
  const PI_KEYS = `F|Project Name|PROJECTNAME|ROTEMPLATE
F|Project Description|PROJECT_DESCRIPTION|
F|Project ID|PROJECT_ID|
F|Project Code|PROJECT_CODE|
F|Project Number|PROJECTNUMBER|NR. PROIECT
F|Project Status|PROJECTSTATUS|FAZA PROIECT
F|Keywords|KEYWORDS|
F|Notes|NOTES|
F|Site Name|SITE_NAME|DENUMIRE AMPLASAMENT
F|Site Description|SITE_DESCRIPTION|
F|Site ID|SITE_ID|
F|Site Full Address|SITEFULLADDRESS|ADRESA ORAS AMPLASAMENT Romania
F|Site Address1|SITEADDRESS1|ADRESA
F|Site Address2|SITEADDRESS2|
F|Site Address3|SITEADDRESS3|
F|Site Postal Box|SITEPOSTBOX|
F|Site City|SITECITY|ORAS AMPLASAMENT
F|Site State|SITESTATE|
F|Site Postcode|SITEPOSTCODE|
F|Site Country|SITECOUNTRY|Romania
F|Site Gross Perimeter|SITEGROSSPERIMETER|
F|Site Gross Area|SITEGROSSAREA|SUPRAFATA TEREN
F|Building Name|BUILDING_NAME|DENUMIRE CLADIRE
F|Building Description|BUILDING_DESCRIPTION|
F|Building ID|BUILDING_ID|
F|Contact Full Name|CONTACT_FULLNAME|ARH.
F|Contact Prefix Title|CONTACT_PREFIXTITLE|
F|Contact Given Name|CONTACT_GIVENNAME|ARH.
F|Contact Middle Name|CONTACT_MIDDLENAME|
F|Contact Family Name|CONTACT_FAMILYNAME|
F|Contact Suffix Title|CONTACT_SUFFIXTITLE|
F|Contact Name Order|CONTACT_NAMEORDER|
F|Contact ID|CONTACT_ID|
F|Contact Role|CONTACT_ROLE|
F|Contact Department|CONTACT_DEPARTMENT|
F|CAD Technician Full Name|CAD_TECHNICIAN_FULLNAME|DESENATOR
F|CAD Technician Prefix Title|CAD_TECHNICIAN_PREFIXTITLE|
F|CAD Technician Given Name|CAD_TECHNICIAN_GIVENNAME|DESENATOR
F|CAD Technician Middle Name|CAD_TECHNICIAN_MIDDLENAME|
F|CAD Technician Family Name|CAD_TECHNICIAN_FAMILYNAME|
F|CAD Technician Suffix Title|CAD_TECHNICIAN_SUFFIXTITLE|
F|CAD Technician Name Order|CAD_TECHNICIAN_NAMEORDER|
F|Contact Company|CONTACTCOMPANY|PROIECTANT ARHITECTURA SRL
F|Contact Company Code|CONTACT_COMPANYCODE|
F|Contact Full Address|CONTACTFULLADDRESS|
F|Contact Address1|CONTACTADDRESS1|
F|Contact Address2|CONTACTADDRESS2|
F|Contact Address3|CONTACTADDRESS3|
F|Contact Postal Box|CONTACTPOSTBOX|
F|Contact City|CONTACTCITY|
F|Contact State|CONTACTSTATE|
F|Contact Postcode|CONTACTPOSTCODE|
F|Contact Country|CONTACTCOUNTRY|Romania
F|Contact E-mail|CONTACTEMAIL|
F|Contact Phone Number|CONTACTPHONE|
F|Contact Fax|CONTACTFAX|
F|Contact Web|CONTACTWEB|
F|Client Full Name|CLIENT_FULLNAME|NUME BENEFICIAR
F|Client Prefix Title|CLIENT_PREFIXTITLE|
F|Client Given Name|CLIENT_GIVENNAME|NUME BENEFICIAR
F|Client Middle Name|CLIENT_MIDDLENAME|
F|Client Family Name|CLIENT_FAMILYNAME|
F|Client Suffix Title|CLIENT_SUFFIXTITLE|
F|Client Name Order|CLIENT_NAMEORDER|
F|Client Company|CLIENTCOMPANY|
F|Client Full Address|CLIENTFULLADDRESS|
F|Client Address1|CLIENTADDRESS1|
F|Client Address2|CLIENTADDRESS2|
F|Client Address3|CLIENTADDRESS3|
F|Client Postal Box|CLIENTPOSTBOX|
F|Client City|CLIENTCITY|
F|Client State|CLIENTSTATE|
F|Client Postcode|CLIENTPOSTCODE|
F|Client Country|CLIENTCOUNTRY|
F|Client E-mail|CLIENTEMAIL|
F|Client Phone Number|CLIENTPHONE|NR. TEL. BENEFICIAR
F|Client Fax|CLIENTFAX|
F|EcoDesigner report header text|EDREPORTHEADER|
C|Coordonator proiect|CUSTOM1|COORD. PROIECT
C|Șef proiect|CUSTOM2|SEF PROIECT
C|Nume Verificator|CUSTOM3|NUME VERIFICATOR
C|Arie construită desfășurată|autotext-BUILDING-8768DA21-BE7F-1C4D-BCAF-11FF1B496B76|ARIE DESF.
C|Grad de rezistență la foc|autotext-BUILDING-280B8FE8-8A2C-479D-8B10-CC92F846392D|GRF
C|Proiectant de specialitate|autotext-PROJECT-A4DA76EA-5FD8-49F2-9DCA-19B1870B1ADE|
C|Proiectant general|autotext-PROJECT-AADF5365-9BD5-442E-8A26-5F3DD4DA1EDC|PROIECTANT GENERAL
C|Clasa de importanță|autotext-BUILDING-4DEB680E-457F-4E02-A345-0163D60EC45E|CLASA IMP.
C|Categoria de importanță|autotext-BUILDING-BCD22C38-BA3F-46A0-98BE-F260E4B5D91C|CATEG. IMP.
C|Proiectant arhitectură|autotext-PROJECT-BBF4FA65-BC0C-4C57-9C72-D6BF96E04C4E|PROIECTANT ARH.
C|Proiectant structură|autotext-PROJECT-FD30A2B2-03C0-4E5F-8394-3F894EA6EA31|
C|POT|autotext-SITE-DAEB6E3C-EF97-BE4D-BC28-3DD5E1E2B3F5|
C|CUT|autotext-SITE-8B35807B-CE14-F249-8F7D-40185FF26745|
C|Arie construită la sol|autotext-BUILDING-FC870FA3-2DB6-6F4B-8A55-F9C76B3EF34A|ARIE LA SOL
C|Suprafața utilă|autotext-BUILDING-26390E59-D5D8-E94E-BBAC-70FCDB9E7EF8|SUPR. UTILA
C|Project Date|autotext-PROJECT-1CF2CCE8-2F88-FB4C-8A97-C794D565468C|DATA PROIECT
C|Executant|autotext-PROJECT-915434F8-F9B2-404D-9F3F-CD62957286AF|EXECUTANT
C|Verificare PSI|autotext-BUILDING-2B10AEDE-0AFA-4A48-89F5-ECCD95B2C7E9|NU
C|Expert Tehnic|autotext-PROJECT-4438B630-1061-EC45-B102-6E41140D1EDB|NUME EXPERT
C|Versiunea ROtemplate|autotext-PROJECT-829B6F28-6144-9745-93B6-0635B419D684|29`;
  const PI_E = '<####>';
  L.PI_KEYS = PI_KEYS.split('\n').map((l) => { const [k, ui, db, v] = l.split('|'); return { k, ui, db, v }; });
  const up = (s) => String(s ?? '').trim().toLocaleUpperCase('ro-RO');
  const cdata = (s) => String(s).replace(/]]>/g, ']]]]><![CDATA[>');
  /* XML complet; values: chei DBKey sau UIKey → text ('' = gol) */
  L.projectInfoXml = (values) => {
    const val = (r) => { let v = values[r.db]; if (v === undefined) v = values[r.ui]; if (v === undefined) v = r.v; v = String(v ?? '').trim(); return v ? cdata(v) : PI_E; };
    const block = (tag, rows) => rows.map((r, i) => `<${tag}${i + 1}>\n<UIKey>\n<![CDATA[${r.ui}]]>\n</UIKey>\n<DBKey>\n<![CDATA[${r.db}]]>\n</DBKey>\n<value>\n<![CDATA[${val(r)}]]>\n</value>\n</${tag}${i + 1}>\n`).join('');
    const fix = L.PI_KEYS.filter((r) => r.k === 'F'), cus = L.PI_KEYS.filter((r) => r.k === 'C');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<ProjectInfo>\n<Version val="3"/>\n<FixKeys val="${fix.length}">\n${block('Fix', fix)}</FixKeys>\n<CustomKeys val="${cus.length}">\n${block('Custom', cus)}</CustomKeys>\n</ProjectInfo>\n`;
  };
  L.FIRMA_CARTUS = { arhideea: 'ATELIER ARHIDEEA SRL', bia: 'BIA OPREA CRISTIAN DANIEL' };
  L.FAZE = ['D.T.A.C.', 'D.T.A.D.', 'D.T.O.E.', 'P.T.+D.E.', 'D.T.A.C.+P.T.+D.E.', 'S.F.', 'D.A.L.I.', 'P.U.Z.', 'P.U.D.', 'RELEVEU', 'D.T.A.C. (modificare)'];
  /* valori calculate din ofertă / contract / CU / client — fiecare se poate suprascrie în o.proiect */
  L.cartusAuto = (o, ctx = {}) => {
    const c = o.contract || {}, b = c.ben || {}, cu = ctx.cu || {}, cl = ctx.client || {};
    const now = ctx.today || new Date().toISOString().slice(0, 10);
    const ben = b.tip === 'PJ' ? (b.denumire || o.clientNume) : (b.nume || o.clientNume);
    const amp = c.amplasament || cu.amplasament || o.adresa || '';
    const cf = c.cf || cu.cf || '';
    return {
      titlu: up(c.investitie || cu.scop || o.obiectiv),
      cladire: up(o.obiectiv),
      faza: 'D.T.A.C.',
      dataProiect: now.slice(5, 7) + '.' + now.slice(0, 4),
      beneficiar: up(ben),
      benAdresa: b.tip === 'PJ' ? (b.sediu || cl.adresa || '') : (b.domiciliu || cl.adresa || ''),
      benTel: b.tel || cl.tel || '', benEmail: b.email || cl.email || '',
      amplasament: up(amp), localitate: up(o.localitate || cl.localitate), judet: '',
      cf: String(cf), nrCad: String(c.nrCad || cu.nrCad || ''), teren: cu.suprafataTeren ? String(cu.suprafataTeren) : '',
      categorie: 'CC1',
    };
  };
  L.cartusValues = (o, ctx = {}) => {
    const a = L.cartusAuto(o, ctx), p = o.proiect || {};
    const g = (k) => (p[k] !== undefined && String(p[k]).trim() !== '' ? String(p[k]).trim() : (a[k] ?? ''));
    const firma = L.FIRMA_CARTUS[o.firma === 'arhideea' ? 'arhideea' : 'bia'];
    const arh = 'ARH. OPREA CRISTIAN';
    const cf = g('cf'), loc = g('localitate'), jud = g('judet');
    const addr1 = [g('amplasament'), cf ? 'C.F. ' + cf : ''].filter(Boolean).join(', ');
    const terenRaw = g('teren'); const teren = terenRaw && /^[\d.,\s]+$/.test(terenRaw) ? terenRaw.trim() + ' mp' : terenRaw;
    const benAdr = g('benAdresa');
    const v = {
      PROJECTNAME: g('titlu'), PROJECTNUMBER: g('nrProiect'), PROJECTSTATUS: g('faza'), 'Project Date': g('dataProiect'),
      SITE_NAME: ['TEREN', g('amplasament'), cf ? 'C.F. ' + cf : '', loc].filter(Boolean).join(' ').replace(/ C\.F\./, ', C.F.'),
      SITE_ID: g('nrCad'), SITEADDRESS1: addr1, SITECITY: loc, SITESTATE: jud, SITECOUNTRY: 'Romania',
      SITEFULLADDRESS: [addr1, loc, jud, 'Romania'].filter(Boolean).join(' '),
      SITEGROSSAREA: teren, BUILDING_NAME: g('cladire'),
      CLIENT_FULLNAME: g('beneficiar'), CLIENT_GIVENNAME: g('beneficiar'),
      CLIENTADDRESS1: benAdr, CLIENTFULLADDRESS: benAdr ? benAdr + ' Romania' : '', CLIENTCOUNTRY: benAdr ? 'Romania' : '',
      CLIENTPHONE: g('benTel'), CLIENTEMAIL: g('benEmail'),
      CONTACT_FULLNAME: arh, CONTACT_GIVENNAME: arh, CAD_TECHNICIAN_FULLNAME: arh, CAD_TECHNICIAN_GIVENNAME: arh, 'Șef proiect': arh,
      CONTACTCOMPANY: firma, 'Proiectant general': firma, 'Proiectant arhitectură': firma,
      CONTACTFULLADDRESS: '', CONTACTADDRESS1: '', CONTACTCITY: '', CONTACTSTATE: '', CONTACTPOSTCODE: '', CONTACTPHONE: '', CONTACTWEB: '',
      'Categoria de importanță': g('categorie'),
      'Proiectant structură': g('rez'), 'Proiectant de specialitate': g('inst'),
    };
    // câmpuri tehnice: doar dacă sunt completate, altfel rămân ca în template
    [['Nume Verificator', 'verificator'], ['Expert Tehnic', 'expert'], ['Executant', 'executant'], ['Coordonator proiect', 'coordonator'], ['Clasa de importanță', 'clasa'], ['Grad de rezistență la foc', 'grf'], ['POT', 'pot'], ['CUT', 'cut'], ['Arie construită la sol', 'ac'], ['Arie construită desfășurată', 'acd'], ['Suprafața utilă', 'su'], ['Verificare PSI', 'psi']].forEach(([key, k]) => { if (String(p[k] ?? '').trim()) v[key] = String(p[k]).trim(); });
    return v;
  };

  if (typeof module !== 'undefined') module.exports = L; else root.L = L;
})(typeof window !== 'undefined' ? window : globalThis);
