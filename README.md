# Byggesøknad

Applikasjonen ligger i [Applikasjon](Applikasjon/).

Kjør fra prosjektroten:

```sh
npm test
npm start
npm run tegn
```

Eller gå inn i `Applikasjon/` og bruk kommandoene fra [Applikasjon/package.json](Applikasjon/package.json).

`Applikasjon/data/` inneholder appens data og eksempelsaker. `kristiansand-maler/` inneholder tilhørende maler og referansemateriale.

## Dispensasjonssimulering

Velg sak **2026/201** i appen. Kjør kontrollen eller spill av et tidligere opptak. Når planvurderingen er ferdig, vises dispensasjonssimuleringen under loggen. Søknadsutkastet fyller bare inn kjente saksopplysninger; søkeren fyller selv ut begrunnelse og alternativer. Kontroller teksten og det oppgitte tegningsgrunnlaget før du simulerer nabovarsel. Velg et syntetisk nabosvar og kjør en egen AI-vurdering av dispensasjonen. Hvis AI-en ber om mer, viser appen avklaringspunktene. Legg inn faktiske opplysninger og last opp inntil fem PNG-, JPG-, WebP- eller PDF-filer (maks. 5 MB per fil). Appen simulerer et nytt nabovarsel basert på søknaden og materialet, og kjører en separat AI-vurdering med vedleggene. Ingen melding sendes til virkelige mottakere. Opptaket for `high` / `Ett kall` / `Stopp ved første feil` kan spilles av uten et nytt modellkall; dispensasjonsvurderingene krever modellkall.
