# Inhoudsopgave: Landelijke Profiel Service (team 1)

| Document | Inhoud |
|---|---|
| [technisch_pva.md](technisch_pva.md) | Technisch plan van aanpak, open punten en gedrag per WP |
| [done.md](done.md) | Afgeronde stories |
| [communicatie voorkeuren.png](<communicatie voorkeuren.png>) | Wireframe communicatievoorkeuren |
| [wireframe_2.png](wireframe_2.png) | Wireframe 2 |
| [omc.md](omc.md) | OMC-scenario "Zaak aangemaakt" met de aansluiting van de profielservice: besluit OpenKlant uitbreiden en sequence diagram |
| [mvp-koppeling-testomgeving.md](mvp-koppeling-testomgeving.md) | MVP-koppeling met de testomgeving: testgegevens, stappenplan om te reproduceren en aandachtspunten |

## Diagrammen

| Diagram | Bestand |
|---|---|
| Architecture diagram | [architecture-diagram.png](diagrammen/architecture-diagram.png) |
| Component diagram | [component-diagram.png](diagrammen/component-diagram.png) |
| Class diagram (eigen oplossing) | [class-diagram.png](diagrammen/class-diagram.png) |
| Sequence diagram | [sequence-diagram.png](diagrammen/sequence-diagram.png) |
| Toelichting bij alle diagrammen | [toelichting.md](diagrammen/toelichting.md) |

## API-specificaties

| API | Versie (testomgeving) | Bestand |
|---|---|---|
| OpenKlant, Klantinteracties | 0.7.0 | [klantinteracties (1).yaml](<klantinteracties (1).yaml>) |
| OpenKlant, Contactgegevens | 1.1.1 | [contactgegevens (1).yaml](<contactgegevens (1).yaml>) |
| Open Notificaties | 1.0.0 | [Open Notificaties API.yaml](<Open Notificaties API.yaml>) |

## Code

- `src/server/services/klantcontact/`: communicatievoorkeuren, met de `openklant`-backend in `klantcontact-openklant.ts`
- `src/server/services/openzaak/`: eigenaarschap van een zaak en de zaken van de ingelogde burger
- `src/server/services/opennotificaties/`: kanalen en abonnementen
- `src/scripts/zgw-koppelingen-check.ts`: koppelingen testen met `pnpm zgw:check`
- `src/scripts/zgw-testzaken.ts`: testpersonen zoeken met `pnpm zgw:testzaken`
- `src/scripts/zgw-testpersoon-seed.ts`: een testpersoon in OpenKlant klaarzetten met `pnpm zgw:seed`
