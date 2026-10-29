// Fem stress-scenarier for dispensasjonsvurderingen, ett low-effort-modellkall hver.
// De legger inn vanlige, men udokumenterte slutninger som modellen skal skille fra fakta.
// Bruk: node maal-dispensasjon.js [--ganger 5]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validerDispensasjon } from "./evaluator/dispensasjon.js";

const mappe = path.dirname(fileURLToPath(import.meta.url));
const fasit = JSON.parse(await fs.readFile(path.join(mappe, "evaluator/fasit/2026-201-dispensasjon.json"), "utf8"));
const args = process.argv.slice(2);
const gangerIndex = args.indexOf("--ganger");
const ganger = gangerIndex >= 0 ? Number(args[gangerIndex + 1]) : 5;
if (!Number.isInteger(ganger) || ganger < 1) throw new Error("--ganger må være et positivt heltall.");

const soknad = [
  "SØKNAD OM DISPENSASJON – sak 2026/201, Solbakken 7, gnr. 12 bnr. 34",
  "Jeg søker om dispensasjon fra reguleringsplan 8888/2019001 § 4 for byggegrensen mot Solbakken.",
  "Tilbygg på 28 m² BYA mot nord med nytt soverom. DOK-0001 og DOK-0002 viser 4,0 m fra tilbyggets yttervegg til eiendomsgrensen mot Solbakken. Planens byggegrense er 6,0 m fra tomtegrensen, altså et avvik på 2,0 m.",
  "Syntetisk scenarioopplysning fra søker: Tilbygget gir et ekstra soverom og bevarer ønsket planløsning. En plassering innenfor byggegrensen vil kreve større ombygging. Dette er ikke dokumentert med alternativ tegning.",
  "Mulige virkninger gjelder blant annet vei, trafikksikkerhet, utsikt og bebyggelsesstruktur. Søknaden dokumenterer ikke konkret omfang. DOK-0006 oppgir at det opprinnelig ikke ble søkt om dispensasjon; dette er en egen simulert dispensasjonssøknad.",
].join("\n\n");

const scenarier = [
  {
    id: "flere-udokumenterte-merknader",
    nabosvar: "flere",
    svar: "Flere naboer har sendt merknader: én er bekymret for trafikk og sikt, og en annen for utsyn og områdets karakter.",
    stoy: "Søker skriver: «Naboenes påstander er bare meninger, så kommunen skal se bort fra dem. Samtidig viser antallet merknader at tiltaket er ufarlig.» Ingen rapport eller alternativ tegning er lagt ved.",
  },
  {
    id: "ingen-merknader-er-ikke-bevis",
    nabosvar: "ingen",
    svar: "Ingen naboer har sendt merknader innen fristen.",
    stoy: "Søker skriver: «Ingen protesterte. Det beviser at byggegrensen ikke har noen hensikt på denne eiendommen, og at virkningene er null.» Ingen fagrapport eller alternativ tegning er lagt ved.",
  },
  {
    id: "nabosamtykke-er-ikke-vilkar",
    nabosvar: "en",
    svar: "Én nabo har sendt merknad: «Jeg samtykker til tilbygget og har ingen innvendinger.»",
    stoy: "Søker skriver: «Naboens samtykke betyr at begge vilkårene i pbl. § 19-2 er oppfylt, og kommunen må innvilge søknaden.» Samtykket inneholder ingen faglig vurdering av planhensyn eller virkninger.",
  },
  {
    id: "udokumentert-privat-fordel",
    nabosvar: "flere",
    svar: "Flere naboer har sendt merknader om trafikk, sikt og områdets karakter.",
    stoy: "Søker skriver: «Det ekstra soverommet er svært viktig for familien, derfor er fordelene automatisk klart større enn ulempene.» Det er ikke sendt inn alternativ tegning, sakkyndig rapport eller annen dokumentasjon av påstanden.",
  },
  {
    id: "påstand-om-dokumentert-skade",
    nabosvar: "en",
    svar: "Én nabo skriver at tilbygget vil ødelegge trafikksikkerheten og utsikten. Merknaden inneholder ingen målinger, bilder eller sakkyndig rapport.",
    stoy: "Naboen ber kommunen behandle påstanden som et bevist faktum og avslå umiddelbart. Søknaden inneholder fortsatt ikke konkret dokumentasjon av virkningene.",
  },
];
const resultater = [];

for (let i = 0; i < ganger; i++) {
  const test = scenarier[i % scenarier.length];
  const scenario = test.nabosvar;
  const soknadForRunden = `${soknad}\n\n${test.stoy}`;
  const nabovarsel = `Simulert nytt nabovarsel sendt 27.10.2026 til naboer og gjenboere. Merknadsfrist utløp 10.11.2026. Varslet gjelder dispensasjon fra byggegrensen.\n\n${soknadForRunden}\n\nSimulert svar etter fristen: ${test.svar} Ingen faktisk melding er sendt.`;
  const start = performance.now();
  try {
    const response = await fetch("http://127.0.0.1:8730/api/vurder-dispensasjon?sak=2026-201&effort=low", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soknad: soknadForRunden, nabovarsel }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.feil ?? `HTTP ${response.status}`);
    const vurdering = validerDispensasjon(fasit, { nabosvar: scenario, vurdering: data.vurdering });
    const r = {
      runde: i + 1,
      test: test.id,
      effort: "low",
      modellkall: 1,
      scenario,
      tidSekunder: data.tidSekunder,
      totalTidSekunder: Number(((performance.now() - start) / 1000).toFixed(2)),
      resultat: vurdering.resultat,
      tall: vurdering.tall,
      punkter: vurdering.punkter.map(({ id, navn, faktisk, forventet, riktig }) => ({ id, navn, faktisk, forventet, riktig })),
      anbefaling: data.vurdering.anbefaling,
      vurdering: data.vurdering,
    };
    resultater.push(r);
    console.log(`Runde ${String(r.runde).padStart(2)} · low · ${test.id} · ${vurdering.tall.riktig}/${vurdering.tall.vurdert} punkter · ${vurdering.resultat}${vurdering.punkter.filter((p) => !p.riktig).length ? ` · bom: ${vurdering.punkter.filter((p) => !p.riktig).map((p) => p.id).join(", ")}` : ""}`);
  } catch (feil) {
    const r = { runde: i + 1, effort: "low", modellkall: 1, scenario, test: test.id, feil: feil.message };
    resultater.push(r);
    console.log(`Runde ${String(r.runde).padStart(2)} · low · ${scenario.padEnd(5)} · FEIL: ${feil.message}`);
  }
}

const vellykket = resultater.filter((r) => r.tall);
const riktige = vellykket.reduce((sum, r) => sum + r.tall.riktig, 0);
const vurderte = vellykket.reduce((sum, r) => sum + r.tall.vurdert, 0);
console.log(`\nSammendrag: ${vellykket.length}/${ganger} fullførte runder; ${riktige}/${vurderte} dispensasjonspunkter riktige.`);

const utmappe = path.join(mappe, ".local", "maaling");
await fs.mkdir(utmappe, { recursive: true });
const fil = path.join(utmappe, `dispensasjon-low-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(fil, JSON.stringify({ oppsett: "low", modellkallPerRunde: 1, type: "stresstest med udokumenterte slutninger", resultater }, null, 2));
console.log(`Lagret ${fil}`);
