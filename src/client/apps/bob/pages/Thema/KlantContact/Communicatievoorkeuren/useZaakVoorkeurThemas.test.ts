import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  OPENZAAK_ZAKEN_THEMA_ID,
  useZaakVoorkeurThemas,
} from './useZaakVoorkeurThemas.ts';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
import { themaConfig as erfpachtThemaConfig } from '../../Erfpacht/Erfpacht-thema-config.ts';
import { themaConfig as klantContactThemaConfig } from '../KlantContact-thema-config.ts';

type ErfpachtToggles = {
  active: boolean;
  wijzigingsaanvragenActive: boolean;
};

function setErfpachtToggles(toggles: Partial<ErfpachtToggles>) {
  Object.assign(erfpachtThemaConfig.featureToggle as ErfpachtToggles, toggles);
}

function setErfpachtContent(content: unknown) {
  useAppStateStore.setState({
    ERFPACHT: { status: 'OK', content },
  } as never);
}

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
  const originalToggles = {
    active: erfpachtThemaConfig.featureToggle.active,
    wijzigingsaanvragenActive:
      erfpachtThemaConfig.featureToggle.wijzigingsaanvragenActive,
  };

  beforeEach(() => {
    setErfpachtToggles({ active: true, wijzigingsaanvragenActive: true });
  });

  afterEach(() => {
    setErfpachtToggles(originalToggles);
    setOpenZaakZaken([]);
  });

  it('geeft de zaken van Erfpacht met het zaaknummer als zaakidentificatie', () => {
    setErfpachtContent({
      dossiers: { dossiers: [] },
      zaken: [
        {
          zaakNummer: 'ZAAK-2025-0000011488',
          zaakOmschrijving: 'Wijzigen erfpachtrecht',
        },
        {
          zaakNummer: 'ZAAK-2025-0000010602',
          zaakOmschrijving: 'Overdracht erfpachtrecht',
        },
      ],
    });

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current).toEqual([
      {
        id: erfpachtThemaConfig.id,
        title: erfpachtThemaConfig.title,
        route: erfpachtThemaConfig.route.path,
        zaken: [
          {
            zaakIdentificatie: 'ZAAK-2025-0000011488',
            omschrijving: 'Wijzigen erfpachtrecht',
          },
          {
            zaakIdentificatie: 'ZAAK-2025-0000010602',
            omschrijving: 'Overdracht erfpachtrecht',
          },
        ],
      },
    ]);
  });

  it('geeft niets zolang er geen Erfpacht-gegevens zijn', () => {
    setErfpachtContent(null);

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current).toEqual([]);
  });

  it('geeft niets als Erfpacht geen zaken heeft', () => {
    setErfpachtContent({ dossiers: { dossiers: [] }, zaken: [] });

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current).toEqual([]);
  });

  it('geeft niets als de wijzigingsaanvragen (de zaken van Erfpacht) uit staan', () => {
    setErfpachtToggles({ wijzigingsaanvragenActive: false });
    setErfpachtContent({
      dossiers: { dossiers: [] },
      zaken: [{ zaakNummer: 'ZAAK-1', zaakOmschrijving: 'Zaak' }],
    });

    const { result } = renderHook(() => useZaakVoorkeurThemas());

    expect(result.current).toEqual([]);
  });

  describe('zaken uit Open Zaak', () => {
    const openZaakZaak = {
      zaakIdentificatie: 'ZAAK-2026-0000000171',
      omschrijving: 'Melding openbare ruimte',
    };

    it('geeft de zaken uit Open Zaak als eigen thema met een link naar Mijn contact', () => {
      setErfpachtContent(null);
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

    it('zet een zaak die al bij Erfpacht staat niet nog een keer in het thema Zaken', () => {
      setErfpachtContent({
        dossiers: { dossiers: [] },
        zaken: [
          {
            zaakNummer: openZaakZaak.zaakIdentificatie,
            zaakOmschrijving: 'Wijzigen erfpachtrecht',
          },
        ],
      });
      setOpenZaakZaken([openZaakZaak]);

      const { result } = renderHook(() => useZaakVoorkeurThemas());

      expect(result.current.map((thema) => thema.id)).toEqual([
        erfpachtThemaConfig.id,
      ]);
    });
  });
});
