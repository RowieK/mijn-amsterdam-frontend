import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OPENZAAK_ZAKEN_THEMA_ID,
  useZaakVoorkeurThemas,
} from './useZaakVoorkeurThemas.ts';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
import { themaConfig as klantContactThemaConfig } from '../KlantContact-thema-config.ts';

function setOpenZaakZaken(
  zaken: { zaakIdentificatie: string; omschrijving: string }[]
) {
  useAppStateStore.setState({
    KLANT_CONTACT: {
      status: 'OK',
      content: { communicatievoorkeuren: { zaken } },
    },
  } as never);
}

describe('useZaakVoorkeurThemas', () => {
  const openZaakZaak = {
    zaakIdentificatie: 'ZAAK-2026-0000000171',
    omschrijving: 'Melding openbare ruimte',
  };

  afterEach(() => {
    setOpenZaakZaken([]);
  });

  it('geeft de zaken uit Open Zaak als eigen thema met een link naar Mijn contact', () => {
    setOpenZaakZaken([openZaakZaak]);

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current).toEqual([
      {
        id: OPENZAAK_ZAKEN_THEMA_ID,
        title: 'Zaken',
        route: klantContactThemaConfig.route.path,
        zaken: [openZaakZaak],
      },
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
    setOpenZaakZaken([openZaakZaak]);

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current.map((thema) => thema.id)).toEqual([
      OPENZAAK_ZAKEN_THEMA_ID,
    ]);
    expect(result.current[0].zaken).toEqual([openZaakZaak]);
  });
});
