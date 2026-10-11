import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kontrollerMatrikkel } from "./matrikkel.js";

const les = (fil) => JSON.parse(fs.readFileSync(new URL(`./data/${fil}`, import.meta.url), "utf8"));
const matrikkel = les("matrikkel.json");
const planregister = les("planregister.json");

const riktig = {
  kommune: "Hvileskjær",
  kommunenr: "8888",
  gnr: 12,
  bnr: 34,
  adresse: "Solbakken 7",
  postnr: "9998",
  poststed: "Hvileskjær",
  tomteareal: 800,
  byaFor: 120,
  planOppgitt: "Reguleringsplan for Solbakken boligområde (8888/2019001)",
};

function status(resultat) {
  return Object.fromEntries(resultat.punkter.map((p) => [p.id, p.status]));
}

test("riktige opplysninger gir ingen avvik og finner planen", () => {
  const r = kontrollerMatrikkel(riktig, "endring", matrikkel, planregister);
  assert.deepEqual(
    Object.values(status(r)).filter((s) => s !== "oppfylt"),
    [],
  );
  assert.equal(r.plan.id, "8888/2019001");
  assert.equal(r.eiendom.bnr, 34);
});

test("adresse og små bokstaver normaliseres", () => {
  const r = kontrollerMatrikkel({ ...riktig, adresse: "  solbakken   7. ", poststed: "HVILESKJÆR" }, "endring", matrikkel, planregister);
  assert.equal(status(r).M3, "oppfylt");
  assert.equal(status(r).M4, "oppfylt");
  assert.equal(status(r).M5, "oppfylt");
});

test("feil kommune gir avvik", () => {
  const r = kontrollerMatrikkel({ ...riktig, kommune: "Kristiansand", kommunenr: "4204" }, "endring", matrikkel, planregister);
  assert.equal(status(r).M1, "avvik");
});

test("ukjent gnr/bnr gir avvik", () => {
  const r = kontrollerMatrikkel({ ...riktig, bnr: 99 }, "endring", matrikkel, planregister);
  assert.equal(status(r).M2, "avvik");
  assert.equal(r.plan, null);
});

test("adresse som hører til en annen eiendom gir avvik", () => {
  const r = kontrollerMatrikkel({ ...riktig, bnr: 35, adresse: "Solbakken 11" }, "nybygg", matrikkel, planregister);
  assert.equal(status(r).M3, "oppfylt");
  assert.equal(status(r).M4, "avvik");
});

test("ukjent adresse gir avvik", () => {
  const r = kontrollerMatrikkel({ ...riktig, adresse: "Solbakken 70" }, "endring", matrikkel, planregister);
  assert.equal(status(r).M3, "avvik");
});

test("feil postnummer gir avvik", () => {
  const r = kontrollerMatrikkel({ ...riktig, postnr: "8888" }, "endring", matrikkel, planregister);
  assert.equal(status(r).M5, "avvik");
});

test("tomteareal og BYA utenfor toleransen gir avvik", () => {
  const r = kontrollerMatrikkel({ ...riktig, tomteareal: 700, byaFor: 100 }, "endring", matrikkel, planregister);
  assert.equal(status(r).M6, "avvik");
  assert.equal(status(r).M7, "avvik");
});

test("endring på ubebygd tomt gir avvik, nybygg gjør det ikke", () => {
  const tomt = { ...riktig, bnr: 36, adresse: "Solbakken 11", tomteareal: 820, byaFor: 0 };
  assert.equal(status(kontrollerMatrikkel(tomt, "endring", matrikkel, planregister)).M8, "avvik");
  assert.equal(status(kontrollerMatrikkel(tomt, "nybygg", matrikkel, planregister)).M8, "ikke_vurdert");
});

test("eiendom uten plan gir avvik på M9", () => {
  const r = kontrollerMatrikkel(
    { ...riktig, gnr: 14, bnr: 2, adresse: "Fjellveien 3", tomteareal: 1450, byaFor: 140, planOppgitt: null },
    "endring",
    matrikkel,
    planregister,
  );
  assert.equal(status(r).M9, "avvik");
});

test("feil plan i søknaden gir avvik på M10", () => {
  const r = kontrollerMatrikkel({ ...riktig, planOppgitt: "Kommuneplanens arealdel 2023" }, "endring", matrikkel, planregister);
  assert.equal(status(r).M10, "avvik");
});
