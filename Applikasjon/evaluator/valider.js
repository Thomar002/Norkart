// Validerer en ferdig kjøring mot fasiten for saken. Ren kode uten AI: samme kjøring og fasit gir alltid samme rapport.
// Fasiten ligger i evaluator/fasit/<sak>.json. Agenten får den aldri. Serveren leser den bare når brukeren ber om validering.

const FEIL = new Set(["mangler", "avvik"]);
const USIKKER = new Set(["uklart", "usikkert"]);

function norm(tekst) {
  return String(tekst ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,]+$/, "");
}

const tom = (v) => v === null || v === undefined || norm(v) === "";

/** Samler hendelsene fra en kjøring til sluttilstanden. Et punkt som sendes flere ganger, har siste versjon. */
export function lesKjoring(hendelser) {
  const k = {
    start: null,
    kategori: null,
    opplysninger: null,
    punkter: new Map(),
    bestemmelser: new Map(),
    port: null,
    stopp: null,
    konklusjon: null,
    ferdig: null,
  };
  for (const h of hendelser ?? []) {
    if (h.type === "start") k.start = h;
    else if (h.type === "kategori") k.kategori = h.kategori;
    else if (h.type === "opplysninger") k.opplysninger = h.opplysninger;
    else if (h.type === "punkt") k.punkter.set(h.punkt.id, h.punkt);
    else if (h.type === "bestemmelse") k.bestemmelser.set(h.bestemmelse.id, h.bestemmelse);
    else if (h.type === "port") k.port = h;
    else if (h.type === "stopp") k.stopp = h;
    else if (h.type === "konklusjon") k.konklusjon = h;
    else if (h.type === "ferdig") k.ferdig = h;
  }
  if (k.ferdig?.kategori) k.kategori = k.ferdig.kategori;
  return k;
}

function stemmer(forventet, faktisk) {
  if (forventet === null) return tom(faktisk);
  if (typeof forventet === "object") return norm(faktisk).includes(norm(forventet.inneholder));
  if (typeof forventet === "number") return typeof faktisk === "number" && Math.abs(faktisk - forventet) < 0.5;
  return norm(forventet) === norm(faktisk);
}

const visVerdi = (v) => (v === null || v === undefined ? "ikke oppgitt" : typeof v === "object" ? `inneholder «${v.inneholder}»` : String(v));

// Sammenligner statusen agenten eller koden ga, med fasiten for ett punkt.
function sammenlign(fasit, faktisk) {
  if (faktisk === null) return { vurdering: "ikke_nadd", type: null };
  if (faktisk === fasit.forventet) return { vurdering: "riktig", type: null };
  if ((fasit.godtatt ?? []).includes(faktisk)) return { vurdering: "godtatt", type: null };
  const f = fasit.forventet;
  let type = "annet";
  if (FEIL.has(f) && USIKKER.has(faktisk)) type = "usikker";
  else if (FEIL.has(f)) type = "oversett";
  else if (FEIL.has(faktisk) && !USIKKER.has(f)) type = "falsk_feil";
  else if (USIKKER.has(faktisk)) type = "usikker";
  return { vurdering: "feil", type };
}

const antall = (n, entall, flertall) => `${n} ${n === 1 ? entall : flertall}`;

/**
 * @param {object} fasit Innholdet i evaluator/fasit/<sak>.json.
 * @param {object[]} hendelser Hendelsene fra kjøringen, slik serveren sendte dem.
 * @param {object} sjekkliste Innholdet i data/sjekkliste.json.
 */
export function valider(fasit, hendelser, sjekkliste) {
  const k = lesKjoring(hendelser);
  if (!k.ferdig) throw new Error("Kjøringen er ikke ferdig. Valider når kontrollen er ferdig.");

  const def = new Map(
    sjekkliste.grupper.flatMap((g) => g.punkter.map((p) => [p.id, { ...p, gruppe: g.id, kontrolleresAv: g.kontrolleresAv }])),
  );
  const stoppet = Boolean(k.stopp);
  const planNadd = k.bestemmelser.size > 0 || Boolean(k.konklusjon);
  const alvorlige = [];
  const mindre = [];

  // Kategori
  const kategori = {
    forventet: fasit.kategori.forventet,
    faktisk: k.kategori,
    riktig: k.kategori === fasit.kategori.forventet,
    begrunnelse: fasit.kategori.begrunnelse,
  };
  if (!kategori.riktig) alvorlige.push(`Feil kategori: agenten valgte «${k.kategori ?? "ingen"}», men fasiten er «${kategori.forventet}».`);

  // Opplysningene agenten hentet ut av søknaden
  const opplysninger = Object.entries(fasit.opplysninger).map(([felt, forventet]) => {
    const faktisk = k.opplysninger ? k.opplysninger[felt] ?? null : undefined;
    const riktig = faktisk !== undefined && stemmer(forventet, faktisk);
    if (faktisk !== undefined && !riktig) {
      mindre.push(`Opplysningen «${felt}» ble lest som ${visVerdi(faktisk)}, men fasiten er ${visVerdi(forventet)}.`);
    }
    return { felt, forventet: visVerdi(forventet), faktisk: faktisk === undefined ? null : visVerdi(faktisk), riktig };
  });

  // Punktene. Et punkt som er med i et kritisk funn, er kritisk.
  const kritiske = new Set(fasit.funn.filter((f) => f.kritisk).flatMap((f) => f.krav.map((x) => x.punkt).filter(Boolean)));
  const iFunn = new Set(fasit.funn.flatMap((f) => f.krav.map((x) => x.punkt).filter(Boolean)));
  const punkter = [];

  const vurder = (id, f, svar, steg, tekst, nadd) => {
    const faktisk = svar ? (steg === "plan" ? svar.vurdering : svar.status) : null;
    let { vurdering, type } = sammenlign(f, faktisk);
    // Mangler et punkt i en kjøring som ikke stoppet, hoppet agenten over det.
    if (vurdering === "ikke_nadd" && nadd) {
      vurdering = "feil";
      type = "utelatt";
    }
    let alvor = null;
    if (vurdering === "feil") {
      if (type === "falsk_feil") alvor = "alvorlig";
      else if (kritiske.has(id) && (type === "oversett" || type === "usikker" || type === "utelatt")) alvor = "alvorlig";
      else alvor = "mindre";
    }
    const d = def.get(id);
    const telles = !(d && d.gjelder !== "begge" && d.gjelder !== fasit.kategori.forventet);
    const rad = {
      id,
      steg,
      tekst,
      forventet: f.forventet,
      godtatt: f.godtatt ?? [],
      faktisk,
      vurdering,
      type,
      alvor,
      kritisk: kritiske.has(id),
      telles,
      begrunnelse: f.begrunnelse,
      agent: svar ? (steg === "plan" ? svar.begrunnelse : svar.funnet) : null,
    };
    punkter.push(rad);
    // Feil på punkter som hører til et funn, meldes samlet under funnet. Falske feil meldes alltid.
    if (vurdering === "feil" && (type === "falsk_feil" || type === "annet" || !iFunn.has(id))) {
      const hvem = steg === "matrikkel" ? "koden" : "agenten";
      const melding = type === "utelatt"
        ? `${id}: ${hvem} vurderte ikke punktet. Fasiten er «${f.forventet}».`
        : `${id}: ${hvem} svarte «${faktisk}», men fasiten er «${f.forventet}».${type === "falsk_feil" ? ` ${f.begrunnelse}` : ""}`;
      (alvor === "alvorlig" ? alvorlige : mindre).push(melding);
    }
  };

  const formNadd = !stoppet;
  for (const [id, f] of Object.entries(fasit.punkter)) {
    const d = def.get(id);
    const steg = d?.kontrolleresAv === "kode" ? "matrikkel" : "form";
    vurder(id, f, k.punkter.get(id) ?? null, steg, d?.tekst ?? "", formNadd);
  }

  // Port
  const port = {
    forventet: fasit.port.bestatt,
    faktisk: k.port ? k.port.bestatt : null,
    begrunnelse: fasit.port.begrunnelse,
  };
  port.riktig = port.faktisk === port.forventet;
  if (k.port && !port.riktig) {
    alvorlige.push(port.forventet
      ? "Porten stoppet saken, men søknaden er komplett og skulle gått videre til planvurdering."
      : "Porten slapp saken videre til planvurdering, men søknaden skulle vært stoppet.");
  }

  // Planvurdering
  let plan = null;
  if (fasit.plan) {
    const planNaddFullt = planNadd && !stoppet;
    for (const [id, f] of Object.entries(fasit.plan.bestemmelser)) {
      vurder(id, f, k.bestemmelser.get(id) ?? null, "plan", k.bestemmelser.get(id)?.tittel ?? "", planNaddFullt);
    }
    const kf = fasit.plan.konklusjon;
    const faktisk = k.konklusjon?.konklusjon ?? null;
    plan = {
      nadd: planNadd,
      konklusjon: { forventet: kf.forventet, faktisk, riktig: faktisk === kf.forventet, begrunnelse: kf.begrunnelse },
    };
    if (faktisk && !plan.konklusjon.riktig) alvorlige.push(`Feil konklusjon i planvurderingen: «${faktisk}», men fasiten er «${kf.forventet}».`);
  } else if (planNadd) {
    plan = { nadd: true, konklusjon: null };
  }

  // Funn agenten skulle fått med seg
  const tekstFor = (id) => {
    const p = k.punkter.get(id);
    if (p) return `${p.vurdering ?? ""} ${p.funnet ?? ""}`;
    const b = k.bestemmelser.get(id);
    return b ? `${b.krav ?? ""} ${b.soknad ?? ""} ${b.begrunnelse ?? ""}` : "";
  };
  const statusFor = (id) => k.punkter.get(id)?.status ?? k.bestemmelser.get(id)?.vurdering ?? null;
  const naddFor = (id) => (k.bestemmelser.has(id) || k.punkter.has(id) ? true : fasit.plan?.bestemmelser?.[id] ? planNadd && !stoppet : !stoppet);

  const funn = fasit.funn.map((f) => {
    const deler = f.krav.map((x) => {
      const faktisk = statusFor(x.punkt);
      return { punkt: x.punkt, faktisk, ok: faktisk !== null && x.status.includes(faktisk), nadd: faktisk !== null || naddFor(x.punkt) };
    });
    const nadde = deler.filter((d) => d.nadd);
    const ok = nadde.filter((d) => d.ok);
    let utfall;
    let detalj = deler.map((d) => `${d.punkt}: ${d.faktisk ?? (d.nadd ? "ikke vurdert" : "ikke nådd")}`).join(" · ");
    if (!nadde.length) utfall = "ikke_nadd";
    else if (ok.length === nadde.length) utfall = "fanget";
    else if (ok.length) utfall = "delvis";
    else utfall = "oversett";
    if (utfall === "fanget" && f.nevner) {
      const tekst = [
        ...f.nevner.punkter.map(tekstFor),
        f.nevner.konklusjon ? k.konklusjon?.oppsummering ?? "" : "",
      ].join(" ");
      const funnet = f.nevner.ord.some((ord) => norm(tekst).includes(norm(ord)));
      if (!funnet) {
        utfall = "delvis";
        detalj += ` · nevner ikke «${f.nevner.ord.join("» eller «")}»`;
      }
    }
    if (utfall === "delvis" || utfall === "oversett") {
      const melding = `${f.id} ${utfall === "delvis" ? "bare delvis fanget" : "ikke fanget"}: ${f.tekst} (${detalj})`;
      (f.kritisk ? alvorlige : mindre).push(melding);
    }
    return { id: f.id, tekst: f.tekst, kritisk: f.kritisk, utfall, detalj };
  });

  // Feller agenten ikke skulle gå i. Feilene telles allerede under punktene, kategorien og opplysningene.
  const feller = (fasit.feller ?? []).map((l) => {
    const deler = l.krav.map((x) => {
      if (x.kategori) return { nadd: k.kategori !== null, ok: x.kategori.includes(k.kategori) };
      if ("opplysning" in x) return { nadd: Boolean(k.opplysninger), ok: Boolean(k.opplysninger) && stemmer(x.verdi, k.opplysninger[x.opplysning] ?? null) };
      const faktisk = statusFor(x.punkt);
      return { nadd: faktisk !== null, ok: faktisk !== null && x.status.includes(faktisk) };
    });
    const nadde = deler.filter((d) => d.nadd);
    const utfall = !nadde.length ? "ikke_nadd" : nadde.every((d) => d.ok) ? "unngatt" : "gikk_i";
    return { id: l.id, tekst: l.tekst, utfall };
  });

  // Stopp ved første feil: stoppet kjøringen på et punkt som virkelig er en feil?
  let stopp = null;
  if (k.stopp) {
    const f = fasit.punkter[k.stopp.id] ?? fasit.plan?.bestemmelser?.[k.stopp.id];
    const legitimt = Boolean(f) && kategori.riktig && (FEIL.has(f.forventet) || (f.godtatt ?? []).some((s) => FEIL.has(s)));
    stopp = { id: k.stopp.id, steg: k.stopp.steg, legitimt, forventet: f?.forventet ?? null };
  }

  const tellbare = punkter.filter((p) => p.telles);
  const vurderte = tellbare.filter((p) => p.vurdering !== "ikke_nadd");
  const tall = {
    totalt: tellbare.length,
    vurdert: vurderte.length,
    riktig: vurderte.filter((p) => p.vurdering === "riktig").length,
    godtatt: vurderte.filter((p) => p.vurdering === "godtatt").length,
    feil: vurderte.filter((p) => p.vurdering === "feil").length,
    ikkeNadd: tellbare.length - vurderte.length,
    funn: funn.length,
    funnFanget: funn.filter((f) => f.utfall === "fanget").length,
    funnIkkeNadd: funn.filter((f) => f.utfall === "ikke_nadd").length,
  };

  const resultat = alvorlige.length ? "ikke_bestatt" : mindre.length ? "bestatt_med_merknader" : "bestatt";
  const setninger = [
    { ikke_bestatt: "Ikke bestått.", bestatt_med_merknader: "Bestått med merknader.", bestatt: "Bestått." }[resultat],
    `${tall.riktig + tall.godtatt} av ${antall(tall.vurdert, "vurdert punkt", "vurderte punkter")} stemmer med fasiten.`,
    `${tall.funnFanget} av ${tall.funn - tall.funnIkkeNadd} funn er fanget${tall.funnIkkeNadd ? ` (${tall.funnIkkeNadd} ikke nådd)` : ""}.`,
  ];
  if (stopp) {
    setninger.push(stopp.legitimt
      ? `Kjøringen stoppet riktig ved ${stopp.id}. ${antall(tall.ikkeNadd, "punkt", "punkter")} ble ikke nådd, så valideringen gjelder bare delen som ble kjørt.`
      : `Kjøringen stoppet ved ${stopp.id}, men fasiten har ingen feil der.`);
  }

  return {
    sakId: fasit.sakId,
    modus: k.start?.stoppVedFeil ? "stopp" : "hele",
    effort: k.start?.effort ?? k.ferdig?.effort ?? null,
    oppsett: k.start?.oppsett ?? k.ferdig?.oppsett ?? null,
    resultat,
    oppsummering: setninger.join(" "),
    sammendrag: fasit.sammendrag,
    tall,
    kategori,
    opplysninger,
    port,
    plan,
    stopp,
    punkter,
    funn,
    feller,
    alvorlige,
    mindre,
    merknader: fasit.merknader ?? [],
  };
}
