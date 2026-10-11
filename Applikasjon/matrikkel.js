// Kontroll av eiendomsopplysningene i søknaden mot matrikkelen og planregisteret.
// Ren kode uten AI: samme inndata gir alltid samme svar. Punktene tilsvarer gruppe M i data/sjekkliste.json.

function norm(tekst) {
  return String(tekst ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,]+$/, "");
}

function tom(verdi) {
  return verdi === null || verdi === undefined || norm(verdi) === "";
}

function innenfor(oppgitt, fasit, minstAvvik) {
  return Math.abs(oppgitt - fasit) <= Math.max(fasit * 0.01, minstAvvik);
}

/**
 * @param {object} opplysninger Feltene agenten hentet ut av søknaden (se OPPLYSNINGER_SKJEMA i server.js).
 * @param {"endring"|"nybygg"|"uklart"} kategori
 * @param {object} matrikkel Innholdet i data/matrikkel.json.
 * @param {object} planregister Innholdet i data/planregister.json.
 * @returns {{ punkter: {id: string, status: "oppfylt"|"avvik"|"ikke_vurdert", funnet: string}[], eiendom: object|null, plan: object|null }}
 */
export function kontrollerMatrikkel(opplysninger, kategori, matrikkel, planregister) {
  const o = opplysninger ?? {};
  const punkter = [];
  const sett = (id, status, funnet) => punkter.push({ id, status, funnet });
  const kommune = matrikkel.kommune;

  // M1 Kommune
  const nrOppgitt = !tom(o.kommunenr);
  const navnOppgitt = !tom(o.kommune);
  if (!nrOppgitt && !navnOppgitt) {
    sett("M1", "avvik", "Søknaden oppgir ikke kommune.");
  } else if (nrOppgitt && norm(o.kommunenr) !== kommune.nr) {
    sett("M1", "avvik", `Søknaden oppgir kommunenummer ${o.kommunenr}, men eiendommen må ligge i ${kommune.navn} (${kommune.nr}).`);
  } else if (navnOppgitt && norm(o.kommune) !== norm(kommune.navn) && norm(o.kommune) !== kommune.nr) {
    sett("M1", "avvik", `Søknaden oppgir kommunen «${o.kommune}», men eiendommen må ligge i ${kommune.navn} (${kommune.nr}).`);
  } else {
    sett("M1", "oppfylt", `${kommune.navn} (${kommune.nr}).`);
  }

  // M2 Gnr/bnr
  let eiendom = null;
  if (!Number.isInteger(o.gnr) || !Number.isInteger(o.bnr)) {
    sett("M2", "avvik", "Søknaden oppgir ikke både gårdsnummer og bruksnummer.");
  } else {
    eiendom = matrikkel.eiendommer.find((e) => e.gnr === o.gnr && e.bnr === o.bnr) ?? null;
    sett(
      "M2",
      eiendom ? "oppfylt" : "avvik",
      eiendom
        ? `${kommune.nr}-${o.gnr}/${o.bnr} finnes i matrikkelen.`
        : `${kommune.nr}-${o.gnr}/${o.bnr} finnes ikke i matrikkelen.`,
    );
  }

  // M3 og M4 Adresse
  let adresseTreff = null;
  if (tom(o.adresse)) {
    sett("M3", "avvik", "Søknaden oppgir ikke byggeadresse.");
    sett("M4", "ikke_vurdert", "Adressen mangler.");
  } else {
    for (const e of matrikkel.eiendommer) {
      const a = e.adresser.find((x) => norm(x.adresse) === norm(o.adresse));
      if (a) {
        adresseTreff = { eiendom: e, adresse: a };
        break;
      }
    }
    if (!adresseTreff) {
      sett("M3", "avvik", `Adressen «${o.adresse}» finnes ikke i adresseregisteret for ${kommune.navn}.`);
      sett("M4", "ikke_vurdert", "Adressen finnes ikke.");
    } else {
      const ae = adresseTreff.eiendom;
      sett("M3", "oppfylt", `«${adresseTreff.adresse.adresse}» finnes og hører til ${kommune.nr}-${ae.gnr}/${ae.bnr}.`);
      if (!eiendom) {
        sett("M4", "ikke_vurdert", "Gnr/bnr ble ikke funnet, så adressen kan ikke sammenlignes.");
      } else if (ae === eiendom) {
        sett("M4", "oppfylt", `Adressen og gnr/bnr peker på samme eiendom.`);
      } else {
        const riktig = eiendom.adresser.map((x) => x.adresse).join(", ") || "ingen adresse";
        sett(
          "M4",
          "avvik",
          `«${adresseTreff.adresse.adresse}» hører til ${kommune.nr}-${ae.gnr}/${ae.bnr}, men søknaden oppgir ${kommune.nr}-${eiendom.gnr}/${eiendom.bnr} (${riktig}).`,
        );
      }
    }
  }

  // M5 Postnummer og poststed
  if (!adresseTreff) {
    sett("M5", "ikke_vurdert", "Adressen ble ikke funnet.");
  } else if (tom(o.postnr) || tom(o.poststed)) {
    sett("M5", "avvik", "Søknaden oppgir ikke både postnummer og poststed.");
  } else {
    const a = adresseTreff.adresse;
    const stemmer = norm(o.postnr) === norm(a.postnr) && norm(o.poststed) === norm(a.poststed);
    sett(
      "M5",
      stemmer ? "oppfylt" : "avvik",
      stemmer
        ? `${a.postnr} ${a.poststed}.`
        : `Søknaden oppgir ${o.postnr} ${o.poststed}, men matrikkelen har ${a.postnr} ${a.poststed}.`,
    );
  }

  // M6 Tomteareal
  if (!eiendom) {
    sett("M6", "ikke_vurdert", "Eiendommen ble ikke funnet.");
  } else if (typeof o.tomteareal !== "number") {
    sett("M6", "ikke_vurdert", `Søknaden oppgir ikke tomteareal. Matrikkelen har ${eiendom.tomteareal} m².`);
  } else if (innenfor(o.tomteareal, eiendom.tomteareal, 0)) {
    sett("M6", "oppfylt", `Søknaden: ${o.tomteareal} m². Matrikkelen: ${eiendom.tomteareal} m².`);
  } else {
    sett("M6", "avvik", `Søknaden oppgir ${o.tomteareal} m², men matrikkelen har ${eiendom.tomteareal} m².`);
  }

  // M7 Bebygd areal før tiltaket
  if (!eiendom) {
    sett("M7", "ikke_vurdert", "Eiendommen ble ikke funnet.");
  } else {
    const registrert = eiendom.bygninger.reduce((sum, b) => sum + b.bya, 0);
    if (typeof o.byaFor !== "number") {
      sett("M7", "ikke_vurdert", `Søknaden oppgir ikke BYA før tiltaket. Matrikkelen har ${registrert} m².`);
    } else if (innenfor(o.byaFor, registrert, 1)) {
      sett("M7", "oppfylt", `Søknaden: ${o.byaFor} m². Matrikkelen: ${registrert} m².`);
    } else {
      sett("M7", "avvik", `Søknaden oppgir BYA ${o.byaFor} m² før tiltaket, men matrikkelen har ${registrert} m².`);
    }
  }

  // M8 Eksisterende bygning ved endring
  if (kategori !== "endring") {
    sett("M8", "ikke_vurdert", "Gjelder bare endring.");
  } else if (!eiendom) {
    sett("M8", "ikke_vurdert", "Eiendommen ble ikke funnet.");
  } else if (eiendom.bygninger.length === 0) {
    sett("M8", "avvik", "Søknaden gjelder tilbygg, men eiendommen har ingen registrert bygning.");
  } else {
    const liste = eiendom.bygninger.map((b) => `${b.type} (bygningsnr. ${b.bygningsnr}, BYA ${b.bya} m²)`).join(", ");
    sett("M8", "oppfylt", liste);
  }

  // M9 og M10 Plan
  let plan = null;
  if (!eiendom) {
    sett("M9", "ikke_vurdert", "Eiendommen ble ikke funnet.");
    sett("M10", "ikke_vurdert", "Eiendommen ble ikke funnet.");
  } else {
    plan = planregister.planer.find((p) => eiendom.planer.includes(p.id)) ?? null;
    if (!plan) {
      sett("M9", "avvik", "Planregisteret har ingen plan for eiendommen.");
      sett("M10", "ikke_vurdert", "Ingen plan å sammenligne med.");
    } else {
      sett("M9", "oppfylt", `${plan.id} ${plan.navn}.`);
      if (tom(o.planOppgitt)) {
        sett("M10", "ikke_vurdert", "Søknaden oppgir ikke plan.");
      } else {
        const oppgitt = norm(o.planOppgitt);
        const lopenr = plan.id.split("/").pop();
        const stemmer = oppgitt.includes(norm(plan.id)) || oppgitt.includes(lopenr) || oppgitt.includes(norm(plan.navn));
        sett(
          "M10",
          stemmer ? "oppfylt" : "avvik",
          stemmer
            ? `Søknaden oppgir «${o.planOppgitt}».`
            : `Søknaden oppgir «${o.planOppgitt}», men planregisteret har ${plan.id} ${plan.navn}.`,
        );
      }
    }
  }

  return { punkter, eiendom, plan };
}
