import { useMemo } from 'react';

import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
import { themaConfig as erfpachtThemaConfig } from '../../Erfpacht/Erfpacht-thema-config.ts';
import { themaConfig as klantContactThemaConfig } from '../KlantContact-thema-config.ts';

export type ZaakVoorkeurZaak = {
  // Dezelfde waarde als de `zaakIdentificatie` die de BFF als `referentie` opslaat (WP3 en WP5).
  zaakIdentificatie: string;
  omschrijving: string;
};

export type ZaakVoorkeurThema = {
  id: string;
  title: string;
  route: string;
  zaken: ZaakVoorkeurZaak[];
};

export const OPENZAAK_ZAKEN_THEMA_ID = 'OPENZAAK_ZAKEN';

// De thema's waarvan de zaken een kanaalvoorkeur kunnen krijgen. De BFF (WP3 en WP5) kent geen thema's:
// hij slaat per zaak alleen de `zaakIdentificatie` op, als `referentie` van het adres. Deze hook koppelt
// de zaken van een thema aan die identificatie, zodat de tabel ze per thema kan tonen.
// Het doel is alle thema's op te nemen waarvan de gebruiker notificaties over zaken krijgt. Welke dat zijn
// (staan de zaken in OpenZaak, en neemt de OMC het zaaktype mee) wordt in WP8 bepaald. Een thema komt hier bij
// zodra dat vaststaat. Tot die tijd staan de zaken uit Open Zaak (WP8) in een eigen thema.
export function useZaakVoorkeurThemas(): ZaakVoorkeurThema[] {
  const erfpacht = useAppStateStore((state) => state.ERFPACHT);
  const klantContact = useAppStateStore((state) => state.KLANT_CONTACT);

  return useMemo(() => {
    const themas: ZaakVoorkeurThema[] = [];

    const isErfpachtZakenActive =
      erfpachtThemaConfig.featureToggle.active &&
      erfpachtThemaConfig.featureToggle.wijzigingsaanvragenActive;

    const erfpachtData =
      erfpacht.content && 'dossiers' in erfpacht.content
        ? erfpacht.content
        : null;

    if (isErfpachtZakenActive && erfpachtData?.zaken?.length) {
      themas.push({
        id: erfpachtThemaConfig.id,
        title: erfpachtThemaConfig.title,
        route: erfpachtThemaConfig.route.path,
        zaken: erfpachtData.zaken.map((zaak) => ({
          zaakIdentificatie: zaak.zaakNummer,
          omschrijving: zaak.zaakOmschrijving,
        })),
      });
    }

    // Een zaak die al bij een thema staat, komt er niet nog een keer in.
    const zaakIdentificaties = new Set(
      themas.flatMap((thema) =>
        thema.zaken.map((zaak) => zaak.zaakIdentificatie)
      )
    );
    const openZaakZaken = (
      klantContact.content?.communicatievoorkeuren?.zaken ?? []
    ).filter((zaak) => !zaakIdentificaties.has(zaak.zaakIdentificatie));

    // Er is (nog) geen themapagina voor deze zaken, dus de link gaat naar Mijn contact.
    if (openZaakZaken.length) {
      themas.push({
        id: OPENZAAK_ZAKEN_THEMA_ID,
        title: 'Zaken',
        route: klantContactThemaConfig.route.path,
        zaken: openZaakZaken,
      });
    }

    return themas;
  }, [erfpacht, klantContact]);
}
