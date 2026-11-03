import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useZaakVoorkeurThemas } from './useZaakVoorkeurThemas.ts';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
import { themaConfig as erfpachtThemaConfig } from '../../Erfpacht/Erfpacht-thema-config.ts';

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
});
