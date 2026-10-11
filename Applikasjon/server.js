import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { kontrollerMatrikkel } from "./matrikkel.js";
import { FAKTA_SKJEMA, kontrollerMaal, kontrollerNabogrense, kontrollerOpplysninger } from "./formregler.js";
import { JsonStrom } from "./strom.js";
import { valider } from "./evaluator/valider.js";

const mappe = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8730);
const MODELL = "claude-haiku-5-5";
// Effort-nivåene Haiku 5.5 støtter. Brukeren velger nivå før kontrollen starter.
export const EFFORT = ["low", "medium", "high", "xhigh", "max"];
// USD per million tokens for claude-haiku-5-5 (prompter under 100K tokens).
const PRIS_PER_MILL = { inn: 0.1, ut: 0.5 };
// Hurtigbufret inndata: skriving koster 1,25 ganger og lesing 0,1 ganger vanlig inndata.
const BUFFER = { skriv: 1.25, les: 0.1 };

// Steg 1: formkontroll. Agenten kategoriserer søknaden, henter ut eiendomsopplysningene
// og går gjennom kontrollisten i data/sjekkliste.json (gruppe A–E).
const SYSTEM_FORMKONTROLL = `Du er saksassistent i Hvileskjær kommune. Du gjør formkontrollen av en innkommende byggesøknad fra en privatperson. Formkontrollen avgjør om søknaden er komplett nok til å behandles. Du vurderer ikke om tiltaket er i samsvar med reguleringsplanen. Det gjøres i et senere steg.

1. Kategoriser søknaden:
   - «endring»: tilbygg til en eksisterende bygning på eiendommen.
   - «nybygg»: ny frittliggende bygning.
   - «uklart»: søknaden gjelder noe annet (påbygg, bruksendring, fasadeendring, riving, bolig), flere tiltak, eller det går ikke an å avgjøre.

2. Hent ut eiendomsopplysningene og arealene nøyaktig slik søkeren har oppgitt dem. Les feltbeskrivelsene nøye: BYA før tiltaket gjelder bare bygningene, uten parkering. Bruk null når en opplysning ikke står i søknaden. Ikke rett, slå opp eller gjett. Opplysningene kontrolleres mot matrikkelen i neste steg.

3. Gå gjennom punktene i kontrollisten ett og ett, i samme rekkefølge som i listen. For hvert punkt skriver du først en kort vurdering (to til fire setninger): hva punktet krever, og hva du ser i dokumentene. Deretter gir du punktet én status:
   - oppfylt: dokumentene viser det punktet krever. Skriv hvor du fant det (dokument-ID).
   - mangler: punktet gjelder denne søknaden, men det som kreves, er ikke sendt inn eller er feil. Skriv konkret hva som mangler, slik at det kan stå i et mangelbrev.
   - uklart: du kan ikke avgjøre punktet ut fra dokumentene. Skriv hvorfor.
   - ikke_relevant: punktet gjelder den andre kategorien, eller det er merket «hvis relevant» og forholdet ikke gjelder dette tiltaket. Skriv hvorfor.

Søknaden trenger ikke å være på en bestemt blankett. Fritekst i en e-post er godt nok når opplysningene står der. Tegningene er vedlagt som bilder. Les mål, målestokk og tekst direkte fra dem, og godta bare det som faktisk vises. Sammenlign målene på tegningene med tallene i søknaden.

Skriv på norsk bokmål.`;

// Steg 3: planvurdering. Kjøres bare når formkontrollen og matrikkelkontrollen er bestått.
const SYSTEM_PLAN = `Du er saksassistent i Hvileskjær kommune. Du skal vurdere om en byggesøknad er i samsvar med reguleringsplanen for eiendommen.

Gå gjennom paragrafene i planbestemmelsene én og én, i rekkefølge. For hver paragraf skriver du:
- kravet i planen
- det søknaden oppgir, med dokument-ID
- en kort begrunnelse der du sammenligner de to
- vurderingen: samsvar, avvik, usikkert eller ikke_relevant (paragrafen sier ikke noe om dette tiltaket)

Plankartet og tegningene er vedlagt som bilder. Les målene direkte fra dem, og sammenlign dem med planbestemmelsene. Eiendomsopplysningene fra matrikkelen er kontrollert og går foran tallene i søknaden.

Avslutt med én konklusjon: samsvar når ingen paragraf har avvik eller er usikker, avvik når minst én paragraf har avvik, ellers usikkert.

Dette er en vurdering til saksbehandler, ikke et vedtak. Bruk bare opplysningene i saken, og gjett ikke manglende mål. Skriv på norsk bokmål.`;

/**
 * Valg for kjøringen.
 * - effort: et av nivåene i EFFORT.
 * - parallell: gruppe B–E og planvurderingen kjøres som egne kall samtidig.
 * - bit: høyst så mange punkter per kall i parallell kjøring (standard: én gruppe per kall).
 * - kode: agenten henter bare ut fakta for gruppe B, D13 og E5, og formregler.js avgjør punktene (krever parallell).
 */
export const STANDARD_OPPSETT = { effort: "high", parallell: false, kode: false };

// Måtene å kjøre kontrollen på som brukeren kan velge i nettsiden. Parallelt deler gruppene i kall på fire punkter.
export const KJORINGER = {
  sekvensiell: { parallell: false, kode: false },
  parallell: { parallell: true, kode: false, bit: 4 },
  "parallell-kode": { parallell: true, kode: true, bit: 4 },
};

/** Oppsettet for et effort-nivå og en kjøring fra nettsiden. */
export function lagOppsett(effort, kjoring) {
  if (!EFFORT.includes(effort)) throw new Error(`Ukjent effort-nivå «${effort}». Gyldige nivåer: ${EFFORT.join(", ")}.`);
  if (!KJORINGER[kjoring]) throw new Error(`Ukjent kjøring «${kjoring}». Gyldige: ${Object.keys(KJORINGER).join(", ")}.`);
  return { effort, ...KJORINGER[kjoring] };
}

/**
 * Leser et oppsett skrevet som effort pluss valg, skilt med bindestrek, f.eks. «low-par-kode-bit4».
 * par = parallell, kode og bitN (høyst N punkter per kall).
 */
export function lesOppsett(navn) {
  if (!navn) return STANDARD_OPPSETT;
  const deler = navn.split("-");
  if (!EFFORT.includes(deler[0])) throw new Error(`Ukjent effort i oppsettet «${navn}».`);
  const bit = Number(deler.find((d) => /^bit\d+$/.test(d))?.slice(3)) || undefined;
  return { effort: deler[0], parallell: deler.includes("par"), kode: deler.includes("kode"), ...(bit ? { bit } : {}) };
}

/** Navnet på et oppsett, f.eks. «high» eller «low-par-kode-bit4». Brukes i filnavn for opptak og i målinger. */
export function oppsettNavn(o) {
  return [o.effort, o.parallell && "par", o.kode && "kode", o.bit && `bit${o.bit}`].filter(Boolean).join("-");
}

const innhold = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function lesFil(...deler) {
  return fs.readFile(path.join(mappe, ...deler), "utf8");
}

async function lesBinaer(...deler) {
  return fs.readFile(path.join(mappe, ...deler));
}

async function lesJson(...deler) {
  return JSON.parse(await lesFil(...deler));
}

// Sakene ligger i data/saker/<mappe>/sak.json. Bare mapper som finnes der, godtas.
async function sakMapper() {
  const oppf = await fs.readdir(path.join(mappe, "data", "saker"), { withFileTypes: true });
  return oppf.filter((o) => o.isDirectory()).map((o) => o.name).sort();
}

async function lesSak(sakMappe) {
  if (!(await sakMapper()).includes(sakMappe)) {
    const feil = new Error(`Ukjent sak: ${sakMappe}`);
    feil.status = 404;
    throw feil;
  }
  return lesJson("data", "saker", sakMappe, "sak.json");
}

function agentPunkter(sjekkliste) {
  return sjekkliste.grupper
    .filter((g) => g.kontrolleresAv === "agent")
    .flatMap((g) => g.punkter.map((p) => ({ ...p, gruppe: g.navn })));
}

const nullbar = (type, description) => ({ anyOf: [{ type }, { type: "null" }], description });

function formkontrollSkjema(sjekkliste) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kategori", "begrunnelse", "opplysninger", "punkter"],
    properties: {
      kategori: { type: "string", enum: ["endring", "nybygg", "uklart"] },
      begrunnelse: { type: "string", description: "Hvorfor søknaden hører til kategorien." },
      opplysninger: {
        type: "object",
        additionalProperties: false,
        required: [
          "tiltakshaver", "kommune", "kommunenr", "gnr", "bnr", "adresse", "postnr", "poststed",
          "tomteareal", "byaFor", "tiltakBya", "planOppgitt",
        ],
        properties: {
          tiltakshaver: nullbar("string", "Tiltakshavers navn."),
          kommune: nullbar("string", "Kommunenavnet slik det står i søknaden."),
          kommunenr: nullbar("string", "Kommunenummeret, fire sifre."),
          gnr: nullbar("integer", "Gårdsnummer."),
          bnr: nullbar("integer", "Bruksnummer."),
          adresse: nullbar("string", "Gatenavn og husnummer, uten postnummer og poststed."),
          postnr: nullbar("string", "Postnummer."),
          poststed: nullbar("string", "Poststed."),
          tomteareal: nullbar("number", "Tomtens areal i m²."),
          byaFor: nullbar("number", "Bebygd areal (BYA) for bygningene alene før tiltaket, i m². Ta ikke med parkering, konstruksjoner eller tiltaket. I DiBKs skjema heter feltet «BYA bygninger i dag», ikke «Areal av bygninger, konstruksjoner og parkering i dag»."),
          tiltakBya: nullbar("number", "Tiltakets eget bebygd areal (BYA) i m²."),
          planOppgitt: nullbar("string", "Planen søknaden viser til, med navn og/eller plan-ID."),
        },
      },
      punkter: {
        type: "array",
        description: "Ett element per punkt i kontrollisten.",
        items: {
          type: "object",
          additionalProperties: false,
          // Status kommer sist, slik at modellen har skrevet begrunnelsen før den bestemmer seg.
          required: ["id", "vurdering", "funnet", "status"],
          properties: {
            id: { type: "string", enum: agentPunkter(sjekkliste).map((p) => p.id) },
            vurdering: { type: "string", description: "Kort vurdering: hva punktet krever, og hva dokumentene viser." },
            funnet: { type: "string", description: "Hva du fant, og i hvilket dokument. Ved mangler: hva som mangler." },
            status: { type: "string", enum: ["oppfylt", "mangler", "uklart", "ikke_relevant"] },
          },
        },
      },
    },
  };
}

function kontrollisteTekst(sjekkliste) {
  const linjer = [`Omfang: ${sjekkliste.omfang}`, ""];
  for (const g of sjekkliste.grupper.filter((g) => g.kontrolleresAv === "agent")) {
    linjer.push(`### ${g.id} ${g.navn}`);
    for (const p of g.punkter) {
      const gjelder = p.gjelder === "begge" ? "begge kategorier" : `bare ${p.gjelder}`;
      const krav = p.obligatorisk ? "obligatorisk" : "hvis relevant";
      linjer.push(`- ${p.id} [${gjelder}, ${krav}] ${p.tekst} (Kilde: ${p.kilde})`);
    }
    linjer.push("");
  }
  return linjer.join("\n");
}

async function dokumentDeler(sakMappe, sak) {
  const deler = [];
  for (const dok of sak.dokumenter) {
    deler.push({ tekst: `### ${dok.id} ${dok.tittel}` });
    if (dok.fil.endsWith(".md")) {
      deler.push({ tekst: await lesFil("data", "saker", sakMappe, dok.fil) });
    } else {
      deler.push({ bilde: dok.fil, sti: ["data", "saker", sakMappe, dok.fil] });
    }
  }
  return deler;
}

// Meldingen til AI-en er en liste med tekst og bilder. Den samme listen vises i svaret,
// slik at du ser nøyaktig hva AI-en får.
async function tilApi(deler) {
  const blokker = [];
  for (const del of deler) {
    if (del.tekst !== undefined) {
      blokker.push({ type: "text", text: del.tekst, ...(del.cache ? { cache_control: { type: "ephemeral" } } : {}) });
    } else {
      const bytes = await lesBinaer(...del.sti);
      blokker.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: bytes.toString("base64") },
      });
    }
  }
  return blokker;
}

function tilVisning(deler) {
  return deler.map((del) => del.tekst ?? `[bilde: ${del.bilde}]`).join("\n\n");
}

/**
 * Tenkingen som brukes på et effort-nivå. Opp til high tenker ikke modellen i skjul. Den skriver i stedet
 * en vurdering per punkt i svaret, slik at hvert punkt kan vises mens det skrives. Haiku 5.5 godtar ikke
 * avslått tenking på xhigh og max, så der tenker den adaptivt, og et sammendrag vises i loggen.
 */
export function tenking(effort) {
  return effort === "xhigh" || effort === "max" ? { type: "adaptive", display: "summarized" } : { type: "disabled" };
}

/**
 * Kaller modellen med strømming. vedTanke og vedTekst får hver bit etter hvert som den kommer.
 * Avbrytes kallet med signal, returneres det modellen rakk å skrive, med avbrutt: true.
 */
async function kallModell(klient, system, deler, format, { effort = STANDARD_OPPSETT.effort, vedTanke, vedTekst, signal } = {}) {
  const start = performance.now();
  const strom = klient.messages.stream(
    {
      model: MODELL,
      max_tokens: 64000,
      // Med tenking på kommer første punkt først når modellen har tenkt ferdig.
      thinking: tenking(effort),
      output_config: format ? { effort, format } : { effort },
      system,
      messages: [{ role: "user", content: await tilApi(deler) }],
    },
    { signal },
  );
  let siste = null;
  let forste = null;
  strom.on("streamEvent", (_hendelse, snapshot) => {
    siste = snapshot;
    forste ??= performance.now();
  });
  if (vedTanke) strom.on("thinking", (bit) => vedTanke(bit));
  if (vedTekst) strom.on("text", (bit) => vedTekst(bit));
  let svar;
  let avbrutt = false;
  try {
    svar = await strom.finalMessage();
  } catch (feil) {
    if (!signal?.aborted || !siste) throw feil;
    svar = siste;
    avbrutt = true;
  }
  if (!avbrutt && (svar.stop_reason === "refusal" || svar.stop_reason === "max_tokens")) {
    throw new Error(`Modellen stoppet uten fullstendig svar (${svar.stop_reason}).`);
  }
  const blokker = (type, felt) => svar.content.filter((b) => b.type === type).map((b) => b[felt]).join("\n");
  return {
    modell: svar.model,
    stopp: avbrutt ? "avbrutt" : svar.stop_reason,
    avbrutt,
    bruk: svar.usage,
    tidSekunder: (performance.now() - start) / 1000,
    forsteSekunder: forste === null ? null : (forste - start) / 1000,
    resonering: blokker("thinking", "thinking"),
    tekst: blokker("text", "text"),
    system,
    sendt: tilVisning(deler),
  };
}

// Retter åpenbare feil i agentens vurdering av ett punkt, slik at porten bare avhenger av kode.
function ryddPunkt(p, a, kategori) {
  const vurdering = a?.vurdering ?? "";
  let status = a?.status ?? "uklart";
  let funnet = a?.funnet ?? "Agenten vurderte ikke punktet.";
  if (kategori !== "uklart" && p.gjelder !== "begge" && p.gjelder !== kategori) {
    status = "ikke_relevant";
    funnet = `Gjelder bare ${p.gjelder}.`;
  } else if (p.obligatorisk && status === "ikke_relevant") {
    status = "uklart";
    funnet = `Obligatorisk punkt kan ikke være ikke relevant. Agenten skrev: ${funnet}`;
  }
  return { id: p.id, gruppe: p.gruppe, tekst: p.tekst, kilde: p.kilde, obligatorisk: p.obligatorisk, vurdering, status, funnet };
}

// Paragrafene i planbestemmelsene, f.eks. «**§ 2 Utnyttelse.**» -> { id: "§ 2", tittel: "Utnyttelse" }.
export function planParagrafer(planTekst) {
  return [...planTekst.matchAll(/\*\*(§\s*\d+)\s+([^*]+?)\.\*\*/g)].map((m) => ({
    id: m[1].replace(/\s+/g, " "),
    tittel: m[2].trim(),
  }));
}

function planSkjema(paragrafer) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["bestemmelser", "konklusjon", "oppsummering"],
    properties: {
      bestemmelser: {
        type: "array",
        description: "Én vurdering per paragraf i planbestemmelsene, i rekkefølge.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "krav", "soknad", "begrunnelse", "vurdering"],
          properties: {
            id: { type: "string", enum: paragrafer.map((p) => p.id) },
            krav: { type: "string", description: "Kravet i planen." },
            soknad: { type: "string", description: "Det søknaden oppgir, med dokument-ID." },
            begrunnelse: { type: "string", description: "Sammenligningen av kravet og søknaden." },
            vurdering: { type: "string", enum: ["samsvar", "avvik", "usikkert", "ikke_relevant"] },
          },
        },
      },
      konklusjon: { type: "string", enum: ["samsvar", "avvik", "usikkert"] },
      oppsummering: { type: "string", description: "To til fire setninger til saksbehandler." },
    },
  };
}

// Konklusjonen følger av vurderingene av paragrafene, med samme regel som i SYSTEM_PLAN.
export function planKonklusjon(bestemmelser) {
  if (bestemmelser.some((b) => b.vurdering === "avvik")) return "avvik";
  if (bestemmelser.some((b) => b.vurdering === "usikkert")) return "usikkert";
  return "samsvar";
}

function planOppsummering(bestemmelser) {
  const konklusjon = planKonklusjon(bestemmelser);
  const liste = (v) => bestemmelser.filter((b) => b.vurdering === v).map((b) => `${b.id} ${b.tittel}: ${b.begrunnelse}`).join(" ");
  if (konklusjon === "samsvar") return "Ingen paragraf i planbestemmelsene har avvik eller er usikker.";
  if (konklusjon === "avvik") return `Avvik fra planen. ${liste("avvik")}`;
  return `Usikker vurdering. ${liste("usikkert")}`;
}

function sum(...bruk) {
  const felt = (navn) => bruk.reduce((s, b) => s + (b?.[navn] ?? 0), 0);
  return {
    input_tokens: felt("input_tokens"),
    cache_creation_input_tokens: felt("cache_creation_input_tokens"),
    cache_read_input_tokens: felt("cache_read_input_tokens"),
    output_tokens: felt("output_tokens"),
  };
}

function kostnad(bruk) {
  const inn = bruk.input_tokens + bruk.cache_creation_input_tokens * BUFFER.skriv + bruk.cache_read_input_tokens * BUFFER.les;
  return (inn * PRIS_PER_MILL.inn + bruk.output_tokens * PRIS_PER_MILL.ut) / 1_000_000;
}

function utenSvar(kall) {
  if (!kall) return null;
  const { bruk, ...resten } = kall;
  return resten;
}

/**
 * Melder hvilket punkt modellen skriver om nå, og teksten den skriver om det, bit for bit.
 * Gjelder fritekstfeltene `felt` i elementene i listen `liste` (f.eks. "punkter"), og fritekst på toppnivå.
 */
const TOPPTEKST = new Set(["begrunnelse", "oppsummering"]);

function folgSkriving(send, steg, liste, felt, erStoppet) {
  const tekstfelt = new Set(felt);
  const ider = new Map();
  const lengde = new Map();
  return {
    vedId(sti, verdi) {
      if (sti[0] !== liste || sti[2] !== "id" || erStoppet()) return;
      ider.set(sti[1], verdi);
      send({ type: "vurderer", steg, id: verdi });
    },
    vedDelvis(sti, tekst) {
      const iListe = sti[0] === liste && sti.length === 3 && tekstfelt.has(sti[2]);
      if (erStoppet() || !(iListe || (sti.length === 1 && TOPPTEKST.has(sti[0])))) return;
      const nokkel = sti.join(".");
      const for_ = lengde.get(nokkel) ?? 0;
      if (tekst.length <= for_) return;
      lengde.set(nokkel, tekst.length);
      const id = sti[0] === liste && sti.length === 3 ? ider.get(sti[1]) : null;
      if (sti[0] === liste && !id) return;
      send({ type: "skriver", steg, id, felt: sti.at(-1), tekst: tekst.slice(for_) });
    },
  };
}

/**
 * Kjører kontrollen og melder hver hendelse med send(...) etter hvert som den skjer.
 * Med stoppVedFeil avbrytes kontrollen ved første punkt som gjør at søknaden ikke kan godkjennes.
 */
export async function vurder(sakMappe, send, { stoppVedFeil = true, signal, oppsett = STANDARD_OPPSETT } = {}) {
  if (oppsett.parallell) return vurderParallelt(sakMappe, send, { stoppVedFeil, signal, oppsett });
  const { effort } = oppsett;
  const sak = await lesSak(sakMappe);
  const sjekkliste = await lesJson("data", "sjekkliste.json");
  const matrikkel = await lesJson("data", "matrikkel.json");
  const planregister = await lesJson("data", "planregister.json");
  const klient = new Anthropic();
  const dokumenter = await dokumentDeler(sakMappe, sak);
  const hode = `Sak ${sak.sakId} · mottatt ${sak.mottatt} · ${sak.kanal} · avsender ${sak.avsender} · emne «${sak.emne}»`;

  // Ett avbrudd for hele kjøringen: brukeren lukker siden, eller kontrollen stopper ved første feil.
  const avbryt = new AbortController();
  signal?.addEventListener("abort", () => avbryt.abort());
  let stopp = null;
  const stoppHer = (steg, id, grunn) => {
    if (!stoppVedFeil || stopp) return;
    stopp = { steg, id, grunn };
    send({ type: "stopp", ...stopp });
    avbryt.abort();
  };

  send({ type: "start", sakId: sak.sakId, modell: MODELL, effort, tenker: tenking(effort).type !== "disabled", oppsett, stoppVedFeil, dokumenter: sak.dokumenter.map((d) => d.id) });

  // Steg 1 og 2: agenten går gjennom kontrollisten punkt for punkt. Når den er ferdig med gruppe A og B
  // (kategori og opplysninger), kontrollerer koden opplysningene mot matrikkelen før agenten fortsetter med C–E.
  const definisjoner = agentPunkter(sjekkliste);
  const mGruppe = sjekkliste.grupper.find((g) => g.id === "M");
  const mDef = new Map(mGruppe.punkter.map((p) => [p.id, p]));
  const form = { kategori: null, begrunnelse: null, opplysninger: null, punkter: new Map() };
  let mat = null;
  const matPunkter = [];

  const kjorMatrikkel = () => {
    if (mat || stopp || !form.kategori || !form.opplysninger) return;
    mat = kontrollerMatrikkel(form.opplysninger, form.kategori, matrikkel, planregister);
    send({ type: "steg", steg: "matrikkel", tilstand: "start" });
    for (const p of mat.punkter) {
      const d = mDef.get(p.id);
      const punkt = { ...p, gruppe: mGruppe.navn, tekst: d.tekst, kilde: d.kilde, obligatorisk: d.obligatorisk };
      matPunkter.push(punkt);
      send({ type: "punkt", steg: "matrikkel", punkt });
      if (punkt.status === "avvik") stoppHer("matrikkel", punkt.id, `${punkt.id}: ${punkt.funnet}`);
      if (stopp) return;
    }
    send({
      type: "steg",
      steg: "matrikkel",
      tilstand: "ferdig",
      eiendom: mat.eiendom ? `${mat.eiendom.gnr}/${mat.eiendom.bnr}` : null,
      plan: mat.plan,
    });
  };

  const skrivForm = folgSkriving(send, "form", "punkter", ["vurdering", "funnet"], () => Boolean(stopp));
  const lesForm = new JsonStrom((sti, verdi) => {
    if (stopp) return;
    if (sti[0] === "punkter" && sti[2] === "id" && !/^[AB]/.test(verdi)) {
      kjorMatrikkel();
      if (stopp) return;
    }
    skrivForm.vedId(sti, verdi);
    if (sti.length === 3 || (sti.length === 2 && typeof sti[1] !== "number")) return;
    const [felt, indeks] = sti;
    if (felt === "kategori") {
      form.kategori = verdi;
      send({ type: "kategori", kategori: verdi });
      if (verdi === "uklart") stoppHer("form", "A1", "Søknaden kunne ikke kategoriseres som endring eller nybygg.");
    } else if (felt === "begrunnelse") {
      form.begrunnelse = verdi;
      send({ type: "begrunnelse", begrunnelse: verdi });
    } else if (felt === "opplysninger") {
      form.opplysninger = verdi;
      send({ type: "opplysninger", opplysninger: verdi });
    } else if (felt === "punkter" && typeof indeks === "number") {
      const d = definisjoner.find((p) => p.id === verdi.id);
      if (!d) return;
      const punkt = ryddPunkt(d, verdi, form.kategori);
      form.punkter.set(punkt.id, punkt);
      send({ type: "punkt", steg: "form", punkt });
      if (punkt.status === "mangler") stoppHer("form", punkt.id, `${punkt.id}: ${punkt.funnet}`);
    }
  }, { vedDelvis: skrivForm.vedDelvis });

  send({ type: "steg", steg: "form", tilstand: "start" });
  const kall1 = await kallModell(
    klient,
    SYSTEM_FORMKONTROLL,
    [{ tekst: hode }, { tekst: `## Kontrolliste\n\n${kontrollisteTekst(sjekkliste)}` }, { tekst: "## Søknadens dokumenter" }, ...dokumenter],
    { type: "json_schema", schema: formkontrollSkjema(sjekkliste) },
    {
      vedTanke: (bit) => send({ type: "tanke", steg: "form", tekst: bit }),
      vedTekst: (bit) => lesForm.mat(bit),
      signal: avbryt.signal,
      effort: oppsett.effort,
    },
  );
  if (signal?.aborted) return;

  if (!stopp) {
    // Hele svaret er skrevet. Fyll inn punkter agenten hoppet over.
    const svar = JSON.parse(kall1.tekst);
    form.kategori = svar.kategori;
    form.begrunnelse = svar.begrunnelse;
    form.opplysninger = svar.opplysninger;
    const fraAgent = new Map(svar.punkter.map((p) => [p.id, p]));
    for (const d of definisjoner) {
      const punkt = ryddPunkt(d, fraAgent.get(d.id), form.kategori);
      const sendt = form.punkter.get(d.id);
      form.punkter.set(d.id, punkt);
      if (!sendt || sendt.status !== punkt.status || sendt.funnet !== punkt.funnet) send({ type: "punkt", steg: "form", punkt });
    }
    kjorMatrikkel();
  }
  send({ type: "steg", steg: "form", tilstand: "ferdig" });

  // Port: planvurderingen kjøres bare når søknaden er komplett og eiendommen er bekreftet.
  const punkter = [...form.punkter.values()];
  const mangler = punkter.filter((p) => p.status === "mangler");
  const avvik = matPunkter.filter((p) => p.status === "avvik");
  const grunner = [];
  if (form.kategori === "uklart") grunner.push("Søknaden kunne ikke kategoriseres som endring eller nybygg.");
  if (mangler.length) grunner.push(`${mangler.length} punkt(er) mangler i formkontrollen.`);
  if (avvik.length) grunner.push(`${avvik.length} avvik mot matrikkelen eller planregisteret.`);
  if (stopp) grunner.push("Kontrollen stoppet ved første feil. Resten av punktene er ikke kontrollert.");
  const bestatt = grunner.length === 0;
  send({
    type: "port",
    bestatt,
    grunner,
    mangelliste: [...mangler, ...avvik].map((p) => `${p.id}: ${p.funnet}`),
  });

  // Steg 3: planvurdering (agent)
  let kall3 = null;
  let plan = null;
  if (bestatt) {
    const e = mat.eiendom;
    const byaReg = e.bygninger.reduce((s, b) => s + b.bya, 0);
    const planTekst = await lesFil("data", mat.plan.fil);
    const paragrafer = planParagrafer(planTekst);
    plan = { id: mat.plan.id, navn: mat.plan.navn, bestemmelser: [], konklusjon: null, oppsummering: null };
    send({ type: "steg", steg: "plan", tilstand: "start", plan: { id: plan.id, navn: plan.navn }, paragrafer });
    const skrivPlan = folgSkriving(send, "plan", "bestemmelser", ["krav", "soknad", "begrunnelse"], () => Boolean(stopp));
    const lesPlan = new JsonStrom((sti, verdi) => {
      if (stopp) return;
      skrivPlan.vedId(sti, verdi);
      if (sti.length === 3) return;
      const [felt, indeks] = sti;
      if (felt === "bestemmelser" && typeof indeks === "number") {
        const tittel = paragrafer.find((p) => p.id === verdi.id)?.tittel ?? "";
        const bestemmelse = { ...verdi, tittel };
        plan.bestemmelser.push(bestemmelse);
        send({ type: "bestemmelse", bestemmelse });
        if (verdi.vurdering === "avvik") stoppHer("plan", verdi.id, `${verdi.id} ${tittel}: ${verdi.begrunnelse}`);
      } else if (felt === "konklusjon") {
        plan.konklusjon = verdi;
      } else if (felt === "oppsummering") {
        plan.oppsummering = verdi;
      }
    }, { vedDelvis: skrivPlan.vedDelvis });
    kall3 = await kallModell(
      klient,
      SYSTEM_PLAN,
      [
        {
          tekst: `${hode}\nKategori: ${form.kategori}\nEiendom (matrikkelen): ${matrikkel.kommune.nr}-${e.gnr}/${e.bnr}, ${e.adresser.map((a) => `${a.adresse}, ${a.postnr} ${a.poststed}`).join("; ")}, tomteareal ${e.tomteareal} m², registrert BYA for bygninger ${byaReg} m²`,
        },
        { tekst: `## Reguleringsplan ${mat.plan.id}\n\n${planTekst}` },
        { tekst: `## Plankart ${mat.plan.id}` },
        { bilde: mat.plan.plankart, sti: ["data", mat.plan.plankart] },
        { tekst: "## Søknadens dokumenter" },
        ...dokumenter,
      ],
      { type: "json_schema", schema: planSkjema(paragrafer) },
      {
        vedTanke: (bit) => send({ type: "tanke", steg: "plan", tekst: bit }),
        vedTekst: (bit) => lesPlan.mat(bit),
        signal: avbryt.signal,
        effort: oppsett.effort,
      },
    );
    if (signal?.aborted) return;
    if (stopp) {
      plan.konklusjon = "avvik";
      plan.oppsummering = `Vurderingen stoppet ved første avvik. ${stopp.grunn}`;
    }
    send({ type: "konklusjon", konklusjon: plan.konklusjon, oppsummering: plan.oppsummering });
    send({ type: "steg", steg: "plan", tilstand: "ferdig" });
  }

  const bruk = sum(kall1.bruk, kall3?.bruk);
  const ufullstendig = kall1.avbrutt || Boolean(kall3?.avbrutt);
  const kostUsd = kostnad(bruk);
  const kurs = Number(process.env.USD_NOK_KURS);
  send({
    type: "ferdig",
    sakId: sak.sakId,
    modell: kall1.modell,
    effort,
    oppsett,
    bruk,
    // Et avbrutt kall har ikke rapportert tokens ut. Kostnaden er da et minimum.
    ufullstendig,
    tidSekunder: kall1.tidSekunder + (kall3?.tidSekunder ?? 0),
    kostUsd,
    kostNok: kurs > 0 ? kostUsd * kurs : null,
    stopp,
    kategori: form.kategori,
    begrunnelse: form.begrunnelse,
    port: { bestatt, grunner },
    planvurdering: plan,
    kall: { form: utenSvar(kall1), plan: utenSvar(kall3) },
  });
}

/**
 * Hendelser fra flere samtidige kall slippes ut i fast rekkefølge. Nettsiden ser da ett punkt om gangen,
 * og «stopp ved første feil» gjelder den første feilen i kontrollisten, uansett hvilket kall som ble ferdig først.
 */
// Punkter som avgjøres av formregler.js når oppsettet har kode: true.
const KODEPUNKTER = new Set(["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B13", "B14", "B15", "B16", "D13", "E5"]);

class Rekkefolge {
  /** @param {string[]} navn @param {(h: object) => void} slipp */
  constructor(navn, slipp) {
    this.deler = navn.map((n) => ({ navn: n, hendelser: [], ferdig: false }));
    this.slipp = slipp;
    this.i = 0;
  }

  #del(navn) {
    return this.deler.find((d) => d.navn === navn);
  }

  send(navn, h) {
    const del = this.#del(navn);
    if (this.deler.indexOf(del) <= this.i) this.slipp(h);
    else del.hendelser.push(h);
  }

  /** Legger til deler bakerst, f.eks. én per paragraf når planen er lest. */
  leggTil(...navn) {
    this.deler.push(...navn.map((n) => ({ navn: n, hendelser: [], ferdig: false })));
  }

  ferdig(navn) {
    this.#del(navn).ferdig = true;
    while (this.deler[this.i]?.ferdig) {
      this.i++;
      const neste = this.deler[this.i];
      if (neste) for (const h of neste.hendelser.splice(0)) this.slipp(h);
    }
  }
}

function punktSkjema(ider) {
  const { punkter } = formkontrollSkjema({ grupper: [] }).properties;
  punkter.items.properties.id = { type: "string", enum: ider };
  return { type: "object", additionalProperties: false, required: ["punkter"], properties: { punkter } };
}

/**
 * Samme kontroll som vurder(), men delt i samtidige kall:
 * 1. Ett kall henter kategori og opplysninger og vurderer gruppe A.
 * 2. Så snart kategorien er klar, vurderes gruppe B, C, D og E i hvert sitt kall.
 *    Med kode henter det første kallet fakta, og formregler.js avgjør gruppe B, D13 og E5.
 * 3. Så snart opplysningene er klare, kontrollerer koden matrikkelen og starter planvurderingen på forhånd.
 *    Den vises bare hvis porten er bestått. Ellers avbrytes den.
 */
async function vurderParallelt(sakMappe, send, { stoppVedFeil, signal, oppsett }) {
  const sak = await lesSak(sakMappe);
  const sjekkliste = await lesJson("data", "sjekkliste.json");
  const matrikkel = await lesJson("data", "matrikkel.json");
  const planregister = await lesJson("data", "planregister.json");
  const klient = new Anthropic();
  const dokumenter = await dokumentDeler(sakMappe, sak);
  const hode = `Sak ${sak.sakId} · mottatt ${sak.mottatt} · ${sak.kanal} · avsender ${sak.avsender} · emne «${sak.emne}»`;
  const start = performance.now();
  const system = SYSTEM_FORMKONTROLL;
  // Dokumentene kommer før oppgaven, slik at alle kallene for formkontrollen har samme begynnelse.
  const grunnlag = [{ tekst: hode }, { tekst: "## Søknadens dokumenter" }, ...dokumenter];
  grunnlag.push({ tekst: "## Oppgave", cache: true });

  const avbryt = new AbortController();
  signal?.addEventListener("abort", () => avbryt.abort());
  const planAvbryt = new AbortController();
  avbryt.signal.addEventListener("abort", () => planAvbryt.abort());

  let stopp = null;
  const stoppHer = (steg, id, grunn) => {
    if (!stoppVedFeil || stopp) return;
    stopp = { steg, id, grunn };
    send({ type: "stopp", ...stopp });
    avbryt.abort();
  };

  const definisjoner = agentPunkter(sjekkliste);
  const mGruppe = sjekkliste.grupper.find((g) => g.id === "M");
  const mDef = new Map(mGruppe.punkter.map((p) => [p.id, p]));
  const form = { kategori: null, begrunnelse: null, opplysninger: null, punkter: new Map() };
  const matPunkter = [];
  let mat = null;
  let port = null;
  let plan = null;
  let planForkastet = false;
  const kall = {};

  // Alt som avgjør utfallet, skjer her, i fast rekkefølge.
  const INNHOLD = new Set(["vurderer", "skriver", "punkt", "bestemmelse"]);
  const slipp = (h) => {
    if (planForkastet && (h.type === "_planstart" || h.type === "_bestemmelse" || h.steg === "plan")) return;
    if (stopp && h.type !== "_port" && (INNHOLD.has(h.type) || h.type.startsWith("_"))) return;
    switch (h.type) {
      case "_kategori":
        form.kategori = h.kategori;
        send({ type: "kategori", kategori: h.kategori });
        if (h.kategori === "uklart") stoppHer("form", "A1", "Søknaden kunne ikke kategoriseres som endring eller nybygg.");
        return;
      case "_punkt": {
        const d = definisjoner.find((p) => p.id === h.verdi.id);
        if (!d || form.punkter.has(d.id)) return;
        const punkt = ryddPunkt(d, h.verdi, form.kategori);
        form.punkter.set(punkt.id, punkt);
        send({ type: "punkt", steg: "form", punkt });
        if (punkt.status === "mangler") stoppHer("form", punkt.id, `${punkt.id}: ${punkt.funnet}`);
        return;
      }
      case "_matrikkel":
        send({ type: "steg", steg: "matrikkel", tilstand: "start" });
        for (const p of mat.punkter) {
          const d = mDef.get(p.id);
          const punkt = { ...p, gruppe: mGruppe.navn, tekst: d.tekst, kilde: d.kilde, obligatorisk: d.obligatorisk };
          matPunkter.push(punkt);
          send({ type: "punkt", steg: "matrikkel", punkt });
          if (punkt.status === "avvik") stoppHer("matrikkel", punkt.id, `${punkt.id}: ${punkt.funnet}`);
          if (stopp) return;
        }
        send({ type: "steg", steg: "matrikkel", tilstand: "ferdig", eiendom: mat.eiendom ? `${mat.eiendom.gnr}/${mat.eiendom.bnr}` : null, plan: mat.plan });
        return;
      case "_port":
        sendPort();
        return;
      case "_planstart":
        send({ type: "steg", steg: "plan", tilstand: "start", plan: { id: plan.id, navn: plan.navn }, paragrafer: h.paragrafer });
        return;
      case "_bestemmelse":
        plan.bestemmelser.push(h.bestemmelse);
        send({ type: "bestemmelse", bestemmelse: h.bestemmelse });
        if (h.bestemmelse.vurdering === "avvik") stoppHer("plan", h.bestemmelse.id, `${h.bestemmelse.id} ${h.bestemmelse.tittel}: ${h.bestemmelse.begrunnelse}`);
        return;
      default:
        send(h);
    }
  };
  // Hver gruppe deles i biter på høyst oppsett.bit punkter, ett kall per bit.
  // K og L er punktene i gruppe D og E som avgjøres av kode (D13 og E5).
  const bitStorrelse = oppsett.bit ?? Infinity;
  const biter = {};
  for (const id of ["B", "C", "D", "E"]) {
    const punkter = sjekkliste.grupper.find((g) => g.id === id).punkter.filter((p) => !(oppsett.kode && KODEPUNKTER.has(p.id)));
    biter[id] = [];
    for (let i = 0; i < punkter.length; i += bitStorrelse) biter[id].push({ navn: `${id}${biter[id].length + 1}`, punkter: punkter.slice(i, i + bitStorrelse) });
  }
  const navn = (id) => biter[id].map((b) => b.navn);
  const DELER = ["A", "B", ...navn("B"), "M", ...navn("C"), ...navn("D"), "K", ...navn("E"), "L", "port", "P"];
  const ko = new Rekkefolge(DELER, slipp);

  function sendPort() {
    if (port) return;
    // Punkter agenten hoppet over, fylles inn før porten.
    if (!stopp) {
      for (const d of definisjoner) {
        if (form.punkter.has(d.id)) continue;
        const punkt = ryddPunkt(d, null, form.kategori);
        form.punkter.set(d.id, punkt);
        send({ type: "punkt", steg: "form", punkt });
      }
    }
    send({ type: "steg", steg: "form", tilstand: "ferdig" });
    const punkter = [...form.punkter.values()];
    const mangler = punkter.filter((p) => p.status === "mangler");
    const avvik = matPunkter.filter((p) => p.status === "avvik");
    const grunner = [];
    if (form.kategori === "uklart") grunner.push("Søknaden kunne ikke kategoriseres som endring eller nybygg.");
    if (mangler.length) grunner.push(`${mangler.length} punkt(er) mangler i formkontrollen.`);
    if (avvik.length) grunner.push(`${avvik.length} avvik mot matrikkelen eller planregisteret.`);
    if (stopp) grunner.push("Kontrollen stoppet ved første feil. Resten av punktene er ikke kontrollert.");
    if (!mat) grunner.push("Opplysningene ble ikke kontrollert mot matrikkelen.");
    port = { bestatt: grunner.length === 0, grunner };
    send({ type: "port", ...port, mangelliste: [...mangler, ...avvik].map((p) => `${p.id}: ${p.funnet}`) });
    if (!port.bestatt) {
      planForkastet = true;
      planAvbryt.abort();
    }
  }

  // Ett kall for en del av formkontrollen. Hendelsene går til delen `del` i køen.
  const kjorDel = (del, navn, oppgave, schema, vedVerdi) => {
    const skriv = folgSkriving((h) => ko.send(del, h), "form", "punkter", ["vurdering", "funnet"], () => Boolean(stopp));
    const les = new JsonStrom((sti, verdi) => {
      skriv.vedId(sti, verdi);
      if (sti.length === 3) return;
      if (sti[0] === "punkter" && typeof sti[1] === "number") ko.send(del, { type: "_punkt", verdi });
      else vedVerdi?.(sti, verdi);
    }, { vedDelvis: skriv.vedDelvis });
    return kallModell(klient, system, [...grunnlag, { tekst: oppgave }], { type: "json_schema", schema }, {
      vedTanke: (bit) => ko.send(del, { type: "tanke", steg: "form", tekst: bit }),
      vedTekst: (bit) => les.mat(bit),
      signal: avbryt.signal,
      effort: oppsett.effort,
    }).then((k) => {
      kall[navn] = k;
      ko.ferdig(del);
    }, (feil) => {
      ko.ferdig(del);
      if (!avbryt.signal.aborted) throw feil;
    });
  };

  const gruppe = (id) => sjekkliste.grupper.find((g) => g.id === id);
  const listeTekst = (punkter) => punkter.map((p) => {
    const gjelder = p.gjelder === "begge" ? "begge kategorier" : `bare ${p.gjelder}`;
    const krav = p.obligatorisk ? "obligatorisk" : "hvis relevant";
    return `- ${p.id} [${gjelder}, ${krav}] ${p.tekst} (Kilde: ${p.kilde})`;
  }).join("\n");

  const kall0Skjema = formkontrollSkjema({ ...sjekkliste, grupper: [gruppe("A")] });
  const oppgave0 = [
    `Omfang: ${sjekkliste.omfang}`,
    "Kategoriser søknaden, hent ut opplysningene og gå gjennom gruppe A i kontrollisten. De andre gruppene vurderes i egne kall.",
    `### A ${gruppe("A").navn}`,
    listeTekst(gruppe("A").punkter),
  ].join("\n\n");

  let kategoriTidlig = null;
  // Alle kallene starter samtidig. Punkter for den andre kategorien rettes av ryddPunkt når de slippes ut.
  const andre = [];
  let planKall = null;
  for (const id of ["B", "C", "D", "E"]) {
    for (const bit of biter[id]) {
      const oppgave = [
        "Kategori og opplysninger hentes ut i et annet kall. Gå bare gjennom disse punktene i kontrollisten, i rekkefølge. Et punkt som bare gjelder den andre kategorien enn søknaden hører til, er ikke_relevant.",
        `### ${id} ${gruppe(id).navn}`,
        listeTekst(bit.punkter),
      ].join("\n\n");
      andre.push(kjorDel(bit.navn, bit.navn, oppgave, punktSkjema(bit.punkter.map((p) => p.id))));
    }
  }
  // Segmentet B brukes av koden. Uten kode er det tomt.
  if (!oppsett.kode) ko.ferdig("B");
  if (!oppsett.kode) {
    ko.ferdig("K");
    ko.ferdig("L");
  }

  // Med kode avgjøres gruppe B, D13 og E5 når både opplysningene og faktaene er hentet ut.
  let fakta = null;
  const kodeKlar = () => {
    if (!oppsett.kode || !form.opplysninger || !fakta) return;
    const vurdering = "Avgjort av kode ut fra opplysningene agenten hentet ut av søknaden og tegningene.";
    const o = form.opplysninger;
    const b = kontrollerOpplysninger(o, fakta, sak.dokumenter);
    for (const p of gruppe("B").punkter) ko.send("B", { type: "_punkt", verdi: { id: p.id, vurdering, ...b[p.id] } });
    ko.send("K", { type: "_punkt", verdi: { id: "D13", vurdering, ...kontrollerMaal(o, fakta) } });
    ko.send("L", { type: "_punkt", verdi: { id: "E5", vurdering, ...kontrollerNabogrense(o, fakta) } });
    for (const del of ["B", "K", "L"]) ko.ferdig(del);
  };
  if (oppsett.kode) {
    const skjema = { type: "object", additionalProperties: false, required: ["fakta"], properties: { fakta: FAKTA_SKJEMA } };
    const oppgave = "Hent ut faktaene i skjemaet fra søknaden og tegningene, nøyaktig slik de står. Ikke vurder kontrollisten. Den vurderes i egne kall.";
    andre.push(kallModell(klient, system, [...grunnlag, { tekst: oppgave }], { type: "json_schema", schema: skjema }, { signal: avbryt.signal, effort: oppsett.effort })
      .then((k) => {
        kall.fakta = k;
        if (k.avbrutt) return;
        fakta = JSON.parse(k.tekst).fakta;
        kodeKlar();
      }, (feil) => {
        if (!avbryt.signal.aborted) throw feil;
      }));
  }

  // Med bit vurderes hver paragraf i et eget kall, og koden setter konklusjonen.
  const startPlan = async () => {
    const e = mat.eiendom;
    const byaReg = e.bygninger.reduce((s, b) => s + b.bya, 0);
    const planTekst = await lesFil("data", mat.plan.fil);
    const paragrafer = planParagrafer(planTekst);
    plan = { id: mat.plan.id, navn: mat.plan.navn, bestemmelser: [], konklusjon: null, oppsummering: null };
    ko.send("P", { type: "_planstart", paragrafer });
    const delt = Boolean(oppsett.bit);
    const grupper = delt ? paragrafer.map((p) => [p]) : [paragrafer];
    const navn = grupper.map((_, i) => `P${i + 1}`);
    ko.leggTil(...navn);
    ko.ferdig("P");
    const grunnlagPlan = [
      { tekst: `${hode}\nKategori: ${form.kategori ?? kategoriTidlig}\nEiendom (matrikkelen): ${matrikkel.kommune.nr}-${e.gnr}/${e.bnr}, ${e.adresser.map((a) => `${a.adresse}, ${a.postnr} ${a.poststed}`).join("; ")}, tomteareal ${e.tomteareal} m², registrert BYA for bygninger ${byaReg} m²` },
      { tekst: `## Reguleringsplan ${mat.plan.id}\n\n${planTekst}` },
      { tekst: `## Plankart ${mat.plan.id}` },
      { bilde: mat.plan.plankart, sti: ["data", mat.plan.plankart] },
      { tekst: "## Søknadens dokumenter" },
      ...dokumenter,
    ];
    await Promise.all(grupper.map(async (gruppe, i) => {
      const del = navn[i];
      const skriv = folgSkriving((h) => ko.send(del, h), "plan", "bestemmelser", ["krav", "soknad", "begrunnelse"], () => Boolean(stopp));
      const les = new JsonStrom((sti, verdi) => {
        skriv.vedId(sti, verdi);
        if (sti.length === 3) return;
        const [felt, indeks] = sti;
        if (felt === "bestemmelser" && typeof indeks === "number") {
          const tittel = paragrafer.find((p) => p.id === verdi.id)?.tittel ?? "";
          ko.send(del, { type: "_bestemmelse", bestemmelse: { ...verdi, tittel } });
        } else if (felt === "konklusjon") {
          plan.konklusjon = verdi;
        } else if (felt === "oppsummering") {
          plan.oppsummering = verdi;
        }
      }, { vedDelvis: skriv.vedDelvis });
      const skjema = planSkjema(gruppe);
      if (delt) {
        skjema.required = ["bestemmelser"];
        skjema.properties = { bestemmelser: skjema.properties.bestemmelser };
      }
      const oppgave = delt
        ? [{ tekst: `## Oppgave\n\nVurder bare ${gruppe[0].id} ${gruppe[0].tittel}. De andre paragrafene vurderes i egne kall, og konklusjonen settes etterpå.` }]
        : [];
      try {
        kall[`plan${delt ? i + 1 : ""}`] = await kallModell(
          klient,
          SYSTEM_PLAN,
          [...grunnlagPlan, ...oppgave],
          { type: "json_schema", schema: skjema },
          {
            vedTanke: (bit) => ko.send(del, { type: "tanke", steg: "plan", tekst: bit }),
            vedTekst: (bit) => les.mat(bit),
            signal: planAvbryt.signal,
            effort: oppsett.effort,
          },
        );
      } catch (feil) {
        if (!planAvbryt.signal.aborted) throw feil;
      }
      ko.ferdig(del);
    }));
  };

  // Kategorien og opplysningene leses mens det første kallet skriver.
  send({ type: "start", sakId: sak.sakId, modell: MODELL, effort: oppsett.effort, tenker: tenking(oppsett.effort).type !== "disabled", oppsett, stoppVedFeil, dokumenter: sak.dokumenter.map((d) => d.id) });
  send({ type: "steg", steg: "form", tilstand: "start" });
  const kall0 = kjorDel("A", "form", oppgave0, kall0Skjema, (sti, verdi) => {
    if (sti.length !== 1) return;
    if (sti[0] === "kategori") {
      kategoriTidlig = verdi;
      ko.send("A", { type: "_kategori", kategori: verdi });
    } else if (sti[0] === "begrunnelse") {
      form.begrunnelse = verdi;
      ko.send("A", { type: "begrunnelse", begrunnelse: verdi });
    } else if (sti[0] === "opplysninger") {
      form.opplysninger = verdi;
      ko.send("A", { type: "opplysninger", opplysninger: verdi });
      mat = kontrollerMatrikkel(verdi, kategoriTidlig, matrikkel, planregister);
      ko.send("M", { type: "_matrikkel" });
      ko.ferdig("M");
      kodeKlar();
      const klar = mat.eiendom && mat.plan && !mat.punkter.some((p) => p.status === "avvik") && kategoriTidlig !== "uklart";
      if (klar) planKall = startPlan();
      else ko.ferdig("P");
    }
  });
  ko.send("port", { type: "_port" });
  ko.ferdig("port");

  await kall0;
  await Promise.all(andre);
  if (planKall) await planKall;
  if (signal?.aborted) return;
  // Kom kallene aldri fram til porten (f.eks. etter stopp), avgjøres den nå.
  for (const { navn: del } of ko.deler) ko.ferdig(del);
  sendPort();

  if (plan && !planForkastet) {
    // Med ett kall per paragraf setter koden konklusjonen når alle vurderingene er sluppet ut.
    if (oppsett.bit) {
      plan.konklusjon = planKonklusjon(plan.bestemmelser);
      plan.oppsummering = planOppsummering(plan.bestemmelser);
    }
    if (stopp?.steg === "plan") {
      plan.konklusjon = "avvik";
      plan.oppsummering = `Vurderingen stoppet ved første avvik. ${stopp.grunn}`;
    }
    send({ type: "konklusjon", konklusjon: plan.konklusjon, oppsummering: plan.oppsummering });
    send({ type: "steg", steg: "plan", tilstand: "ferdig" });
  }

  const alle = Object.values(kall);
  const bruk = sum(...alle.map((k) => k.bruk));
  const kostUsd = kostnad(bruk);
  const kurs = Number(process.env.USD_NOK_KURS);
  send({
    type: "ferdig",
    sakId: sak.sakId,
    modell: MODELL,
    effort: oppsett.effort,
    oppsett,
    bruk,
    ufullstendig: alle.some((k) => k.avbrutt),
    tidSekunder: (performance.now() - start) / 1000,
    kostUsd,
    kostNok: kurs > 0 ? kostUsd * kurs : null,
    stopp,
    kategori: form.kategori,
    begrunnelse: form.begrunnelse,
    port,
    planvurdering: planForkastet ? null : plan,
    kall: Object.fromEntries(Object.entries(kall).map(([n, k]) => [n, utenSvar(k)])),
  });
}

async function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

// Hver kjøring tas opp i .local/opptak/, slik at den kan spilles av igjen uten modellen.
// Det finnes ett opptak per sak, oppsett og modus, f.eks. 2026-201-low-par-bit4-hele.ndjson,
// slik at effort-nivåene og kjøringene kan sammenlignes.
const OPPTAK = path.join(mappe, ".local", "opptak");
const modus = (stoppVedFeil) => (stoppVedFeil ? "stopp" : "hele");
const opptakFil = (sakMappe, stoppVedFeil, oppsett) => path.join(OPPTAK, `${sakMappe}-${oppsettNavn(oppsett)}-${modus(stoppVedFeil)}.ndjson`);

async function finnesOpptak(sakMappe, stoppVedFeil, oppsett) {
  return fs.access(opptakFil(sakMappe, stoppVedFeil, oppsett)).then(() => true, () => false);
}

// Hvilke opptak som finnes for saken, f.eks. { "high-sekvensiell-stopp": true, "max-parallell-hele": false, ... }.
async function opptakForSak(sakMappe) {
  const finnes = {};
  for (const effort of EFFORT) {
    for (const kjoring of Object.keys(KJORINGER)) {
      for (const stoppVedFeil of [true, false]) {
        finnes[`${effort}-${kjoring}-${modus(stoppVedFeil)}`] = await finnesOpptak(sakMappe, stoppVedFeil, lagOppsett(effort, kjoring));
      }
    }
  }
  return finnes;
}

function startStrom(res) {
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
}

async function kjorVurdering(req, res, sakMappe, stoppVedFeil, oppsett) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return sendJson(res, 400, { feil: "ANTHROPIC_API_KEY er ikke satt i miljøet der serveren kjører." });
  }
  await lesSak(sakMappe);
  const lukket = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) lukket.abort();
  });
  startStrom(res);
  const start = performance.now();
  const logg = [];
  const send = (hendelse) => {
    const linje = JSON.stringify({ ...hendelse, ms: Math.round(performance.now() - start) });
    logg.push(linje);
    if (!res.writableEnded) res.write(`${linje}\n`);
  };
  try {
    await vurder(sakMappe, send, { stoppVedFeil, signal: lukket.signal, oppsett });
    if (!lukket.signal.aborted) {
      await fs.mkdir(OPPTAK, { recursive: true });
      await fs.writeFile(opptakFil(sakMappe, stoppVedFeil, oppsett), `${logg.join("\n")}\n`);
    }
  } catch (feil) {
    console.error(feil);
    send({ type: "feil", melding: feil.message });
  }
  res.end();
}

// Spiller av et opptak med samme tidsforløp som da det ble tatt opp, ganget med fart.
async function spillAv(res, sakMappe, stoppVedFeil, oppsett, fart) {
  await lesSak(sakMappe);
  if (!(await finnesOpptak(sakMappe, stoppVedFeil, oppsett))) {
    return sendJson(res, 404, { feil: `Det finnes ikke noe opptak for denne saken med oppsettet ${oppsettNavn(oppsett)} ennå.` });
  }
  const linjer = (await fs.readFile(opptakFil(sakMappe, stoppVedFeil, oppsett), "utf8")).trim().split("\n");
  let lukket = false;
  res.on("close", () => {
    lukket = true;
  });
  startStrom(res);
  const start = performance.now();
  for (const linje of linjer) {
    const { ms } = JSON.parse(linje);
    const vent = ms / fart - (performance.now() - start);
    if (vent > 0) await new Promise((ok) => setTimeout(ok, vent));
    if (lukket) return;
    res.write(`${linje}\n`);
  }
  res.end();
}

// Fasiten leses bare her, når brukeren ber om validering etter en ferdig kjøring. Agenten får den aldri.
async function lesFasit(sakMappe) {
  try {
    return await lesJson("evaluator", "fasit", `${sakMappe}.json`);
  } catch (feil) {
    if (feil.code !== "ENOENT") throw feil;
    const ukjent = new Error(`Det finnes ingen fasit for saken ${sakMappe}.`);
    ukjent.status = 404;
    throw ukjent;
  }
}

async function lesKropp(req, maks = 20_000_000) {
  const biter = [];
  let lengde = 0;
  for await (const bit of req) {
    lengde += bit.length;
    if (lengde > maks) {
      const feil = new Error("Forespørselen er for stor.");
      feil.status = 413;
      throw feil;
    }
    biter.push(bit);
  }
  return Buffer.concat(biter).toString("utf8");
}

const OFFENTLIG = ["index.html", "app.js", "kart.js", "stil.css"];

async function handter(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const fil = url.pathname === "/" ? "index.html" : url.pathname.slice(1);

  if (req.method === "GET" && OFFENTLIG.includes(fil)) {
    res.writeHead(200, { "Content-Type": innhold[path.extname(fil)] });
    res.end(await lesFil("public", fil));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/saker") {
    const saker = [];
    for (const m of await sakMapper()) {
      const sak = await lesSak(m);
      saker.push({ mappe: m, sakId: sak.sakId, emne: sak.emne });
    }
    return sendJson(res, 200, saker);
  }

  if (req.method === "GET" && url.pathname === "/api/sak") {
    // Visningen (kartskisse, nabovarsel) er bare til skjermen. Agenten får den ikke.
    const sakMappe = url.searchParams.get("sak");
    const sak = await lesSak(sakMappe);
    const visning = await lesJson("data", "saker", sakMappe, "visning.json").catch(() => null);
    return sendJson(res, 200, { ...sak, visning, opptak: await opptakForSak(sakMappe), effortNivaer: EFFORT, kjoringer: Object.keys(KJORINGER) });
  }

  if (req.method === "GET" && url.pathname === "/api/sjekkliste") {
    return sendJson(res, 200, await lesJson("data", "sjekkliste.json"));
  }

  if (req.method === "GET" && url.pathname === "/api/kart") {
    return sendJson(res, 200, {
      kart: await lesJson("data", "kart.json"),
      matrikkel: await lesJson("data", "matrikkel.json"),
      planregister: await lesJson("data", "planregister.json"),
    });
  }

  if (req.method === "GET" && url.pathname.startsWith("/dokumenter/")) {
    // /dokumenter/<sak>/<fil>. Bare filer som står i sakens sak.json, blir servert.
    const [sakMappe, navn] = url.pathname.slice("/dokumenter/".length).split("/").map(decodeURIComponent);
    const sak = await lesSak(sakMappe);
    if (!sak.dokumenter.some((d) => d.fil === navn)) {
      return sendJson(res, 404, { feil: "Ukjent dokument" });
    }
    res.writeHead(200, { "Content-Type": innhold[path.extname(navn)] });
    res.end(await lesBinaer("data", "saker", sakMappe, navn));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/plan/")) {
    // Bare plankart og planbestemmelser som står i planregisteret, blir servert.
    const navn = decodeURIComponent(url.pathname.slice("/plan/".length));
    const planregister = await lesJson("data", "planregister.json");
    if (!planregister.planer.some((p) => p.plankart === navn || p.fil === navn)) {
      return sendJson(res, 404, { feil: "Ukjent planfil" });
    }
    res.writeHead(200, { "Content-Type": innhold[path.extname(navn)] });
    res.end(await lesBinaer("data", navn));
    return;
  }

  const stoppVedFeil = url.searchParams.get("stopp") !== "0";
  let oppsett = STANDARD_OPPSETT;
  if (url.pathname === "/api/vurder" || url.pathname === "/api/opptak") {
    try {
      oppsett = lagOppsett(url.searchParams.get("effort") ?? STANDARD_OPPSETT.effort, url.searchParams.get("kjoring") ?? "sekvensiell");
    } catch (feil) {
      return sendJson(res, 400, { feil: feil.message });
    }
  }


  if (req.method === "POST" && url.pathname === "/api/vurder") {
    return kjorVurdering(req, res, url.searchParams.get("sak"), stoppVedFeil, oppsett);
  }

  if (req.method === "POST" && url.pathname === "/api/valider") {
    // Kroppen er hendelsene fra kjøringen som vises i nettleseren, live eller avspilt.
    const sakMappe = url.searchParams.get("sak");
    await lesSak(sakMappe);
    const fasit = await lesFasit(sakMappe);
    let hendelser;
    try {
      hendelser = JSON.parse(await lesKropp(req)).hendelser;
    } catch (feil) {
      if (feil.status) throw feil;
      return sendJson(res, 400, { feil: "Kroppen må være JSON med listen «hendelser»." });
    }
    if (!Array.isArray(hendelser)) return sendJson(res, 400, { feil: "Kroppen må være JSON med listen «hendelser»." });
    try {
      return sendJson(res, 200, valider(fasit, hendelser, await lesJson("data", "sjekkliste.json")));
    } catch (feil) {
      return sendJson(res, 400, { feil: feil.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/opptak") {
    const fart = Math.min(Math.max(Number(url.searchParams.get("fart")) || 1, 0.25), 50);
    return spillAv(res, url.searchParams.get("sak"), stoppVedFeil, oppsett, fart);
  }

  sendJson(res, 404, { feil: "Finnes ikke" });
}

// Importeres filen (f.eks. fra en test), startes ikke serveren.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const server = http.createServer((req, res) => {
    handter(req, res).catch((feil) => {
      console.error(feil);
      if (!res.headersSent) {
        sendJson(res, feil.status ?? 500, { feil: feil.message });
      } else {
        res.end();
      }
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Start kjører på http://127.0.0.1:${PORT}`);
  });
}
