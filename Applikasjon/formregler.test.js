import test from "node:test";
import assert from "node:assert/strict";
import { kontrollerMaal, kontrollerNabogrense, kontrollerOpplysninger } from "./formregler.js";

const dokumenter = [{ id: "DOK-0001" }, { id: "DOK-0002" }, { id: "DOK-0003" }];

const opplysninger = {
  tiltakshaver: "Knut Solberg",
  kommune: "Hvileskjær",
  kommunenr: "8888",
  gnr: 12,
  bnr: 34,
  adresse: "Solbakken 7",
  postnr: "9998",
  poststed: "Hvileskjær",
  tomteareal: 800,
  byaFor: 120,
  tiltakBya: 28,
  planOppgitt: "8888/2019001",
};

const fakta = {
  telefon: "900 00 123",
  epost: "",
  borPaByggeadressen: "ja",
  postadresse: "",
  hvaSkalBygges: "Tilbygg med soverom",
  hvorPaEiendommen: "Mot nord",
  bruk: "Soverom",
  beregningsmaate: "%-BYA",
  byaEtter: "184",
  utnyttingEtter: "23,0 % BYA",
  tiltakBra: "25",
  avstandNabogrense: "10",
  avstandVeigrense: "4",
  avstandVeimidte: "8",
  avstandBygning: "27",
  omgivelserBesvart: true,
  omgivelserJa: [],
  omgivelserVedlagt: false,
  avkjorsel: "nei",
  avkjorselVedlagt: false,
  dispensasjon: "nei",
  dispensasjonVedlagt: false,
  vedleggsliste: [
    { tittel: "Situasjonsplan", dokumentId: "DOK-0002" },
    { tittel: "Plantegning", dokumentId: "DOK-0003" },
  ],
  dato: "2026-10-04",
  underskrift: "signert",
  parkeringsplasser: "2",
  parkeringBya: "36",
  situasjonsplanMaalestokk: "1:500",
  tegnetTiltak: "7,0 × 4,0",
  tegnetEksisterende: "15,0 × 8,0",
  tegnetAvstandNabogrense: "10,0 m",
  tegnetAvstandVeigrense: "4,0 m",
  tegnetAvstandVeimidte: "8,0 m",
  tegnetAvstandBygning: "27,0 m",
  tegnetParkeringsplasser: "2",
  garasjeEllerBod: false,
  samtykkeNabogrense: false,
};

const status = (r) => Object.fromEntries(Object.entries(r).map(([id, p]) => [id, p.status]));

test("en komplett søknad oppfyller alle punktene i gruppe B", () => {
  const r = kontrollerOpplysninger(opplysninger, fakta, dokumenter);
  assert.equal(Object.keys(r).length, 16);
  assert.deepEqual(Object.entries(status(r)).filter(([, s]) => s !== "oppfylt"), []);
});

test("manglende kommune, postnummer og plan gir mangler", () => {
  const r = status(kontrollerOpplysninger({ ...opplysninger, kommune: null, kommunenr: "", postnr: null, planOppgitt: null }, fakta, dokumenter));
  assert.equal(r.B2, "mangler");
  assert.equal(r.B3, "mangler");
  assert.equal(r.B7, "mangler");
  assert.equal(r.B1, "oppfylt");
});

test("bare fornavn er ikke fullt navn", () => {
  assert.equal(kontrollerOpplysninger({ ...opplysninger, tiltakshaver: "Knut" }, fakta, dokumenter).B4.status, "mangler");
});

test("annen bostedsadresse krever postadresse", () => {
  const uten = kontrollerOpplysninger(opplysninger, { ...fakta, borPaByggeadressen: "nei" }, dokumenter);
  assert.equal(uten.B5.status, "mangler");
  const med = kontrollerOpplysninger(opplysninger, { ...fakta, borPaByggeadressen: "nei", postadresse: "Storgata 1, 9999 Byen" }, dokumenter);
  assert.equal(med.B5.status, "oppfylt");
});

test("ja på et forhold uten vedlegg gir mangler", () => {
  const r = kontrollerOpplysninger(opplysninger, { ...fakta, omgivelserJa: ["høyspent"], omgivelserVedlagt: false }, dokumenter);
  assert.equal(r.B12.status, "mangler");
  assert.match(r.B12.funnet, /høyspent/);
});

test("ubesvart avkjørsel og dispensasjon gir mangler, ja med vedlegg er oppfylt", () => {
  const r = status(kontrollerOpplysninger(opplysninger, { ...fakta, avkjorsel: "ikke_besvart", dispensasjon: "ja", dispensasjonVedlagt: true }, dokumenter));
  assert.equal(r.B13, "mangler");
  assert.equal(r.B14, "oppfylt");
});

test("vedleggslisten må stemme med dokumentene i saken", () => {
  const ikkeSendt = kontrollerOpplysninger(opplysninger, { ...fakta, vedleggsliste: [...fakta.vedleggsliste, { tittel: "Fasader", dokumentId: "" }] }, dokumenter);
  assert.equal(ikkeSendt.B15.status, "mangler");
  assert.match(ikkeSendt.B15.funnet, /Fasader/);
  const ikkeNevnt = kontrollerOpplysninger(opplysninger, { ...fakta, vedleggsliste: fakta.vedleggsliste.slice(0, 1) }, dokumenter);
  assert.equal(ikkeNevnt.B15.status, "mangler");
  assert.match(ikkeNevnt.B15.funnet, /DOK-0003/);
  assert.equal(kontrollerOpplysninger(opplysninger, { ...fakta, vedleggsliste: [] }, dokumenter).B15.status, "mangler");
});

test("en e-post med navnet under er godt nok, uten dato er det ikke", () => {
  assert.equal(kontrollerOpplysninger(opplysninger, { ...fakta, underskrift: "navn_under_epost" }, dokumenter).B16.status, "oppfylt");
  assert.equal(kontrollerOpplysninger(opplysninger, { ...fakta, dato: "" }, dokumenter).B16.status, "mangler");
});

test("D13: målene på situasjonsplanen stemmer med søknaden", () => {
  const r = kontrollerMaal(opplysninger, fakta);
  assert.equal(r.status, "oppfylt");
  assert.match(r.funnet, /tiltakets BYA 28 m²/);
});

test("D13: feil areal, avstand eller parkering gir mangler", () => {
  const areal = kontrollerMaal(opplysninger, { ...fakta, tegnetTiltak: "8,0 × 4,0" });
  assert.equal(areal.status, "mangler");
  assert.match(areal.funnet, /søknaden oppgir 28 m², tegningen viser 32 m²/);
  assert.equal(kontrollerMaal(opplysninger, { ...fakta, tegnetAvstandNabogrense: "9,5" }).status, "mangler");
  // Parkering regnes med 18 m² per plass, uansett hvor stor plassen er tegnet.
  assert.equal(kontrollerMaal(opplysninger, { ...fakta, parkeringBya: "25" }).status, "mangler");
});

test("D13: en skisse uten målestokk gir uklart, selv om tallene stemmer, men avvik gir fortsatt mangler", () => {
  const skisse = { ...fakta, situasjonsplanMaalestokk: "" };
  assert.equal(kontrollerMaal(opplysninger, skisse).status, "uklart");
  assert.equal(kontrollerMaal(opplysninger, { ...skisse, tegnetTiltak: "8,0 × 4,0" }).status, "mangler");
});

test("D13: ingen mål å sammenligne gir uklart", () => {
  const tomt = Object.fromEntries(Object.keys(fakta).filter((k) => k.startsWith("tegnet")).map((k) => [k, ""]));
  assert.equal(kontrollerMaal(opplysninger, { ...fakta, ...tomt, parkeringBya: "" }).status, "uklart");
});

test("E5: minst 4 m til nabogrensen gjør punktet ikke relevant", () => {
  assert.equal(kontrollerNabogrense(opplysninger, fakta).status, "ikke_relevant");
});

test("E5: nærmere enn 4 m krever samtykke, med unntak for små garasjer", () => {
  const naer = { ...fakta, avstandNabogrense: "2,0" };
  assert.equal(kontrollerNabogrense(opplysninger, naer).status, "mangler");
  assert.equal(kontrollerNabogrense(opplysninger, { ...naer, samtykkeNabogrense: true }).status, "oppfylt");
  const garasje = { ...naer, garasjeEllerBod: true, tiltakBra: "34" };
  assert.equal(kontrollerNabogrense({ ...opplysninger, tiltakBya: 36 }, garasje).status, "ikke_relevant");
  assert.equal(kontrollerNabogrense({ ...opplysninger, tiltakBya: 36 }, { ...garasje, avstandNabogrense: "0,5" }).status, "mangler");
  assert.equal(kontrollerNabogrense({ ...opplysninger, tiltakBya: 36 }, { ...garasje, tiltakBra: "" }).status, "uklart");
});
