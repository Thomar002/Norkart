import { lagKart } from "/kart.js";

const $ = (sel) => document.querySelector(sel);
const velg = $("#velg");
const stoppBryter = $("#stopp");
const effortVelg = $("#effort");
const kjoringVelg = $("#kjoring");
const KJORINGSTEKST = { sekvensiell: "ett kall", parallell: "parallelt", "parallell-kode": "parallelt + kode" };
// Kjøringen et oppsett fra serveren tilsvarer, f.eks. { parallell: true, kode: false } -> "parallell".
const kjoringAv = (o) => (!o?.parallell ? "sekvensiell" : o.kode ? "parallell-kode" : "parallell");
const oppsettTekst = (effort, o) => `effort ${effort}${o ? ` · ${KJORINGSTEKST[kjoringAv(o)]}` : ""}`;
const kjorKnapp = $("#kjor");
const simulerKnapp = $("#simuler");
const spillKnapp = $("#spill");
const validerKnapp = $("#valider");
const fartVelg = $("#fart");
const scene = $("#scene");

const STATUSTEKST = {
  oppfylt: "Oppfylt",
  mangler: "Mangler",
  uklart: "Uklart",
  ikke_relevant: "Ikke relevant",
  avvik: "Avvik",
  ikke_vurdert: "Ikke vurdert",
  samsvar: "Samsvar",
  usikkert: "Usikkert",
  kan_kreves: "Kan være nødvendig",
  ikke_identifisert: "Ikke identifisert",
  venter: "Venter",
  hoppet: "Ikke kontrollert",
};
const IKON = {
  oppfylt: "✓", samsvar: "✓", mangler: "✕", avvik: "✕", uklart: "?", usikkert: "?",
  ikke_relevant: "–", ikke_vurdert: "–", venter: "", hoppet: "",
};
const FEIL = new Set(["mangler", "avvik"]);

/** Lager et element. attr kan være en klassestreng eller et objekt. */
function el(tag, attr, ...barn) {
  const e = document.createElement(tag);
  if (typeof attr === "string") e.className = attr;
  else if (attr) {
    for (const [k, v] of Object.entries(attr)) {
      if (k === "on") for (const [h, f] of Object.entries(v)) e.addEventListener(h, f);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const b of barn.flat()) if (b !== null && b !== undefined && b !== false) e.append(b);
  return e;
}

function svgFra(tekst, klasse) {
  const mal = document.createElement("template");
  mal.innerHTML = tekst.trim();
  const svg = mal.content.firstElementChild;
  if (klasse) svg.setAttribute("class", klasse);
  return svg;
}

function hash(tekst) {
  let h = 2166136261;
  for (const c of tekst) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

// En enkel tegnet person. Utseendet velges fra navnet, slik at samme søker alltid ser lik ut.
function avatar(navn) {
  const h = hash(navn);
  const hud = ["#f2c9a0", "#e5b48a", "#c68a5e", "#f6d7bd"][h % 4];
  const haar = ["#4b2e1a", "#c8a165", "#2b2b2b", "#8a4b2a", "#a3a3a3"][(h >>> 3) % 5];
  const klaer = ["#2563eb", "#0891b2", "#db2777", "#16a34a", "#ea580c"][(h >>> 6) % 5];
  const langt = (h >>> 9) % 2 === 1;
  const haarform = langt
    ? `<path d="M27 46c-3-20 8-31 23-31s26 11 23 31c-1 9-2 16-6 20l-3-25c-6 3-20 3-28 0l-3 25c-4-4-5-11-6-20z" fill="${haar}"/>`
    : `<path d="M28 42c-2-16 8-26 22-26s25 9 22 26c-4-6-10-9-22-9s-18 3-22 9z" fill="${haar}"/>`;
  return svgFra(`
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#dbeafe"/>
      <clipPath id="sirkel-${h}"><circle cx="50" cy="50" r="48"/></clipPath>
      <g clip-path="url(#sirkel-${h})">
        <path d="M14 104c2-20 16-30 36-30s34 10 36 30z" fill="${klaer}"/>
        <path d="M42 66h16v12c-4 4-12 4-16 0z" fill="${hud}"/>
        <circle cx="50" cy="46" r="21" fill="${hud}"/>
        ${haarform}
        <circle cx="42" cy="47" r="2.4" fill="#1f2937"/>
        <circle cx="58" cy="47" r="2.4" fill="#1f2937"/>
        <circle cx="38" cy="55" r="3.5" fill="#f87171" opacity=".25"/>
        <circle cx="62" cy="55" r="3.5" fill="#f87171" opacity=".25"/>
        <path d="M43 56c4 4 10 4 14 0" stroke="#1f2937" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      </g>
    </svg>`, "avatar");
}

const ROBOT = `
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <line x1="50" y1="8" x2="50" y2="20" stroke="#6d28d9" stroke-width="3"/>
    <circle class="antenne" cx="50" cy="8" r="5" fill="#a78bfa"/>
    <rect x="18" y="20" width="64" height="54" rx="18" fill="#7c3aed"/>
    <rect x="26" y="30" width="48" height="32" rx="12" fill="#f5f3ff"/>
    <g class="oye"><circle cx="40" cy="45" r="5" fill="#4c1d95"/><circle cx="60" cy="45" r="5" fill="#4c1d95"/></g>
    <path d="M42 55c5 3 11 3 16 0" stroke="#4c1d95" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <rect x="10" y="38" width="8" height="18" rx="4" fill="#a78bfa"/>
    <rect x="82" y="38" width="8" height="18" rx="4" fill="#a78bfa"/>
    <rect x="34" y="76" width="32" height="14" rx="6" fill="#6d28d9"/>
    <path d="M44 83h12" stroke="#ddd6fe" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;

const RADHUS = `
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <line x1="50" y1="6" x2="50" y2="24" stroke="#334155" stroke-width="2"/>
    <path d="M50 7h16l-4 4 4 4H50z" fill="#dc2626"/>
    <path d="M12 40L50 22l38 18z" fill="#0f766e"/>
    <rect x="16" y="40" width="68" height="6" fill="#115e59"/>
    <rect x="16" y="46" width="68" height="38" fill="#f0fdfa" stroke="#99f6e4"/>
    <g fill="#5eead4"><rect x="22" y="50" width="6" height="30"/><rect x="34" y="50" width="6" height="30"/><rect x="60" y="50" width="6" height="30"/><rect x="72" y="50" width="6" height="30"/></g>
    <rect x="44" y="60" width="12" height="24" rx="6" fill="#0f766e"/>
    <rect x="10" y="84" width="80" height="6" rx="2" fill="#115e59"/>
  </svg>`;

function dokIkon(fil) {
  const bilde = fil.endsWith(".png");
  return svgFra(`
    <svg viewBox="0 0 18 22" aria-hidden="true">
      <path d="M1 1h11l5 5v15H1z" fill="${bilde ? "#eff6ff" : "#fff"}" stroke="${bilde ? "#3b82f6" : "#94a3b8"}"/>
      <path d="M12 1v5h5" fill="none" stroke="${bilde ? "#3b82f6" : "#94a3b8"}"/>
      ${bilde
        ? '<path d="M4 16l3-4 2 2 3-4 3 6z" fill="#93c5fd"/>'
        : '<path d="M4 9h9M4 12h9M4 15h6" stroke="#cbd5e1" stroke-width="1.4"/>'}
    </svg>`, "ikon");
}

// Enkel markdown til DOM: overskrifter, tabeller, lister, fet og kursiv. Teksten escapes først.
function md(tekst) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[x\]/gi, "☑").replace(/\[ \]/g, "☐");
  const ut = [];
  const linjer = tekst.split("\n");
  for (let i = 0; i < linjer.length; i++) {
    const l = linjer[i];
    if (/^\s*\|/.test(l)) {
      const rader = [];
      while (i < linjer.length && /^\s*\|/.test(linjer[i])) rader.push(linjer[i++]);
      i--;
      const celler = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [hode, , ...kropp] = rader;
      ut.push(`<table><tr>${celler(hode).map((c) => `<th>${inline(c)}</th>`).join("")}</tr>${kropp
        .map((r) => `<tr>${celler(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</table>`);
    } else if (/^#{1,4} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      ut.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
    } else if (/^\s*- /.test(l)) {
      const punkter = [];
      while (i < linjer.length && /^\s*- /.test(linjer[i])) punkter.push(linjer[i++].replace(/^\s*- /, ""));
      i--;
      ut.push(`<ul>${punkter.map((p) => `<li>${inline(p)}</li>`).join("")}</ul>`);
    } else if (l.trim()) {
      ut.push(`<p>${inline(l)}</p>`);
    }
  }
  const d = el("div", "md");
  d.innerHTML = ut.join("");
  return d;
}

const tall = (n, des = 0) => n.toLocaleString("nb-NO", { minimumFractionDigits: des, maximumFractionDigits: des });
const tid = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const dokRefs = (tekst) => [...new Set(String(tekst ?? "").match(/DOK-\d{4}/g) ?? [])];

// ---------------------------------------------------------------------------
// Tilstand

const t = {
  saker: [],
  sak: null,
  sjekkliste: null,
  kartdata: null,
  kart: null,
  punktRad: new Map(),
  punktDef: new Map(),
  resultat: new Map(),
  rekkefolge: [],
  paragrafer: [],
  aktivtSteg: null,
  kjorer: false,
  avbryt: null,
  stopp: null,
  ferdig: null,
  opplysninger: null,
  kategori: null,
  begrunnelse: null,
  tanker: { form: "", plan: "" },
  tankeLogg: {},
  sisteMs: 0,
  plan: null,
  hendelser: [],
  validering: null,
};

// ---------------------------------------------------------------------------
// Skuffen med detaljer

function apneSkuff(...innhold) {
  $("#skuffinnhold").replaceChildren(...innhold.filter((x) => x !== null && x !== undefined && x !== false));
  $("#skuff").classList.add("apen");
  $("#skuff").setAttribute("aria-hidden", "false");
  $("#skygge").classList.add("apen");
  $("#skuff").scrollTop = 0;
}

function lukkSkuff() {
  $("#skuff").classList.remove("apen");
  $("#skuff").setAttribute("aria-hidden", "true");
  $("#skygge").classList.remove("apen");
  document.querySelectorAll(".punkt.valgt").forEach((r) => r.classList.remove("valgt"));
}
$("#lukk").addEventListener("click", lukkSkuff);
$("#skygge").addEventListener("click", lukkSkuff);
document.addEventListener("keydown", (e) => e.key === "Escape" && lukkSkuff());

function merkelapp(status) {
  return el("span", `merkelapp ${status}`, `${IKON[status] ?? ""} ${STATUSTEKST[status] ?? status}`.trim());
}

function dokKnapper(refs) {
  if (!refs.length) return null;
  return el("div", "dokknapper", refs.map((id) => {
    const d = t.sak.dokumenter.find((x) => x.id === id);
    return el("button", { on: { click: () => visDokument(id) } }, `📄 ${id}${d ? ` ${d.tittel}` : ""}`);
  }));
}

function nokkel(par) {
  return el("dl", "nokkel", par.filter(([, v]) => v !== null && v !== undefined && v !== "").flatMap(([k, v]) => [el("dt", null, k), el("dd", null, v)]));
}

function urlDok(dok) {
  return `/dokumenter/${encodeURIComponent(velg.value)}/${encodeURIComponent(dok.fil)}`;
}

async function visDokument(id) {
  const dok = t.sak.dokumenter.find((d) => d.id === id);
  if (!dok) return;
  pekDok(id);
  const visere = [...t.resultat.values()].filter((p) => dokRefs(p.funnet ?? p.soknad).includes(id));
  const innhold = dok.fil.endsWith(".png")
    ? el("img", { src: urlDok(dok), alt: dok.tittel })
    : md(await (await fetch(urlDok(dok))).text());
  apneSkuff(
    el("h3", null, `${dok.id} · ${dok.tittel}`),
    el("p", "undertekst", `Sendt inn av ${navnPaSoker()} · ${dok.fil}`),
    visere.length
      ? el("div", null, el("h4", null, "Agenten viser til dokumentet i"), el("div", "dokknapper", visere.map((p) =>
        el("button", { on: { click: () => visPunkt(p.id) } }, `${IKON[p.status ?? p.vurdering] ?? ""} ${p.id}`))))
      : null,
    el("h4", null, "Dokumentet"),
    innhold,
  );
}

function navnPaSoker() {
  return t.sak?.visning?.soker?.navn ?? t.sak?.avsender ?? "søker";
}

function visPunkt(id) {
  const def = t.punktDef.get(id);
  const r = t.resultat.get(id);
  if (!def) return;
  document.querySelectorAll(".punkt.valgt").forEach((x) => x.classList.remove("valgt"));
  t.punktRad.get(id)?.classList.add("valgt");
  if (def.paragraf) return visBestemmelse(id);
  const status = r?.status ?? (t.punktRad.get(id)?.classList.contains("hoppet") ? "hoppet" : "venter");
  const hvem = def.kontrolleresAv === "kode" ? "Kode (matrikkelen og planregisteret, uten AI)" : "Agenten (KI), etterkontrollert av kode";
  const refs = dokRefs(r?.funnet);
  refs.forEach(pekDok);
  apneSkuff(
    el("h3", null, `${id} · ${def.gruppe}`),
    el("p", "undertekst", hvem),
    merkelapp(status),
    el("h4", null, "Krav i kontrollisten"),
    el("p", null, def.tekst),
    nokkel([
      ["Kilde", def.kilde],
      ["Gjelder", def.gjelder === "begge" ? "Endring og nybygg" : `Bare ${def.gjelder}`],
      ["Krav", def.obligatorisk ? "Obligatorisk" : "Hvis relevant"],
    ]),
    r?.vurdering ? el("div", null, el("h4", null, "Agentens vurdering"), el("p", null, r.vurdering)) : null,
    !r && t.skrift[id] ? el("div", null, el("h4", null, "Agenten skriver nå"), el("p", null, t.skrift[id])) : null,
    el("h4", null, def.kontrolleresAv === "kode" ? "Hva koden fant" : "Hva agenten fant"),
    r ? el("blockquote", "sitat", r.funnet)
      : el("p", "undertekst", status === "hoppet"
        ? `Ikke kontrollert. Kontrollen stoppet ved ${t.stopp?.id ?? "første feil"}.`
        : "Ikke kontrollert ennå."),
    dokKnapper(refs),
    fasitDel(id),
  );
}

function visBestemmelse(id) {
  const def = t.punktDef.get(id);
  const b = t.resultat.get(id);
  apneSkuff(
    el("h3", null, `${id} ${def.tittel}`),
    el("p", "undertekst", `Planvurdering mot ${t.plan?.id ?? ""} ${t.plan?.navn ?? ""} · agenten (KI)`),
    merkelapp(b?.vurdering ?? (t.punktRad.get(id)?.classList.contains("hoppet") ? "hoppet" : "venter")),
    b ? el("div", null,
      el("h4", null, "Kravet i planen"), el("p", null, b.krav),
      el("h4", null, "Det søknaden oppgir"), el("p", null, b.soknad),
      el("h4", null, "Begrunnelse"), el("blockquote", "sitat", b.begrunnelse),
      dokKnapper(dokRefs(`${b.soknad} ${b.begrunnelse}`)),
    ) : el("p", "undertekst", "Ikke vurdert ennå."),
    el("h4", null, "Planen"),
    el("div", "dokknapper",
      el("button", { on: { click: visPlan } }, "🗺 Plankart og planbestemmelser"),
    ),
    el("p", "undertekst", "Dette er en vurdering til saksbehandler, ikke et vedtak."),
    fasitDel(id),
  );
}

async function visPlan() {
  const plan = t.kartdata.planregister.planer[0];
  const tekst = await (await fetch(`/plan/${encodeURIComponent(plan.fil)}`)).text();
  apneSkuff(
    el("h3", null, `${plan.id} ${plan.navn}`),
    el("p", "undertekst", "Fra planregisteret. Agenten får plankartet og bestemmelsene i steg 3."),
    el("img", { src: `/plan/${encodeURIComponent(plan.plankart)}`, alt: `Plankart ${plan.id}` }),
    md(tekst),
  );
}

function visEiendom(id) {
  t.kart.velg(id);
  const tomt = t.kart.tomt(id);
  const m = t.kart.matrikkelEiendom(id);
  const v = t.sak.visning;
  const mottaker = v?.nabovarsel?.mottakere?.find((x) => x.eiendom === id);
  const soker = v?.soker?.eiendom;
  const naboer = soker ? t.kart.naboer(soker) : [];
  let rolle = "Ingen rolle i denne saken.";
  if (id === soker) rolle = `${v.soker.navn} oppgir gnr/bnr ${id} i søknaden.`;
  else if (mottaker) rolle = `Nabo. Varslet ${v.nabovarsel.dato ?? ""}: ${mottaker.maate.toLowerCase()} til ${mottaker.navn} (${mottaker.bekreftelse}). Kilde: ${v.nabovarsel.kilde}.`;
  else if (naboer.includes(id)) rolle = `Nabo eller gjenboer til ${soker}. Søknaden dokumenterer ikke at eiendommen er varslet.`;
  const plan = m?.planer.length ? t.kartdata.planregister.planer.find((p) => p.id === m.planer[0]) : null;
  apneSkuff(
    el("h3", null, `${t.kart.adresse(id)} · ${id}`),
    el("p", "undertekst", tomt?.utenforMatrikkel ? "Gjenboer på kartskissen. Eiendommen er ikke med i det syntetiske matrikkelutdraget." : "Fra matrikkelen for Hvileskjær (8888). Syntetiske data."),
    el("h4", null, "Rolle i saken"),
    el("p", null, rolle),
    m ? el("div", null,
      el("h4", null, "Matrikkelen"),
      nokkel([
        ["Gnr/bnr", `8888-${m.gnr}/${m.bnr}`],
        ["Adresse", m.adresser.map((a) => `${a.adresse}, ${a.postnr} ${a.poststed}`).join("; ") || "Ingen"],
        ["Tomteareal", `${tall(m.tomteareal)} m²`],
        ["Bygninger", m.bygninger.length ? m.bygninger.map((b) => `${b.type}, BYA ${b.bya} m² (bygningsnr. ${b.bygningsnr})`).join("; ") : "Ingen registrert"],
        ["Plan", plan ? `${plan.id} ${plan.navn}` : "Ingen i planregisteret"],
      ]),
    ) : null,
  );
}

function visPerson() {
  const v = t.sak.visning?.soker;
  if (v?.eiendom) {
    t.kart.velg(v.eiendom);
    t.kart.puls(v.eiendom);
  }
  apneSkuff(
    el("div", { style: "display:flex;gap:16px;align-items:center" }, avatar(navnPaSoker()), el("div", null,
      el("h3", null, navnPaSoker()),
      el("p", "undertekst", v?.rolle ?? "Søker"),
    )),
    el("h4", null, "Hva søkeren har gjort"),
    nokkel([
      ["Sendt", `${t.sak.mottatt} · ${t.sak.kanal}`],
      ["Avsender", t.sak.avsender],
      ["Emne", t.sak.emne],
      ["Oppgir eiendom", v?.eiendom ? `${v.eiendom} · ${v.adresse}` : null],
      ["Nabovarsel", v ? (t.sak.visning.nabovarsel?.mottakere?.length
        ? `${t.sak.visning.nabovarsel.mottakere.length} naboer varslet ${t.sak.visning.nabovarsel.dato}`
        : t.sak.visning.nabovarsel?.merknad) : null],
    ]),
    el("h4", null, `Dokumenter (${t.sak.dokumenter.length})`),
    dokKnapper(t.sak.dokumenter.map((d) => d.id)),
    el("p", "undertekst", "Eiendommen søkeren oppgir, er uthevet i kartet."),
  );
}

function visPostmottak() {
  apneSkuff(
    el("h3", null, "Postmottaket · Hvileskjær kommune"),
    el("p", "undertekst", "Søknaden er journalført og venter på kontroll."),
    nokkel([
      ["Saksnummer", t.sak.sakId],
      ["Mottatt", t.sak.mottatt],
      ["Kanal", t.sak.kanal],
      ["Avsender", t.sak.avsender],
      ["Emne", t.sak.emne],
      ["Kategori", t.kategori ? `${t.kategori} (satt av agenten)` : "Ikke satt ennå. Det finner kontrollen ut."],
    ]),
    el("h4", null, "Journalførte dokumenter"),
    dokKnapper(t.sak.dokumenter.map((d) => d.id)),
  );
}

function visAgent() {
  const k = t.ferdig?.kall;
  const kallNavn = (n) => n === "form" ? "Formkontroll · kategori, opplysninger og gruppe A"
    : n === "fakta" ? "Fakta til kodereglene"
    : /^plan\d*$/.test(n) ? `Planvurdering${n.length > 4 ? ` · del ${n.slice(4)}` : ""}`
    : `Formkontroll · gruppe ${n[0]}, del ${n.slice(1)}`;
  const kallDel = (navn, kall, steg) => kall ? el("div", null,
    el("h4", null, navn),
    nokkel([
      ["Tid", `${tall(kall.tidSekunder, 1)} s`],
      ["Stopp", kall.stopp === "avbrutt" ? "Avbrutt ved første feil" : kall.stopp],
    ]),
    el("details", "raa", el("summary", null, "Svaret fra modellen"), el("pre", null, kall.tekst || "(tomt)")),
    el("details", "raa", el("summary", null, "Det AI-en fikk"), el("pre", null, `SYSTEM:\n${kall.system}\n\nBRUKER:\n${kall.sendt}`)),
  ) : null;
  apneSkuff(
    el("h3", null, "Saksassistenten"),
    el("p", "undertekst", `${t.ferdig?.modell ?? "claude-haiku-5-5"} · ${oppsettTekst(t.effort ?? effortVelg.value, t.oppsett ?? { parallell: kjoringVelg.value !== "sekvensiell", kode: kjoringVelg.value === "parallell-kode" })}${(t.effort ?? effortVelg.value).match(/^(xhigh|max)$/) ? " · tenker før den svarer" : " · uten tenking i skjul"}`),
    el("ol", null,
      el("li", null, el("strong", null, "Formkontroll (agent). "), "Kategoriserer søknaden, henter ut eiendomsopplysningene og går gjennom kontrollisten A–E, ett punkt om gangen."),
      el("li", null, el("strong", null, "Matrikkelkontroll (kode). "), "Slår opp opplysningene i matrikkelen og planregisteret. Kjøres når agenten er ferdig med gruppe A og B."),
      el("li", null, el("strong", null, "Planvurdering (agent). "), "Bare når steg 1 og 2 er bestått. Vurderer hver paragraf i reguleringsplanen."),
    ),
    t.oppsett?.parallell ? el("p", "undertekst", `Kontrollisten er delt i kall på høyst ${t.oppsett.bit ?? "én gruppe med"} punkter som kjøres samtidig, og punktene vises i fast rekkefølge.${t.oppsett.kode ? " Agenten henter fakta, og koden avgjør gruppe B, D13 og E5." : ""}`) : null,
    el("p", "undertekst", /^(xhigh|max)$/.test(t.effort ?? effortVelg.value)
      ? "På xhigh og max tenker agenten før den svarer. Et sammendrag av tenkingen vises i loggen. Klikk på et punkt for å se vurderingen."
      : "Agenten tenker ikke i skjul først. Den skriver en kort vurdering av hvert punkt før den setter status, slik at du kan følge den punkt for punkt. Klikk på et punkt for å se vurderingen."),
    k ? null : el("p", "undertekst", t.kjorer ? "Kjøringen pågår." : "Kjør kontrollen for å se svaret og det AI-en fikk."),
    ...Object.entries(k ?? {}).map(([n, kall]) => kallDel(kallNavn(n), kall, n)),
  );
}

// ---------------------------------------------------------------------------
// Scenen: søker → dokumenter → postmottak → saksassistent → stempel

function tegnScene() {
  const sak = t.sak;
  const v = sak.visning?.soker;
  $("#person").replaceChildren(
    avatar(navnPaSoker()),
    el("div", "navn", navnPaSoker()),
    el("div", "rolle", v ? v.rolle : "Søker", v?.adresse ? el("br") : null, v?.adresse ?? ""),
  );
  $("#bunke").replaceChildren(...sak.dokumenter.map((d, i) => el("button", {
    class: "dok", "data-dok": d.id, style: `--i:${i}`, title: `${d.id} ${d.tittel}`,
    on: { click: () => visDokument(d.id) },
  }, dokIkon(d.fil), el("span", null, d.tittel))));
  $("#postmottak").replaceChildren(svgFra(RADHUS), el("div", "navn", "Postmottak"), el("div", "rolle", `Sak ${sak.sakId}`, el("br"), `mottatt ${sak.mottatt}`));
  $("#agent").replaceChildren(
    el("div", "ring"),
    svgFra(ROBOT, "robot"),
    el("div", "navn", "Saksassistent"),
    el("div", "rolle", "KI · formkontroll og plan"),
    el("div", "tenker", ""),
  );
  stempel("venter", "Venter på kontroll", "Trykk «Kjør kontroll»");
  requestAnimationFrame(tegnLedninger);
}

function tegnLedninger() {
  const svg = $("#ledninger");
  const r0 = scene.getBoundingClientRect();
  const boks = (sel) => {
    const r = $(sel).getBoundingClientRect();
    return { x0: r.left - r0.left, x1: r.right - r0.left, y: r.top - r0.top + r.height / 2 };
  };
  const ledd = ["#person", "#bunke", "#postmottak", "#agent", "#stempelfelt"].map(boks);
  const stier = [];
  for (let i = 0; i < ledd.length - 1; i++) {
    const a = ledd[i];
    const b = ledd[i + 1];
    const dx = (b.x0 - a.x1) / 2;
    stier.push(`<path class="ledning" d="M${a.x1 - 6},${a.y} C${a.x1 + dx},${a.y} ${b.x0 - dx},${b.y} ${b.x0 + 6},${b.y}"/>`);
  }
  svg.setAttribute("viewBox", `0 0 ${r0.width} ${r0.height}`);
  svg.innerHTML = stier.join("");
}
window.addEventListener("resize", tegnLedninger);

function stempel(klasse, tekst, liten) {
  const felt = $("#stempelfelt");
  felt.classList.remove("dunk");
  felt.replaceChildren(el("div", `stempel ${klasse}`, tekst, liten ? el("small", null, liten) : null));
  if (klasse !== "venter") {
    void felt.offsetWidth;
    felt.classList.add("dunk");
  }
}

function pekDok(id) {
  const chip = document.querySelector(`.dok[data-dok="${id}"]`);
  if (!chip) return;
  chip.classList.add("lest");
  chip.classList.remove("pek");
  void chip.offsetWidth;
  chip.classList.add("pek");
}

// Dokumentene flyr fra søkeren til saksassistenten når kontrollen starter.
function sendDokumenter() {
  const mal = $("#agent .robot").getBoundingClientRect();
  document.querySelectorAll(".dok").forEach((chip, i) => {
    const r = chip.getBoundingClientRect();
    const kopi = chip.cloneNode(true);
    kopi.classList.add("flygende");
    Object.assign(kopi.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, animation: "none" });
    document.body.append(kopi);
    const dx = mal.left + mal.width / 2 - (r.left + r.width / 2);
    const dy = mal.top + mal.height / 2 - (r.top + r.height / 2);
    kopi.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx / 2}px, ${dy / 2 - 50}px) scale(.8) rotate(${i % 2 ? 8 : -8}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 },
      ],
      { duration: 1100, delay: i * 140, easing: "cubic-bezier(.5,0,.4,1)", fill: "both" },
    ).onfinish = () => kopi.remove();
  });
}

// Fjerner merkelappen «vurderer …» under agenten når den ikke skriver om et punkt.
function stoppTenker() {
  $("#agent .tenker")?.replaceChildren();
}

// ---------------------------------------------------------------------------
// Gjennomgangen: alle kontrollpunkter vises fra start og fylles inn etter hvert

const GRUPPEREKKEFOLGE = ["A", "B", "M", "C", "D", "E"];

function byggGjennomgang() {
  const boks = $("#gjennomgang");
  boks.replaceChildren();
  t.punktRad.clear();
  t.punktDef.clear();
  t.rekkefolge = [];
  const grupper = GRUPPEREKKEFOLGE.map((id) => t.sjekkliste.grupper.find((g) => g.id === id)).filter(Boolean);
  for (const g of grupper) boks.append(gruppeBoks(g.id, g.navn, g.kontrolleresAv, g.punkter.map((p) => ({ ...p, gruppe: g.navn, kontrolleresAv: g.kontrolleresAv }))));
  boks.append(gruppeBoks("P", "Planvurdering", "agent", [], "Kjøres når formkontrollen og matrikkelkontrollen er bestått."));
  oppdaterTeller();
}

function gruppeBoks(id, navn, hvem, punkter, tomTekst) {
  const mini = el("span", "mini", "");
  const boks = el("div", { class: "gruppe", "data-gruppe": id },
    el("div", { class: "gruppehode", on: { click: () => boks.classList.toggle("lukket") } },
      el("span", "gid", id), el("span", "gnavn", navn), el("span", `hvem ${hvem === "kode" ? "kode" : ""}`, hvem === "kode" ? "kode" : "agent"), mini),
    el("div", "punkter", tomTekst ? el("div", { class: "punkt venter", style: "grid-template-columns:1fr;cursor:default" }, el("span", "ptekst", tomTekst)) : null),
  );
  boks._mini = mini;
  for (const p of punkter) leggTilPunkt(boks, p);
  return boks;
}

function leggTilPunkt(boks, def) {
  t.punktDef.set(def.id, def);
  t.rekkefolge.push(def.id);
  const rad = el("div", { class: "punkt venter", "data-id": def.id, on: { click: () => visPunkt(def.id) } },
    el("span", "status venter", ""), el("span", "pid", def.id), el("span", { class: "ptekst", title: def.tekst }, def.tekst));
  t.punktRad.set(def.id, rad);
  boks.querySelector(".punkter").append(rad);
}

function settStatus(id, status, data) {
  const rad = t.punktRad.get(id);
  if (!rad) return;
  t.resultat.set(id, { id, status, ...data });
  rad.querySelector(".levende")?.remove();
  rad.className = `punkt ny ${status}`;
  rad.querySelector(".status").className = `status ${status}`;
  rad.querySelector(".status").textContent = IKON[status] ?? "";
  rad.addEventListener("animationend", () => rad.classList.remove("ny"), { once: true });
  oppdaterTeller();
  oppdaterNeste();
  synlig(rad);
}

// Ruller listen slik at raden synes, uten å flytte resten av siden.
function synlig(rad) {
  const liste = $("#gjennomgang");
  const top = rad.offsetTop - liste.offsetTop;
  if (top < liste.scrollTop || top > liste.scrollTop + liste.clientHeight - 40) liste.scrollTop = top - liste.clientHeight / 2;
}

function oppdaterTeller() {
  const alle = t.rekkefolge;
  const ferdige = alle.filter((id) => t.resultat.has(id)).length;
  const feil = [...t.resultat.values()].filter((r) => FEIL.has(r.status)).length;
  $("#teller").textContent = `${ferdige} av ${alle.length} kontrollert${feil ? ` · ${feil} feil` : ""}`;
  $("#fremdrift").style.width = `${alle.length ? (100 * ferdige) / alle.length : 0}%`;
  $("#fremdrift").classList.toggle("feil", feil > 0);
  for (const boks of document.querySelectorAll(".gruppe")) {
    const ids = [...boks.querySelectorAll(".punkt[data-id]")].map((r) => r.dataset.id);
    const n = ids.filter((id) => t.resultat.has(id)).length;
    const f = ids.filter((id) => FEIL.has(t.resultat.get(id)?.status)).length;
    boks._mini.textContent = ids.length ? `${f ? `✕${f} · ` : ""}${n}/${ids.length}` : "";
  }
}

// Punktet modellen skriver om akkurat nå. Vurderingen vises i raden mens den skrives.
const FELTNAVN = { krav: "Krav", soknad: "Søknaden", begrunnelse: "Vurdering", funnet: "Funnet" };

function vurderer(id) {
  t.aktivtPunkt = id;
  t.skrift[id] = "";
  t.vist[id] = 0;
  t.vurdererStart[id] = performance.now();
  t.skriftFelt[id] = null;
  const merke = $("#agent .tenker");
  if (merke) merke.textContent = `✍ vurderer ${id}`;
  const rad = t.punktRad.get(id);
  if (rad && !rad.querySelector(".levende")) rad.append(el("span", "levende", ""));
  oppdaterNeste();
}

function skriver(h) {
  // Begrunnelsen for kategorien og oppsummeringen av planen skrives utenfor listen og vises først når de er ferdige.
  if (!h.id) return;
  if (t.resultat.has(h.id)) return;
  if (t.skriftFelt[h.id] !== h.felt) {
    t.skriftFelt[h.id] = h.felt;
    if (FELTNAVN[h.felt]) t.skrift[h.id] += `${t.skrift[h.id] ? "\n" : ""}${FELTNAVN[h.felt]}: `;
  }
  t.skrift[h.id] += h.tekst;
  skrivFram();
}

// Skrivemaskin: teksten modellen har skrevet, vises tegn for tegn i raden.
// Ligger visningen etter, skrives det fortere til den tar igjen.
function skrivFram() {
  if (t.skriverFram) return;
  t.skriverFram = true;
  const tegn = () => {
    const id = t.aktivtPunkt;
    const full = (id && t.skrift[id]) || "";
    const vist = t.vist[id] ?? 0;
    if (!id || vist >= full.length || t.resultat.has(id)) {
      t.skriverFram = false;
      return;
    }
    const ny = Math.min(full.length, vist + Math.ceil(Math.max(1.5, (full.length - vist) / 14) * t.fart));
    t.vist[id] = ny;
    const tekst = full.slice(0, ny);
    const levende = t.punktRad.get(id)?.querySelector(".levende");
    if (levende) {
      levende.textContent = tekst;
      synlig(levende.parentElement);
    }
    dokRefs(full.slice(Math.max(0, vist - 8), ny)).forEach(pekDok);
    requestAnimationFrame(tegn);
  };
  requestAnimationFrame(tegn);
}

// Venter til teksten for punktet er skrevet ferdig på skjermen og punktet har vært under vurdering
// en liten stund, før resultatet vises.
async function ferdigSkrevet(id) {
  const start = t.vurdererStart[id];
  // I en bakgrunnsfane stanser nettleseren animasjonene. Da vises punktet med en gang.
  if (start === undefined || document.hidden) return;
  const igjen = MIN_PUNKT_MS / tempo() - (performance.now() - start);
  if (igjen > 0) await pause(igjen);
  for (let i = 0; i < 400 && (t.vist[id] ?? 0) < (t.skrift[id]?.length ?? 0) && t.kjorer && !document.hidden; i++) await pause(25);
}

// Uthever raden modellen skriver om nå. Ingen rad uthevet når modellen ikke skriver om et punkt.
function oppdaterNeste() {
  document.querySelectorAll(".punkt.neste").forEach((r) => r.classList.remove("neste"));
  document.querySelectorAll(".gruppe.aktiv").forEach((g) => g.classList.remove("aktiv"));
  if (!t.kjorer || t.stopp) return;
  const id = t.aktivtPunkt;
  if (!id || t.resultat.has(id)) return;
  const rad = t.punktRad.get(id);
  if (!rad) return;
  rad.classList.add("neste");
  rad.closest(".gruppe").classList.add("aktiv");
  synlig(rad);
}

function gruppeAv(id) {
  return t.punktRad.get(id)?.closest(".gruppe")?.dataset.gruppe;
}

function banner(klasse, tittel, tekst) {
  $("#banner").replaceChildren(el("div", `banner ${klasse}`, el("strong", null, tittel), tekst ?? ""));
}

// ---------------------------------------------------------------------------
// Eiendomsopplysninger: søknaden mot matrikkelen

const RADER = [
  { navn: "Tiltakshaver", soknad: (o) => o.tiltakshaver },
  { navn: "Kommune", m: ["M1"], soknad: (o) => [o.kommune, o.kommunenr && `(${o.kommunenr})`].filter(Boolean).join(" "), mat: () => "Hvileskjær (8888)" },
  { navn: "Gnr/bnr", m: ["M2"], soknad: (o) => (o.gnr ?? o.bnr) !== null ? `${o.gnr ?? "?"}/${o.bnr ?? "?"}` : null, mat: (e, o) => (e ? `${e.gnr}/${e.bnr}` : `${o.gnr}/${o.bnr} finnes ikke`) },
  { navn: "Adresse", m: ["M3", "M4"], soknad: (o) => o.adresse, mat: (e) => e?.adresser.map((a) => a.adresse).join(", ") || "–" },
  { navn: "Postnr og sted", m: ["M5"], soknad: (o) => [o.postnr, o.poststed].filter(Boolean).join(" "), mat: (e) => e?.adresser.map((a) => `${a.postnr} ${a.poststed}`).join(", ") || "–" },
  { navn: "Tomteareal", m: ["M6"], soknad: (o) => o.tomteareal !== null ? `${tall(o.tomteareal)} m²` : null, mat: (e) => (e ? `${tall(e.tomteareal)} m²` : "–") },
  { navn: "BYA før tiltaket", m: ["M7"], soknad: (o) => o.byaFor !== null ? `${tall(o.byaFor)} m²` : null, mat: (e) => (e ? `${tall(e.bygninger.reduce((s, b) => s + b.bya, 0))} m²` : "–") },
  { navn: "BYA for tiltaket", soknad: (o) => o.tiltakBya !== null ? `${tall(o.tiltakBya)} m²` : null },
  { navn: "Plan", m: ["M9", "M10"], soknad: (o) => o.planOppgitt, mat: (e) => (e?.planer.length ? e.planer.join(", ") : "Ingen plan") },
];

function tegnOpplysninger() {
  const o = t.opplysninger;
  const boks = $("#opplysninger");
  if (!o) {
    boks.replaceChildren(el("p", "hint", t.kjorer ? "Agenten leser søknaden …" : "Fylles ut når agenten har lest søknaden. Kategori, eiendom og plan er ikke registrert ennå."));
    return;
  }
  const e = t.kart.matrikkelEiendom(`${o.gnr}/${o.bnr}`);
  const tabell = el("table", "opp", el("tr", null, el("th", null, ""), el("th", null, "Søknaden (agenten leste)"), el("th", null, "Matrikkelen (kode)"), el("th", null, "")));
  for (const r of RADER) {
    const s = r.soknad(o);
    const mRes = (r.m ?? []).map((id) => t.resultat.get(id)).filter(Boolean);
    const avvik = mRes.some((x) => x.status === "avvik");
    const ferdig = r.m && mRes.length === r.m.length;
    const status = avvik ? "avvik" : ferdig ? (mRes.every((x) => x.status === "oppfylt") ? "oppfylt" : mRes.find((x) => x.status !== "oppfylt").status) : null;
    tabell.append(el("tr", { class: status ?? "", style: mRes.length ? "cursor:pointer" : null, on: { click: () => mRes[0] && visPunkt(avvik ? mRes.find((x) => x.status === "avvik").id : mRes[0].id) } },
      el("td", null, r.navn),
      el("td", s ? "verdi" : "tom", s || "ikke oppgitt"),
      el("td", mRes.length ? "verdi mat" : "tom", mRes.length && r.mat ? r.mat(e, o) : r.m ? "…" : ""),
      el("td", null, status ? el("span", `status ${status}`, IKON[status]) : ""),
    ));
  }
  boks.replaceChildren(
    t.kategori ? el("p", { style: "margin:0 0 8px" }, "Kategori: ", el("strong", null, t.kategori), t.begrunnelse ? ` · ${t.begrunnelse}` : "") : null,
    tabell,
  );
}

// ---------------------------------------------------------------------------
// Kartet reagerer på kontrollen

function settOppKart() {
  const v = t.sak.visning;
  t.kart.nullstill();
  t.kart.tegnTiltak(v?.tiltak);
  $("#kartforklaring").replaceChildren(
    el("span", null, el("i", { style: "background:#dbeafe;border:2px solid #2563eb" }), "Søkers eiendom"),
    el("span", null, el("i", { style: "background:#fde68a;border:1px solid #b45309" }), "Tiltaket (fra situasjonsplanen)"),
    el("span", null, el("i", { style: "background:#94a3b8" }), "Bygning i matrikkelen"),
  );
  if (v?.soker?.eiendom) {
    t.kart.merk(v.soker.eiendom, "soker");
    t.kart.merkelapp(v.soker.eiendom, `🙂 ${v.soker.navn}`, "", { nokkel: "soker" });
  }
}

function kartOpplysninger(o) {
  const id = `${o.gnr}/${o.bnr}`;
  if (t.kart.finnesPaKart(id)) {
    t.kart.merk(id, "oppgitt");
    t.kart.puls(id);
    t.kart.merkelapp(id, `Søknaden: gnr/bnr ${id}`, "", { nokkel: "gnr" });
  }
  const adr = t.kartdata.matrikkel.eiendommer.find((e) => e.adresser.some((a) => a.adresse.toLowerCase() === String(o.adresse ?? "").toLowerCase().trim()));
  const adrId = adr ? `${adr.gnr}/${adr.bnr}` : null;
  if (adrId && adrId !== id) t.kart.merkelapp(adrId, `Søknaden: ${o.adresse}`, "", { nokkel: "adr" });
  t.adresseEiendom = adrId;
}

function kartPunkt(p) {
  const o = t.opplysninger;
  const id = o ? `${o.gnr}/${o.bnr}` : null;
  if (p.id === "M2" && p.status === "oppfylt") {
    t.kart.fjern("oppgitt");
    t.kart.merk(id, "bekreftet");
    t.kart.merkelapp(id, `✓ ${id} finnes i matrikkelen`, "ok", { nokkel: "gnr" });
  }
  if (p.id === "M4" && p.status === "avvik" && t.adresseEiendom) {
    t.kart.merk(id, "avvik");
    t.kart.merk(t.adresseEiendom, "avvik");
    t.kart.konflikt(id, t.adresseEiendom, "Adressen og gnr/bnr peker på ulike eiendommer");
  } else if (p.id.startsWith("M") && p.status === "avvik" && id) {
    t.kart.merk(id, "avvik");
    t.mAvvik = [...(t.mAvvik ?? []), p.id];
    t.kart.merkelapp(id, `✕ avvik ${t.mAvvik.join(", ")}`, "feil", { nokkel: "mavvik" });
  }
  if (p.id === "E2") nabovarsel(p.status);
}

function nabovarsel(status) {
  const v = t.sak.visning;
  const fra = v?.soker?.eiendom;
  if (!fra) return;
  const varslet = new Set((v.nabovarsel?.mottakere ?? []).map((m) => m.eiendom));
  const alle = [...new Set([...t.kart.naboer(fra), ...varslet])];
  t.kart.sendNabovarsel(fra, alle.map((eiendom) => ({ eiendom, varslet: varslet.has(eiendom) })));
  const tekst = { oppfylt: `✉ ${varslet.size} naboer varslet`, uklart: `✉ ${varslet.size} varslet · uklart om alle er med` }[status] ?? "✉ Nabovarsel ikke dokumentert";
  const klasse = { oppfylt: "ok", uklart: "usikker" }[status] ?? "feil";
  t.kart.merkelapp(fra, tekst, klasse, { nokkel: "nabo" });
}

function kartBestemmelse(b) {
  const tiltak = t.sak.visning?.tiltak;
  const klasse = b.vurdering === "samsvar" ? "ok" : b.vurdering === "avvik" ? "feil" : b.vurdering === "usikkert" ? "usikker" : "";
  if (b.id === "§ 4") {
    t.kart.tiltakStatus(b.vurdering === "samsvar" ? "ok" : b.vurdering === "avvik" ? "avvik" : null);
    if (tiltak) t.kart.merkelapp(null, `§ 4 byggegrense: ${STATUSTEKST[b.vurdering].toLowerCase()}`, klasse, { x: tiltak.x + tiltak.b / 2, y: tiltak.y - 2.4, nokkel: "p4" });
  }
}

// ---------------------------------------------------------------------------
// Loggen

function logg(ms, ikon, tekst, { klasse, klikk } = {}) {
  const li = el("li", { class: `${klasse ?? ""}${klikk ? " klikkbar" : ""}` }, el("span", "tid", tid(ms)), el("span", "ikon", ikon), el("span", null, tekst));
  if (klikk) li.addEventListener("click", klikk);
  const liste = $("#logg");
  const nederst = liste.scrollHeight - liste.scrollTop - liste.clientHeight < 40;
  liste.append(li);
  if (nederst) liste.scrollTop = liste.scrollHeight;
  return li;
}

// Gjennomgang og logg kan få hele arbeidsflaten når mange detaljer skal leses.
const PANELER = [
  { panel: "#kartKort", knapp: "#utvidKart", navn: "Kart" },
  { panel: "#gjennomgangKort", knapp: "#utvidGjennomgang", navn: "Gjennomgang" },
  { panel: "#loggKort", knapp: "#utvidLogg", navn: "Logg" },
];

function lukkUtvidedePaneler() {
  for (const p of PANELER) {
    $(p.panel).classList.remove("panel-fullskjerm");
    const knapp = $(p.knapp);
    knapp.setAttribute("aria-expanded", "false");
    knapp.textContent = "⛶ Utvid";
  }
  document.body.classList.remove("panel-aktiv");
}

function vekslePanel(panelId) {
  const valgt = PANELER.find((p) => p.panel === panelId);
  if (!valgt) return;
  const erApen = $(valgt.panel).classList.contains("panel-fullskjerm");
  lukkUtvidedePaneler();
  if (!erApen) {
    $(valgt.panel).classList.add("panel-fullskjerm");
    const knapp = $(valgt.knapp);
    knapp.setAttribute("aria-expanded", "true");
    knapp.textContent = "↙ Minimer";
    document.body.classList.add("panel-aktiv");
  }
}

for (const p of PANELER) $(p.knapp).addEventListener("click", () => vekslePanel(p.panel));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("panel-aktiv")) lukkUtvidedePaneler();
});

function kortTekst(tekst, n = 110) {
  const s = String(tekst ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Hendelsene fra serveren

// Hendelsene validatoren trenger. Resten (tekst som skrives, tanker) sendes ikke.
const TIL_VALIDERING = new Set(["start", "kategori", "opplysninger", "punkt", "port", "stopp", "bestemmelse", "konklusjon", "ferdig", "disp-runde"]);

function behandle(h) {
  t.sisteMs = h.ms ?? t.sisteMs;
  if (TIL_VALIDERING.has(h.type)) {
    const { kall, ...uten } = h;
    t.hendelser.push(uten);
  }
  switch (h.type) {
    case "start":
      t.effort = h.effort ?? h.oppsett?.effort ?? null;
      t.oppsett = h.oppsett ?? null;
      t.stoppVedFeil = Boolean(h.stoppVedFeil);
      logg(h.ms, "📨", `${navnPaSoker()} sin søknad (${h.dokumenter.length} dokumenter) sendes til saksassistenten · ${h.modell}${t.effort ? ` · ${oppsettTekst(t.effort, t.oppsett)}` : ""}${h.tenker ? " (tenker før den svarer)" : ""}${h.stoppVedFeil ? " · stopper ved første feil" : ""}`, { klasse: "steg", klikk: visPostmottak });
      sendDokumenter();
      break;
    case "steg":
      steg(h);
      break;
    case "tanke": {
      t.tanker[h.steg] += h.tekst;
      let li = t.tankeLogg[h.steg];
      if (!li) {
        li = t.tankeLogg[h.steg] = logg(h.ms, "💭", "", { klikk: visAgent });
        li.lastChild.className = "tanke";
      }
      li.lastChild.textContent = kortTekst(t.tanker[h.steg].split(/\n+/).filter(Boolean).at(-1), 220);
      break;
    }
    case "vurderer":
      vurderer(h.id);
      break;
    case "skriver":
      skriver(h);
      break;
    case "kategori":
      t.kategori = h.kategori;
      logg(h.ms, "🏷", `Kategori: ${h.kategori}`, { klikk: visPostmottak });
      tegnOpplysninger();
      break;
    case "begrunnelse":
      t.begrunnelse = h.begrunnelse;
      tegnOpplysninger();
      break;
    case "opplysninger": {
      t.opplysninger = h.opplysninger;
      const o = h.opplysninger;
      logg(h.ms, "📍", `Eiendom oppgitt i søknaden: ${o.gnr ?? "?"}/${o.bnr ?? "?"}, ${o.adresse ?? "uten adresse"} ${o.postnr ?? ""} ${o.poststed ?? ""}`);
      tegnOpplysninger();
      kartOpplysninger(o);
      break;
    }
    case "punkt": {
      const p = h.punkt;
      settStatus(p.id, p.status, p);
      dokRefs(p.funnet).forEach(pekDok);
      const feil = FEIL.has(p.status);
      logg(h.ms, el("span", `status ${p.status}`, IKON[p.status]), `${p.id} ${kortTekst(p.funnet, 140)}`, { klikk: () => visPunkt(p.id), klasse: feil ? "stopp" : "" });
      if (p.id.startsWith("M")) tegnOpplysninger();
      kartPunkt(p);
      break;
    }
    case "stopp":
      t.stopp = h;
      hoppOver();
      stoppTenker();
      logg(h.ms, "⛔", `Stoppet: ${kortTekst(h.grunn, 200)}`, { klasse: "stopp", klikk: () => visPunkt(h.id) });
      if (h.steg === "plan") {
        stempel("feil", "Avvik fra planen", `${h.id} · vurdering til saksbehandler`);
        banner("feil", `Avvik fra reguleringsplanen (${h.id})`, h.grunn);
      } else {
        stempel("feil", "Ikke godkjent", h.steg === "matrikkel" ? "Eiendommen stemmer ikke med matrikkelen" : "Søknaden er ikke komplett");
        banner("feil", `Ikke godkjent – stoppet ved ${h.id}`, h.grunn);
      }
      break;
    case "port":
      if (h.bestatt) {
        logg(h.ms, "🚦", "Formkontroll og matrikkelkontroll er bestått. Søknaden går videre til planvurdering.", { klasse: "godkjent" });
        banner("ok", "Formkontrollen er bestått", "Søknaden er komplett og eiendommen er bekreftet. Planvurderingen starter.");
        stempel("ok", "Komplett", "Går videre til planvurdering");
      } else if (!t.stopp) {
        logg(h.ms, "🚦", `Ikke godkjent: ${h.grunner.join(" ")}`, { klasse: "stopp" });
        banner("feil", "Ikke godkjent", el("div", null, el("p", { style: "margin:4px 0" }, h.grunner.join(" ")),
          el("details", null, el("summary", null, "Grunnlag for mangelbrev"), el("pre", { style: "white-space:pre-wrap;font-size:12px" }, h.mangelliste.join("\n")))));
        stempel("feil", "Ikke godkjent", "Søknaden er ikke komplett");
      }
      break;
    case "bestemmelse": {
      const b = h.bestemmelse;
      settStatus(b.id, b.vurdering, b);
      dokRefs(`${b.soknad} ${b.begrunnelse}`).forEach(pekDok);
      logg(h.ms, el("span", `status ${b.vurdering}`, IKON[b.vurdering]), `${b.id} ${b.tittel}: ${kortTekst(b.begrunnelse, 140)}`, { klikk: () => visPunkt(b.id), klasse: b.vurdering === "avvik" ? "stopp" : "" });
      kartBestemmelse(b);
      break;
    }
    case "konklusjon": {
      const k = h.konklusjon;
      logg(h.ms, k === "samsvar" ? "✅" : k === "avvik" ? "⚠️" : "❔", `Planvurdering: ${STATUSTEKST[k] ?? k}. ${h.oppsummering ?? ""}`, { klasse: k === "samsvar" ? "godkjent" : "stopp" });
      if (!t.stopp) {
        if (k === "samsvar") {
          stempel("ok", "I samsvar med planen", "Vurdering til saksbehandler");
          banner("ok", "I samsvar med reguleringsplanen", h.oppsummering);
        } else if (k === "avvik") {
          stempel("feil", "Avvik fra planen", "Vurdering til saksbehandler");
          banner("feil", "Avvik fra reguleringsplanen", h.oppsummering);
        } else {
          stempel("usikker", "Usikkert", "Saksbehandler må vurdere");
          banner("usikker", "Usikker planvurdering", h.oppsummering);
        }
      }
      break;
    }
    case "ferdig":
      t.ferdig = h;
      ferdig(h);
      break;
    case "disp-runde":
      spillDispensasjonsrunde(h);
      break;
    case "disp-soknad":
      visDispensasjonssteg(h);
      logg(h.ms, "📝", "Søkeren fyller ut søknad om dispensasjon.", { klasse: "steg" });
      break;
    case "disp-varslet":
      visDispensasjonsvarsel(h);
      logg(h.ms, "📨", "Søknaden varsles naboene i simuleringen.", { klasse: "steg" });
      break;
    case "feil":
      logg(t.sisteMs, "💥", `Feil: ${h.melding}`, { klasse: "stopp" });
      banner("feil", "Feil under kjøringen", h.melding);
      break;
  }
}

function steg(h) {
  if (h.tilstand === "start") t.aktivtSteg = h.steg;
  if (h.steg === "form" && h.tilstand === "start") {
    logg(h.ms, "1️⃣", "Steg 1 · Agenten leser søknaden og går gjennom kontrollisten A–E", { klasse: "steg", klikk: visAgent });
  } else if (h.steg === "form" && h.tilstand === "ferdig") {
    t.sak.dokumenter.forEach((d) => document.querySelector(`.dok[data-dok="${d.id}"]`)?.classList.add("lest"));
    stoppTenker();
  } else if (h.steg === "matrikkel" && h.tilstand === "start") {
    logg(h.ms, "2️⃣", "Steg 2 · Kode slår opp eiendommen i matrikkelen og planregisteret", { klasse: "steg" });
  } else if (h.steg === "matrikkel" && h.tilstand === "ferdig") {
    t.eiendom = h.eiendom;
    // Agenten skriver resten av kontrollisten etter at opplysningene er kontrollert.
    t.aktivtSteg = "form";
  } else if (h.steg === "plan" && h.tilstand === "start") {
    t.plan = h.plan;
    t.paragrafer = h.paragrafer;
    const boks = document.querySelector('.gruppe[data-gruppe="P"]');
    boks.querySelector(".punkter").replaceChildren();
    boks.querySelector(".gnavn").textContent = `Planvurdering · ${h.plan.id}`;
    for (const p of h.paragrafer) leggTilPunkt(boks, { id: p.id, tittel: p.tittel, tekst: p.tittel, gruppe: "Planvurdering", paragraf: true, kontrolleresAv: "agent" });
    oppdaterTeller();
    logg(h.ms, "3️⃣", `Steg 3 · Agenten vurderer søknaden mot ${h.plan.id} ${h.plan.navn}`, { klasse: "steg", klikk: visPlan });
    const planKart = t.kartdata.kart.planer[h.plan.id];
    if (t.eiendom) t.kart.byggegrenser(t.eiendom, planKart);
    stempel("venter", "Planvurdering pågår", h.plan.id);
  }
  oppdaterNeste();
}

function hoppOver() {
  for (const [id, rad] of t.punktRad) {
    if (!t.resultat.has(id)) {
      rad.className = "punkt hoppet";
      rad.querySelector(".status").className = "status hoppet";
    }
  }
  oppdaterNeste();
}

function ferdig(h) {
  t.kjorer = false;
  scene.classList.remove("aktiv");
  stoppTenker();
  oppdaterNeste();
  if (t.stopp) hoppOver();
  if (visDispensasjonsmulighet()) {
    if (!$("#dispSoknad").value) fyllDispensasjonsutkast();
    logg(h.ms, "📄", "Planavvik funnet. Velg «Kjør simulering» for å fortsette med dispensasjonssøknad og nabovarsel.", {
      klasse: "steg",
      klikk: () => $("#dispensasjonskort").scrollIntoView({ behavior: "smooth", block: "start" }),
    });
  } else if (t.sak?.sakId === "2026/202") {
    visHildeSimuleringsresultat(h);
  }
  const usd = `${tall(h.kostUsd, 4)} USD`;
  const nok = h.kostNok === null ? "" : ` ≈ ${tall(h.kostNok, 3)} kr`;
  const kost = `${h.ufullstendig ? "minst " : ""}${usd}${nok}`;
  const ut = h.ufullstendig ? "ukjent (avbrutt)" : tall(h.bruk.output_tokens);
  $("#statuslinje").textContent = `${h.modell}${h.effort ? ` · ${oppsettTekst(h.effort, h.oppsett)}` : ""} · ${tall(h.tidSekunder, 1)} s · tokens inn ${tall(h.bruk.input_tokens)}, ut ${ut} · ${kost}`;
  logg(h.ms, "🏁", `Ferdig etter ${tall(h.tidSekunder, 1)} s · ${kost}`, { klasse: "steg", klikk: visAgent });
  oppdaterKnapper();
}

function visHildeSimuleringsresultat(h) {
  const portHendelse = [...t.hendelser].reverse().find((e) => e.type === "port") ?? {};
  const port = { ...portHendelse, ...(h.port ?? {}) };
  const plan = h.planvurdering;
  const tegningsmangler = [...t.resultat.values()].filter((p) =>
    /^[CD]\d+$/.test(p.id) && ["mangler", "uklart", "avvik"].includes(p.status));
  const trengerBedreGrunnlag = port.bestatt === false || tegningsmangler.length > 0;
  const merke = $("#hildeResultatMerke");
  const innhold = $("#hildeResultatDetaljer");

  $("#hildeSimResultat").hidden = false;
  if (trengerBedreGrunnlag) {
    merke.className = "merkelapp uklart";
    merke.textContent = "Be om flere opplysninger";
    $("#hildeResultatTekst").textContent = "Hildes søknad går ikke videre til dispensasjonsvurdering. Simuleringen stopper her fordi søknaden eller tegningsgrunnlaget må kompletteres først.";
    const liste = tegningsmangler.length
      ? tegningsmangler
      : (port.mangelliste ?? []).map((tekst) => ({ id: "", funnet: tekst }));
    const punkter = liste.map((p) => el("li", null, p.id ? `${p.id}: ${p.funnet ?? "må avklares"}` : p.funnet));
    const grunner = port.grunner?.length
      ? el("p", null, port.grunner.join(" "))
      : null;
    innhold.replaceChildren(
      el("h3", null, "Hvorfor stopper simuleringen her?"),
      grunner,
      punkter.length
        ? el("details", null, el("summary", null, `Se hva som mangler eller er uklart (${punkter.length})`), el("ul", null, punkter))
        : null,
      el("p", "hint", "Dette scenarioet viser at tegningene må kompletteres før saken kan gå videre. Det blir ikke sendt nabovarsel eller laget dispensasjonssøknad i dette forløpet."),
    );
    return;
  }

  if (plan?.konklusjon === "avvik") {
    merke.className = "merkelapp avvik";
    merke.textContent = "Planavvik funnet";
    $("#hildeResultatTekst").textContent = plan.oppsummering || "Planvurderingen fant et avvik. Saken må vurderes videre av saksbehandler.";
    innhold.replaceChildren(el("p", "hint", "Dette simuleringsløpet stopper ved planvurderingen. Det oppretter ikke automatisk en dispensasjonssøknad for Hilde."));
  } else if (plan?.konklusjon === "samsvar") {
    merke.className = "merkelapp samsvar";
    merke.textContent = "Planvurdering: samsvar";
    $("#hildeResultatTekst").textContent = plan.oppsummering || "Kontrollen fant ikke planavvik. Saken går videre til ordinær saksbehandling.";
    innhold.replaceChildren(el("p", "hint", "Det er ikke behov for dispensasjon i dette simuleringsløpet."));
  } else {
    merke.className = "merkelapp usikkert";
    merke.textContent = "Krever saksbehandler";
    $("#hildeResultatTekst").textContent = plan?.oppsummering || "Grunnlaget er ikke tilstrekkelig til å konkludere. Saken må vurderes videre av saksbehandler.";
    innhold.replaceChildren(el("p", "hint", "Saksbehandler må avklare saken før et eventuelt dispensasjonsløp."));
  }
}

// Sak 2026/201 demonstrerer at planvurderingen finner et dispensasjonsbehov
// selv om søkeren har krysset av for at dispensasjon ikke trengs.
function visDispensasjonsmulighet() {
  const kort = $("#dispensasjonskort");
  const tilgjengelig = t.sak?.sakId === "2026/201" && Boolean(t.plan) && Boolean(t.ferdig);
  kort.hidden = !tilgjengelig;
  $("#dispScenarioValg").hidden = t.sak?.sakId !== "2026/201";
  return tilgjengelig;
}

function fyllDispensasjonsutkast() {
  const soker = t.sak.visning?.soker;
  $("#dispSoknad").value = [
    "SØKNAD OM DISPENSASJON",
    "Til Hvileskjær kommune",
    `Søker: ${soker?.navn ?? "Knut Solberg"}`,
    `Eiendom: ${soker?.eiendom ?? "12/34"}, ${soker?.adresse ?? "Solbakken 7"}`,
    `Saksnummer: ${t.sak.sakId}`,
    "",
    "Jeg søker om dispensasjon fra reguleringsplan 8888/2019001 § 4 for byggegrensen mot Solbakken.",
    "",
    "Tiltak og avvik (hentet fra søknaden og tegningene)",
    "Tilbygg på 28 m² BYA mot nord, med nytt soverom. DOK-0001 oppgir 4,0 m fra tilbyggets yttervegg til eiendomsgrensen mot Solbakken. Reguleringsplanens byggegrense er 6,0 m fra tomtegrensen. Oppgitt avvik er 2,0 m. Kilder: DOK-0001 og reguleringsplan § 4.",
    "",
    "Søkerens begrunnelse",
    "Syntetisk scenarioopplysning fra søker: Tilbygget skal gi husstanden et nytt soverom. Søker opplyser at en plassering innenfor byggegrensen vil kreve større ombygging av planløsningen. Dette er ikke dokumentert med en alternativ tegning.",
    "",
    "Fordeler ved dispensasjon",
    "Syntetisk scenarioopplysning fra søker: Tiltaket gir et ekstra soverom og gjør det mulig å beholde den ønskede planløsningen. Fordelene er ikke underbygget med alternativ tegning eller annen dokumentasjon i søknaden.",
    "",
    "Ulemper og virkninger",
    "Tilbygget plasseres 2,0 m innenfor byggegrensen mot Solbakken. Mulige virkninger gjelder hensynene bak grensen, blant annet vei, trafikksikkerhet, utsikt og bebyggelsesstruktur. Søknaden dokumenterer ikke konkret omfang for disse virkningene.",
    "",
    "Alternativer som er vurdert",
    "Syntetisk scenarioopplysning fra søker: En plassering innenfor byggegrensen vil kreve større ombygging av planløsningen. Det er ikke lagt ved alternativ tegning, så alternative plasseringer kan ikke kontrolleres mot dokumentasjonen.",
    "",
    "Dokumentgrunnlag",
    "DOK-0001 (søknad), DOK-0002 (situasjonsplan) og reguleringsplan 8888/2019001 § 4. DOK-0006 oppgir at det ikke ble søkt om dispensasjon i det opprinnelige nabovarselet. Dette er derfor en egen, simulert søknad og krever nytt nabovarsel i øvingsforløpet. Søkeropplysningene merket «syntetisk scenarioopplysning» er laget for simuleringen, ikke hentet fra dokumentene.",
  ].join("\n");
  $("#dispStart").hidden = true;
}

const DISP_NABOSVAR = {
  flere: "Flere naboer har sendt merknader: én nabo er bekymret for trafikk og sikt, og en annen for utsyn og områdets karakter.",
  en: "Én nabo har sendt merknad og er bekymret for plasseringen nær veien og virkningen på utsyn og områdets karakter.",
  ingen: "Ingen naboer har sendt merknader innen fristen.",
};

function nabosvarTekst(svar = $("#dispNabosvar").value, merknad = $("#dispMerknad").value.trim()) {
  if (svar === "flere") return DISP_NABOSVAR.flere;
  if (svar === "en") return `Én nabo har sendt merknad: ${merknad || DISP_NABOSVAR.en}`;
  return DISP_NABOSVAR.ingen;
}

function lagUtvidbarTekst(tekst, visTekst, skjulTekst) {
  const visning = el("pre", "disp-varseltekst begrenset", tekst);
  const ramme = el("div", "disp-varseltekst-ramme", visning);
  if (tekst.length > 180) {
    const knapp = el("button", { type: "button", class: "disp-tekst-toggle", "aria-expanded": "false" }, visTekst);
    knapp.addEventListener("click", () => {
      const utvidet = visning.classList.toggle("utvidet");
      visning.classList.toggle("begrenset", !utvidet);
      knapp.setAttribute("aria-expanded", String(utvidet));
      knapp.textContent = utvidet ? skjulTekst : visTekst;
    });
    ramme.append(knapp);
  }
  return ramme;
}

function lagSoknadOgNabovarsel(soknad, nabovarsel) {
  let varseltekst = String(nabovarsel ?? "");
  if (soknad) varseltekst = varseltekst.replace(soknad, "");
  varseltekst = varseltekst.replace(/\n\nSimulert svar etter fristen:[\s\S]*$/, "").trim();
  const start = varseltekst.indexOf("Varslet gjelder ");
  if (start >= 0) varseltekst = varseltekst.slice(start);

  return [
    el("h4", "disp-dokumenttittel", "Dispensasjonssøknad fra Knut"),
    el("p", "hint", "Søknaden som vurderes i dispensasjonsløpet."),
    lagUtvidbarTekst(soknad, "Vis hele dispensasjonssøknaden", "Skjul dispensasjonssøknaden"),
    el("h4", "disp-dokumenttittel", "Nabovarseltekst"),
    el("p", "hint", "Meldingen som ble sendt til naboene i simuleringen."),
    lagUtvidbarTekst(varseltekst, "Vis hele nabovarselteksten", "Skjul nabovarselteksten"),
  ];
}

function sendSimulertNabovarsel() {
  const svar = $("#dispNabosvar").value;
  $("#dispMerknadFelt").hidden = svar !== "en";
  const mottakere = t.sak.visning?.nabovarsel?.mottakere ?? [];
  const navn = mottakere.map((m) => `${m.navn} (${m.eiendom})`).join(", ") || "Naboer og gjenboere";
  $("#dispVarselInfo").replaceChildren(
    el("p", null, `Simulert sendt 27.10.2026 til ${mottakere.length} naboer/gjenboere: ${navn}.`),
    el("p", null, "Simuleringen lar merknadsfristen på to uker gå. Fristen er ute 10.11.2026."),
    ...lagSoknadOgNabovarsel($("#dispSoknad").value, lagNabovarselgrunnlag()),
    el("p", null, "Simulert nabosvar: " + nabosvarTekst(svar)),
    el("p", null, "Ingen faktisk melding er sendt."),
  );
  $("#dispFaseVarsel").hidden = false;
  $("#dispFaseVarsel").scrollIntoView({ behavior: "smooth", block: "center" });
}

const DISP_STATUS = {
  ikke_vesentlig_tilsidesatt: "Ikke vesentlig tilsidesatt",
  vesentlig_tilsidesatt: "Vesentlig tilsidesatt",
  klart_storre: "Klart større",
  ikke_klart_storre: "Ikke klart større",
  usikkert: "Usikkert",
  kan_vurderes: "Kan vurderes videre",
  bør_ikke_gis: "Bør ikke gis",
  ikke_grunnlag: "Ikke nok grunnlag",
  anbefal_innvilgelse: "Anbefal innvilgelse",
  anbefal_avslag: "Anbefal avslag",
  be_om_mer: "Be om mer",
};

function visDispensasjonsvurdering(data, nabo = {}) {
  const v = data.vurdering;
  t.dispMangler = v.mangler;
  const anbefaling = {
    anbefal_innvilgelse: "AI-anbefaling: innvilg dispensasjonen",
    anbefal_avslag: "AI-anbefaling: avslå dispensasjonen",
    be_om_mer: "AI-anbefaling: be om flere opplysninger",
  }[v.anbefaling] ?? "AI-anbefaling";
  $("#dispAnbefaling").textContent = anbefaling;
  $("#dispBegrunnelseResultat").textContent = v.begrunnelse;
  $("#dispKriterier").replaceChildren(
    el("div", "disp-kriterium", el("strong", null, "Hensyn bak bestemmelsen"), el("span", null, DISP_STATUS[v.hensyn] ?? v.hensyn)),
    el("div", "disp-kriterium", el("strong", null, "Fordeler mot ulemper"), el("span", null, DISP_STATUS[v.fordelerUlemper] ?? v.fordelerUlemper)),
    el("div", "disp-kriterium", el("strong", null, "Kommunens skjønn"), el("span", null, DISP_STATUS[v.kommunaltSkjonn] ?? v.kommunaltSkjonn)),
  );
  const mangler = $("#dispMangler");
  mangler.replaceChildren(v.mangler.length
    ? el("div", "disp-sjekk", el("strong", null, "Dette bør avklares"), el("ul", null, v.mangler.map((m) => el("li", null, m))))
    : el("p", "hint", "AI-en fant ingen konkrete mangler i det innsendte grunnlaget."));
  const trengerMer = v.anbefaling === "be_om_mer";
  $("#dispTilleggssteg").hidden = !trengerMer;
  if (!trengerMer) $("#dispTilleggFase").hidden = true;
  $("#dispVurdering").hidden = false;
  visSimuleringsresultat(v, nabo);
  $("#dispVurdering").scrollIntoView({ behavior: "smooth", block: "start" });
}

function visSimuleringsresultat(v, nabo = {}) {
  const anbefalinger = {
    anbefal_innvilgelse: { tittel: "Anbefaling: Innvilg dispensasjonen", status: "oppfylt", neste: "AI-en anbefaler å innvilge dispensasjonen. Dette er anbefalingen i simuleringen, ikke et vedtak." },
    anbefal_avslag: { tittel: "Anbefaling: Avslå dispensasjonen", status: "mangler", neste: "AI-en anbefaler avslag. Dette er anbefalingen i simuleringen, ikke et vedtak." },
    be_om_mer: { tittel: "Anbefaling: Be om flere opplysninger", status: "uklart", neste: "Simuleringen avventer flere opplysninger før søknaden kan vurderes på nytt." },
  };
  const utfall = anbefalinger[v.anbefaling] ?? { tittel: "Anbefaling: Usikkert utfall", status: "uklart", neste: "AI-en kunne ikke gi en tydelig anbefaling på grunnlaget i simuleringen." };
  const planHendelse = [...t.hendelser].reverse().find((h) => h.type === "konklusjon");
  const nabosvar = nabo.nabosvar ?? $("#dispNabosvar").value;
  const nabomerknad = nabo.nabomerknad ?? $("#dispMerknad").value;
  const naboTekst = nabosvarTekst(nabosvar, nabomerknad);
  const detaljer = $("#simResultatDetaljer");
  const rad = (navn, verdi) => [el("dt", null, navn), el("dd", null, verdi)];

  $("#simResultatMerke").className = `merkelapp ${utfall.status}`;
  $("#simResultatMerke").textContent = utfall.tittel.replace("Anbefaling: ", "");
  $("#simResultatStatus").textContent = utfall.neste;
  detaljer.replaceChildren(...[
    ...rad("Byggesakskontroll", planHendelse
      ? `${statusTekst(planHendelse.konklusjon)}. ${planHendelse.oppsummering ?? ""}`
      : "Planvurderingen finnes i gjennomgangen ovenfor."),
    ...rad("Nabosvar", naboTekst),
    ...rad("Hvorfor AI-en anbefaler dette", v.begrunnelse || "Ingen begrunnelse ble returnert."),
  ]);

  const mangler = $("#simResultatMangler");
  mangler.replaceChildren(v.mangler?.length
    ? el("div", "sim-resultat-mangler", el("strong", null, "Dette gjenstår"), el("ul", null, v.mangler.map((punkt) => el("li", null, punkt))))
    : el("p", "hint", "Ingen flere opplysninger ble etterspurt i denne vurderingen."));

  const dokumenter = dokKnapper(["DOK-0001", "DOK-0002", "DOK-0006"]);
  $("#simResultatDokumenter").replaceChildren(...(dokumenter ? [...dokumenter.childNodes] : []));
  $("#simuleringsresultat").hidden = false;
}

function visDispensasjonssteg(h) {
  $("#dispensasjonskort").hidden = false;
  $("#dispStart").hidden = true;
  $("#kjorDispVurdering").hidden = true;
  $("#dispSoknad").value = h.soknad;
  $("#dispNabosvar").value = ["flere", "en", "ingen"].includes(h.nabosvar) ? h.nabosvar : h.nabosvar === "merknad" ? "en" : "ingen";
  $("#dispMerknadFelt").hidden = $("#dispNabosvar").value !== "en";
  if (typeof h.nabomerknad === "string") $("#dispMerknad").value = h.nabomerknad;
  $("#dispFaseVarsel").hidden = true;
  $("#dispVurdering").hidden = true;
  if (h.tilleggsopplysninger) {
    $("#dispTilleggFase").hidden = false;
    $("#dispTillegg").value = h.tilleggsopplysninger;
  }
}

function visDispensasjonsvarsel(h) {
  visDispensasjonssteg(h);
  const mottakere = t.sak.visning?.nabovarsel?.mottakere ?? [];
  const navn = mottakere.map((m) => `${m.navn} (${m.eiendom})`).join(", ") || "Naboer og gjenboere";
  const dato = h.oppdatertNabovarsel ? "11.11.2026" : "27.10.2026";
  const frist = h.oppdatertNabovarsel ? "25.11.2026" : "10.11.2026";
  $("#dispVarselInfo").replaceChildren(
    el("p", null, `Simulert ${h.oppdatertNabovarsel ? "nytt " : ""}nabovarsel ${dato} til ${mottakere.length} naboer/gjenboere: ${navn}. Fristen gikk ut ${frist}.`),
    ...lagSoknadOgNabovarsel(h.soknad, h.nabovarsel),
    el("p", null, "Avspilling fra opptak. Ingen faktisk melding er sendt."),
  );
  $("#dispFaseVarsel").hidden = false;
}

function spillDispensasjonsrunde(h) {
  visDispensasjonsvarsel(h);
  visDispensasjonsvurdering({ vurdering: h.vurdering }, h);
  $("#kjorDispVurdering").hidden = false;
  logg(h.ms, "⚖️", `Opptak · dispensasjonskontroll · ${$("#dispAnbefaling").textContent}`, { klasse: "steg" });
}

$("#dispNabosvar").addEventListener("change", () => {
  $("#dispMerknadFelt").hidden = $("#dispNabosvar").value !== "en";
});
function lagNabovarselgrunnlag({ oppdatert = false, vedlegg = [], tilleggsopplysninger = "" } = {}) {
  const mottakere = t.sak.visning?.nabovarsel?.mottakere ?? [];
  const navn = mottakere.map((m) => `${m.navn} (${m.eiendom})`).join(", ") || "Naboer og gjenboere";
  const utfall = nabosvarTekst();
  const sendt = oppdatert ? "11.11.2026" : "27.10.2026";
  const frist = oppdatert ? "25.11.2026" : "10.11.2026";
  const vedleggstekst = vedlegg.length ? vedlegg.map((v) => v.name).join(", ") : "DOK-0001 og DOK-0002";
  return `Simulert ${oppdatert ? "oppdatert " : ""}nabovarsel sendt ${sendt} til ${mottakere.length} naboer/gjenboere: ${navn}. Merknadsfrist to uker, utløp ${frist}. Varslet gjelder dispensasjon fra byggegrensen og bygger på søknadsteksten og dokumentene nedenfor.\n\n${$("#dispSoknad").value}${oppdatert && tilleggsopplysninger ? `\n\nTilleggsopplysninger fra søker:\n${tilleggsopplysninger}` : ""}\n\nVedlagte tegninger/dokumenter: ${vedleggstekst}.\n\nSimulert svar etter fristen: ${utfall} Ingen faktisk melding er sendt.`;
}

async function vurderDispensasjon({ knapp, tilleggsopplysninger = "", vedlegg = [], oppdatertNabovarsel = false }) {
  knapp.disabled = true;
  knapp.textContent = "AI-en vurderer dispensasjonen …";
  $("#dispVurdering").hidden = true;
  $("#simuleringsresultat").hidden = true;
  try {
    const svar = await fetch(`/api/vurder-dispensasjon?sak=${encodeURIComponent(velg.value)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soknad: $("#dispSoknad").value, nabovarsel: lagNabovarselgrunnlag({ oppdatert: oppdatertNabovarsel, vedlegg, tilleggsopplysninger }), tilleggsopplysninger, vedlegg, avklaringer: oppdatertNabovarsel ? (t.dispMangler ?? []) : [] }),
    });
    const data = await svar.json();
    if (!svar.ok) throw new Error(data.feil ?? "Kunne ikke vurdere dispensasjonssøknaden.");
    visDispensasjonsvurdering(data);
    $("#kjorDispVurdering").hidden = false;
    const opptakParametre = new URLSearchParams({
      sak: velg.value,
      stopp: t.stoppVedFeil ? "1" : "0",
      effort: t.effort ?? effortVelg.value,
      kjoring: kjoringAv(t.oppsett) ?? kjoringVelg.value,
    });
    const lagring = await fetch(`/api/opptak/dispensasjonsrunde?${opptakParametre}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        soknad: $("#dispSoknad").value,
        nabovarsel: lagNabovarselgrunnlag({ oppdatert: oppdatertNabovarsel, vedlegg, tilleggsopplysninger }),
        nabosvar: $("#dispNabosvar").value,
        nabomerknad: $("#dispMerknad").value,
        tilleggsopplysninger,
        oppdatertNabovarsel,
        vurdering: data.vurdering,
      }),
    });
    if (!lagring.ok) console.warn("Dispensasjonsrunden ble ikke lagt til i opptaket:", (await lagring.json()).feil);
    else {
      const lagret = await lagring.json();
      if (Array.isArray(lagret.hendelser)) {
        t.hendelser.push(...lagret.hendelser);
        t.sisteMs = Math.max(t.sisteMs, ...lagret.hendelser.map((h) => Number(h.ms) || 0));
      }
    }
    logg(t.sisteMs, "⚖️", `Dispensasjonskontroll ferdig · ${$("#dispAnbefaling").textContent}`, { klasse: "steg" });
  } catch (feil) {
    $("#kjorDispVurdering").hidden = false;
    $("#dispVurdering").hidden = false;
    $("#dispAnbefaling").textContent = "Kunne ikke vurdere søknaden";
    $("#dispBegrunnelseResultat").textContent = feil.message;
  } finally {
    knapp.disabled = false;
    knapp.textContent = knapp.id === "sendDispTillegg" ? "Simuler nytt nabovarsel og vurder på nytt" : "Kjør dispensasjonskontroll på nytt";
  }
}

async function startAutomatiskDispensasjonslop() {
  if (t.sak?.sakId !== "2026/201" || !visDispensasjonsmulighet()) return;
  logg(t.sisteMs, "📄", "Knut søker dispensasjon etter at planavviket er funnet.", { klasse: "steg" });
  if (!$("#dispSoknad").value) fyllDispensasjonsutkast();
  sendSimulertNabovarsel();
  logg(t.sisteMs, "📨", "Dispensasjonssøknaden er sendt på simulert nabovarsel.", { klasse: "steg" });
  await vurderDispensasjon({ knapp: $("#kjorDispVurdering") });
}

$("#kjorDispVurdering").addEventListener("click", () => vurderDispensasjon({ knapp: $("#kjorDispVurdering") }));
$("#visDispTillegg").addEventListener("click", () => {
  $("#dispTilleggFase").hidden = false;
  $("#dispTillegg").focus();
  $("#dispTilleggFase").scrollIntoView({ behavior: "smooth", block: "center" });
});

function visDispVedlegg() {
  const filer = [...$("#dispVedlegg").files];
  const ugyldig = filer.length > 5 || filer.reduce((sum, f) => sum + f.size, 0) > 22 * 1024 * 1024 || filer.some((f) => !f.size || f.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(f.type));
  $("#dispVedleggListe").textContent = ugyldig
    ? "Velg maks 5 PNG-, JPG-, WebP- eller PDF-filer på opptil 5 MB hver og 22 MB samlet."
    : filer.length ? `Valgte filer: ${filer.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`).join(", ")}` : "Ingen filer valgt.";
  $("#sendDispTillegg").disabled = ugyldig;
}

$("#dispVedlegg").addEventListener("change", visDispVedlegg);
async function vedleggSomData(filer) {
  return Promise.all(filer.map(async (fil) => {
    const bytes = new Uint8Array(await fil.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name: fil.name, media_type: fil.type, data: btoa(bin) };
  }));
}

$("#sendDispTillegg").addEventListener("click", async () => {
  const filer = [...$("#dispVedlegg").files];
  const tekst = $("#dispTillegg").value.trim();
  if (!tekst && !filer.length) {
    $("#dispVedleggListe").textContent = "Skriv inn opplysninger eller legg ved minst én tegning før vurderingen kjøres.";
    return;
  }
  try {
    const vedlegg = await vedleggSomData(filer);
    const mottakere = t.sak.visning?.nabovarsel?.mottakere ?? [];
    const mottakernavn = mottakere.map((m) => `${m.navn} (${m.eiendom})`).join(", ") || "naboer/gjenboere i saken";
    $("#dispVarselInfo").replaceChildren(
      el("p", null, `Simulert nytt nabovarsel 11.11.2026 til ${mottakere.length} naboer/gjenboere: ${mottakernavn}. Fristen settes til 25.11.2026.`),
      el("p", null, `Utkast til varsel bygger på søknaden, tilleggsopplysningene og ${filer.length ? `tegningene ${filer.map((f) => f.name).join(", ")}` : "de opprinnelige tegningene DOK-0001 og DOK-0002"}.`),
      ...lagSoknadOgNabovarsel($("#dispSoknad").value, lagNabovarselgrunnlag({ oppdatert: true, vedlegg, tilleggsopplysninger: tekst })),
      el("p", null, "Simulert nabosvar: " + nabosvarTekst()),
      el("p", null, "Dette er bare en simulering. Ingen faktisk melding er sendt."),
    );
    vurderDispensasjon({ knapp: $("#sendDispTillegg"), tilleggsopplysninger: tekst, vedlegg, oppdatertNabovarsel: true });
  } catch (feil) {
    $("#dispVedleggListe").textContent = `Kunne ikke lese vedleggene: ${feil.message}`;
  }
});

// ---------------------------------------------------------------------------
// Validering mot fasiten. Fasiten ligger på serveren og hentes først når brukeren trykker på knappen.

const VURDERING = {
  riktig: { ikon: "✓", tekst: "Stemmer med fasiten" },
  godtatt: { ikon: "≈", tekst: "Godtatt avvik fra fasiten" },
  feil: { ikon: "✕", tekst: "Feil mot fasiten" },
  ikke_nadd: { ikon: "·", tekst: "Ikke nådd" },
};
const UTFALL = {
  fanget: ["ok", "✓ Fanget"],
  delvis: ["usikker", "◐ Delvis"],
  oversett: ["feil", "✕ Oversett"],
  ikke_nadd: ["hoppet", "· Ikke nådd"],
  unngatt: ["ok", "✓ Unngått"],
  gikk_i: ["feil", "✕ Gikk i fella"],
};
const TYPE = { oversett: "oversett", falsk_feil: "falsk feil", usikker: "usikker", annet: "annen status", utelatt: "ikke vurdert" };
const RESULTAT = {
  bestatt: ["ok", "Bestått"],
  bestatt_med_merknader: ["usikker", "Bestått med merknader"],
  ikke_bestatt: ["feil", "Ikke bestått"],
};

async function validerKjoring() {
  validerKnapp.disabled = true;
  validerKnapp.textContent = "Validerer …";
  try {
    const params = new URLSearchParams({
      sak: velg.value,
      effort: effortVelg.value,
      kjoring: kjoringVelg.value,
      stopp: stoppBryter.checked ? "1" : "0",
    });
    const svar = await fetch(`/api/valider?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hendelser: t.hendelser }),
    });
    const data = await svar.json();
    if (!svar.ok) throw new Error(data.feil);
    t.validering = data;
    visValidering(data);
    const [klasse, tittel] = RESULTAT[data.resultat];
    logg(t.sisteMs, klasse === "ok" ? "🎯" : klasse === "feil" ? "❌" : "⚠️", `Validering mot fasit (${data.effort ? oppsettTekst(data.effort, data.oppsett) : "effort ukjent"}): ${tittel}. ${data.oppsummering}`, {
      klasse: klasse === "ok" ? "godkjent" : klasse === "feil" ? "stopp" : "steg",
      klikk: () => $("#valideringskort").scrollIntoView({ behavior: "smooth", block: "start" }),
    });
  } catch (feil) {
    $("#valideringskort").hidden = false;
    $("#validering").replaceChildren(el("div", "banner feil", el("strong", null, "Kunne ikke validere"), feil.message));
  } finally {
    validerKnapp.textContent = "✓ Valider mot fasit";
    oppdaterKnapper();
  }
}

function utfallMerke(utfall) {
  const [klasse, tekst] = UTFALL[utfall];
  return el("span", `merkelapp ${klasse === "ok" ? "oppfylt" : klasse === "feil" ? "mangler" : klasse === "usikker" ? "uklart" : "hoppet"}`, tekst);
}

function statusTekst(s) {
  return s === null || s === undefined ? "–" : STATUSTEKST[s] ?? s;
}

function visValidering(v) {
  const [klasse, tittel] = RESULTAT[v.resultat];
  const flis = (tall, tekst, status) => el("div", `vflis ${status ?? ""}`, el("strong", null, tall), el("span", null, tekst));
  const ja = (riktig) => (riktig ? "ok" : "feil");
  const liste = (tittel, linjer, klasse) => linjer.length
    ? el("div", `vliste ${klasse}`, el("h4", null, tittel), el("ul", null, linjer.map((l) => el("li", null, l))))
    : null;

  const fliser = el("div", "vfliser",
    flis(`${v.tall.riktig + v.tall.godtatt}/${v.tall.vurdert}`, "punkter stemmer", v.tall.feil ? "usikker" : "ok"),
    flis(`${v.tall.funnFanget}/${v.tall.funn - v.tall.funnIkkeNadd}`, `funn fanget${v.tall.funnIkkeNadd ? ` · ${v.tall.funnIkkeNadd} ikke nådd` : ""}`,
      v.funn.some((f) => f.utfall === "oversett" || f.utfall === "delvis") ? "feil" : "ok"),
    flis(v.kategori.faktisk ?? "–", `kategori · fasit ${v.kategori.forventet}`, ja(v.kategori.riktig)),
    flis(v.port.faktisk === null ? "–" : v.port.faktisk ? "Bestått" : "Stoppet", `porten · fasit ${v.port.forventet ? "bestått" : "stoppet"}`, ja(v.port.riktig)),
    v.plan?.konklusjon
      ? flis(statusTekst(v.plan.konklusjon.faktisk), `planvurdering · fasit ${statusTekst(v.plan.konklusjon.forventet).toLowerCase()}`, v.plan.konklusjon.faktisk ? ja(v.plan.konklusjon.riktig) : "")
      : null,
    v.dispensasjon
      ? flis(`${v.dispensasjon.tall.riktig}/${v.dispensasjon.tall.vurdert}`, `dispensasjon · ${v.dispensasjon.scenarioTekst.toLowerCase()}`, v.dispensasjon.resultat === "bestatt" ? "ok" : "feil")
      : null,
    v.stopp ? flis(v.stopp.id, v.stopp.legitimt ? "stoppet riktig" : "stoppet feil", ja(v.stopp.legitimt)) : null,
  );

  const funn = el("div", "vfunn", v.funn.map((f) => el("div", "vfunnrad",
    utfallMerke(f.utfall),
    el("div", null,
      el("div", null, el("strong", null, `${f.id} `), f.kritisk ? el("span", "kritisk", "kritisk") : null, " ", f.tekst),
      el("div", "undertekst", f.detalj),
    ),
  )));

  const feller = v.feller.length ? el("div", "vfunn", v.feller.map((f) => el("div", "vfunnrad",
    utfallMerke(f.utfall), el("div", null, el("strong", null, `${f.id} `), f.tekst)))) : null;

  const avvikende = v.punkter.filter((p) => p.vurdering === "feil" || p.vurdering === "godtatt");
  const punktTabell = (rader) => el("table", "vtabell",
    el("tr", null, el("th", null, ""), el("th", null, "Punkt"), el("th", null, "Fasit"), el("th", null, "Kjøringen"), el("th", null, "Vurdering")),
    rader.map((p) => el("tr", { class: `${p.vurdering} ${p.alvor ?? ""}`, on: { click: () => t.punktDef.has(p.id) && visPunkt(p.id) } },
      el("td", null, el("span", `fasitmerke ${p.vurdering} ${p.alvor ?? ""}`, VURDERING[p.vurdering].ikon)),
      el("td", null, el("strong", null, p.id), p.kritisk ? el("span", "kritisk", "kritisk") : null),
      el("td", null, statusTekst(p.forventet), p.godtatt.length ? el("span", "undertekst", ` (godtar ${p.godtatt.map(statusTekst).join(", ").toLowerCase()})`) : null),
      el("td", null, statusTekst(p.faktisk)),
      el("td", null, p.vurdering === "feil" ? `${p.alvor === "alvorlig" ? "Alvorlig" : "Mindre"}: ${TYPE[p.type]}` : VURDERING[p.vurdering].tekst),
    )));

  const opplysninger = el("table", "vtabell",
    el("tr", null, el("th", null, ""), el("th", null, "Felt"), el("th", null, "Fasit"), el("th", null, "Agenten leste")),
    v.opplysninger.map((o) => el("tr", { class: o.riktig ? "riktig" : "feil" },
      el("td", null, el("span", `fasitmerke ${o.riktig ? "riktig" : "feil"}`, o.riktig ? "✓" : "✕")),
      el("td", null, o.felt), el("td", null, o.forventet), el("td", null, o.faktisk ?? "–"))));

  $("#validering").replaceChildren(
    el("div", `banner ${klasse}`, el("strong", null, `${tittel} · sak ${v.sakId} · ${v.effort ? oppsettTekst(v.effort, v.oppsett) : "effort ukjent"} · ${v.modus === "stopp" ? "stopp ved første feil" : "hele kontrollen"}`), v.oppsummering),
    fliser,
    el("div", "vkolonner",
      el("div", null,
        liste("Alvorlige feil", v.alvorlige, "feil"),
        liste("Merknader", v.mindre, "usikker"),
        !v.alvorlige.length && !v.mindre.length ? el("p", "hint", "Ingen avvik fra fasiten i den delen som ble kjørt.") : null,
        el("h4", null, "Funn agenten skulle fått med seg"),
        funn,
        feller ? el("h4", null, "Feller agenten ikke skulle gå i") : null,
        feller,
      ),
      v.dispensasjon
        ? lagDispensasjonsfasit(v.dispensasjon)
        : el("div", null,
          el("h4", null, "Fasiten for saken"),
          el("p", null, v.sammendrag),
          v.merknader.length ? el("ul", "vmerknader", v.merknader.map((m) => el("li", null, m))) : null,
          avvikende.length ? el("div", null, el("h4", null, "Punkter som avviker fra fasiten"), punktTabell(avvikende)) : null,
        ),
    ),
    el("details", "raa", el("summary", null, `Alle ${v.punkter.length} punkter mot fasiten`), punktTabell(v.punkter)),
    el("details", "raa", el("summary", null, "Eiendomsopplysningene mot fasiten"), opplysninger),
  );
  $("#valideringskort").hidden = false;
  merkGjennomgang(v);
  $("#valideringskort").scrollIntoView({ behavior: "smooth", block: "start" });
}

function lagDispensasjonsfasit(v) {
  const status = (verdi) => DISP_STATUS[verdi] ?? verdi ?? "Ikke returnert";
  const punkter = v.punkter.map((punkt) => {
    const farge = punkt.riktig ? "ok" : punkt.id === "kommunaltSkjonn" ? "usikker" : "feil";
    return el("div", `vflis ${farge}`,
      el("strong", null, status(punkt.faktisk)),
      el("span", null, `${punkt.navn} · fasit ${status(punkt.forventet)}`),
    );
  });
  return el("div", "disp-fasit-inline",
    el("h4", null, "Fasiten for dispensasjon"),
    el("p", "disp-fasit-sammendrag", `${v.oppsummering} Scenario: ${v.scenarioTekst}.`),
    el("p", "hint", v.sammendrag),
    el("div", "vfliser", punkter),
  );
}

// Setter et lite merke på hver rad i gjennomgangen: stemmer punktet med fasiten?
function merkGjennomgang(v) {
  for (const p of v.punkter) {
    const rad = t.punktRad.get(p.id);
    if (!rad) continue;
    rad.querySelector(".fasitmerke")?.remove();
    rad.append(el("span", {
      class: `fasitmerke ${p.vurdering} ${p.alvor ?? ""}`,
      title: `${VURDERING[p.vurdering].tekst}. Fasit: ${statusTekst(p.forventet)}.`,
    }, VURDERING[p.vurdering].ikon));
  }
}

function fasitDel(id) {
  const p = t.validering?.punkter.find((x) => x.id === id);
  if (!p) return null;
  return el("div", "fasitdel",
    el("h4", null, "Fasit"),
    el("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap" },
      merkelapp(p.forventet),
      p.godtatt.length ? el("span", "undertekst", `Godtar også: ${p.godtatt.map(statusTekst).join(", ").toLowerCase()}`) : null,
      el("span", `fasitmerke ${p.vurdering} ${p.alvor ?? ""}`, VURDERING[p.vurdering].ikon),
      el("span", null, p.vurdering === "feil" ? `${p.alvor === "alvorlig" ? "Alvorlig" : "Mindre"} feil: ${TYPE[p.type]}` : VURDERING[p.vurdering].tekst),
    ),
    el("p", null, p.begrunnelse),
  );
}

// ---------------------------------------------------------------------------
// Kjøring

function nullstillKjoring() {
  t.avbryt?.abort();
  t.resultat.clear();
  t.stopp = null;
  t.ferdig = null;
  t.opplysninger = null;
  t.kategori = null;
  t.begrunnelse = null;
  t.eiendom = null;
  t.plan = null;
  t.adresseEiendom = null;
  t.mAvvik = [];
  t.tanker = { form: "", plan: "" };
  t.tankeLogg = {};
  t.aktivtPunkt = null;
  t.skrift = {};
  t.skriftFelt = {};
  t.vist = {};
  t.vurdererStart = {};
  t.aktivtSteg = null;
  t.effort = null;
  t.oppsett = null;
  t.hendelser = [];
  t.validering = null;
  t.dispMangler = [];
  $("#valideringskort").hidden = true;
  $("#validering").replaceChildren();
  $("#dispensasjonskort").hidden = true;
  $("#dispScenarioValg").hidden = true;
  $("#hildeSimResultat").hidden = true;
  $("#dispStart").hidden = false;
  $("#kjorDispVurdering").hidden = false;
  $("#dispFaseVarsel").hidden = true;
  $("#dispVurdering").hidden = true;
  $("#simuleringsresultat").hidden = true;
  $("#dispTilleggssteg").hidden = true;
  $("#dispTilleggFase").hidden = true;
  $("#dispTillegg").value = "";
  $("#dispVedlegg").value = "";
  $("#dispVedleggListe").textContent = "";
  $("#sendDispTillegg").disabled = false;
  $("#dispSoknad").value = "";
  $("#dispNabosvar").value = "flere";
  $("#dispMerknad").value = "Naboen mener plasseringen nær veien vil påvirke utsyn og områdets karakter.";
  $("#dispMerknadFelt").hidden = true;
  $("#logg").replaceChildren();
  $("#banner").replaceChildren();
  $("#statuslinje").textContent = "";
  byggGjennomgang();
  tegnScene();
  settOppKart();
  tegnOpplysninger();
}

// Hendelsene vises i rekkefølge, og hvert ferdige punkt får stå litt før neste vises, slik at
// gjennomgangen kan følges ett punkt om gangen. Det som kommer i mellomtiden, venter i køen.
// Ligger visningen mange punkter etter modellen, går den fortere til den tar igjen.
const PAUSE_MS = 350;
const MIN_PUNKT_MS = 1200;
let ko = [];
const tempo = () => t.fart * Math.max(1, ko.filter((h) => h.type === "punkt" || h.type === "bestemmelse").length / 3);
let tommer = null;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

function leggIKo(h) {
  ko.push(h);
  tommer ??= tomKo();
}

async function tomKo() {
  // Vent ett mikrosteg, slik at `tommer` er satt før køen tømmes og nullstilles.
  await null;
  while (ko.length) {
    const h = ko.shift();
    if (h.type === "punkt" || h.type === "bestemmelse") await ferdigSkrevet((h.punkt ?? h.bestemmelse).id);
    behandle(h);
    if ((h.type === "punkt" || h.type === "bestemmelse") && !document.hidden) await pause(PAUSE_MS / tempo());
  }
  tommer = null;
}

async function kjor(url, init, fart = 1, { simulerDispensasjon = false } = {}) {
  const valgtNabosvar = $("#dispNabosvar").value;
  nullstillKjoring();
  $("#dispNabosvar").value = valgtNabosvar;
  $("#dispMerknadFelt").hidden = valgtNabosvar !== "en";
  ko = [];
  t.fart = fart;
  t.kjorer = true;
  t.avbryt = new AbortController();
  scene.classList.add("aktiv");
  stempel("venter", "Kontroll pågår …");
  oppdaterKnapper();
  tegnOpplysninger();
  try {
    const svar = await fetch(url, { ...init, signal: t.avbryt.signal });
    if (!svar.ok) throw new Error((await svar.json()).feil);
    const leser = svar.body.pipeThrough(new TextDecoderStream()).getReader();
    let rest = "";
    for (;;) {
      const { value, done } = await leser.read();
      if (done) break;
      rest += value;
      let i;
      while ((i = rest.indexOf("\n")) >= 0) {
        const linje = rest.slice(0, i);
        rest = rest.slice(i + 1);
        if (linje.trim()) leggIKo(JSON.parse(linje));
      }
    }
    await tommer;
    if (simulerDispensasjon && url.startsWith("/api/vurder?") && t.sak?.sakId === "2026/201") {
      t.kjorer = true;
      oppdaterKnapper();
      await startAutomatiskDispensasjonslop();
    }
  } catch (feil) {
    ko = [];
    if (feil.name !== "AbortError") {
      logg(t.sisteMs, "💥", `Feil: ${feil.message}`, { klasse: "stopp" });
      banner("feil", "Kunne ikke kjøre kontrollen", feil.message);
      stempel("venter", "Ingen kontroll");
    } else {
      logg(t.sisteMs, "■", "Avbrutt av brukeren.", { klasse: "steg" });
      stempel("venter", "Avbrutt");
    }
  } finally {
    t.kjorer = false;
    scene.classList.remove("aktiv");
    stoppTenker();
    oppdaterNeste();
    await oppdaterOpptak();
  }
}

function oppdaterKnapper() {
  const harSimulering = ["2026/201", "2026/202"].includes(t.sak?.sakId);
  $("#dispScenarioValg").hidden = t.sak?.sakId !== "2026/201";
  kjorKnapp.hidden = harSimulering;
  simulerKnapp.hidden = !harSimulering;
  kjorKnapp.textContent = t.kjorer ? "■ Avbryt" : "▶ Kjør kontroll";
  kjorKnapp.classList.toggle("sekundar", t.kjorer);
  kjorKnapp.classList.toggle("hoved", !t.kjorer);
  simulerKnapp.disabled = t.kjorer;
  velg.disabled = t.kjorer;
  stoppBryter.disabled = t.kjorer;
  effortVelg.disabled = t.kjorer;
  kjoringVelg.disabled = t.kjorer;
  const finnes = t.sak?.opptak?.[`${effortVelg.value}-${kjoringVelg.value}-${stoppBryter.checked ? "stopp" : "hele"}`];
  spillKnapp.disabled = t.kjorer || !finnes;
  validerKnapp.disabled = t.kjorer || !t.ferdig;
  validerKnapp.title = t.ferdig
    ? "Sammenlign kjøringen med fasiten for saken"
    : "Tilgjengelig når kontrollen er ferdig";
  spillKnapp.title = finnes
    ? "Spill av forrige kjøring av denne saken uten å kalle modellen"
    : `Ingen tidligere kjøring med effort ${effortVelg.value}, ${KJORINGSTEKST[kjoringVelg.value]} og denne innstillingen ennå`;
}

async function oppdaterOpptak() {
  const sak = await (await fetch(`/api/sak?sak=${encodeURIComponent(velg.value)}`)).json();
  if (t.sak && sak.sakId === t.sak.sakId) t.sak.opptak = sak.opptak;
  oppdaterKnapper();
}

kjorKnapp.addEventListener("click", () => {
  if (t.kjorer) {
    t.avbryt?.abort();
    return;
  }
  kjor(`/api/vurder?sak=${encodeURIComponent(velg.value)}&stopp=${stoppBryter.checked ? 1 : 0}&effort=${effortVelg.value}&kjoring=${kjoringVelg.value}`, { method: "POST" }, Number(fartVelg.value));
});

spillKnapp.addEventListener("click", () => {
  kjor(`/api/opptak?sak=${encodeURIComponent(velg.value)}&stopp=${stoppBryter.checked ? 1 : 0}&effort=${effortVelg.value}&kjoring=${kjoringVelg.value}&fart=${fartVelg.value}`, {}, Number(fartVelg.value));
});

simulerKnapp.addEventListener("click", () => {
  const url = "/api/vurder?sak=" + encodeURIComponent(velg.value) + "&stopp=" + (stoppBryter.checked ? 1 : 0) + "&effort=" + effortVelg.value + "&kjoring=" + kjoringVelg.value;
  kjor(url, { method: "POST" }, Number(fartVelg.value), { simulerDispensasjon: true });
});

validerKnapp.addEventListener("click", validerKjoring);

stoppBryter.addEventListener("change", oppdaterKnapper);
effortVelg.addEventListener("change", oppdaterKnapper);
kjoringVelg.addEventListener("change", oppdaterKnapper);
$("#person").addEventListener("click", visPerson);
$("#postmottak").addEventListener("click", visPostmottak);
$("#agent").addEventListener("click", visAgent);
for (const id of ["#person", "#postmottak", "#agent"]) {
  $(id).addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && $(id).click());
}

async function lastSak() {
  t.sak = await (await fetch(`/api/sak?sak=${encodeURIComponent(velg.value)}`)).json();
  nullstillKjoring();
  oppdaterKnapper();
}

velg.addEventListener("change", lastSak);

async function start() {
  const [saker, sjekkliste, kartdata] = await Promise.all(
    ["/api/saker", "/api/sjekkliste", "/api/kart"].map(async (u) => (await fetch(u)).json()),
  );
  t.sjekkliste = sjekkliste;
  t.kartdata = kartdata;
  t.kart = lagKart($("#kart"), kartdata, { vedKlikk: visEiendom });
  for (const s of saker) velg.append(el("option", { value: s.mappe }, `${s.sakId} · ${s.emne}`));
  await lastSak();
}

start();
