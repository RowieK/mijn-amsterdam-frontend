# Technisch plan van aanpak: communicatievoorkeur per zaak

| | |
|---|---|
| Status | Concept, ter afstemming |
| Domein | Klantcontact (`src/server/services/klantcontact/`, `src/client/apps/bob/pages/Thema/KlantContact/`) |
| Gebruik | Eerst Amsterdam, daarna meerdere gemeenten (zie sectie 4) |
| Externe systemen | OpenKlant 2 (Klantinteracties API), OpenZaak (Zaken API), Open Notificaties, NotifyNL-OMC, Notify NL |

## 1. Aanleiding en doel

Burgers en ondernemers moeten per zaak kunnen kiezen via welk kanaal ze een notificatie krijgen, bijvoorbeeld SMS voor zaak A en e-mail voor zaak B. Alle kanalen moeten als keuze beschikbaar zijn.

De oplossing wordt uiteindelijk door meerdere gemeenten gebruikt. OpenKlant, OpenZaak en Notify NL zijn open API's die elke gemeente zelf draait of via een leverancier afneemt. Alleen wat echt Amsterdam-specifiek is (configuratie, de profielservice, de UI in Mijn Amsterdam) mag Amsterdam-specifiek zijn. De rest moet per gemeente te configureren zijn.

### Scope

- Per zaak een kanaal (en adres) vastleggen, wijzigen en verwijderen vanuit Mijn Amsterdam.
- Vastleggen in OpenKlant op een manier die de Notify NL-keten (OMC) zonder aanpassing oppikt.
- SMS (telefoonnummer) als volwaardig kanaal ondersteunen, inclusief verificatie.
- Een gemeente-onafhankelijke kern: alles wat met OpenKlant, OpenZaak of Notify NL praat kent geen Amsterdam-specifieke URL's, thema's of begrippen. Die komen uit configuratie.

### Buiten scope

- Het versturen van notificaties. Dat doet de OMC via Notify NL (zie sectie 3); Mijn Amsterdam stuurt zelf niets.
- Wijzigingen in OpenKlant, OpenZaak, Open Notificaties of de OMC zelf.
- Meerdere gemeenten in één draaiende instantie (runtime-tenants). Uitgangspunt is één deployment per gemeente (open punt 10).

## 2. Uitgangssituatie in deze repo

OpenKlant, OpenZaak en Notify NL zijn open API's, maar worden in dit project nergens direct aangeroepen. Er is wel een communicatievoorkeuren-flow die via de profielservice (`BFF_PROFIEL_API_BASE_URL`) praat. Die gebruikt OpenKlant-begrippen (`partij`, `contactgegevens`, `isGeverifieerd`, `isDefault`); vermoedelijk is het een laag boven OpenKlant. Dat is niet bevestigd, en dus ook niet of andere gemeenten die laag hebben (open punt 8).

| Bestand | Rol |
|---|---|
| `klantcontact-service-config.ts` | Routes, feature toggle `KLANT_CONTACT.communicatievoorkeuren`, upstream-URL's |
| `klantcontact-profieldienst.ts` | Upstream-calls: `POST /partij`, `GET /dienstverlener/{naam}`, `POST /contactgegeven`, `DELETE /contactgegeven/{id}`, `POST /emailverificatie` |
| `klantcontact-profieldienst-types.ts` | API-formaat (Source- en Frontend-types) |
| `klantcontact-communicatievoorkeuren.ts` | Combineert profiel, dienstverlener en adres tot het frontend-model |
| `klantcontact-helpers.ts` | Mapping Source naar Frontend, `getMostRecentByContactgegevenType` |
| `klantcontact-route-handlers.ts`, `klantcontact-router.ts` | BFF-endpoints `/services/klantcontact/contactgegeven/{create,verify,delete}` |
| `Communicatievoorkeuren/useCommunicatieVoorkeuren.ts`, `config/api.ts` | Client-hooks en BFF-URL's |

### Gaps

1. Er is geen koppeling tussen een contactgegeven en een zaak.
2. `createContactgegeven` zet altijd `isDefault: true`. Elk nieuw adres wordt dus het standaardadres.
3. Alleen e-mail werkt: telefoonnummer staat hard op `disabled: true`, `verifyContactgegeven` stuurt alleen naar `/emailverificatie`, `handleVerifyContactgegeven` weigert alles behalve `Email`.
4. UI is een stub: `useCommunicatieVoorkeurBevestigen` doet alleen `console.info`.
5. Geen enkel thema in Mijn Amsterdam haalt zaken uit OpenZaak. Zaken komen uit Decos, ZorgNed, Powerbrowser en andere bronnen.
6. `fetchDienstverlener` voegt tijdelijk een nep-dienst `zorgned` toe.
7. De configuratie is enkelvoudig en staat op moduleniveau: `profieldienstRequestConfig` leest één `BFF_PROFIEL_API_BASE_URL` uit de omgeving. Voor meerdere gemeenten moet de configuratie als gegeven worden doorgegeven (WP1).

## 3. Hoe de externe keten werkt

Bron: broncode van [Worth-NL/NotifyNL-OMC](https://github.com/Worth-NL/NotifyNL-OMC) (commit `50f5286`, release v.2.3.2) en de Klantinteracties-OpenAPI van [Open Klant](https://github.com/maykinmedia/open-klant).

```
OpenZaak ──(status op zaak)──► Open Notificaties ──(kanaal "zaken")──► NotifyNL-OMC
                                                                         │
                     1. GET /rollen?zaak=…&omschrijvingGeneriek=initiator (OpenZaak)  → BSN/KVK
                     2. GET /partijen?partijIdentificator__…&expand=digitaleAdressen (OpenKlant)
                     3. kies digitaal adres (zie hieronder)
                     4. POST /v2/notifications/email of /sms (Notify NL)
                     5. klantcontact registreren in OpenKlant
```

### Hoe de OMC het adres kiest

In `PartyResults.TrySelectAddress` kiest de OMC per notificatie één digitaal adres van de partij, in deze volgorde:

1. **Het adres waarvan `referentie` gelijk is aan `zaak.identificatie`.** Dit is het mechanisme voor een voorkeur per zaak.
2. Het adres waar `partij.voorkeursDigitaalAdres` naar wijst.
3. Het adres met `isStandaardAdres: true` (e-mail gaat voor telefoon).
4. Het adres met `referentie: "portaalvoorkeur"` (conventie van Den Haag).

Valt alles af, dan krijgt de burger niets. Er is geen terugval op "het eerste adres".

Het kanaal volgt uit `soortDigitaalAdres`: `email` wordt e-mail, `telefoonnummer` wordt SMS. `overig` wordt genegeerd.

### OpenKlant: `DigitaalAdres`

Endpoint `/klantinteracties/api/v1/digitaleadressen`. Relevante velden:

| Veld | Type | Opmerking |
|---|---|---|
| `verstrektDoorPartij` | `{ uuid }` | Koppeling aan de partij (burger of onderneming) |
| `soortDigitaalAdres` | `email` \| `telefoonnummer` \| `overig` | Bepaalt het kanaal |
| `adres` | string, max 80 | E-mailadres of telefoonnummer |
| `referentie` | string, max 50, patroon `^[-a-zA-Z0-9_]+$` | **Hier komt de zaakidentificatie** |
| `isStandaardAdres` | boolean | Sinds OpenKlant 2.4.0 |
| `verificatieDatum` | date (geen tijdstip), nullable, schrijfbaar | Filter `isGeverifieerd` beschikbaar |
| `omschrijving` | string, max 40 | Vrij label |

Filters op de lijst: onder andere `referentie`, `soortDigitaalAdres`, `isStandaardAdres`, `isGeverifieerd`, `verstrektDoorPartij__uuid` en `verstrektDoorPartij__partijIdentificator__objectId`.

### Standaard of per gemeente

| Onderdeel | Gelijk voor alle gemeenten | Verschilt per gemeente |
|---|---|---|
| OpenKlant (Klantinteracties API) | Resources en velden (`DigitaalAdres`, `referentie`, `soortDigitaalAdres`), filters | Basis-URL, authenticatie, versie (`isStandaardAdres` vanaf 2.4.0) |
| OpenZaak (Zaken API) | Resources en velden (`zaak`, `rol`) | Basis-URL, authenticatie, welke zaaktypen er in staan, en of de gemeente OpenZaak of een ander ZGW-zaaksysteem gebruikt |
| Open Notificaties | Standaard Notificaties API | Abonnementen en routering naar de OMC |
| NotifyNL-OMC | Hoe hij een adres kiest (v.2.3.2) | Of hij draait, welke versie en welke conventies erbij horen (Den Haag gebruikt `portaalvoorkeur`) |
| Notify NL | API voor e-mail en SMS | Eigen service, API-sleutel en sjablonen |
| Verificatie van een adres | OpenKlant bewaart alleen `verificatieDatum` | Een code versturen en controleren is geen onderdeel van de standaard. Amsterdam doet dit in de profielservice (`/emailverificatie`). |
| Zaakidentificatie | Patroon van `referentie` (`^[-a-zA-Z0-9_]+$`, max 50) | Formaat van de identificaties in het zaaksysteem |

### Gevolgen voor dit plan

- **Een voorkeur per zaak is een extra digitaal adres** met `referentie = zaak.identificatie`. Er is geen apart voorkeur-object nodig.
- **Gebruikt iemand hetzelfde e-mailadres voor drie zaken**, dan zijn dat drie `DigitaalAdres`-records met elk een eigen `referentie`.
- **Per zaak zijn alleen e-mail en SMS mogelijk.** Post (brief), Berichtenbox (MijnOverheid) en de Amsterdam App zijn in de OMC aparte scenario's en kunnen niet per zaak worden gekozen. "Geen notificatie" kan ook niet per zaak. De eis "alle kanalen" is dus alleen haalbaar met een aanpassing in de OMC of een productkeuze (zie open punt 4).
- **Alleen zaken in OpenZaak tellen.** De OMC luistert naar OpenZaak. Een keuze voor een Decos- of ZorgNed-zaak doet niets, tenzij die zaak ook in OpenZaak staat met dezelfde identificatie.
- **Zaakidentificatie moet in het patroon passen.** Identificaties met `/` of spaties (zoals sommige Decos-nummers) mogen niet in `referentie`.
- **De adreskeuze op `referentie` is een conventie van de OMC, geen standaard.** Een gemeente zonder OMC, of met een andere versie of configuratie, volgt die niet vanzelf. De referentiestrategie moet daarom per gemeente configureerbaar zijn (sectie 4).

## 4. Ontwerp

### Meerdere gemeenten

Uitgangspunten:

- **Kern en adapters.** De kern (zaakvoorkeur zetten, wijzigen, verwijderen, valideren) praat tegen een kleine interface, `KlantcontactBackend`. Wat Amsterdam-specifiek is zit in een adapter erachter.
- **Configuratie als gegeven.** Alle URL's, authenticatie en conventies zitten in één object, `GemeenteKlantcontactConfig`, dat aan de kern wordt meegegeven. De kern leest zelf geen omgevingsvariabelen.
- **Eén deployment per gemeente.** De config wordt bij het opstarten uit de omgeving opgebouwd. Runtime-tenants zijn niet nodig zolang elke gemeente zijn eigen BFF draait (open punt 10).
- **Conventies zijn instellingen.** Hoe een zaak in `referentie` terechtkomt en welke kanalen per zaak kunnen, volgt uit de config, niet uit constanten in de kern.
- **Een duidelijke grens in de code.** De kern importeert niets uit Amsterdam-specifieke modules (thema's, Decos, ZorgNed). Dan kan hij later zonder herschrijven naar een eigen pakket (open punt 9).

`GemeenteKlantcontactConfig`:

| Veld | Doel |
|---|---|
| `openKlant` | Basis-URL en authenticatie van de Klantinteracties API. Alleen nodig bij de `openklant`-adapter. |
| `profielservice` | Basis-URL van de profielservice. Alleen nodig bij de `profielservice`-adapter (Amsterdam). |
| `openZaak` | Basis-URL en authenticatie van de Zaken API, om te controleren dat een zaak van de gebruiker is. |
| `notifyNl` | Basis-URL en API-sleutel. Alleen nodig als de gemeente adressen zelf moet verifiëren (open punt 11). |
| `zaakVoorkeur.referentie` | Hoe een zaak naar een `referentie` wordt omgezet. Standaard de zaakidentificatie (OMC v.2.3.2). Geeft `null` als het resultaat niet in het patroon past. |
| `zaakVoorkeur.kanalen` | Welke kanalen per zaak worden aangeboden. Standaard `Email` en `Telefoonnummer`. |

`KlantcontactBackend` heeft de operaties `fetchContactgegevens`, `createContactgegeven` (met optionele `referentie` en `isDefault`), `deleteContactgegeven`, `verifyContactgegeven` en `zaakIsVanGebruiker`.

| Adapter | Voor wie | Opmerking |
|---|---|---|
| `profielservice` | Amsterdam | Zet de bestaande calls uit `klantcontact-profieldienst.ts` achter de interface. Eerst te bouwen, want die infrastructuur bestaat al. |
| `openklant` | Gemeenten zonder profielservice | Praat direct met de Klantinteracties API: partij zoeken op BSN of KVK (`partijIdentificator`), `DigitaalAdres` aanmaken en verwijderen. Verificatie is een aparte stap (open punt 11). Pas bouwen als blijkt dat de profielservice niet herbruikbaar is (open punt 8). |

### Ontwerp van de zaakvoorkeur

- **Eerst via de profielservice (Amsterdam-adapter).** Dan blijven auth, caching en foutafhandeling (`requestData`, `getCustomApiConfig`) gelijk. Voorwaarde: de profielservice geeft `referentie` door en terug (open punt 1). Lukt dat niet, dan wordt de `openklant`-adapter de eerste.
- **Een zaakvoorkeur is een contactgegeven met `referentie`.** De bestaande `createContactgegeven` en `deleteContactgegeven` worden hergebruikt.
- **Zaakgebonden adressen tellen niet als standaardadres.** `getMostRecentByContactgegevenType` moet contactgegevens met een `referentie` overslaan, anders verschijnt een zaakadres als "Mijn contactgegevens".
- **Per zaak maximaal één adres.** Bij wijzigen eerst het oude zaakadres verwijderen. De OMC pakt het eerste adres met een overeenkomende `referentie`, dus duplicaten maken het gedrag onvoorspelbaar.
- **Alleen geverifieerde adressen.** De BFF controleert dit, niet alleen de UI.
- **Feature toggle** `KLANT_CONTACT.zaakvoorkeuren` (nieuw, in `src/server/config/feature-toggles.ts`, aan buiten productie).

## 5. Werkpakketten

### WP0: Afstemming (blokkerend)

Beantwoord open punten 1 tot en met 5 en 8 tot en met 10 (sectie 7) met de beheerders van de profielservice, OpenKlant en de OMC, en met het team. De uitkomst bepaalt de opzet van WP1 en de exacte payloads in WP3 en WP4.

Oplevering: bevestigde endpoints en velden, OMC-versie (minimaal v.2.3.2), een lijst van thema's waarvan de zaken in OpenZaak staan, en de keuze voor adapter en plek van de code.

### WP1: Gemeente-configuratie en interface

Doel: de bestaande code gemeente-onafhankelijk maken, zonder gedragswijziging.

- `GemeenteKlantcontactConfig` (sectie 4) en één functie die de Amsterdam-config uit de omgeving opbouwt. Die vervangt het gebruik van `profieldienstRequestConfig` op moduleniveau.
- Interface `KlantcontactBackend` met de operaties uit sectie 4.
- Adapter `profielservice`: de bestaande calls uit `klantcontact-profieldienst.ts` erachter. De bestaande service-functies krijgen de backend en config als argument.
- Referentiestrategie als functie: zaak in, `referentie` of `null` uit. Voor Amsterdam is dat de zaakidentificatie.

Oplevering: bestaande tests blijven groen, de kern importeert niets uit Amsterdam-specifieke modules.

### WP2: Types en mapping

De types in `klantcontact-profieldienst-types.ts` beschrijven het formaat van de profielservice-adapter. De kern en de frontend gebruiken de Frontend-types; de adapter vertaalt.

In `klantcontact-profieldienst-types.ts`:

| Type | Wijziging |
|---|---|
| `ContactgegevenSource` | Nieuw optioneel veld `referentie` (OpenKlant `DigitaalAdres.referentie`) |
| `ContactgegevenPayloadSource` | Nieuw optioneel veld `referentie` (de zaakidentificatie) |
| `ZaakKanaal` (nieuw) | De kanalen die de OMC per zaak kan bedienen: `Email` en `Telefoonnummer` |
| `ZaakKanaalVoorkeurFrontend` (nieuw) | Zaakidentificatie plus het bijbehorende contactgegeven (kanaal en adres) |
| `ZaakKanaalVoorkeurPayloadFrontend` (nieuw) | Wat de frontend instuurt: zaakidentificatie, kanaal en adres |
| `CommunicatievoorkeurenResponseFrontend` | Nieuwe lijst `zaakKanaalVoorkeuren` naast de bestaande velden |
| `CommunicatievoorkeurPayloadFrontend` | Vervalt (wordt nergens gebruikt) |

In `klantcontact-helpers.ts`:

- Nieuwe constante `ZAAK_REFERENTIE_PATTERN` met het patroon en de maximale lengte van OpenKlant `referentie`.
- Nieuwe functie `getZaakKanaalVoorkeuren`: haalt uit de profielresponse alle contactgegevens met een `referentie` en zet ze om naar `ZaakKanaalVoorkeurFrontend`. Bij een mislukte profielresponse geeft hij een lege lijst.
- `getMostRecentByContactgegevenType` slaat contactgegevens met een `referentie` over.

### WP3: Service-functies

Deze functies gebruiken `KlantcontactBackend` en de config uit WP1, niet rechtstreeks de profielservice-functies.

In `klantcontact-profieldienst.ts`:

- `createContactgegeven` krijgt een optioneel argument met `referentie` en `isDefault`. Zonder dat argument blijft het gedrag zoals nu (`isDefault: true`, geen referentie), zodat bestaande aanroepen niet veranderen.

In `klantcontact-communicatievoorkeuren.ts`:

- **`setZaakKanaalVoorkeur` (nieuw)**, in drie stappen:
  1. Het huidige zaakadres opzoeken via `fetchProfiel` en `getZaakKanaalVoorkeuren`.
  2. Als dat bestaat, het verwijderen met `deleteContactgegeven`.
  3. Een nieuw adres aanmaken met `createContactgegeven`, met de zaakidentificatie als `referentie` en `isDefault: false`. Anders wordt het het standaardadres van de partij.
- **`deleteZaakKanaalVoorkeur` (nieuw)**: zoekt het zaakadres op en verwijdert het met `deleteContactgegeven`. De OMC valt daarna terug op het standaardadres.
- **`fetchCommunicatievoorkeuren`**: vult de nieuwe lijst `zaakKanaalVoorkeuren` met `getZaakKanaalVoorkeuren`.

### WP4: SMS als volwaardig kanaal

- `klantcontact-communicatievoorkeuren.ts`: `disabled: true` bij `Telefoonnummer` weghalen.
- `verifyContactgegeven`: type-afhankelijk maken (payloadveld en endpoint). Staat al als TODO in de code; endpoint volgt uit WP0.
- `handleVerifyContactgegeven`: `Telefoonnummer` toestaan.
- `VerifyVerificationRequestPayload`: variant voor telefoon.
- `ValueInputAndValidation.tsx`: alleen mobiele nummers accepteren (SMS).
- Verificatie hoort bij de adapter. Voor gemeenten zonder profielservice is het een eigen stap (open punt 11).

### WP5: BFF-routes en handlers

Volgorde conform `agents.server.md`: eerst config, dan router en handlers.

1. `klantcontact-service-config.ts`: `ZAAKVOORKEUR_SET` en `ZAAKVOORKEUR_DELETE` in `routes`, plus de toggle.
2. `klantcontact-route-handlers.ts`: `handleSetZaakKanaalVoorkeur` en `handleDeleteZaakKanaalVoorkeur`.
3. `klantcontact-router.ts`: routes registreren.

Validatie in `handleSetZaakKanaalVoorkeur`:

- `kanaal` is `Email` of `Telefoonnummer`; `value` aanwezig.
- `zaakIdentificatie` levert via de referentiestrategie uit de config een `referentie` op die voldoet aan `ZAAK_REFERENTIE_PATTERN`.
- De zaak hoort bij de ingelogde gebruiker (`zaakIsVanGebruiker` van de backend; de implementatie verschilt per gemeente). Anders kan iemand het kanaal voor andermans zaak omleiden.
- Het adres is geverifieerd, of is gelijk aan een al geverifieerd standaardadres (afhankelijk van open punt 3).

### WP6: Mock-server

Nieuwe route in `src/mocks-server/routes/` voor `/profielservice` (`/partij`, `/dienstverlener/*`, `/contactgegeven`, verificatie), met contactgegevens zonder en met `referentie`. Nu bestaat er geen mock. Fixtures blijven gescheiden van testdata.

### WP7: Frontend

1. `config/api.ts`: `KLANTCONTACT_ZAAKVOORKEUR_SET` en `KLANTCONTACT_ZAAKVOORKEUR_DELETE`.
2. `useCommunicatieVoorkeuren.ts`: hooks `useSetZaakKanaalVoorkeur` en `useVerwijderZaakKanaalVoorkeur`, naar het voorbeeld van `useSetCommunicatievoorkeur`. `useCommunicatieVoorkeurBevestigen` vervangen.
3. Component voor de kanaalkeuze per zaak: keuze uit geverifieerde e-mail en telefoonnummer, plus "standaard" (= zaakadres verwijderen). Lege staat met link naar instellen als er geen geverifieerd adres is.
4. Op de detailpagina van een zaak (eerst één thema, zie WP8) de keuze tonen met de zaakidentificatie.
5. `updateCommunicatievoorkeurState` uitbreiden. Let op: `mergeAppState` vervangt arrays mogelijk in plaats van ze samen te voegen.

### WP8: Zaken uit OpenZaak (afhankelijkheid)

De keuze werkt alleen voor zaken die in OpenZaak staan. Kies samen met het team één thema waarvan de zaken (ook) in OpenZaak staan en controleer dat de identificatie in Mijn Amsterdam gelijk is aan `zaak.identificatie` in OpenZaak. Staat er nog geen enkel thema in OpenZaak, dan is een nieuwe OpenZaak-service in `src/server/services/` nodig. Dat is een apart traject.

### WP9: Opruimen

- Tijdelijke `zorgned`-dienst in `fetchDienstverlener` weghalen zodra de API echte data levert.
- Ongebruikt `CommunicatievoorkeurPayloadFrontend` verwijderen.

## 6. Testplan

Conform `agents.server.md`: tests naast de code, upstream-HTTP gestubd met `remoteApi`, geen echt netwerk.

| Laag | Wat |
|---|---|
| Helpers | `getZaakKanaalVoorkeuren`; `getMostRecentByContactgegevenType` slaat adressen met `referentie` over; `ZAAK_REFERENTIE_PATTERN` (geldig, met `/`, langer dan 50) |
| Service | `createContactgegeven` zonder opties is ongewijzigd (`isDefault: true`); met `referentie` gaat `isDefault: false` en `referentie` mee; `setZaakKanaalVoorkeur` verwijdert eerst het oude zaakadres |
| Handlers | ongeldig kanaal, ongeldige zaakidentificatie, zaak niet van gebruiker, ongeverifieerd adres (`ResponseAuthenticatedMock`, `getReqMockWithOidc`) |
| Toggle | uit-staat met `vi.resetModules()` en `vi.doMock(...)` |
| Gemeente-config | Dezelfde service-tests draaien met twee configs: Amsterdam (`profielservice`) en een fictieve gemeente met een andere referentiestrategie. Controle dat de kern niets uit Amsterdam-specifieke modules importeert. |
| Client | `useCommunicatieVoorkeuren.test.ts`, `CommunicatieVoorkeuren.test.tsx` uitbreiden |

Uitvoeren: `CI=1 pnpm run bff-api:test:dirs src/server/services/klantcontact -- --run --reporter=verbose`, daarna `pnpm lint`.

Ketentest (handmatig, op een testomgeving): zaakadres zetten in Mijn Amsterdam, status op de zaak in OpenZaak wijzigen, controleren dat de OMC-dashboard of logregel "digital address is linked to case" toont en dat de notificatie via het gekozen kanaal binnenkomt.

## 7. Open punten

| # | Vraag | Bij wie | Impact |
|---|---|---|---|
| 1 | Geeft de profielservice `referentie` (en `isStandaardAdres`, `verificatieDatum`) van OpenKlant door, en kan `POST /contactgegeven` een `referentie` meekrijgen? | Profielservice | Zo niet: profielservice uitbreiden of directe OpenKlant-client |
| 2 | Draait Amsterdam de NotifyNL-OMC, en welke versie? Selectie op `referentie` = zaakidentificatie zit in v.2.3.2. Dezelfde vraag stelt zich per nieuwe gemeente. | Beheer notificaties | Zonder OMC geldt deze conventie niet |
| 3 | Moet een tweede `DigitaalAdres` met hetzelfde adres opnieuw geverifieerd worden? Stuurt `POST /contactgegeven` dan weer een code? | Profielservice | UX en validatie in WP5 |
| 4 | "Alle kanalen": per zaak kan de OMC alleen e-mail en SMS. Accepteren we dat, of wordt de OMC uitgebreid voor post, Berichtenbox, App en "geen"? | Product en OMC | Scope |
| 5 | Welke thema's hebben zaken in OpenZaak, en voldoen hun identificaties aan `^[-a-zA-Z0-9_]+$` (max 50)? | Zaaksystemen | WP8, haalbaarheid |
| 6 | Zet de profielservice `voorkeursDigitaalAdres` op de partij? Die gaat in de OMC vóór `isStandaardAdres`. | Profielservice | Terugval na verwijderen van een zaakvoorkeur |
| 7 | Welk endpoint verifieert een telefoonnummer? | Profielservice | WP4 |
| 8 | Is de profielservice een generiek product dat andere gemeenten ook kunnen draaien, of is hij Amsterdam-specifiek? | Beheerders profielservice | Generiek: één adapter volstaat. Anders komt er een `openklant`-adapter bij (partij zoeken en aanmaken, verificatie) |
| 9 | Waar leeft de herbruikbare code: in deze repo (map `klantcontact/` met strikte grens, later te extraheren) of direct in een eigen pakket of repo? | Team, architectuur | Repo-structuur en eigenaarschap in WP1 |
| 10 | Eén deployment per gemeente, of meerdere gemeenten in één instantie? Dit plan gaat uit van het eerste. | Architectuur, beheer | Config bij opstarten (WP1) of per request bepalen welke gemeente aan de beurt is |
| 11 | Hoe verifiëren andere gemeenten een adres? OpenKlant kent alleen `verificatieDatum`; een code versturen en controleren moet ergens anders. Kan dat via Notify NL, en waar staat de code zolang hij geldig is? | Product, architectuur | WP4, extra stap in de `openklant`-adapter |
| 12 | Welke gemeenten volgen na Amsterdam, en welke OMC-versie en adresselectie gebruiken zij? | Product | Bepaalt welke configuratieopties nodig zijn (bijvoorbeeld `portaalvoorkeur`) |

### Uitkomst API-specificaties (testomgeving, 29 oktober 2026)

Bron: de OpenAPI-specs van de testomgeving (`/schema/openapi.json` achter de Redoc-pagina's): Klantinteracties 0.7.0, Contactgegevens 1.1.1, Open Notificaties 1.0.0, Documenten API 1.4.2 en Zaken API 1.5.1. De Zaken API staat op dezelfde host (`/zaken/api/v1/`); de aangeleverde OpenZaak-link was de Documenten API en beantwoordt geen enkel open punt. Daarnaast de [OMC-documentatie](https://omc-notify.gitbook.io/omc-notify-docs/) (changelog t/m v2.0.0) en de [Notify NL API-spec](http://docs.notifynl.nl/api-reference.html) (v2). Een spec beschrijft alleen het contract, niet wat de profielservice of de OMC doet.

| # | Wat de specs zeggen | Status |
|---|---|---|
| 1 | `DigitaalAdres` heeft `referentie`, `isStandaardAdres` en `verificatieDatum`, en de lijst filtert op `referentie` (exact), `isStandaardAdres` en `isGeverifieerd`. OpenKlant kan het dus. Of de profielservice ze doorgeeft staat niet in deze specs. | Open, vraag aan profielservice |
| 2 | De OMC-docs beschrijven de scenario's (zaak aangemaakt, gewijzigd, afgesloten), maar niet de adresselectie of `referentie`. Dat de OMC een voorkeursadres per zaak kan overschrijven blijkt alleen uit de changelog (v1.14.0, "op basis van zaaknummer"). De bron blijft de code (v.2.3.2). Of de OMC op de testomgeving is ingetekend, zie je in `GET /abonnement` van Open Notificaties (`callbackUrl`), met een token. | Open, te controleren met een token |
| 3 | `verificatieDatum` hoort bij één `DigitaalAdres`-record en is schrijfbaar. Een nieuw record met hetzelfde adres begint dus zonder datum. Een directe OpenKlant-client kan de datum bij het aanmaken meegeven als hetzelfde adres al geverifieerd is. Wat de profielservice doet, blijft een vraag. | Gedeeltelijk |
| 4 | `soortDigitaalAdres` is alleen `email`, `telefoonnummer` of `overig`. Post, Berichtenbox en App bestaan niet als kanaal in OpenKlant. De Notify NL-API kan wel brieven en Berichtenbox versturen (`/v2/notifications/letter` en `/berichtenbox`), maar per zaak kiezen kan in de OMC alleen voor e-mail en sms (sectie 3). De rest is een productkeuze. | Bevestigd, product beslist |
| 5 | `Zaak.identificatie` heeft `maxLength: 40` en in de spec geen patroon. De lengte past dus altijd in `referentie` (max 50), de tekens niet gegarandeerd. De identificatie is uniek binnen de verantwoordelijke organisatie, niet globaal; `/zaken` filtert daarom ook op `bronorganisatie`. Welke thema's in OpenZaak staan blijft een vraag. | Gedeeltelijk |
| 6 | `Partij.voorkeursDigitaalAdres` bestaat (nullable, bij te werken met `PATCH /partijen/{uuid}`). Of de profielservice hem zet, is niet te zien. | Open, vraag aan profielservice |
| 7 | OpenKlant heeft geen verificatie-endpoint, alleen `verificatieDatum`. Notify NL heeft er wel een, voor e-mail en sms met dezelfde endpoints (zie "Verificatie via Notify NL" hieronder). Welk endpoint de profielservice voor telefoon aanbiedt, en of hij die Notify NL-API gebruikt, staat in geen van de docs. | Gedeeltelijk, vraag aan profielservice |
| 11 | Ja, via Notify NL. De Open Notificaties-instantie op de `notifynl.nl`-host is alleen het routeringscomponent (kanalen, abonnementen, `POST /notificaties`) en kan niets versturen. Notify NL heeft een aparte verificatieservice (`https://verify.notifynl.nl/api`) die de code verstuurt en controleert; de service houdt de code zelf bij. Geldigheidsduur, aantal pogingen en of de service een JWT vraagt, staan niet in de spec. | Grotendeels beantwoord, details open |

Verificatie via Notify NL (open punten 7 en 11):

| Stap | Aanroep | Opmerking |
|---|---|---|
| Code versturen | `POST https://verify.notifynl.nl/api/verification-requests` met `email` **of** `phoneNumber` (E.164, `+31612345678`), optioneel `reference` en `templateId` | Antwoord `201 { success: true }`. Notify NL verstuurt de code zelf. |
| Code controleren | `POST …/verification-requests/verify` met `code` plus `reference`, anders `email`, anders `phoneNumber` | `200 { verified, verifiedOn }`. `400 { verified: false, reason }` bij onjuiste of verlopen code, `404` als er geen verzoek is. |

- **`reference` is de sleutel waarmee het verzoek terug wordt gevonden** en heeft voorrang op e-mail en telefoonnummer. Gebruik per verzoek een unieke waarde zonder persoonsgegevens (dus geen BSN of KVK). Het voorbeeld in de spec gebruikt een zaaknummer, maar dat is niet uniek per adres.
- **Telefoonnummers naar E.164 omzetten** (`06…` en `0031…` worden `+316…`), anders is de terugval op `phoneNumber` onbetrouwbaar. OpenKlant accepteert zowel `06…` als `+31…`.
- **Na een geslaagde `verify`** hoort `verificatieDatum` op het `DigitaalAdres` te komen (de datum uit `verifiedOn`). Dat is een `PATCH /digitaleadressen/{uuid}` voor de `openklant`-adapter. Bij de `profielservice`-adapter loopt dat via de profielservice (`isGeverifieerd`).
- **Internationale sms moet per dienst aan staan** (anders de fout `Cannot send to international mobile numbers`). Dat past bij "alleen mobiele nummers" in WP4, maar dan dus alleen Nederlandse.

Nieuwe aandachtspunten uit de specs en docs:

- **De OMC verstuurt niet voor elke zaak.** Alleen bij een nieuwe status (`kanaal = zaken`, `resource = status`, `actie = create`) waarvan het statustype `informeren = true` heeft, en waarvan `zaaktype.identificatie` in de whitelist van dat scenario staat (`ZGW_WHITELIST_ZAAKCREATE_IDS`, `…UPDATE…`, `…CLOSE…`). Een zaakvoorkeur kan dus ook voor een zaak in OpenZaak zonder effect blijven. Dat verhoogt het risico "keuze zonder effect" (sectie 8). Per zaaktype moeten we bij beheer navragen of het in de whitelist staat.
- **OMC-eisen per gemeente (open punt 12):** OpenKlant 2.12.0 of hoger (sinds OMC v1.17.0), `OMC_FEATURE_WORKFLOW_VERSION=2` voor OpenKlant 2 en ondernemers (KVK), en `ZGW_AUTH_KEY_OPENKLANT`. De docs-changelog stopt bij v2.0.0 en de analyse in sectie 3 gaat uit van v.2.3.2, dus de docs lopen achter op de code.
- **Oudere OMC-versies zijn strenger.** Volgens de changelog (v1.17.2) is zonder `voorkeursAdres` een digitale verwijzing naar de zaak nodig om te kunnen versturen. In v.2.3.2 volgt daarna nog `isStandaardAdres`. Een gemeente met een oudere OMC kan dus zonder terugval op het standaardadres zitten. Dat is een extra reden om de OMC-versie per gemeente vast te stellen.
- **Notify NL heeft geen aparte testomgeving** ("Alle tests vinden plaats in de productieomgeving"). Een testsleutel levert status `delivered` zonder iets te versturen. Voor de ketentest met echte sms is een sleutel voor team en gastlijst nodig (teamleden plus maximaal 5 gasten).

- **`zaakIsVanGebruiker` (WP5) is in OpenZaak uit te drukken met een filter.** `GET /rollen?zaak=…&betrokkeneIdentificatie__natuurlijkPersoon__inpBsn=…` (of `…nietNatuurlijkPersoon__kvkNummer` / `…vestiging__kvkNummer` voor ondernemers), of `GET /zaken?identificatie=…&bronorganisatie=…&rol__betrokkeneIdentificatie__natuurlijkPersoon__inpBsn=…`. Zonder `bronorganisatie` kan een identificatie meerdere zaken opleveren. Dat moet de check afvangen.
- **Telefoonnummers: OpenKlant accepteert ook vaste nummers.** Het patroon is `^(0[1-9][0-9]{8}|\+[0-9]{9,15}|00[0-9]{7,13})$` (0800, 0900, 088 en 14xx zijn uitgesloten). "Alleen mobiel" (WP4) is dus een eigen regel in `ValueInputAndValidation.tsx` en niet iets dat OpenKlant afdwingt.
- **Geen uniciteit op `referentie`.** De spec kent geen uniekheidsregel, dus twee adressen met dezelfde `referentie` zijn mogelijk. Dat onderbouwt "per zaak maximaal één adres" (sectie 4) als eigen controle.
- **`isStandaardAdres` is "het standaardadres voor het `soortDigitaalAdres`".** De spec zegt niet wat er gebeurt als er twee zijn. Zaakadressen met `isStandaardAdres: false` aanmaken blijft dus de veilige keuze. Wat OpenKlant doet bij een tweede `true` is op de testomgeving uit te proberen.
- **Zoeken van de partij voor de `openklant`-adapter:** `GET /partijen?partijIdentificator__codeSoortObjectId=bsn|kvk_nummer&partijIdentificator__objectId=…&expand=digitaleAdressen`. De toegestane waarden zijn `bsn`, `vestigingsnummer`, `kvk_nummer` en `rsin`.
- **Versieverschil.** De testomgeving meldt Klantinteracties 0.7.0, terwijl de Bronnen hieronder de spec van master (0.9.1) noemen. `isStandaardAdres`, `referentie` en `isGeverifieerd` staan wel in de 0.7.0-spec, maar per gemeente moet de versie gecontroleerd worden (sectie 3, "Standaard of per gemeente").

## 8. Risico's

- **Keuze zonder effect:** een voorkeur voor een zaak die niet in OpenZaak staat, of met een afwijkende identificatie, wordt stil genegeerd. Mitigatie: keuze alleen tonen bij zaken uit OpenZaak (WP8).
- **Standaardadres overschreven:** `createContactgegeven` zet nu altijd `isDefault: true`. Vergeten we dat voor zaakadressen, dan verandert het kanaal voor alle zaken. Mitigatie: test in WP3.
- **Zaakadres zichtbaar als standaardgegeven:** `getMostRecentByContactgegevenType` sorteert op datum en kan een zaakadres kiezen. Mitigatie: filter en test in WP2.
- **Omleiden van andermans notificaties:** zonder controle op eigenaarschap van de zaak kan iemand een referentie zetten op een vreemde zaak. Mitigatie: check in WP5.
- **Privacy:** contactgegevens niet loggen; bestaande debug-opzet volgen.
- **Ongeverifieerde nummers:** leidt tot niet-bezorgde notificaties. Mitigatie: server-side check.
- **Amsterdam-aannames in de kern:** een Amsterdam-URL, thema of begrip dat in de kern belandt, maakt hergebruik door een andere gemeente duur. Mitigatie: de tweede config in de tests (sectie 6) en de importgrens.
- **Conventie die niet overal geldt:** een gemeente zonder OMC, of met een andere adresselectie, ziet geen effect van `referentie`. Mitigatie: referentiestrategie in de config, en open punt 12 per nieuwe gemeente beantwoorden.
- **Te vroeg abstraheren:** de `openklant`-adapter bouwen voordat een tweede gemeente bekend is, kost werk dat misschien niet nodig blijkt. Mitigatie: alleen de interface en de `profielservice`-adapter in dit plan (WP1); de `openklant`-adapter pas na open punt 8.

## 9. Uitrol

1. Achter de toggle `KLANT_CONTACT.zaakvoorkeuren`, aan buiten productie.
2. Eén thema met zaken in OpenZaak, met een ketentest op de testomgeving.
3. Productie pas aan als de OMC in productie draait en de ketentest slaagt.
4. Daarna de overige thema's met zaken in OpenZaak.
5. Een volgende gemeente aansluiten vraagt configuratie en, als zij de profielservice niet heeft, de `openklant`-adapter. De kern verandert niet.

## 10. Definition of done

- WP1 tot en met WP7 zijn gebouwd en getest (sectie 6); `pnpm lint` is schoon.
- De kern bevat geen Amsterdam-specifieke URL's, thema's of begrippen en draait door dezelfde tests met een tweede gemeente-config.
- Alle upstream-calls zijn gestubd met `remoteApi`.
- `*-service-config.ts` is de bron van routes en toggles; toggle-uit-pad is getest.
- Mock-server bevat de profielservice-routes, met en zonder `referentie`.
- Ketentest geslaagd voor ten minste één thema.
- Open punten 1, 2, 4, 5 en 8 tot en met 10 zijn beantwoord en in dit document verwerkt.

## Bronnen

- [Worth-NL/NotifyNL-OMC](https://github.com/Worth-NL/NotifyNL-OMC): `PartyResults.cs` (adresselectie), `DistributionChannels.cs`, `QueryKlant.cs`, `QueryZaak.cs`, `Documentation/OMC - Documentation.md`
- [NotifyNL-OMC release v.2.3.2](https://github.com/Worth-NL/NotifyNL-OMC/releases/tag/v.2.3.2)
- [Worth-NL/notifynl issue #100](https://github.com/Worth-NL/notifynl/issues/100): keuze van het digitale adres
- [Open Klant, Klantinteracties OpenAPI](https://github.com/maykinmedia/open-klant/blob/master/src/openklant/components/klantinteracties/openapi.yaml) (spec-versie 0.9.1)
- [Open Klant documentatie](https://open-klant.readthedocs.io/)
- [Open Zaak documentatie](https://open-zaak.readthedocs.io/)
