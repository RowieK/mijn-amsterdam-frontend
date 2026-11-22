import { describe, expect, it, vi } from 'vitest';

import type {
  GemeenteKlantcontactConfig,
  KlantcontactBackend,
  ProfielserviceBackend,
} from './klantcontact-backend-types.ts';
import {
  deleteThemaKanaalVoorkeur,
  fetchCommunicatievoorkeuren,
  setThemaKanaalVoorkeur,
} from './klantcontact-communicatievoorkeuren.ts';
import {
  getThemaKanaalVoorkeuren,
  transformContactgegevenSource,
  withoutThemaContactgegevens,
  zaakIdentificatieAlsReferentie,
} from './klantcontact-helpers.ts';
import type { ContactgegevenSource } from './klantcontact-profieldienst-types.ts';
import { featureToggle } from './klantcontact-service-config.ts';
import { getAuthProfileAndToken } from '../../../testing/utils.ts';
import {
  apiErrorResult,
  apiSuccessResult,
} from '../../../universal/helpers/api.ts';

vi.mock('../bag/my-locations.ts', () => ({
  fetchMyLocations: vi.fn(async () => apiSuccessResult([])),
}));

// Alleen testdata: verzonnen thema's, diensten en adressen.
const SCOPE_A = {
  dienstverlenerNaam: 'test-dienstverlener',
  dienstNaam: 'test-dienst-a',
};
const SCOPE_B = {
  dienstverlenerNaam: 'test-dienstverlener',
  dienstNaam: 'test-dienst-b',
};

const config: GemeenteKlantcontactConfig = {
  profielservice: {},
  zaakVoorkeur: {
    referentie: zaakIdentificatieAlsReferentie,
    kanalen: ['Email', 'Telefoonnummer'],
  },
  themaVoorkeur: {
    kanalen: {
      'test-thema-a': ['Email', 'Sms'],
      'test-thema-b': ['Berichtenbox'],
    },
    scopes: { 'test-thema-a': SCOPE_A, 'test-thema-b': SCOPE_B },
  },
};

function getScope(dienstId: string): ContactgegevenSource['scopes'][number] {
  return {
    partij: { identificatieType: 'BSN', identificatieNummer: '999999999' },
    dienst: { id: dienstId, beschrijving: `Beschrijving ${dienstId}` },
  };
}

function getContactgegeven(
  overrides: Partial<ContactgegevenSource>
): ContactgegevenSource {
  return {
    id: '1',
    type: 'Email',
    waarde: 'standaard@example.org',
    isGeverifieerd: true,
    isDefault: true,
    createdAt: '2025-01-01T10:00:00Z',
    lastUpdated: '2025-01-01T10:00:00Z',
    scopes: [],
    ...overrides,
  };
}

const standaardAdres = getContactgegeven({ id: 'standaard' });
const zaakAdres = getContactgegeven({
  id: 'zaak',
  waarde: 'zaak@example.org',
  isDefault: false,
  referentie: 'TEST-ZAAK-1',
});
const themaAdresA = getContactgegeven({
  id: 'thema-a',
  waarde: 'thema-a@example.org',
  isDefault: false,
  scopes: [getScope('test-dienst-a')],
});
const themaAdresB = getContactgegeven({
  id: 'thema-b',
  waarde: 'thema-b@example.org',
  isDefault: false,
  scopes: [getScope('test-dienst-b')],
});
// Een zaakadres blijft een zaakadres, ook als er een scope aan hangt.
const zaakAdresMetScope = getContactgegeven({
  id: 'zaak-met-scope',
  isDefault: false,
  referentie: 'TEST-ZAAK-2',
  scopes: [getScope('test-dienst-a')],
});

const nieuwContactgegeven = transformContactgegevenSource(
  getContactgegeven({
    id: 'nieuw',
    waarde: 'nieuw@example.org',
    isGeverifieerd: false,
    isDefault: false,
    scopes: [getScope('test-dienst-a')],
  }),
  'Email'
);

function getBackend(overrides: Partial<KlantcontactBackend> = {}) {
  return {
    fetchContactgegevens: vi
      .fn()
      .mockResolvedValue(
        apiSuccessResult([standaardAdres, zaakAdres, themaAdresB])
      ),
    createContactgegeven: vi
      .fn()
      .mockResolvedValue(apiSuccessResult(nieuwContactgegeven)),
    deleteContactgegeven: vi.fn().mockResolvedValue(apiSuccessResult(null)),
    verifyContactgegeven: vi.fn(),
    zaakIsVanGebruiker: vi.fn(),
    ...overrides,
  } satisfies KlantcontactBackend;
}

describe('getThemaKanaalVoorkeuren', () => {
  it('geeft alleen de keuzes op themaniveau, niet het standaardadres of een zaakadres', () => {
    const result = getThemaKanaalVoorkeuren(
      config,
      apiSuccessResult([
        standaardAdres,
        zaakAdres,
        zaakAdresMetScope,
        themaAdresA,
        themaAdresB,
      ])
    );

    expect(result.map(({ themaId }) => themaId)).toEqual([
      'test-thema-a',
      'test-thema-b',
    ]);
    expect(result[0].contactgegeven.value).toBe('thema-a@example.org');
  });

  it('geeft geen themakeuzes als de gemeente geen themavoorkeur kent', () => {
    const zonderThema = { ...config, themaVoorkeur: undefined };

    expect(
      getThemaKanaalVoorkeuren(zonderThema, apiSuccessResult([themaAdresA]))
    ).toEqual([]);
  });

  it('geeft een lege lijst als de profielresponse mislukt is', () => {
    expect(
      getThemaKanaalVoorkeuren(config, apiErrorResult('Profiel mislukt', null))
    ).toEqual([]);
  });
});

describe('withoutThemaContactgegevens', () => {
  it('laat het standaardadres en zaakadressen staan en haalt de themaadressen weg', () => {
    const result = withoutThemaContactgegevens(
      config,
      apiSuccessResult([standaardAdres, zaakAdres, themaAdresA, themaAdresB])
    );

    expect(result.status).toBe('OK');
    expect(
      result.status === 'OK' && result.content.map(({ id }) => id)
    ).toEqual(['standaard', 'zaak']);
  });
});

describe('setThemaKanaalVoorkeur', () => {
  const authProfileAndToken = getAuthProfileAndToken();
  const payload = {
    themaId: 'test-thema-a',
    kanaal: 'Email',
    value: 'nieuw@example.org',
  } as const;

  it.each([
    { naam: 'onbekend thema', themaId: 'onbekend-thema' },
    { naam: 'naam van een object-eigenschap', themaId: 'constructor' },
  ])('geeft een fout zonder aanroepen: $naam', async ({ themaId }) => {
    const backend = getBackend();

    const response = await setThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      { ...payload, themaId }
    );

    expect(response.status).toBe('ERROR');
    expect(backend.fetchContactgegevens).not.toHaveBeenCalled();
    expect(backend.createContactgegeven).not.toHaveBeenCalled();
  });

  it('weigert een kanaal dat het thema niet toestaat', async () => {
    const backend = getBackend();

    const response = await setThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      { ...payload, themaId: 'test-thema-b' }
    );

    expect(response.status).toBe('ERROR');
    expect(backend.createContactgegeven).not.toHaveBeenCalled();
  });

  it('weigert elke themakeuze als de gemeente geen themavoorkeur kent', async () => {
    const backend = getBackend();
    const zonderThema = { ...config, themaVoorkeur: undefined };

    const response = await setThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      zonderThema,
      payload
    );

    expect(response.status).toBe('ERROR');
    expect(backend.createContactgegeven).not.toHaveBeenCalled();
  });

  it('geeft een fout en maakt niets aan of weg als de profielresponse mislukt', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(apiErrorResult('Profiel mislukt', null)),
    });

    const response = await setThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(response.status).toBe('ERROR');
    expect(backend.createContactgegeven).not.toHaveBeenCalled();
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
  });

  it('maakt zonder bestaande themakeuze een adres aan met de scope, zonder referentie en als niet-standaard', async () => {
    const backend = getBackend();

    const response = await setThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(backend.createContactgegeven).toHaveBeenCalledWith(
      authProfileAndToken,
      'Email',
      'nieuw@example.org',
      { isDefault: false, scope: SCOPE_A }
    );
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
    expect(response).toEqual(
      apiSuccessResult({
        themaId: 'test-thema-a',
        contactgegeven: nieuwContactgegeven,
      })
    );
    expect(nieuwContactgegeven.isVerified).toBe(false);
  });

  it('vervangt een bestaande themakeuze: eerst aanmaken, dan het oude adres verwijderen', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(
          apiSuccessResult([standaardAdres, zaakAdres, themaAdresA])
        ),
    });

    await setThemaKanaalVoorkeur(authProfileAndToken, backend, config, payload);

    expect(backend.deleteContactgegeven).toHaveBeenCalledTimes(1);
    expect(backend.deleteContactgegeven).toHaveBeenCalledWith(
      authProfileAndToken,
      'thema-a'
    );
    expect(
      vi.mocked(backend.createContactgegeven).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(backend.deleteContactgegeven).mock.invocationCallOrder[0]
    );
  });

  it('raakt het standaardadres, een zaakadres en de keuze voor een ander thema niet aan', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(
          apiSuccessResult([
            standaardAdres,
            zaakAdres,
            zaakAdresMetScope,
            themaAdresA,
            themaAdresB,
          ])
        ),
    });

    await setThemaKanaalVoorkeur(authProfileAndToken, backend, config, payload);

    expect(backend.deleteContactgegeven).toHaveBeenCalledTimes(1);
    expect(backend.deleteContactgegeven).toHaveBeenCalledWith(
      authProfileAndToken,
      'thema-a'
    );
  });

  it('verwijdert niets als het aanmaken mislukt', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(apiSuccessResult([themaAdresA])),
      createContactgegeven: vi
        .fn()
        .mockResolvedValue(apiErrorResult('Aanmaken mislukt', null)),
    });

    const response = await setThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(response.status).toBe('ERROR');
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
  });

  it('geeft een fout als het oude adres niet verwijderd kan worden', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(apiSuccessResult([themaAdresA])),
      deleteContactgegeven: vi
        .fn()
        .mockResolvedValue(apiErrorResult('Verwijderen mislukt', null)),
    });

    const response = await setThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(response.status).toBe('ERROR');
  });
});

describe('deleteThemaKanaalVoorkeur', () => {
  const authProfileAndToken = getAuthProfileAndToken();

  it('verwijdert alleen de themakeuze en laat standaardadres, zaakadressen en een ander thema staan', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(
          apiSuccessResult([
            standaardAdres,
            zaakAdres,
            zaakAdresMetScope,
            themaAdresA,
            themaAdresB,
          ])
        ),
    });

    const response = await deleteThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      'test-thema-a'
    );

    expect(backend.deleteContactgegeven).toHaveBeenCalledTimes(1);
    expect(backend.deleteContactgegeven).toHaveBeenCalledWith(
      authProfileAndToken,
      'thema-a'
    );
    expect(response).toEqual(apiSuccessResult(null));
  });

  it('is een succes als er geen themakeuze is om te verwijderen', async () => {
    const backend = getBackend();

    const response = await deleteThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      'test-thema-a'
    );

    expect(response).toEqual(apiSuccessResult(null));
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
  });

  it('geeft een fout zonder aanroepen voor een onbekend thema', async () => {
    const backend = getBackend();

    const response = await deleteThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      'onbekend-thema'
    );

    expect(response.status).toBe('ERROR');
    expect(backend.fetchContactgegevens).not.toHaveBeenCalled();
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
  });

  it('geeft een fout en verwijdert niets als de profielresponse mislukt', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(apiErrorResult('Profiel mislukt', null)),
    });

    const response = await deleteThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      'test-thema-a'
    );

    expect(response.status).toBe('ERROR');
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
  });

  it('geeft een fout als de themakeuze niet verwijderd kan worden', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(apiSuccessResult([themaAdresA])),
      deleteContactgegeven: vi
        .fn()
        .mockResolvedValue(apiErrorResult('Verwijderen mislukt', null)),
    });

    const response = await deleteThemaKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      'test-thema-a'
    );

    expect(response.status).toBe('ERROR');
  });
});

describe('fetchCommunicatievoorkeuren met themakeuzes', () => {
  function getProfielserviceBackend(contactgegevens: ContactgegevenSource[]) {
    return {
      fetchContactgegevens: vi.fn(async () =>
        apiSuccessResult(contactgegevens)
      ),
      fetchDienstverlener: vi.fn(async () => apiSuccessResult(null)),
    } as unknown as ProfielserviceBackend;
  }

  it('geeft de themakeuzes apart en houdt het themaadres uit de standaardcontactgegevens', async () => {
    featureToggle.communicatievoorkeuren = true;
    // Het themaadres is het meest recent: zonder filter zou het als standaard-e-mail getoond worden.
    const recentThemaAdres = {
      ...themaAdresA,
      lastUpdated: '2026-01-01T10:00:00Z',
    };

    const response = await fetchCommunicatievoorkeuren(
      getAuthProfileAndToken(),
      getProfielserviceBackend([standaardAdres, recentThemaAdres]),
      config
    );

    expect(response.status).toBe('OK');
    expect(response.content?.standaardContactgegevens?.Email.value).toBe(
      'standaard@example.org'
    );
    expect(response.content?.themaKanaalVoorkeuren).toEqual([
      {
        themaId: 'test-thema-a',
        contactgegeven: expect.objectContaining({
          value: 'thema-a@example.org',
        }),
      },
    ]);
  });

  it('geeft geen themakeuzes zonder config', async () => {
    featureToggle.communicatievoorkeuren = true;

    const response = await fetchCommunicatievoorkeuren(
      getAuthProfileAndToken(),
      getProfielserviceBackend([standaardAdres, themaAdresA])
    );

    expect(response.content?.themaKanaalVoorkeuren).toEqual([]);
  });
});
