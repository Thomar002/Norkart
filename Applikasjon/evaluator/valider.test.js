import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { valider } from "./valider.js";
import { kontrollerMatrikkel } from "../matrikkel.js";
import { planParagrafer } from "../server.js";

const les = (sti) => JSON.parse(fs.readFileSync(new URL(sti, import.meta.url), "utf8"));
const sjekkliste = les("../data/sjekkliste.json");
const matrikkel = les("../data/matrikkel.json");
const planregister = les("../data/planregister.json");
const fasiter = { "2026-201": les("./fasit/2026-201.json"), "2026-202": les("./fasit/2026-202.json") };
const FEIL = new Set(["mangler", "avvik"]);

const opplysningerFra = (fasit) =>
  Object.fromEntries(Object.entries(fasit.opplysninger).map(([k, v]) => [k, v && typeof v === "object" ? `Plan ${v.inneholder}` : v]));

/**
 * Lager hendelsene fra en kjøring der alle punktene får statusen i fasiten, med unntakene i `endre`.
 * Rekkefølgen og stoppet ved første feil følger server.js: A og B, så matrikkelen, så C–E, port og plan.
 */
function kjoring(fasit, { stopp = false, endre = {}, kategori, opplysninger } = {}) {
  const h = [{ type: "start", stoppVedFeil: stopp, effort: "medium" }];
  const kat = kategori ?? fasit.kategori.forventet;
  h.push({ type: "kategori", kategori: kat });
  h.push({ type: "opplysninger", opplysninger: { ...opplysningerFra(fasit), ...opplysninger } });
  let stoppet = kat === "uklart" && stopp;
  if (stoppet) h.push({ type: "stopp", steg: "form", id: "A1", grunn: "Kategori uklart." });
  const rekkefolge = ["A", "B", "M", "C", "D", "E"].flatMap((g) => sjekkliste.grupper.find((x) => x.id === g).punkter.map((p) => p.id));
  let feil = kat === "uklart";
  for (const id of rekkefolge) {
    if (stoppet) break;
    const status = endre[id] ?? fasit.punkter[id].forventet;
    h.push({ type: "punkt", steg: id.startsWith("M") ? "matrikkel" : "form", punkt: { id, status, vurdering: "", funnet: `${id} ${status}` } });
    if (FEIL.has(status)) {
      feil = true;
      if (stopp) {
        stoppet = true;
        h.push({ type: "stopp", steg: id.startsWith("M") ? "matrikkel" : "form", id, grunn: `${id}` });
      }
    }
  }
  h.push({ type: "port", bestatt: !feil && !stoppet, grunner: [], mangelliste: [] });
  if (!feil && !stoppet && fasit.plan) {
    let avvik = false;
    for (const id of Object.keys(fasit.plan.bestemmelser)) {
      const vurdering = endre[id] ?? fasit.plan.bestemmelser[id].forventet;
      h.push({ type: "bestemmelse", bestemmelse: { id, vurdering, krav: "", soknad: "", begrunnelse: "Tiltaket krever dispensasjon." } });
      if (vurdering === "avvik") {
        avvik = true;
        if (stopp) {
          stoppet = true;
          h.push({ type: "stopp", steg: "plan", id, grunn: id });
          break;
        }
      }
    }
    h.push({ type: "konklusjon", konklusjon: avvik ? "avvik" : "samsvar", oppsummering: "Vurderingen gjelder dispensasjon." });
  }
  h.push({ type: "ferdig", kategori: kat });
  return h;
}

test("fasiten har alle punktene i kontrollisten, med gyldige statuser", () => {
  for (const [sak, fasit] of Object.entries(fasiter)) {
    const ider = sjekkliste.grupper.flatMap((g) => g.punkter.map((p) => p.id));
    assert.deepEqual(Object.keys(fasit.punkter).sort(), [...ider].sort(), sak);
    for (const g of sjekkliste.grupper) {
      const gyldige = sjekkliste.statuser[g.kontrolleresAv];
      for (const p of g.punkter) {
        const f = fasit.punkter[p.id];
        for (const s of [f.forventet, ...(f.godtatt ?? [])]) assert.ok(gyldige.includes(s), `${sak} ${p.id}: ${s}`);
        assert.ok(f.begrunnelse, `${sak} ${p.id} mangler begrunnelse`);
      }
    }
    for (const f of [...fasit.funn, ...fasit.feller]) {
      for (const x of f.krav) {
        if (x.punkt) assert.ok(fasit.punkter[x.punkt] || fasit.plan?.bestemmelser[x.punkt], `${sak} ${f.id} viser til ukjent punkt ${x.punkt}`);
      }
    }
  }
});

test("planvurderingen i fasiten har alle paragrafene i planen", () => {
  const paragrafer = planParagrafer(fs.readFileSync(new URL("../data/reguleringsplan.md", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(fasiter["2026-201"].plan.bestemmelser), paragrafer.map((p) => p.id));
});

test("matrikkelpunktene i fasiten er det koden gir for opplysningene i fasiten", () => {
  for (const [sak, fasit] of Object.entries(fasiter)) {
    const r = kontrollerMatrikkel(opplysningerFra(fasit), fasit.kategori.forventet, matrikkel, planregister);
    for (const p of r.punkter) assert.equal(p.status, fasit.punkter[p.id].forventet, `${sak} ${p.id}: ${p.funnet}`);
  }
});

test("bare valideringen leser fasiten", () => {
  const kilde = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.equal(kilde.match(/lesFasit\(/g).length, 2);
  assert.ok(kilde.indexOf("lesFasit(sakMappe)", kilde.indexOf('"/api/valider"')) > 0);
  for (const sak of Object.keys(fasiter)) {
    const sakJson = fs.readFileSync(new URL(`../data/saker/${sak}/sak.json`, import.meta.url), "utf8");
    assert.ok(!/fasit|evaluator/.test(sakJson));
  }
});

test("en kjøring som følger fasiten, består", () => {
  for (const [sak, fasit] of Object.entries(fasiter)) {
    const r = valider(fasit, kjoring(fasit), sjekkliste);
    assert.equal(r.resultat, "bestatt", `${sak}: ${[...r.alvorlige, ...r.mindre].join(" | ")}`);
    assert.equal(r.effort, "medium");
    assert.equal(r.tall.feil, 0);
    assert.ok(r.funn.every((f) => f.utfall === "fanget"), sak);
    assert.ok(r.feller.every((f) => f.utfall === "unngatt"), sak);
  }
});

test("stopp ved første feil på riktig sted består, og resten er ikke nådd", () => {
  const r1 = valider(fasiter["2026-201"], kjoring(fasiter["2026-201"], { stopp: true }), sjekkliste);
  assert.equal(r1.resultat, "bestatt");
  assert.deepEqual([r1.stopp.id, r1.stopp.legitimt], ["§ 4", true]);
  assert.equal(r1.punkter.find((p) => p.id === "§ 5").vurdering, "ikke_nadd");

  const r2 = valider(fasiter["2026-202"], kjoring(fasiter["2026-202"], { stopp: true }), sjekkliste);
  assert.equal(r2.resultat, "bestatt");
  assert.deepEqual([r2.stopp.id, r2.stopp.legitimt], ["B2", true]);
  assert.equal(r2.funn.find((f) => f.id === "F3").utfall, "ikke_nadd");
});

test("201: overser agenten byggegrensen, er kjøringen ikke bestått", () => {
  const r = valider(fasiter["2026-201"], kjoring(fasiter["2026-201"], { endre: { "§ 4": "samsvar" } }), sjekkliste);
  assert.equal(r.resultat, "ikke_bestatt");
  assert.equal(r.funn.find((f) => f.id === "F1").utfall, "oversett");
  assert.equal(r.plan.konklusjon.riktig, false);
});

test("201: en falsk mangel stopper en komplett søknad og gir ikke bestått", () => {
  const r = valider(fasiter["2026-201"], kjoring(fasiter["2026-201"], { stopp: true, endre: { D13: "mangler" } }), sjekkliste);
  assert.equal(r.resultat, "ikke_bestatt");
  assert.deepEqual([r.stopp.id, r.stopp.legitimt], ["D13", false]);
  assert.equal(r.punkter.find((p) => p.id === "D13").type, "falsk_feil");
  assert.equal(r.port.riktig, false);
});

test("201: uklart der fasiten er oppfylt, gir bestått med merknader", () => {
  const r = valider(fasiter["2026-201"], kjoring(fasiter["2026-201"], { endre: { D13: "uklart" } }), sjekkliste);
  assert.equal(r.resultat, "bestatt_med_merknader");
  assert.equal(r.alvorlige.length, 0);
  assert.equal(r.feller.find((f) => f.id === "L1").utfall, "gikk_i");
});

test("201: nevner ikke agenten dispensasjon, er F2 bare delvis fanget", () => {
  const h = kjoring(fasiter["2026-201"]).map((x) =>
    x.type === "bestemmelse" ? { ...x, bestemmelse: { ...x.bestemmelse, begrunnelse: "For nær veien." } }
      : x.type === "konklusjon" ? { ...x, oppsummering: "Avvik fra § 4." } : x);
  const r = valider(fasiter["2026-201"], h, sjekkliste);
  assert.equal(r.funn.find((f) => f.id === "F2").utfall, "delvis");
  assert.equal(r.resultat, "bestatt_med_merknader");
});

test("202: godtar agenten skissen uten målestokk, er kjøringen ikke bestått", () => {
  const r = valider(fasiter["2026-202"], kjoring(fasiter["2026-202"], { endre: { C2: "oppfylt" } }), sjekkliste);
  assert.equal(r.resultat, "ikke_bestatt");
  assert.equal(r.funn.find((f) => f.id === "F4").utfall, "delvis");
});

test("202: feil kategori gir ikke bestått", () => {
  const r = valider(fasiter["2026-202"], kjoring(fasiter["2026-202"], { kategori: "endring" }), sjekkliste);
  assert.equal(r.resultat, "ikke_bestatt");
  assert.equal(r.kategori.riktig, false);
});

test("202: gjetter agenten kommunen, går den i fella", () => {
  const r = valider(fasiter["2026-202"], kjoring(fasiter["2026-202"], { opplysninger: { kommune: "Hvileskjær" } }), sjekkliste);
  assert.equal(r.feller.find((f) => f.id === "L3").utfall, "gikk_i");
  assert.equal(r.opplysninger.find((o) => o.felt === "kommune").riktig, false);
  assert.notEqual(r.resultat, "bestatt");
});

test("en kjøring som ikke er ferdig, kan ikke valideres", () => {
  const h = kjoring(fasiter["2026-201"]).filter((x) => x.type !== "ferdig");
  assert.throws(() => valider(fasiter["2026-201"], h, sjekkliste), /ikke ferdig/);
});
