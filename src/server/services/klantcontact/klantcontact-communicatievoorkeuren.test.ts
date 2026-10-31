import type {
  GemeenteKlantcontactConfig,
  KlantcontactBackend,
} from './klantcontact-backend-types.ts';
import { setZaakKanaalVoorkeur } from './klantcontact-communicatievoorkeuren.ts';
import {
  transformContactgegevenSource,
  zaakIdentificatieAlsReferentie,
} from './klantcontact-helpers.ts';
import type { ContactgegevenSource } from './klantcontact-profieldienst-types.ts';
import { getAuthProfileAndToken } from '../../../testing/utils.ts';
import {
  apiErrorResult,
  apiSuccessResult,
} from '../../../universal/helpers/api.ts';

const ZAAK = 'Z-24-2238078';
const NIEUWE_WAARDE = 'nieuw@example.org';

const config: GemeenteKlantcontactConfig = {
  profielservice: {},
  zaakVoorkeur: {
    referentie: zaakIdentificatieAlsReferentie,
    kanalen: ['Email', 'Telefoonnummer'],
  },
};

function getContactgegeven(
  overrides: Partial<ContactgegevenSource>
): ContactgegevenSource {
  return {
    id: '1',
    type: 'Email',
    waarde: 'mokum@example.org',
    isGeverifieerd: true,
    isDefault: true,
    createdAt: '2025-01-01T10:00:00Z',
    lastUpdated: '2025-01-01T10:00:00Z',
    scopes: [],
    ...overrides,
  };
}

const nieuwContactgegeven = transformContactgegevenSource(
  getContactgegeven({
    id: 'nieuw',
    waarde: NIEUWE_WAARDE,
    isGeverifieerd: false,
    isDefault: false,
    referentie: ZAAK,
  }),
  'Email'
);

function getBackend(overrides: Partial<KlantcontactBackend> = {}) {
  return {
    fetchContactgegevens: vi.fn().mockResolvedValue(apiSuccessResult([])),
    createContactgegeven: vi
      .fn()
      .mockResolvedValue(apiSuccessResult(nieuwContactgegeven)),
    deleteContactgegeven: vi.fn().mockResolvedValue(apiSuccessResult(null)),
    verifyContactgegeven: vi.fn(),
    ...overrides,
  } satisfies KlantcontactBackend;
}

describe('setZaakKanaalVoorkeur', () => {
  const authProfileAndToken = getAuthProfileAndToken();
  const payload = {
    zaakIdentificatie: ZAAK,
    kanaal: 'Email',
    value: NIEUWE_WAARDE,
  } as const;

  test('breekt af als de profielresponse faalt: geen create en geen delete', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(apiErrorResult('Profiel ophalen mislukt', null)),
    });

    const result = await setZaakKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(result.status).toBe('ERROR');
    expect(backend.createContactgegeven).not.toHaveBeenCalled();
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
  });

  test('maakt een nieuw adres met referentie en isDefault false, zonder delete als er geen zaakadres is', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(
          apiSuccessResult([getContactgegeven({ id: 'standaard' })])
        ),
    });

    const result = await setZaakKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(backend.createContactgegeven).toHaveBeenCalledWith(
      authProfileAndToken,
      'Email',
      NIEUWE_WAARDE,
      { referentie: ZAAK, isDefault: false }
    );
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
    expect(result).toEqual(
      apiSuccessResult({
        zaakIdentificatie: ZAAK,
        contactgegeven: nieuwContactgegeven,
      })
    );
  });

  test('maakt het nieuwe adres vóór het verwijderen van het oude en laat andere adressen staan', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi.fn().mockResolvedValue(
        apiSuccessResult([
          getContactgegeven({ id: 'standaard' }),
          getContactgegeven({ id: 'andere-zaak', referentie: 'Z-24-1' }),
          getContactgegeven({
            id: 'oud',
            referentie: ZAAK,
            isDefault: false,
          }),
        ])
      ),
    });

    const result = await setZaakKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(result.status).toBe('OK');
    expect(backend.deleteContactgegeven).toHaveBeenCalledTimes(1);
    expect(backend.deleteContactgegeven).toHaveBeenCalledWith(
      authProfileAndToken,
      'oud'
    );
    expect(
      vi.mocked(backend.createContactgegeven).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(backend.deleteContactgegeven).mock.invocationCallOrder[0]
    );
  });

  test('verwijdert niets als het aanmaken van het nieuwe adres faalt', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(
          apiSuccessResult([getContactgegeven({ id: 'oud', referentie: ZAAK })])
        ),
      createContactgegeven: vi
        .fn()
        .mockResolvedValue(apiErrorResult('Aanmaken mislukt', null)),
    });

    const result = await setZaakKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(result.status).toBe('ERROR');
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
  });

  test('geeft een fout als het verwijderen van het oude adres faalt', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi
        .fn()
        .mockResolvedValue(
          apiSuccessResult([getContactgegeven({ id: 'oud', referentie: ZAAK })])
        ),
      deleteContactgegeven: vi
        .fn()
        .mockResolvedValue(apiErrorResult('Verwijderen mislukt', null)),
    });

    const result = await setZaakKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(result.status).toBe('ERROR');
  });

  test('verwijdert alle oude adressen met dezelfde referentie (duplicaten)', async () => {
    const backend = getBackend({
      fetchContactgegevens: vi.fn().mockResolvedValue(
        apiSuccessResult([
          getContactgegeven({ id: 'oud-1', referentie: ZAAK }),
          getContactgegeven({
            id: 'oud-2',
            type: 'Telefoonnummer',
            referentie: ZAAK,
          }),
        ])
      ),
    });

    const result = await setZaakKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(result.status).toBe('OK');
    expect(backend.deleteContactgegeven).toHaveBeenCalledTimes(2);
    expect(backend.deleteContactgegeven).toHaveBeenCalledWith(
      authProfileAndToken,
      'oud-1'
    );
    expect(backend.deleteContactgegeven).toHaveBeenCalledWith(
      authProfileAndToken,
      'oud-2'
    );
  });

  test.each([
    {
      naam: 'kanaal niet toegestaan in de config',
      config: {
        ...config,
        zaakVoorkeur: { ...config.zaakVoorkeur, kanalen: ['Telefoonnummer'] },
      } satisfies GemeenteKlantcontactConfig,
      payload,
    },
    {
      naam: 'ongeldige zaakidentificatie',
      config,
      payload: { ...payload, zaakIdentificatie: 'Z/24/1' },
    },
  ])('geeft een fout zonder backend-aanroepen: $naam', async (testCase) => {
    const backend = getBackend();

    const result = await setZaakKanaalVoorkeur(
      authProfileAndToken,
      backend,
      testCase.config,
      testCase.payload
    );

    expect(result.status).toBe('ERROR');
    expect(backend.fetchContactgegevens).not.toHaveBeenCalled();
    expect(backend.createContactgegeven).not.toHaveBeenCalled();
    expect(backend.deleteContactgegeven).not.toHaveBeenCalled();
  });

  test('toont in het resultaat dat het nieuwe adres nog geverifieerd moet worden', async () => {
    const backend = getBackend();

    const result = await setZaakKanaalVoorkeur(
      authProfileAndToken,
      backend,
      config,
      payload
    );

    expect(result.content?.contactgegeven.isVerified).toBe(false);
  });
});
