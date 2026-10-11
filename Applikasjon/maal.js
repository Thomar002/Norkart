// Måler hvor lang tid kontrollen tar med ulike oppsett, og hvor godt resultatet stemmer med fasiten.
// Bruk: node --env-file=.env maal.js [oppsett ...] [--saker 2026-201,2026-202] [--ganger 2]
// Et oppsett er effort pluss valg, skilt med bindestrek: high, low-par-bit4, high-par-kode-bit4.
// Hver kjøring valideres med evaluator/valider.js, samme validering som knappen i nettsiden.
// Kjøringene koster penger (Haiku 5.5, under én cent per kjøring). Resultatene lagres i .local/maaling/.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lesOppsett, vurder } from "./server.js";
import { valider } from "./evaluator/valider.js";

const mappe = path.dirname(fileURLToPath(import.meta.url));
const lesJson = async (...deler) => JSON.parse(await fs.readFile(path.join(mappe, ...deler), "utf8"));
const sjekkliste = await lesJson("data", "sjekkliste.json");

// Tempoet i nettsiden (public/app.js): hvert punkt vises minst MIN_PUNKT_MS, og det er PAUSE_MS mellom punktene.
const MIN_PUNKT_MS = 1200;
const PAUSE_MS = 350;

// Anslår når nettsiden er ferdig med å vise kjøringen, med samme kø og pauser som app.js.
// Med innhenting går visningen fortere når mange punkter venter i køen.
function skjermtid(hendelser, fart = 1, innhent = false) {
  const erPunkt = (h) => h.type === "punkt" || h.type === "bestemmelse";
  let naa = 0;
  const startet = new Map();
  const tempo = (i) => {
    if (!innhent) return fart;
    const venter = hendelser.slice(i + 1).filter((h) => erPunkt(h) && h.ms <= naa).length;
    return fart * Math.max(1, venter / 3);
  };
  hendelser.forEach((h, i) => {
    naa = Math.max(naa, h.ms);
    if (h.type === "vurderer") startet.set(h.id, naa);
    if (erPunkt(h)) {
      const id = (h.punkt ?? h.bestemmelse).id;
      if (startet.has(id)) naa = Math.max(naa, startet.get(id) + MIN_PUNKT_MS / tempo(i));
      naa += PAUSE_MS / tempo(i);
    }
  });
  return naa / 1000;
}

async function enKjoring(sak, oppsett) {
  const hendelser = [];
  const start = performance.now();
  await vurder(sak, (h) => hendelser.push({ ...h, ms: Math.round(performance.now() - start) }), { stoppVedFeil: false, oppsett });
  const feil = hendelser.find((h) => h.type === "feil");
  if (feil) throw new Error(feil.melding);
  const ferdig = hendelser.find((h) => h.type === "ferdig");
  const port = hendelser.find((h) => h.type === "port");
  const status = {};
  for (const h of hendelser) {
    if (h.type === "punkt") status[h.punkt.id] = h.punkt.status;
    if (h.type === "bestemmelse") status[h.bestemmelse.id] = h.bestemmelse.vurdering;
  }
  const v = valider(await lesJson("evaluator", "fasit", `${sak}.json`), hendelser, sjekkliste);
  return {
    sak,
    tid: ferdig.tidSekunder,
    tidTilPort: port.ms / 1000,
    skjerm: skjermtid(hendelser, 1, true),
    resultat: v.resultat,
    riktigePunkter: v.tall.riktig + v.tall.godtatt,
    vurdertePunkter: v.tall.vurdert,
    funnFanget: v.tall.funnFanget,
    funn: v.tall.funn,
    feilPunkter: v.punkter.filter((p) => p.vurdering === "feil").map((p) => `${p.id}:${p.faktisk}${p.alvor === "alvorlig" ? "!" : ""}`),
    ut: ferdig.bruk.output_tokens,
    inn: ferdig.bruk.input_tokens,
    bufferLest: ferdig.bruk.cache_read_input_tokens ?? 0,
    kostUsd: ferdig.kostUsd,
    kategori: ferdig.kategori,
    bestatt: port.bestatt,
    konklusjon: ferdig.planvurdering?.konklusjon ?? null,
    status,
    kall: Object.fromEntries(Object.entries(ferdig.kall).filter(([, k]) => k).map(([n, k]) => [n, { tid: Number(k.tidSekunder.toFixed(1)), forste: Number(k.forsteSekunder?.toFixed(1)), tegn: k.tekst.length }])),
    hendelser,
  };
}

const args = process.argv.slice(2);
const flagg = (navn, standard) => {
  const i = args.indexOf(navn);
  return i >= 0 ? args.splice(i, 2)[1] : standard;
};
const saker = flagg("--saker", "2026-201,2026-202").split(",");
const ganger = Number(flagg("--ganger", "2"));
const oppsettNavn = args.length ? args : ["high", "high-par-bit4", "high-par-kode-bit4"];
const RESULTAT = { bestatt: "bestått", bestatt_med_merknader: "med merknader", ikke_bestatt: "IKKE BESTÅTT" };

const resultater = [];
for (const navn of oppsettNavn) {
  for (const sak of saker) {
    for (let i = 0; i < ganger; i++) {
      try {
        const r = { oppsett: navn, ...(await enKjoring(sak, lesOppsett(navn))) };
        resultater.push(r);
        console.log(`${navn.padEnd(20)} ${sak} ${r.tid.toFixed(1).padStart(5)} s  port ${r.tidTilPort.toFixed(1).padStart(5)} s  skjerm ${r.skjerm.toFixed(0).padStart(3)} s  ut ${String(r.ut).padStart(5)}  ${r.riktigePunkter}/${r.vurdertePunkter} punkter  ${RESULTAT[r.resultat]}${r.feilPunkter.length ? `  (${r.feilPunkter.join(" ")})` : ""}`);
      } catch (feil) {
        console.log(`${navn.padEnd(20)} ${sak} feilet: ${feil.message}`);
        resultater.push({ oppsett: navn, sak, feil: feil.message });
      }
    }
  }
}

// Sammendrag per oppsett og sak. ! betyr alvorlig feil mot fasiten.
console.log("\nOppsett              Sak       Snitt tid  Bestått  Med merknader  Ikke bestått");
const grupper = Map.groupBy(resultater.filter((r) => !r.feil), (r) => `${r.oppsett}|${r.sak}`);
for (const [nokkel, rader] of grupper) {
  const [navn, sak] = nokkel.split("|");
  const antall = (res) => String(rader.filter((r) => r.resultat === res).length).padStart(7);
  const tid = rader.reduce((s, r) => s + r.tid, 0) / rader.length;
  console.log(`${navn.padEnd(20)} ${sak}  ${tid.toFixed(1).padStart(7)} s  ${antall("bestatt")}  ${antall("bestatt_med_merknader").padStart(13)}  ${antall("ikke_bestatt").padStart(12)}`);
}

const ut = path.join(mappe, ".local", "maaling");
await fs.mkdir(ut, { recursive: true });
const fil = path.join(ut, `maaling-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(fil, JSON.stringify(resultater, null, 2));
console.log(`Lagret ${fil}`);
