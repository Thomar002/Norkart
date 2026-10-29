// Sammenligner den siste dispensasjonsrunden med den scenarioavhengige fasiten.
export function validerDispensasjon(fasit, hendelse) {
  const scenarioId = ["flere", "en", "ingen"].includes(hendelse.nabosvar)
    ? hendelse.nabosvar
    : hendelse.nabosvar === "merknad" ? "en" : "ingen";
  const scenario = fasit.scenarioer?.[scenarioId];
  if (!scenario) throw new Error(`Dispensasjonsfasiten mangler scenarioet «${scenarioId}».`);

  const vurdering = hendelse.vurdering ?? {};
  const punkter = Object.entries(scenario.punkter).map(([id, krav]) => {
    const faktisk = vurdering[id] ?? null;
    const riktig = krav.godtatt.includes(faktisk);
    return {
      id,
      navn: krav.navn,
      faktisk,
      forventet: krav.forventet,
      godtatt: krav.godtatt,
      riktig,
      begrunnelse: krav.begrunnelse,
    };
  });
  const riktige = punkter.filter((punkt) => punkt.riktig).length;
  const resultat = riktige === punkter.length ? "bestatt" : "ikke_bestatt";
  const nabotekst = scenarioId === "flere" ? "Flere naboer har merknader"
    : scenarioId === "en" ? "Én nabo har merknad"
      : "Ingen naboer har merknader";

  return {
    scenario: scenarioId,
    scenarioTekst: nabotekst,
    resultat,
    tall: { riktig: riktige, vurdert: punkter.length },
    oppsummering: `${riktige} av ${punkter.length} vurderingspunkter stemmer med dispensasjonsfasiten for scenarioet «${nabotekst.toLowerCase()}».`,
    sammendrag: scenario.sammendrag,
    punkter,
  };
}
