# Krav og sjekker for en byggesøknad i Start

Dokumentet beskriver alle krav og sjekker som Start bruker på en innkommende byggesøknad. Det er skrevet ut fra koden: `data/sjekkliste.json`, `server.js`, `formregler.js`, `matrikkel.js` og `data/reguleringsplan.md`. Står det noe annet i koden, er det koden som gjelder.

## Omfang

Start kontrollerer søknader fra en privatperson som søker selv, uten ansvarlig søker (pbl § 20-4). Søknaden må høre til én av to kategorier:

| Kategori | Hva den gjelder | Grense |
|---|---|---|
| `endring` | Tilbygg til en eksisterende bygning på eiendommen | Høyst 50 m² BYA og 50 m² BRA, og ikke påbygg |
| `nybygg` | Ny frittliggende bygning | Høyst 70 m² BYA og 70 m² BRA, og ingen skal bo eller overnatte i den |

Påbygg, bruksendring, fasadeendring, riving, boliger og søknader med flere tiltak faller utenfor. Agenten gir dem kategorien `uklart`.

## Gangen i kontrollen

1. **Formkontroll (agent).** Agenten kategoriserer søknaden, henter ut eiendomsopplysningene og går gjennom gruppe A–E i kontrollisten.
2. **Matrikkelkontroll (kode).** `matrikkel.js` kontrollerer opplysningene mot matrikkelen og planregisteret (gruppe M). Den kjøres så snart kategori og opplysninger finnes.
3. **Port (kode).** Bare søknader som er komplette, og der eiendommen er bekreftet, går videre.
4. **Planvurdering (agent).** Agenten vurderer tiltaket mot hver paragraf i reguleringsplanen.

Med `stoppVedFeil` (standard i nettsiden) stopper kontrollen ved den første feilen: kategori `uklart`, et punkt med `mangler` eller et matrikkelpunkt med `avvik`. Uten stopp vurderes alle punktene.

## Statuser

| Hvem | Statuser |
|---|---|
| Agenten (gruppe A–E) | `oppfylt`, `mangler`, `uklart`, `ikke_relevant` |
| Koden (gruppe M) | `oppfylt`, `avvik`, `ikke_vurdert` |
| Planvurderingen (per paragraf) | `samsvar`, `avvik`, `usikkert`, `ikke_relevant` |

`gjelder` sier om punktet gjelder `endring`, `nybygg` eller `begge`. Obligatoriske punkter må vurderes. Punkter merket «hvis relevant» kan være `ikke_relevant`.

### Koden retter agentens status (`ryddPunkt` i `server.js`)

- Gjelder punktet bare den andre kategorien, settes det til `ikke_relevant`. Det skjer bare når kategorien ikke er `uklart`.
- Er et obligatorisk punkt satt til `ikke_relevant`, endres det til `uklart`.
- Har agenten hoppet over et punkt, settes det til `uklart` med teksten «Agenten vurderte ikke punktet.».

---

## A Kategori og omfang (agent)

| ID | Gjelder | Oblig. | Krav | Kilde |
|---|---|---|---|---|
| A1 | begge | ja | Søknaden gjelder ett tiltak som hører til én kategori: «endring» (tilbygg til en eksisterende bygning på eiendommen) eller «nybygg» (ny frittliggende bygning). | pbl § 20-1 |
| A2 | begge | ja | Tiltakshaver er en privatperson som søker selv, uten ansvarlig søker eller foretak. | pbl § 20-4 |
| A3 | endring | ja | Tilbygget har høyst 50 m² bebygd areal (BYA) og høyst 50 m² bruksareal (BRA), og det er ikke et påbygg. | SAK10 § 3-1 første ledd bokstav a |
| A4 | nybygg | ja | Den frittliggende bygningen har høyst 70 m² BYA og høyst 70 m² BRA, og ingen skal bo eller overnatte i den. | SAK10 § 3-1 første ledd bokstav b |

Kategorien `uklart` stopper kontrollen ved A1 og gjør at søknaden ikke går gjennom porten.

## B Opplysninger i søknaden (agent, eller kode i kjøringen `parallell-kode`)

| ID | Gjelder | Oblig. | Krav | Kilde |
|---|---|---|---|---|
| B1 | begge | ja | Gårdsnummer og bruksnummer er oppgitt, og festenummer eller seksjonsnummer hvis eiendommen har det. | Forenklet byggesøknad del A |
| B2 | begge | ja | Kommunen er oppgitt med navn eller kommunenummer. | Del A |
| B3 | begge | ja | Byggeadressen er oppgitt med postnummer og poststed. | Del A |
| B4 | begge | ja | Tiltakshavers fulle navn er oppgitt. | Del B |
| B5 | begge | ja | Tiltakshavers telefon eller e-post er oppgitt. Postadressen er også oppgitt hvis tiltakshaver bor et annet sted enn byggeadressen. | Del B |
| B6 | begge | ja | Tiltaket er beskrevet med egne ord: hva som skal bygges, hvor på eiendommen og hva det skal brukes til. | Første side |
| B7 | begge | ja | Planen som gjelder eiendommen, er oppgitt med navn eller plan-ID. | Del C |
| B8 | begge | ja | Beregningsmåten for grad av utnytting er oppgitt (for eksempel %-BYA). | Del D |
| B9 | begge | ja | Tomtens nettoareal, BYA før og etter tiltaket og grad av utnytting etter tiltaket er oppgitt. | Del D |
| B10 | begge | ja | Tiltakets eget BYA og BRA er oppgitt. | SAK10 § 3-1; del D |
| B11 | begge | ja | Korteste avstand fra tiltaket til nabogrense, midten av vei og nærmeste bygning er oppgitt. | Del E |
| B12 | begge | ja | Søknaden svarer på om tiltaket ligger nær VA-ledninger, høyspent, jernbane eller trikk, strandsone eller vassdrag, i flom-, ras- eller kvikkleireområde, på forurenset grunn, nær kulturminner eller vernede arter, i område med midlertidig byggeforbud eller i konsesjonsområde for fjernvarme. Ved ja er uttalelse eller tillatelse vedlagt. | Del F |
| B13 | begge | ja | Søknaden svarer på om tiltaket gir ny eller endret avkjørsel. Ved ja er avkjøringstillatelse eller tinglyst veirett vedlagt. | Del G |
| B14 | begge | ja | Søknaden svarer på om tiltaket trenger dispensasjon eller tillatelse fra andre myndigheter. Ved ja er begrunnet dispensasjonssøknad eller vedtak vedlagt. | pbl § 19-1 |
| B15 | begge | ja | Søknaden har en vedleggsliste, og den stemmer med dokumentene som faktisk er sendt inn. | Del H |
| B16 | begge | ja | Søknaden er datert og underskrevet av tiltakshaver. Kommer den på e-post fra tiltakshaver, holder det at navnet står under teksten. | Del I; SAK10 § 5-1 |

### Kodereglene for gruppe B (`kontrollerOpplysninger` i `formregler.js`)

I kjøringen `parallell-kode` henter agenten bare ut fakta (`FAKTA_SKJEMA`), og koden avgjør punktene. Et punkt er enten `oppfylt` eller `mangler`. Tom tekst, `null` og manglende verdi regnes som «ikke oppgitt».

| ID | Regel |
|---|---|
| B1 | `gnr` og `bnr` er begge heltall. |
| B2 | Kommunenavn eller kommunenummer er oppgitt. |
| B3 | Adresse, postnummer og poststed er alle oppgitt. |
| B4 | Navnet har minst to ord. Bare fornavn gir `mangler`. |
| B5 | Telefon eller e-post er oppgitt. Svarer søknaden at tiltakshaver ikke bor på byggeadressen, må også postadressen være oppgitt. |
| B6 | Hva som skal bygges, hvor på eiendommen og bruken er alle oppgitt. |
| B7 | Planen er oppgitt (navn eller plan-ID). |
| B8 | Beregningsmåten er oppgitt. |
| B9 | Tomteareal, BYA før, BYA etter og grad av utnytting etter er alle oppgitt. |
| B10 | Tiltakets BYA og BRA er begge oppgitt. |
| B11 | Avstand til nabogrense, til midten av vei og til nærmeste bygning er alle oppgitt. Avstand bare til veikant eller veigrense er ikke nok. |
| B12 | Søknaden svarer ja eller nei på alle forholdene. Ved minst ett ja må uttalelse eller tillatelse være vedlagt. |
| B13 | Spørsmålet om avkjørsel er besvart. Ved ja må tillatelse eller veirett være vedlagt. |
| B14 | Spørsmålet om dispensasjon er besvart. Ved ja må dispensasjonssøknad eller vedtak være vedlagt. |
| B15 | Vedleggslisten finnes. Hvert vedlegg i listen peker på et dokument i saken, og hvert innsendt dokument utenom selve søknaden står i listen. |
| B16 | Datoen er oppgitt, og søknaden er enten signert eller har navnet under e-posten. |

## C Situasjonsplan (agent)

| ID | Gjelder | Oblig. | Krav |
|---|---|---|---|
| C1 | begge | ja | En situasjonsplan er vedlagt som eget dokument. |
| C2 | begge | ja | Målestokken er oppgitt, vanligvis 1:500 (1:1000 for store tiltak), og planen har en målestokklinje. |
| C3 | begge | ja | Planen har nordpil. |
| C4 | begge | ja | Eiendomsgrensene er tegnet inn, og eiendommen er merket med gnr/bnr eller adresse. |
| C5 | begge | ja | Tiltaket er tegnet inn på riktig sted og skilt fra eksisterende bebyggelse med farge, skravur eller tekst. |
| C6 | begge | ja | Tiltakets utvendige mål står på planen. |
| C7 | begge | ja | Minste avstand fra tiltaket til nabogrensene er målsatt, målt fra yttervegg. |
| C8 | begge | nei | Avstanden til midten av veien er målsatt når tiltaket ligger mot vei. |
| C9 | begge | nei | Avstanden til andre bygninger på egen eiendom og til nærmeste bygning på naboeiendommen er vist. |
| C10 | begge | nei | Parkeringsplasser på egen tomt er vist når planen har krav til parkering. |
| C11 | begge | nei | Atkomst og avkjørsel er vist når de er nye eller endres. |
| C12 | begge | nei | VA-ledninger og tilknytningspunkt er vist når tiltaket ligger nær ledninger eller skal kobles til. |
| C13 | begge | nei | Høyspentlinjer er vist når tiltaket ligger nær en høyspentlinje. |

Kilder: SAK10 § 5-4, Kristiansand «Slik søker du» og informasjonsarket «Situasjonsplan – hva kreves?».

## D Tegninger (agent, D13 med kode i `parallell-kode`)

| ID | Gjelder | Oblig. | Krav |
|---|---|---|---|
| D1 | endring | ja | Plantegningen viser hele etasjen der tilbygget kommer, med både eksisterende og nytt areal. |
| D2 | nybygg | ja | Det finnes plantegning av alle etasjer i bygningen. |
| D3 | begge | ja | Det finnes minst én snittegning, og snittets plassering er markert på plantegningen. |
| D4 | endring | ja | Det finnes fasadetegninger av alle fasader som endres, merket med himmelretning. |
| D5 | nybygg | ja | Det finnes fasadetegninger av alle fire fasader, merket med himmelretning. |
| D6 | begge | ja | Hver tegning har oppgitt målestokk, vanligvis 1:100 (eventuelt 1:200). |
| D7 | endring | ja | Tegningene skiller tydelig mellom eksisterende og nytt, for eksempel med farge eller tykkere strek. |
| D8 | begge | ja | Plantegningen har utvendige mål og viser hva rommene skal brukes til. |
| D9 | begge | ja | Mønehøyde og gesimshøyde er målsatt fra gjennomsnittlig ferdig planert terreng. |
| D10 | begge | ja | Fasader og snitt viser terrenglinje for eksisterende og ferdig planert terreng. |
| D11 | begge | ja | Snittet viser takvinkel i grader. |
| D12 | begge | ja | Hver tegning har tittelfelt med gnr/bnr, byggeadresse, tiltakshavers navn, tiltakets art, type tegning, tegningsnummer, målestokk og dato. |
| D13 | begge | ja | Målene på tegningene og situasjonsplanen stemmer med arealene og avstandene i søknaden. Parkering på terreng regnes med 18 m² per plass i BYA (veileder H-2300). |

Kilder: informasjonsarket «Tegninger – hva kreves?», Kristiansand «Slik søker du» og DiBK H-2300.

### Koderegelen for D13 (`kontrollerMaal` i `formregler.js`)

Koden sammenligner bare mål som står både i søknaden og på tegningene:

| Sammenligning | Toleranse |
|---|---|
| Tiltakets BYA mot lengde × bredde på tegningen | ±2 %, minst 1 m² |
| BYA før tiltaket mot summen av lengde × bredde for eksisterende bygninger | ±2 %, minst 1 m² |
| Avstand til nabogrense, til grensen mot vei, til midten av vei og til nærmeste bygning | ±0,1 m |
| Antall parkeringsplasser i søknaden mot antall tegnet | Må være likt |
| BYA for parkering mot antall plasser × 18 m² | Må være likt |

Resultatet:

- `mangler` når minst ett mål avviker.
- `uklart` når situasjonsplanen ikke har målestokk, selv om tallene stemmer.
- `uklart` når ingen mål kan sammenlignes.
- `oppfylt` ellers.

## E Nabovarsel (agent, E5 med kode i `parallell-kode`)

| ID | Gjelder | Oblig. | Krav | Kilde |
|---|---|---|---|---|
| E1 | begge | ja | En kopi av nabovarselet er vedlagt. Den beskriver tiltaket og nevner dispensasjon hvis det søkes om det. | pbl § 21-3 |
| E2 | begge | ja | Det er dokumentert at alle naboer og gjenboere er varslet, med kvittering for personlig levering, e-post/SMS eller rekommandert sending. | pbl § 21-3 |
| E3 | begge | ja | Søknaden ble sendt minst 2 uker og senest 1 år etter nabovarselet. | SAK10 § 5-2 |
| E4 | begge | ja | Merknader fra naboer er vedlagt sammen med tiltakshavers kommentarer, eller søknaden opplyser at det ikke kom merknader. | SAK10 § 5-2 |
| E5 | begge | nei | Ligger tiltaket nærmere nabogrensen enn 4 m, er skriftlig samtykke fra alle hjemmelshavere på naboeiendommen vedlagt («Erklæring om nabogrense»). Unntak: frittliggende garasje, bod eller lignende på høyst 50 m² BYA og BRA, minst 1 m fra grensen. | pbl § 29-4 |

### Koderegelen for E5 (`kontrollerNabogrense` i `formregler.js`)

Koden bruker avstanden til nabogrensen fra søknaden. Står den ikke der, brukes avstanden på situasjonsplanen. Grensen mot vei regnes ikke som nabogrense.

1. Avstanden står ingen av stedene: `uklart`.
2. Avstanden er 4 m eller mer: `ikke_relevant`.
3. Tiltaket er en frittliggende garasje eller bod minst 1 m fra grensen:
   - BYA og BRA er begge høyst 50 m²: `ikke_relevant`, fordi unntaket gjelder.
   - BYA er høyst 50 m², men BRA er ikke oppgitt: `uklart`.
4. I alle andre tilfeller: `oppfylt` hvis samtykke er vedlagt, ellers `mangler`.

## M Matrikkel og planregister (kode, `kontrollerMatrikkel` i `matrikkel.js`)

Før sammenligning normaliseres tekst: NFC, små bokstaver, mellomrom slått sammen og punktum eller komma til slutt fjernet.

| ID | Krav | Regel | Utfall |
|---|---|---|---|
| M1 | Kommunen i søknaden er Hvileskjær (8888). | Er kommunenummeret oppgitt, må det være `8888`. Er navnet oppgitt, må det være «Hvileskjær» eller `8888`. | `avvik` når kommune mangler eller er feil |
| M2 | Gnr/bnr finnes i matrikkelen for kommunen. | Begge må være heltall og finnes som eiendom. | `avvik` |
| M3 | Adressen finnes i matrikkelens adresseregister. | Søk i adressene for alle eiendommene. | `avvik` når den ikke finnes |
| M4 | Adressen hører til samme eiendom som gnr/bnr. | Adressen og gnr/bnr må peke på samme eiendom. | `avvik`, eller `ikke_vurdert` når adressen eller eiendommen ikke ble funnet |
| M5 | Postnummer og poststed stemmer med adressen. | Begge må være oppgitt og stemme med adressen i matrikkelen. | `avvik`, eller `ikke_vurdert` uten adressetreff |
| M6 | Tomtearealet avviker høyst 1 % fra matrikkelen. | \|oppgitt − registrert\| ≤ 1 % av registrert. | `avvik`, eller `ikke_vurdert` når tomteareal ikke er oppgitt |
| M7 | BYA før tiltaket avviker høyst 1 % (minst 1 m²) fra bygningene i matrikkelen. | Sammenlignes med summen av BYA for de registrerte bygningene. Toleransen er 1 %, minst 1 m². | `avvik`, eller `ikke_vurdert` når BYA før ikke er oppgitt |
| M8 | Ved endring har eiendommen minst én registrert bygning. | Gjelder bare kategorien `endring`. | `avvik` når ingen bygning er registrert |
| M9 | Eiendommen er omfattet av en plan i planregisteret. | Første plan i planregisteret som eiendommen viser til. | `avvik` uten plan |
| M10 | Planen i søknaden er den samme som i planregisteret. | Teksten i søknaden inneholder plan-ID-en (`8888/2019001`), løpenummeret (`2019001`) eller plannavnet. | `avvik`, eller `ikke_vurdert` når søknaden ikke oppgir plan |

`ikke_vurdert` stopper ikke porten. Det gjør bare `avvik`.

## Port

Søknaden går videre til planvurderingen bare når alt dette holder:

- Kategorien er `endring` eller `nybygg`, ikke `uklart`.
- Ingen punkter i gruppe A–E har status `mangler`. Statusene `uklart` og `ikke_relevant` stopper ikke porten.
- Ingen punkter i gruppe M har status `avvik`.
- Kontrollen ble ikke stoppet ved første feil.
- I parallell kjøring: opplysningene er kontrollert mot matrikkelen.

Stopper porten, får saksbehandler en mangelliste med alle punktene som har `mangler` eller `avvik`, og en begrunnelse for hvert.

## Planvurdering (agent)

Agenten vurderer søknaden mot hver paragraf i planbestemmelsene for planen fra planregisteret. Den ser også plankartet og tegningene. Opplysningene fra matrikkelen går foran tallene i søknaden. For hver paragraf skriver agenten kravet, det søknaden oppgir (med dokument-ID), en begrunnelse og en vurdering.

Paragrafene i `data/reguleringsplan.md` (Reguleringsplan for Solbakken boligområde, 8888/2019001):

| Paragraf | Krav |
|---|---|
| § 1 Formål | Området er regulert til frittliggende boligbebyggelse (enebolig). |
| § 2 Utnyttelse | Bebygd areal (BYA) kan ikke overstige 30 % av tomtearealet. |
| § 3 Høyde | Mønehøyden kan ikke overstige 7,0 m over gjennomsnittlig planert terreng. |
| § 4 Byggegrenser | Byggegrensen er 6,0 m fra tomtegrensen mot Solbakken (offentlig vei i nord) og 4,0 m mot de andre tomtegrensene. Tiltak innenfor byggegrensen krever ikke dispensasjon. |
| § 5 Parkering | Hver bolig skal ha minst to parkeringsplasser på egen tomt. |

Konklusjonen følger av paragrafene (`planKonklusjon` i `server.js`):

- `avvik` når minst én paragraf har avvik.
- `usikkert` når ingen paragraf har avvik, men minst én er usikker.
- `samsvar` ellers.

Når paragrafene vurderes i hvert sitt kall (oppsett med `bit`), er det koden som setter konklusjonen. Med `stoppVedFeil` stopper planvurderingen ved det første avviket, og konklusjonen blir `avvik`. Planvurderingen er en anbefaling til saksbehandler, ikke et vedtak.

## Hvem avgjør hva

| Punkter | Sekvensiell og `parallell` | `parallell-kode` |
|---|---|---|
| A1–A4, kategori | Agent | Agent |
| B1–B16 | Agent | Kode (`formregler.js`) ut fra fakta agenten henter ut |
| C1–C13 | Agent | Agent |
| D1–D12 | Agent | Agent |
| D13 | Agent | Kode |
| E1–E4 | Agent | Agent |
| E5 | Agent | Kode |
| M1–M10 | Kode (`matrikkel.js`) | Kode |
| Port | Kode | Kode |
| Planvurdering | Agent, som også setter konklusjonen etter regelen over | Agent per paragraf, koden setter konklusjonen |
