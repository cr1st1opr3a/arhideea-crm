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

  /* Totaluri pentru o ofertă (orice tip) */
  L.totals = (o) => {
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
    if (o.tip === 'mp' && o.final && (o.final.zone || []).length) return L.calcZone(o.final.zone, o.tva, o.cotaTva).prestator;
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
      mpTot: L.fmt(t.mp), arhTot: L.eur(t.arh), rezTot: L.eur(t.rez), instTot: L.eur(t.inst),
      invTot: t.inv ? L.eur(t.inv) : '-',
      arhPct: t.inv ? L.pct(t.arh / t.inv) : '', rezPct: t.inv ? L.pct(t.rez / t.inv) : '', instPct: t.inv ? L.pct(t.inst / t.inv) : '',
      tvaRandLabel: tvaLbl, arhTva: L.eur(t.arhTva), rezTva: L.eur(t.rezTva), instTva: L.eur(t.instTva),
      areExistent: ex && zoneEx.length > 0, zoneEx, relTot: L.eur(t.rel), expTot: L.eur(t.exp), relExpTot: L.eur(n(t.rel) + n(t.exp)),
      totalGeneralTxt,
      ore: (o.ore || []).map((r, i) => ({ nr: i + 1, den: r.den, ore: L.fmt(r.ore), tarif: L.fmt(r.tarif), cost: L.eur(n(r.ore) * n(r.tarif)) })),
      oreTot: L.fmt(t.ore || 0), oreCostTot: L.eur(t.total),
      forfetar: (o.forfetar || []).map((r, i) => ({ nr: i + 1, den: r.den, desc: r.desc || '', cost: L.eur(r.cost), durata: r.durata || '' })),
      forfTot: L.eur(t.total),
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
    const t = isMp ? L.calcZone(zonele, o.tva, cota) : L.totals(o);
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

  if (typeof module !== 'undefined') module.exports = L; else root.L = L;
})(typeof window !== 'undefined' ? window : globalThis);
