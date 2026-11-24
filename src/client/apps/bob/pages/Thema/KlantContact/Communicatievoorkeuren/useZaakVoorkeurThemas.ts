import { useMemo } from 'react';

import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
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

// Het thema voor de zaken waarvan het zaaktype niet bekend is.
export const OPENZAAK_ZAKEN_THEMA_ID = 'OPENZAAK_ZAKEN';
const OPENZAAK_ZAKEN_THEMA_TITLE = 'Zaken';

// De thema's waarvan de zaken een kanaalvoorkeur kunnen krijgen. De BFF (WP3 en WP5) kent geen thema's:
// hij slaat per zaak alleen de `zaakIdentificatie` op, als `referentie` van het adres. Deze hook koppelt
// de zaken van een thema aan die identificatie, zodat de tabel ze per thema kan tonen.
// Een keuze werkt alleen voor een zaak in Open Zaak, want de BFF controleert daar het eigenaarschap (WP8).
// Daarom staan hier alleen de zaken die de BFF uit Open Zaak haalt, met elk zaaktype als eigen thema.
// Versies van een zaaktype hebben dezelfde identificatie en vallen dus onder één thema.
export function useZaakVoorkeurThemas(): ZaakVoorkeurThema[] {
  const klantContact = useAppStateStore((state) => state.KLANT_CONTACT);

  return useMemo(() => {
    const openZaakZaken =
      klantContact.content?.communicatievoorkeuren?.zaken ?? [];
    const themas = new Map<string, ZaakVoorkeurThema>();

    openZaakZaken.forEach(({ zaakIdentificatie, omschrijving, zaaktype }) => {
      const id = zaaktype
        ? `${OPENZAAK_ZAKEN_THEMA_ID}_${zaaktype.identificatie}`
        : OPENZAAK_ZAKEN_THEMA_ID;
      const thema = themas.get(id) ?? {
        id,
        title: zaaktype?.omschrijving ?? OPENZAAK_ZAKEN_THEMA_TITLE,
        // Er is (nog) geen themapagina voor deze zaken, dus de link gaat naar Mijn contact.
        route: klantContactThemaConfig.route.path,
        zaken: [],
      };

      thema.zaken.push({ zaakIdentificatie, omschrijving });
      themas.set(id, thema);
    });

    // Op alfabet, met de zaken zonder bekend zaaktype als laatste.
    return [...themas.values()].sort(
      (a, b) =>
        Number(a.id === OPENZAAK_ZAKEN_THEMA_ID) -
          Number(b.id === OPENZAAK_ZAKEN_THEMA_ID) ||
        a.title.localeCompare(b.title, 'nl')
    );
  }, [klantContact]);
}
