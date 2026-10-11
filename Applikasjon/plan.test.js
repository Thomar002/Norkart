import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planKonklusjon, planParagrafer } from "./server.js";

test("finner paragrafene i planbestemmelsene", () => {
  const tekst = fs.readFileSync(new URL("./data/reguleringsplan.md", import.meta.url), "utf8");
  assert.deepEqual(planParagrafer(tekst), [
    { id: "§ 1", tittel: "Formål" },
    { id: "§ 2", tittel: "Utnyttelse" },
    { id: "§ 3", tittel: "Høyde" },
    { id: "§ 4", tittel: "Byggegrenser" },
    { id: "§ 5", tittel: "Parkering" },
  ]);
});

test("tekst uten paragrafer gir tom liste", () => {
  assert.deepEqual(planParagrafer("# Plan\n\nIngen bestemmelser."), []);
});

test("tenkingen er av opp til high og adaptiv på xhigh og max", async () => {
  const { tenking, EFFORT } = await import("./server.js");
  assert.deepEqual(EFFORT, ["low", "medium", "high", "xhigh", "max"]);
  for (const e of ["low", "medium", "high"]) assert.deepEqual(tenking(e), { type: "disabled" });
  for (const e of ["xhigh", "max"]) assert.equal(tenking(e).type, "adaptive");
});

test("konklusjonen er avvik når én paragraf har avvik", () => {
  assert.equal(planKonklusjon([{ vurdering: "samsvar" }, { vurdering: "avvik" }, { vurdering: "usikkert" }]), "avvik");
});

test("konklusjonen er samsvar bare når ingen paragraf har avvik eller er usikker", () => {
  assert.equal(planKonklusjon([{ vurdering: "samsvar" }, { vurdering: "ikke_relevant" }]), "samsvar");
  assert.equal(planKonklusjon([{ vurdering: "samsvar" }, { vurdering: "usikkert" }]), "usikkert");
});

test("oppsettene fra nettsiden og navnene på dem", async () => {
  const { lagOppsett, lesOppsett, oppsettNavn } = await import("./server.js");
  assert.equal(oppsettNavn(lagOppsett("high", "sekvensiell")), "high");
  assert.equal(oppsettNavn(lagOppsett("low", "parallell")), "low-par-bit4");
  assert.equal(oppsettNavn(lagOppsett("max", "parallell-kode")), "max-par-kode-bit4");
  assert.deepEqual(lesOppsett("low-par-kode-bit4"), lagOppsett("low", "parallell-kode"));
  assert.throws(() => lagOppsett("ekstrem", "sekvensiell"), /Ukjent effort/);
  assert.throws(() => lagOppsett("high", "turbo"), /Ukjent kjøring/);
});
