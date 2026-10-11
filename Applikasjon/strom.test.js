import test from "node:test";
import assert from "node:assert/strict";
import { JsonStrom } from "./strom.js";

const svar = {
  kategori: "endring",
  begrunnelse: "Tilbygg med \"saltak\", 28 m² {ikke påbygg}, [x] avkrysset.",
  opplysninger: { gnr: 12, bnr: 34, tomteareal: 800.5, planOppgitt: null, ok: true },
  punkter: [
    { id: "A1", status: "oppfylt", funnet: "DOK-0001, del A: \\ og , i tekst" },
    { id: "A2", status: "mangler", funnet: "" },
  ],
  tall: -3,
  tom: [],
};

// Toppnivåverdier og listeelementer, slik kontrollen bruker dem.
const rett = (sti) => sti.length === 1 || (sti.length === 2 && typeof sti[1] === "number");

function kjor(tekst, bitstorrelse) {
  const meldt = [];
  const s = new JsonStrom((sti, verdi) => rett(sti) && meldt.push([sti, verdi]));
  for (let i = 0; i < tekst.length; i += bitstorrelse) s.mat(tekst.slice(i, i + bitstorrelse));
  return meldt;
}

test("melder toppnivåverdier og listeelementer i rekkefølge, uansett oppdeling", () => {
  const tekst = JSON.stringify(svar, null, 2);
  const forventet = [
    [["kategori"], svar.kategori],
    [["begrunnelse"], svar.begrunnelse],
    [["opplysninger"], svar.opplysninger],
    [["punkter", 0], svar.punkter[0]],
    [["punkter", 1], svar.punkter[1]],
    [["punkter"], svar.punkter],
    [["tall"], -3],
    [["tom"], []],
  ];
  for (const bit of [1, 3, 7, 50, tekst.length]) {
    assert.deepEqual(kjor(tekst, bit), forventet, `bitstørrelse ${bit}`);
  }
  assert.deepEqual(kjor(JSON.stringify(svar), 2), forventet);
});

test("melder ikke et listeelement før det er ferdig skrevet", () => {
  const meldt = [];
  const s = new JsonStrom((sti) => rett(sti) && meldt.push(sti.join(".")));
  s.mat('{"punkter": [{"id": "A1", "funnet": "uferdig }');
  assert.deepEqual(meldt, []);
  s.mat(' tekst"}, {"id"');
  assert.deepEqual(meldt, ["punkter.0"]);
});

test("melder felt i listeelementer og tekst som fortsatt skrives", () => {
  const ferdige = [];
  const delvis = [];
  const s = new JsonStrom((sti, verdi) => ferdige.push([sti.join("."), verdi]), {
    vedDelvis: (sti, tekst) => delvis.push([sti.join("."), tekst]),
  });
  s.mat('{"punkter": [{"id": "B7", "vurdering": "Planen er opp');
  s.mat("gitt \\");
  s.mat('u00e5 «8888/2019001\\"');
  s.mat(' og"');
  assert.deepEqual(ferdige, [["punkter.0.id", "B7"], ["punkter.0.vurdering", 'Planen er oppgitt å «8888/2019001" og']]);
  assert.deepEqual(delvis, [
    ["punkter.0.vurdering", "Planen er opp"],
    ["punkter.0.vurdering", "Planen er oppgitt "],
    ["punkter.0.vurdering", 'Planen er oppgitt å «8888/2019001"'],
  ]);
});
