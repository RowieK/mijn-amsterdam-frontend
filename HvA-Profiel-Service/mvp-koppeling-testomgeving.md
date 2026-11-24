# MVP: koppeling met de testomgeving van OpenZaak, OpenKlant en NotifyNL

Dit document beschrijft hoe Mijn Amsterdam (de BFF) aan de testomgeving van NotifyNL is gekoppeld, met welke testgegevens dat is gedaan en hoe je het reproduceert. Zie [omc.md](omc.md) voor het besluit (OpenKlant uitbreiden) en het sequence diagram.

## Wat we aantonen

De keten die het MVP moet laten zien:

> Burger kiest in Mijn Amsterdam een kanaal voor zaak Z → er komt een status op Z in OpenZaak → de OMC stuurt via NotifyNL naar het gekozen adres → het bericht komt binnen en staat als klantcontact in OpenKlant

Dat gebeurt in drie fases:

| Fase | Wat je kunt laten zien | Wat je nodig hebt | Wachten op de beheerder? |
|---|---|---|---|
| **1. Bouwen** | Code met tests | Niets | Nee |
| **2. Koppeling aantonen** | Je logt in, ziet je zaken uit OpenZaak, kiest per zaak een e-mailadres, en die keuze staat daarna in OpenKlant | Een BSN dat initiator is van een zaak in OpenZaak | Nee |
| **3. Ketentest met de OMC** | Na een nieuwe status komt de e-mail binnen op het gekozen adres | Een zaaktype dat de OMC oppakt, en iemand die de status zet | Ja |

Fase 1 is klaar. Fase 2 is uitgevoerd: op 23 november 2026 stond in OpenKlant voor de testpersoon een adres met `referentie ZAAK-2026-0000000172`. De stappen hieronder herhalen het. Fase 3 wacht op de beheerder (zie [Openstaande aanvragen](#openstaande-aanvragen)).

## Gebruikte testgegevens

| Gegeven | Waarde |
|---|---|
| E-mailadres (echt, zelf te lezen) | `email-test-gebruiker` |
| BSN van de testpersoon | `534730103` |
| Zaak in OpenZaak (initiator: dit BSN) | `ZAAK-2026-0000000166` |
| Dev-account | Naam naar keuze in `MA_TEST_ACCOUNTS`, bijvoorbeeld `HvA-Test=534730103` |
| OpenZaak | `https://openzaak.test.notifynl.nl/zaken/api/v1/` |
| OpenKlant | `https://openklantv2.test.notifynl.nl/klantinteracties/api/v1/` |
| Open Notificaties | `https://opennotificaties.test.notifynl.nl/api/v1/` |

Gebruik niet BSN `999993653`: daarmee draaien de producttests van de OMC op dezelfde testomgeving.

## Configuratie

Alles staat in `.env.local`. Dat bestand bevat geheime sleutels: zet het nooit in git, in een document of in een chat. Hieronder staan alleen de namen.

| Variabele | Inhoud |
|---|---|
| `BFF_KLANTCONTACT_BACKEND` | `openklant` |
| `BFF_OPENKLANT_BASE_URL` | Basis-URL van OpenKlant, eindigt op `/api/v1/` |
| `BFF_OPENKLANT_TOKEN` | Token van OpenKlant |
| `BFF_OPENZAAK_BASE_URL` | Basis-URL van OpenZaak, eindigt op `/api/v1/` |
| `BFF_OPENZAAK_CLIENT_ID` | Client-id voor OpenZaak en Open Notificaties |
| `BFF_OPENZAAK_JWT_SECRET` | De client-secret, **geen** kant-en-klare JWT. De BFF maakt per aanroep zelf een JWT |
| `BFF_OPENZAAK_BRONORGANISATIE` | Het RSIN van de organisatie die de zaken registreert |
| `BFF_OPENNOTIFICATIES_BASE_URL` | Basis-URL van Open Notificaties, eindigt op `/api/v1/` |
| `MA_TEST_ACCOUNTS` | Dev-accounts in de vorm `naam=bsn`, gescheiden door komma's |

De basis-URL's eindigen op de API-versie, zonder resourcepad. De BFF plakt `/zaken`, `/partijen` of `/kanaal` er zelf achter. Een URL die op `/partijen` eindigt, geeft een 404.

**Waarom een RSIN?** Een zaakidentificatie is volgens de Zaken API alleen uniek binnen de organisatie die de zaak registreert. De BFF zoekt een zaak daarom op identificatie én bronorganisatie, zodat de eigenaarscontrole nooit de verkeerde zaak controleert. Dit komt niet van de stakeholder. Het staat als open punt 5 in [technisch_pva.md](technisch_pva.md) en is in commit `a3f4216f` ("Koppeling API's") verplicht gemaakt. Zonder RSIN geeft de controle altijd 503. `pnpm zgw:check` toont de bronorganisaties van de testomgeving als de variabele leeg is.

## Stappenplan (fase 2 reproduceren)

### 0. Voorbereiding

1. Check de branch `hva/koppeling-openzaak-openklant-opennotificaties` uit en draai `pnpm install`.
2. Vul `.env.local` volgens [Configuratie](#configuratie). Gebruik `.env.local.template` als voorbeeld.

### 1. Koppelingen controleren

```sh
pnpm zgw:check
```

Verwacht:
- `Open Klant`: `OK verbinding: HTTP 200, … partijen`
- `Open Zaak`: `OK verbinding: HTTP 200, … zaken`
- `Open Notificaties`: `FOUT … 403 | permission_denied`, totdat de client de scope `notificaties.consumeren` heeft. Dit blokkeert fase 2 niet.

Krijg je bij OpenZaak `jwt-expired` of `invalid-jwt-signature`, dan klopt de client-secret niet. Het script geeft per fout een hint.

### 2. Een testpersoon kiezen

```sh
pnpm zgw:testzaken
```

Het script toont open zaken per BSN van de initiator, en of die persoon al een partij in OpenKlant heeft. Het wijzigt niets en slaat `999993653` over. Kies bij voorkeur een BSN zonder partij: een bestaande partij kan van de tests van iemand anders zijn.

Gekozen: BSN `534730103` met zaak `ZAAK-2026-0000000166`.

### 3. De testpersoon in OpenKlant klaarzetten

Eerst kijken wat het script gaat doen:

```sh
pnpm zgw:seed --bsn=534730103 --email=email-test-gebruiker --dry-run
```

Dan uitvoeren:

```sh
pnpm zgw:seed --bsn=534730103 --email=email-test-gebruiker
```

Het script maakt de partij met het BSN aan als die er nog niet is. Daarna zet het het e-mailadres erbij als geverifieerd standaardadres. Twee keer draaien kan geen kwaad: wat al klopt, blijft staan.

Controleren:

```sh
pnpm zgw:check --bsn=534730103
```

Verwacht bij OpenKlant: één contactgegeven, `Email ****@gmail.com (standaard, geverifieerd)`.

Bij OpenZaak toont het script de open zaken van dit BSN per zaaktype: dezelfde thema's als in de tabel op Mijn contact. Met `--zaaktypen` toont het ook alle zaaktypen in de catalogus. De testomgeving kent alleen testzaaktypen (`test`, `test new`, `test zaaktype`), dus op Mijn contact zie je alleen die thema's.

### 4. Dev-account toevoegen en de BFF herstarten

1. Voeg `HvA-Test=534730103` (of een andere naam) toe aan `MA_TEST_ACCOUNTS` in `.env.local`.
2. Start de app met `pnpm serve-dev`. Die start de BFF, de frontend en de mockserver, en herstart de BFF vanzelf als `.env.local` wijzigt. Draait de BFF los, herstart hem dan zelf.

### 5. Inloggen en een kanaal kiezen

1. Log in met het dev-account via de frontend (`http://localhost:3000`) of direct via `http://localhost:5000/api/v1/auth/digid/login?username=HvA-Test`.
2. Ga naar **Mijn contact**. In de tabel met communicatievoorkeuren staan de open zaken uit OpenZaak, met elk zaaktype als eigen thema (bijvoorbeeld "Melding openbare ruimte"). Een zaak waarvan het zaaktype niet op te halen is, staat onder **Zaken**.
3. Klik bij het thema van `ZAAK-2026-0000000166` op **wijzig** en kies voor die zaak het e-mailadres.

De BFF controleert eerst in OpenZaak dat `534730103` de initiator van de zaak is. Daarna schrijft hij in OpenKlant een tweede digitaal adres met `referentie = ZAAK-2026-0000000166` en `isStandaardAdres: false`.

### 6. Aantonen

```sh
pnpm zgw:check --bsn=534730103 --zaak=ZAAK-2026-0000000166
```

Verwacht:
- Bij OpenKlant twee contactgegevens:
  - `Email ****@gmail.com (standaard, geverifieerd)`
  - `Email ****@gmail.com (geverifieerd, referentie ZAAK-2026-0000000166)`
- Bij OpenZaak: `zaak ZAAK-2026-0000000166: gevonden` en `534730103 is de initiator van de zaak`.

Daarmee is fase 2 aangetoond: de keuze in Mijn Amsterdam staat in OpenKlant, precies zoals de OMC hem leest (stap 1 van de adreskeuze: `referentie == zaak.identificatie`).

### 7. Terugdraaien (optioneel)

Kies in het venster bij de zaak weer **standaard**. Het adres met de referentie verdwijnt uit OpenKlant en de OMC valt terug op het standaardadres. `pnpm zgw:check --bsn=534730103` toont dan weer één contactgegeven.

## Fase 3: ketentest met de OMC (later)

Voorwaarden (beheerder):
1. Het zaaktype van de testzaak staat in de whitelist van de OMC (`ZGW_WHITELIST_ZAAKUPDATE_IDS`).
2. De volgende status van dat zaaktype heeft `informeren = true`, anders stuurt de OMC niets.
3. Iemand zet de status: de beheerder, of wij zelf met het recht `zaken.statussen.toevoegen`.
4. De OMC-versie op de testomgeving kiest het adres op `referentie`. De testdata wijzen erop, maar dat is niet bevestigd.

Voorwaarde 1 lijkt rond voor het zaaktype `whitelisted` ("test zaaktype"). Voor `ZAAK-2026-0000000162`, met dat zaaktype en `534730103` als initiator, verstuurde de OMC op 10 november 2026 een e-mail en zette een klantcontact in OpenKlant (`pnpm zgw:check --zaak=ZAAK-2026-0000000162`). Kies voor de ketentest dus een zaak met dat zaaktype, zoals `ZAAK-2026-0000000166` of `…0162`, en niet een zaak met zaaktype `1` ("test new"). Of de volgende status `informeren = true` heeft (voorwaarde 2), is nog niet bekend.

Stappen:
1. Zorg dat het kanaal voor de zaak gekozen is (fase 2, stap 5).
2. Laat een status op de zaak zetten.
3. **Bewijs:**
   - de e-mail komt binnen op `email-test-gebruiker`;
   - in OpenKlant staat een nieuw klantcontact van de OMC met kanaal `Email`, "gelukt" en het bericht-id van NotifyNL (`metadata.notifyNotificationId`). Dat toont `pnpm zgw:check --bsn=534730103 --zaak=<zaak>` onder "Klantcontacten van de OMC over de zaak".
4. **Tegenproef:** zet de keuze terug op "standaard" en zet weer een status. Het bericht gaat dan naar het standaardadres.

`zgw:check --zaak=…` zoekt de klantcontacten op de uuid, de identificatie en de URL van de zaak, want de spec zegt niet welke waarde de OMC als onderwerpobject gebruikt. Het bewijs is zo te herhalen zonder de logs van de beheerder. Het script toont de inhoud van het bericht niet.

## Openstaande aanvragen

| Aanvraag | Bij | Waarvoor | Blokkeert |
|---|---|---|---|
| Scope `notificaties.consumeren` voor onze client in Open Notificaties | Beheerder testomgeving | `zgw:check` laat zien dat de OMC op het kanaal `zaken` is ingeschreven | Niets: alleen die controle |
| Testzaak met een zaaktype dat de OMC oppakt, en een volgende status met `informeren = true` | Beheerder | Fase 3 | Fase 3 |
| Wie zet de status (of het recht `zaken.statussen.toevoegen`) | Beheerder | Fase 3 | Fase 3 |
| API-sleutel en specificatie van de verificatieservice van NotifyNL | Stakeholder | Echte verificatie van een adres (in plaats van de shortcut van het seedscript) | Alleen als dat bij het MVP hoort |

## Wat er in de code is veranderd

| Onderdeel | Bestand |
|---|---|
| Zaken van de ingelogde burger uit OpenZaak (`expand=rollen`, initiator zelf gecontroleerd) | `src/server/services/openzaak/openzaak-api-service.ts` (`fetchZakenVanGebruiker`) |
| `fetchZaken` op beide backends en de zaken in het antwoord van de communicatievoorkeuren | `klantcontact-backend-types.ts`, `klantcontact-openklant.ts`, `klantcontact-profieldienst.ts`, `klantcontact-communicatievoorkeuren.ts` |
| `portaalvoorkeur` telt als adres van de partij, niet als zaak; standaardadres op `isStandaardAdres` | `klantcontact-helpers.ts`, `klantcontact-route-handlers.ts` |
| Zaaktype van elke zaak uit de Catalogi API van hetzelfde OpenZaak | `src/server/services/openzaak/openzaak-api-service.ts` (`fetchZaaktypen`), `klantcontact-helpers.ts` (`fetchZaakVoorkeurZaken`) |
| Eén thema per zaaktype op Mijn contact, de rest onder "Zaken" | `src/client/apps/bob/pages/Thema/KlantContact/Communicatievoorkeuren/useZaakVoorkeurThemas.ts` |
| Kanalen en abonnementen van Open Notificaties | `src/server/services/opennotificaties/` |
| Scripts | `src/scripts/zgw-koppelingen-check.ts`, `zgw-testzaken.ts`, `zgw-testpersoon-seed.ts`, gedeelde hulpfuncties in `zgw-script-helpers.ts` |

Bij elk onderdeel horen tests (`*.test.ts` ernaast).

## Om op te letten

- **De testomgeving is gedeeld.**
  - Gebruik `999993653` niet: dat is van de producttests van de OMC.
  - Een bestaande partij kan van de tests van iemand anders zijn; daarom liever een BSN zonder partij.
- **De verificatie is een shortcut.** OpenKlant kent geen verificatie. Het seedscript zet de `verificatieDatum` zelf. Voor echte burgers moet de verificatie via NotifyNL gebouwd worden (code versturen, code controleren, dan `verificatieDatum` zetten).
- **Seedscript.** Gebouwd op de Klantinteracties-spec 0.7.0. Weigert OpenKlant iets, dan toont het script de foutmelding van de API. Gaat het mis na het aanmaken van de partij, dan staat er een partij zonder BSN. Het script meldt dat met de uuid. Opnieuw draaien vindt die partij niet en maakt een nieuwe.
- **De zakenlijst:**
  - alle zaken van de burger: de BFF volgt de pagina's van OpenZaak (`next`) tot de laatste, zonder vast maximum. Mislukt een pagina, dan geeft de BFF een fout en geen halve lijst. Hetzelfde geldt voor de rollen bij de eigenaarscontrole en voor het zoeken van de partij in OpenKlant;
  - alleen open zaken (zonder einddatum), want een afgesloten zaak krijgt geen notificaties meer;
  - alleen burgers, nog geen ondernemers (KVK).
- **Thema's uit OpenZaak.** Elk zaaktype is een eigen thema in de tabel. Versies van een zaaktype hebben dezelfde identificatie en vallen onder één thema.
  - Het zaaktype komt uit de Catalogi API van hetzelfde OpenZaak. Daarvoor heeft onze client de scope `catalogi.lezen` nodig. Zonder die scope, of als het zaaktype in een catalogus op een andere host staat, komt de zaak onder het thema **Zaken**. De kanaalkeuze werkt dan gewoon.
  - De BFF stuurt zijn token alleen naar de host van OpenZaak, ook als een zaak naar een zaaktype elders verwijst.
  - Een thema linkt naar Mijn contact zelf, want er is nog geen themapagina voor zaken uit OpenZaak.
  - Erfpacht staat er niet meer in: de zaken van Erfpacht komen uit Vernise en niet uit OpenZaak, dus de eigenaarscontrole zou een keuze altijd weigeren (403).
- **De eigenaarscontrole is streng.** Een kanaal kiezen kan alleen voor een zaak waarvan de ingelogde burger de initiator is (anders 403), en alleen voor een al geverifieerd adres van de burger zelf (anders 400). Zonder RSIN of bij een fout in OpenZaak weigert de BFF (503).
- **Feature toggle.** De zaakvoorkeuren staan aan buiten productie (`KLANT_CONTACT.zaakvoorkeuren`). In productie verschijnt het thema Zaken niet.
- **Open Notificaties is niet hetzelfde als NotifyNL.** De adressen eindigen allebei op `test.notifynl.nl`, maar het zijn twee aparte diensten:
  - Open Notificaties stuurt de gebeurtenissen van OpenZaak door naar de OMC. Wij lezen het alleen uit, en daarvoor is een scope nodig.
  - NotifyNL verstuurt de berichten, en dat doet de OMC. Wij hebben er alleen toegang toe nodig voor de verificatie van adressen.
- **Gedeeld hulpbestand.** De scripts gebruiken `src/scripts/zgw-script-helpers.ts` voor de uitvoer, het maskeren van adressen en de nep-login. De scripts tonen adressen gemaskeerd (`****@gmail.com`).
- **Bekende fouten die er al waren.** `tsc` geeft fouten in `ValueInputAndValidation.tsx`, `ContactmomentenTable.tsx` en `generate-user-data-overview.ts`. Die staan los van deze koppeling.
