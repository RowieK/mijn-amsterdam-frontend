import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OPENZAAK_ZAKEN_THEMA_ID,
  useZaakVoorkeurThemas,
} from './useZaakVoorkeurThemas.ts';
import type { ZaakVoorkeurZaakFrontend } from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
import { themaConfig as klantContactThemaConfig } from '../KlantContact-thema-config.ts';

function setOpenZaakZaken(zaken: ZaakVoorkeurZaakFrontend[]) {
  useAppStateStore.setState({
    KLANT_CONTACT: {
      status: 'OK',
      content: { communicatievoorkeuren: { zaken } },
    },
  } as never);
}

const MELDING = {
  identificatie: 'MELDING-OPENBARE-RUIMTE',
  omschrijving: 'Melding openbare ruimte',
};
const PARKEREN = {
  identificatie: 'PARKEERVERGUNNING',
  omschrijving: 'Aanvraag parkeervergunning',
};

function zaak(
  zaakIdentificatie: string,
  zaaktype: ZaakVoorkeurZaakFrontend['zaaktype']
): ZaakVoorkeurZaakFrontend {
  return {
    zaakIdentificatie,
    omschrijving: `Zaak ${zaakIdentificatie}`,
    zaaktype,
  };
}

describe('useZaakVoorkeurThemas', () => {
  afterEach(() => {
    setOpenZaakZaken([]);
  });

  it('geeft per zaaktype een thema met een link naar Mijn contact', () => {
    setOpenZaakZaken([
      zaak('ZAAK-1', MELDING),
      zaak('ZAAK-2', PARKEREN),
      zaak('ZAAK-3', MELDING),
    ]);

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current).toEqual([
      {
        id: `${OPENZAAK_ZAKEN_THEMA_ID}_PARKEERVERGUNNING`,
        title: 'Aanvraag parkeervergunning',
        route: klantContactThemaConfig.route.path,
        zaken: [{ zaakIdentificatie: 'ZAAK-2', omschrijving: 'Zaak ZAAK-2' }],
      },
      {
        id: `${OPENZAAK_ZAKEN_THEMA_ID}_MELDING-OPENBARE-RUIMTE`,
        title: 'Melding openbare ruimte',
        route: klantContactThemaConfig.route.path,
        zaken: [
          { zaakIdentificatie: 'ZAAK-1', omschrijving: 'Zaak ZAAK-1' },
          { zaakIdentificatie: 'ZAAK-3', omschrijving: 'Zaak ZAAK-3' },
        ],
      },
    ]);
  });

  it('zet de zaken zonder bekend zaaktype als laatste onder Zaken', () => {
    setOpenZaakZaken([zaak('ZAAK-1', null), zaak('ZAAK-2', PARKEREN)]);

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(
      result.current.map(({ id, title, zaken }) => ({
        id,
        title,
        zaken: zaken.map((z) => z.zaakIdentificatie),
      }))
    ).toEqual([
      {
        id: `${OPENZAAK_ZAKEN_THEMA_ID}_PARKEERVERGUNNING`,
        title: 'Aanvraag parkeervergunning',
        zaken: ['ZAAK-2'],
      },
      { id: OPENZAAK_ZAKEN_THEMA_ID, title: 'Zaken', zaken: ['ZAAK-1'] },
    ]);
  });

  it('geeft niets zonder zaken uit Open Zaak', () => {
    setOpenZaakZaken([]);

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current).toEqual([]);
  });

  // De zaken van Erfpacht komen uit Vernise, niet uit Open Zaak. Een keuze daarvoor zou de BFF altijd weigeren.
  it('neemt de zaken van Erfpacht niet op', () => {
    useAppStateStore.setState({
      ERFPACHT: {
        status: 'OK',
        content: {
          dossiers: { dossiers: [] },
          zaken: [
            {
              zaakNummer: 'ZAAK-2025-0000011488',
              zaakOmschrijving: 'Wijzigen erfpachtrecht',
            },
          ],
        },
      },
    } as never);
    setOpenZaakZaken([zaak('ZAAK-1', MELDING)]);

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current.flatMap((thema) => thema.zaken)).toEqual([
      { zaakIdentificatie: 'ZAAK-1', omschrijving: 'Zaak ZAAK-1' },
    ]);
  });
});
