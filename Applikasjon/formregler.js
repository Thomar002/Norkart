// Gruppe B i kontrollisten (opplysninger i søknaden), D13 (målene på tegningene) og E5 (samtykke ved nabogrensen) avgjort av kode.
// Agenten henter bare ut fakta fra søknaden og tegningene. Reglene her avgjør om hvert punkt er oppfylt.
// Ren kode uten AI: samme fakta gir alltid samme svar.

const tom = (verdi) => verdi === null || verdi === undefined || String(verdi).trim() === "";

// Strukturert utdata tillater høyst 16 felt som kan være null. Faktaene er derfor tekst, og tom tekst betyr at det ikke står.
const tekst = (description) => ({ type: "string", description: `${description} Tom tekst når det ikke står i søknaden.` });
const valg = (verdier, description) => ({ type: "string", enum: verdier, description });

/** Feltene agenten henter ut i tillegg til eiendomsopplysningene. Brukes i skjemaet til modellen. */
export const FAKTA_SKJEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "telefon", "epost", "borPaByggeadressen", "postadresse",
    "hvaSkalBygges", "hvorPaEiendommen", "bruk",
    "beregningsmaate", "byaEtter", "utnyttingEtter", "tiltakBra",
    "avstandNabogrense", "avstandVeigrense", "avstandVeimidte", "avstandBygning",
    "omgivelserBesvart", "omgivelserJa", "omgivelserVedlagt",
    "avkjorsel", "avkjorselVedlagt", "dispensasjon", "dispensasjonVedlagt",
    "vedleggsliste", "dato", "underskrift",
    "parkeringsplasser", "parkeringBya",
    "situasjonsplanMaalestokk", "tegnetTiltak", "tegnetEksisterende", "tegnetAvstandNabogrense", "tegnetAvstandVeigrense", "tegnetAvstandVeimidte", "tegnetAvstandBygning", "tegnetParkeringsplasser",
    "garasjeEllerBod", "samtykkeNabogrense",
  ],
  properties: {
    telefon: tekst("Tiltakshavers telefonnummer."),
    epost: tekst("Tiltakshavers e-postadresse, også avsenderadressen når søknaden kom på e-post."),
    borPaByggeadressen: valg(["ja", "nei", "ikke_oppgitt"], "ja når søknaden sier at tiltakshaver bor på byggeadressen, nei når tiltakshaver bor et annet sted."),
    postadresse: tekst("Tiltakshavers postadresse når den er en annen enn byggeadressen."),
    hvaSkalBygges: tekst("Hva som skal bygges, med søkerens ord."),
    hvorPaEiendommen: tekst("Hvor på eiendommen tiltaket skal stå, med søkerens ord."),
    bruk: tekst("Hva tiltaket skal brukes til, med søkerens ord."),
    beregningsmaate: tekst("Beregningsmåten for grad av utnytting som søknaden oppgir, for eksempel %-BYA."),
    byaEtter: tekst("Bebygd areal etter tiltaket i m², slik søknaden oppgir det."),
    utnyttingEtter: tekst("Grad av utnytting etter tiltaket, slik søknaden oppgir den, for eksempel «23,0 % BYA»."),
    tiltakBra: tekst("Tiltakets eget bruksareal (BRA) i m²."),
    avstandNabogrense: tekst("Korteste avstand fra tiltaket til grensen mot en naboeiendom i meter. Grensen mot vei er ikke nabogrense."),
    avstandVeigrense: tekst("Avstand fra tiltaket til eiendomsgrensen mot vei i meter."),
    avstandVeimidte: tekst("Avstand fra tiltaket til midten av vei i meter. null når søknaden bare oppgir avstand til vei eller veikant."),
    avstandBygning: tekst("Avstand fra tiltaket til nærmeste bygning i meter."),
    omgivelserBesvart: { type: "boolean", description: "true bare når søknaden svarer ja eller nei på hvert av forholdene: vann- og avløpsledninger, høyspent, jernbane eller trikk, strandsone eller vassdrag, flom, ras eller kvikkleire, forurenset grunn, kulturminner, vernede arter, midlertidig byggeforbud og fjernvarme." },
    omgivelserJa: { type: "array", items: { type: "string" }, description: "Forholdene søknaden svarer ja på. Tom liste når alle er nei." },
    omgivelserVedlagt: { type: "boolean", description: "Ved ja på et forhold: om uttalelse eller tillatelse er vedlagt. false når alle er nei." },
    avkjorsel: valg(["ja", "nei", "ikke_besvart"], "Om søknaden sier at tiltaket gir ny eller endret avkjørsel."),
    avkjorselVedlagt: { type: "boolean", description: "Ved ja: om avkjøringstillatelse eller tinglyst veirett er vedlagt. false ellers." },
    dispensasjon: valg(["ja", "nei", "ikke_besvart"], "Om søknaden sier at tiltaket trenger dispensasjon eller tillatelse fra andre myndigheter."),
    dispensasjonVedlagt: { type: "boolean", description: "Ved ja: om begrunnet dispensasjonssøknad eller vedtak er vedlagt. false ellers." },
    vedleggsliste: {
      type: "array",
      description: "Vedleggslisten i søknaden, ett element per vedlegg. Tom liste når søknaden ikke har en vedleggsliste.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tittel", "dokumentId"],
        properties: {
          tittel: { type: "string", description: "Vedlegget slik det står i vedleggslisten." },
          dokumentId: { type: "string", description: "ID-en til dokumentet i saken som er dette vedlegget. Tom tekst hvis det ikke er sendt inn." },
        },
      },
    },
    dato: tekst("Datoen søknaden er datert, eller datoen e-posten ble sendt."),
    parkeringsplasser: tekst("Antall parkeringsplasser på terreng som søknaden oppgir."),
    parkeringBya: tekst("Bebygd areal for parkering på terreng i m², slik søknaden oppgir det."),
    situasjonsplanMaalestokk: tekst("Målestokken som står på situasjonsplanen, for eksempel «1:500». En skisse uten oppgitt målestokk har ingen."),
    tegnetTiltak: tekst("Tiltakets utvendige mål slik de står på situasjonsplanen eller plantegningen, lengde × bredde i meter, for eksempel «7,0 × 4,0»."),
    tegnetEksisterende: tekst("Utvendige mål på eksisterende bygninger på eiendommen slik de står på situasjonsplanen, lengde × bredde i meter. Flere bygninger skilles med semikolon."),
    tegnetAvstandNabogrense: tekst("Korteste avstand fra tiltaket til grensen mot en naboeiendom slik den er målsatt på situasjonsplanen, i meter. Grensen mot vei er ikke nabogrense."),
    tegnetAvstandVeigrense: tekst("Avstand fra tiltaket til eiendomsgrensen mot vei slik den er målsatt på situasjonsplanen, i meter."),
    tegnetAvstandVeimidte: tekst("Avstand fra tiltaket til midten av vei slik den er målsatt på situasjonsplanen, i meter."),
    tegnetAvstandBygning: tekst("Avstand fra tiltaket til nærmeste bygning slik den er målsatt på situasjonsplanen, i meter."),
    tegnetParkeringsplasser: tekst("Antall parkeringsplasser på terreng som er tegnet på situasjonsplanen."),
    garasjeEllerBod: { type: "boolean", description: "true når tiltaket er en frittliggende garasje, bod eller lignende uten beboelse." },
    samtykkeNabogrense: { type: "boolean", description: "true når skriftlig samtykke fra hjemmelshaverne på naboeiendommen («Erklæring om nabogrense») er vedlagt." },
    underskrift: valg(["signert", "navn_under_epost", "mangler"], "signert: søknaden er underskrevet av tiltakshaver. navn_under_epost: søknaden kom på e-post fra tiltakshaver med navnet under teksten. mangler: ingen av delene."),
  },
};

const mangler = (felt) => felt.filter(([, verdi]) => tom(verdi)).map(([navn]) => navn);

/**
 * Avgjør punktene i gruppe B.
 * @param {object} o Eiendomsopplysningene agenten hentet ut (gnr, bnr, kommune, adresse osv.).
 * @param {object} f Faktaene agenten hentet ut (FAKTA_SKJEMA).
 * @param {{ id: string }[]} dokumenter Dokumentene i saken. Det første er selve søknaden.
 * @returns {Record<string, { status: "oppfylt"|"mangler", funnet: string }>}
 */
export function kontrollerOpplysninger(o, f, dokumenter) {
  const r = {};
  const krev = (id, felt, oppfylt) => {
    const borte = mangler(felt);
    r[id] = borte.length
      ? { status: "mangler", funnet: `Søknaden oppgir ikke ${borte.join(", ")}.` }
      : { status: "oppfylt", funnet: oppfylt };
  };

  if (Number.isInteger(o.gnr) && Number.isInteger(o.bnr)) {
    r.B1 = { status: "oppfylt", funnet: `Gnr ${o.gnr}, bnr ${o.bnr}.` };
  } else {
    r.B1 = { status: "mangler", funnet: "Søknaden oppgir ikke både gårdsnummer og bruksnummer." };
  }
  r.B2 = tom(o.kommune) && tom(o.kommunenr)
    ? { status: "mangler", funnet: "Søknaden oppgir ikke kommunen med navn eller kommunenummer." }
    : { status: "oppfylt", funnet: `Kommune: ${[o.kommune, o.kommunenr].filter((v) => !tom(v)).join(", ")}.` };
  krev("B3", [["adresse", o.adresse], ["postnummer", o.postnr], ["poststed", o.poststed]], `${o.adresse}, ${o.postnr} ${o.poststed}.`);

  const navn = String(o.tiltakshaver ?? "").trim();
  r.B4 = navn.split(/\s+/).length >= 2
    ? { status: "oppfylt", funnet: `Tiltakshaver: ${navn}.` }
    : { status: "mangler", funnet: navn ? `Bare «${navn}» er oppgitt, ikke fullt navn.` : "Søknaden oppgir ikke tiltakshavers navn." };

  if (tom(f.telefon) && tom(f.epost)) {
    r.B5 = { status: "mangler", funnet: "Søknaden oppgir verken telefon eller e-post til tiltakshaver." };
  } else if (f.borPaByggeadressen === "nei" && tom(f.postadresse)) {
    r.B5 = { status: "mangler", funnet: "Tiltakshaver bor ikke på byggeadressen, men postadressen er ikke oppgitt." };
  } else {
    r.B5 = { status: "oppfylt", funnet: `Kontakt: ${[f.telefon, f.epost].filter((v) => !tom(v)).join(", ")}.` };
  }

  krev("B6", [["hva som skal bygges", f.hvaSkalBygges], ["hvor på eiendommen", f.hvorPaEiendommen], ["hva det skal brukes til", f.bruk]],
    `${f.hvaSkalBygges}; ${f.hvorPaEiendommen}; ${f.bruk}.`);
  krev("B7", [["planen som gjelder", o.planOppgitt]], `Plan: ${o.planOppgitt}.`);
  krev("B8", [["beregningsmåten for grad av utnytting", f.beregningsmaate]], `Beregningsmåte: ${f.beregningsmaate}.`);
  krev("B9", [["tomtens nettoareal", o.tomteareal], ["bebygd areal før tiltaket", o.byaFor], ["bebygd areal etter tiltaket", f.byaEtter], ["grad av utnytting etter tiltaket", f.utnyttingEtter]],
    `Tomt ${o.tomteareal} m², BYA før ${o.byaFor} m², etter ${f.byaEtter} m², utnytting ${f.utnyttingEtter}.`);
  krev("B10", [["tiltakets BYA", o.tiltakBya], ["tiltakets BRA", f.tiltakBra]], `Tiltaket: BYA ${o.tiltakBya} m², BRA ${f.tiltakBra} m².`);
  krev("B11", [["avstand til nabogrense", f.avstandNabogrense], ["avstand til midten av vei", f.avstandVeimidte], ["avstand til nærmeste bygning", f.avstandBygning]],
    `Nabogrense ${f.avstandNabogrense} m, midten av vei ${f.avstandVeimidte} m, nærmeste bygning ${f.avstandBygning} m.`);

  if (!f.omgivelserBesvart) {
    r.B12 = { status: "mangler", funnet: "Søknaden svarer ikke på alle spørsmålene om omgivelsene (ledninger, høyspent, flom og ras osv.)." };
  } else if (f.omgivelserJa.length && f.omgivelserVedlagt !== true) {
    r.B12 = { status: "mangler", funnet: `Søknaden svarer ja på ${f.omgivelserJa.join(", ")}, men uttalelse eller tillatelse er ikke vedlagt.` };
  } else {
    r.B12 = { status: "oppfylt", funnet: f.omgivelserJa.length ? `Ja på ${f.omgivelserJa.join(", ")}, med vedlegg.` : "Søknaden svarer nei på alle forholdene." };
  }

  const jaNei = (id, svar, vedlagt, tema, vedlegg, nei) => {
    if (svar === "ikke_besvart") r[id] = { status: "mangler", funnet: `Søknaden svarer ikke på om tiltaket ${tema}.` };
    else if (svar === "ja" && vedlagt !== true) r[id] = { status: "mangler", funnet: `Tiltaket ${tema}, men ${vedlegg} er ikke vedlagt.` };
    else r[id] = { status: "oppfylt", funnet: svar === "ja" ? `Ja, ${vedlegg} er vedlagt.` : nei };
  };
  jaNei("B13", f.avkjorsel, f.avkjorselVedlagt, "gir ny eller endret avkjørsel", "avkjøringstillatelse eller tinglyst veirett", "Nei, ingen ny eller endret avkjørsel.");
  jaNei("B14", f.dispensasjon, f.dispensasjonVedlagt, "trenger dispensasjon eller tillatelse fra andre myndigheter", "dispensasjonssøknad eller vedtak", "Nei, ingen dispensasjon eller andre tillatelser.");

  if (!f.vedleggsliste?.length) {
    r.B15 = { status: "mangler", funnet: "Søknaden har ingen vedleggsliste." };
  } else {
    const ider = new Set(dokumenter.map((d) => d.id));
    const ikkeSendt = f.vedleggsliste.filter((v) => !v.dokumentId || !ider.has(v.dokumentId)).map((v) => v.tittel);
    const nevnt = new Set(f.vedleggsliste.map((v) => v.dokumentId));
    const ikkeNevnt = dokumenter.slice(1).map((d) => d.id).filter((id) => !nevnt.has(id));
    const feil = [
      ikkeSendt.length ? `står i vedleggslisten, men er ikke sendt inn: ${ikkeSendt.join("; ")}` : null,
      ikkeNevnt.length ? `er sendt inn, men står ikke i vedleggslisten: ${ikkeNevnt.join(", ")}` : null,
    ].filter(Boolean);
    r.B15 = feil.length
      ? { status: "mangler", funnet: `Vedleggslisten stemmer ikke: ${feil.join(". ")}.` }
      : { status: "oppfylt", funnet: `Vedleggslisten har ${f.vedleggsliste.length} vedlegg, og alle er sendt inn.` };
  }

  if (tom(f.dato) || f.underskrift === "mangler") {
    r.B16 = { status: "mangler", funnet: `Søknaden er ikke ${[tom(f.dato) ? "datert" : null, f.underskrift === "mangler" ? "underskrevet" : null].filter(Boolean).join(" eller ")}.` };
  } else {
    r.B16 = { status: "oppfylt", funnet: `Datert ${f.dato}, ${f.underskrift === "signert" ? "underskrevet" : "navnet står under e-posten"}.` };
  }
  return r;
}

// Parkering på terreng regnes med 18 m² per plass i BYA (veileder H-2300).
const PARKERING_M2 = 18;

const tall = (tekst) => [...String(tekst ?? "").matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
const areal = (maal) => {
  const [l, b] = tall(maal);
  return l !== undefined && b !== undefined ? l * b : null;
};
const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const likt = (a, b, toleranse) => Math.abs(a - b) <= toleranse;

/**
 * D13: målene på tegningene og situasjonsplanen stemmer med arealene og avstandene i søknaden.
 * Bare mål som står både i søknaden og på tegningene, sammenlignes. At målene står på tegningene, kontrolleres i C6 og C7.
 * Uten målestokk på situasjonsplanen kan målene ikke kontrolleres, selv om tallene som står der, stemmer.
 * @returns {{ status: "oppfylt"|"mangler"|"uklart", funnet: string }}
 */
export function kontrollerMaal(o, f) {
  const avvik = [];
  const stemmer = [];
  const sammenlign = (navn, soknad, tegnet, toleranse, enhet) => {
    if (soknad === null || tegnet === null || Number.isNaN(soknad) || Number.isNaN(tegnet)) return;
    if (likt(soknad, tegnet, toleranse)) stemmer.push(`${navn} ${fmt(tegnet)} ${enhet}`);
    else avvik.push(`${navn}: søknaden oppgir ${fmt(soknad)} ${enhet}, tegningen viser ${fmt(tegnet)} ${enhet}`);
  };
  const forste = (verdi) => (tall(verdi).length ? tall(verdi)[0] : null);

  const tiltak = areal(f.tegnetTiltak);
  if (tiltak !== null && typeof o.tiltakBya === "number") sammenlign("tiltakets BYA", o.tiltakBya, tiltak, Math.max(1, o.tiltakBya * 0.02), "m²");
  const eksisterende = String(f.tegnetEksisterende ?? "").split(";").map(areal).filter((a) => a !== null);
  if (eksisterende.length && typeof o.byaFor === "number") {
    const sumEks = eksisterende.reduce((s, a) => s + a, 0);
    sammenlign("BYA før tiltaket", o.byaFor, sumEks, Math.max(1, o.byaFor * 0.02), "m²");
  }
  sammenlign("avstand til nabogrense", forste(f.avstandNabogrense), forste(f.tegnetAvstandNabogrense), 0.1, "m");
  sammenlign("avstand til grensen mot vei", forste(f.avstandVeigrense), forste(f.tegnetAvstandVeigrense), 0.1, "m");
  sammenlign("avstand til midten av vei", forste(f.avstandVeimidte), forste(f.tegnetAvstandVeimidte), 0.1, "m");
  sammenlign("avstand til nærmeste bygning", forste(f.avstandBygning), forste(f.tegnetAvstandBygning), 0.1, "m");
  sammenlign("antall parkeringsplasser", forste(f.parkeringsplasser), forste(f.tegnetParkeringsplasser), 0, "plasser");
  const plasser = forste(f.parkeringsplasser);
  const parkeringBya = forste(f.parkeringBya);
  if (plasser !== null && parkeringBya !== null) sammenlign("BYA for parkering", parkeringBya, plasser * PARKERING_M2, 0, "m² (18 m² per plass)");

  if (avvik.length) return { status: "mangler", funnet: `Målene stemmer ikke: ${avvik.join("; ")}.` };
  if (tom(f.situasjonsplanMaalestokk)) {
    return { status: "uklart", funnet: "Situasjonsplanen har ingen målestokk, så målene på den kan ikke kontrolleres mot søknaden." };
  }
  if (!stemmer.length) return { status: "uklart", funnet: "Ingen mål står både i søknaden og på tegningene, så de kan ikke sammenlignes." };
  return { status: "oppfylt", funnet: `Målene stemmer med søknaden: ${stemmer.join(", ")}.` };
}

/**
 * E5: ligger tiltaket nærmere nabogrensen enn 4 m, må samtykke fra naboen være vedlagt.
 * Unntak: frittliggende garasje, bod eller lignende med høyst 50 m² BYA og BRA, minst 1 m fra grensen.
 * Avstanden til en eiendomsgrense mot vei er ikke avstand til nabogrense.
 * @returns {{ status: "oppfylt"|"mangler"|"uklart"|"ikke_relevant", funnet: string }}
 */
export function kontrollerNabogrense(o, f) {
  const [avstand] = tall(f.avstandNabogrense).length ? tall(f.avstandNabogrense) : tall(f.tegnetAvstandNabogrense);
  if (avstand === undefined) return { status: "uklart", funnet: "Avstanden til nabogrensen står verken i søknaden eller på situasjonsplanen." };
  if (avstand >= 4) return { status: "ikke_relevant", funnet: `Tiltaket ligger ${fmt(avstand)} m fra nabogrensen, altså minst 4 m.` };
  const [bra] = tall(f.tiltakBra);
  if (f.garasjeEllerBod && avstand >= 1) {
    if (typeof o.tiltakBya === "number" && o.tiltakBya <= 50 && bra !== undefined && bra <= 50) {
      return { status: "ikke_relevant", funnet: `Frittliggende garasje eller bod på høyst 50 m², ${fmt(avstand)} m fra nabogrensen. Samtykke trengs ikke.` };
    }
    if (bra === undefined && typeof o.tiltakBya === "number" && o.tiltakBya <= 50) {
      return { status: "uklart", funnet: `Garasje eller bod ${fmt(avstand)} m fra nabogrensen med BYA ${fmt(o.tiltakBya)} m², men BRA er ikke oppgitt, så unntaket kan ikke bekreftes.` };
    }
  }
  return f.samtykkeNabogrense
    ? { status: "oppfylt", funnet: `Tiltaket ligger ${fmt(avstand)} m fra nabogrensen, og samtykke fra naboen er vedlagt.` }
    : { status: "mangler", funnet: `Tiltaket ligger ${fmt(avstand)} m fra nabogrensen, men skriftlig samtykke fra naboen («Erklæring om nabogrense») er ikke vedlagt.` };
}
