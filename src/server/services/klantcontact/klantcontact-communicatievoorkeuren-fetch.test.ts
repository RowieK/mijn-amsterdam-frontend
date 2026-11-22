import { describe, expect, it, vi } from 'vitest';

import type { ProfielserviceBackend } from './klantcontact-backend-types.ts';
import { fetchCommunicatievoorkeuren } from './klantcontact-communicatievoorkeuren.ts';
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

function getBackend(overrides: Partial<ProfielserviceBackend>) {
  return {
    fetchContactgegevens: vi.fn(async () => apiSuccessResult([])),
    fetchDienstverlener: vi.fn(async () => apiSuccessResult(null)),
    ...overrides,
  } as unknown as ProfielserviceBackend;
}

describe('fetchCommunicatievoorkeuren', () => {
  it('geeft een fout (geen lege lijst) als het profiel niet opgehaald kan worden', async () => {
    featureToggle.communicatievoorkeuren = true;
    const backend = getBackend({
      fetchContactgegevens: vi.fn(async () =>
        apiErrorResult('Profiel niet beschikbaar', null)
      ),
    });

    const response = await fetchCommunicatievoorkeuren(
      getAuthProfileAndToken(),
      backend
    );

    expect(response.status).toBe('ERROR');
  });

  it('geeft OK en een lege zaakKanaalVoorkeuren-lijst als het profiel leeg is', async () => {
    featureToggle.communicatievoorkeuren = true;

    const response = await fetchCommunicatievoorkeuren(
      getAuthProfileAndToken(),
      getBackend({})
    );

    expect(response.status).toBe('OK');
    expect(response.content?.zaakKanaalVoorkeuren).toEqual([]);
  });

  it('geeft alle e-mailadressen en houdt standaardContactgegevens.Email gelijk aan het eerste', async () => {
    featureToggle.communicatievoorkeuren = true;
    const adres = (
      id: string,
      waarde: string,
      overrides: Partial<ContactgegevenSource> = {}
    ): ContactgegevenSource => ({
      id,
      type: 'Email',
      waarde,
      isGeverifieerd: true,
      isDefault: true,
      createdAt: '2025-01-01T10:00:00Z',
      lastUpdated: '2025-01-01T10:00:00Z',
      scopes: [],
      ...overrides,
    });
    const backend = getBackend({
      fetchContactgegevens: vi.fn(async () =>
        apiSuccessResult([
          adres('1', 'eerste@example.org'),
          adres('2', 'tweede@example.org', {
            lastUpdated: '2025-02-01T10:00:00Z',
          }),
          adres('3', 'nieuw@example.org', { isGeverifieerd: false }),
          adres('4', 'zaak@example.org', { referentie: 'Z-24-1' }),
        ])
      ),
    });

    const response = await fetchCommunicatievoorkeuren(
      getAuthProfileAndToken(),
      backend
    );

    expect(response.content?.emailadressen?.map(({ value }) => value)).toEqual([
      'tweede@example.org',
      'eerste@example.org',
      'nieuw@example.org',
    ]);
    expect(response.content?.standaardContactgegevens?.Email.value).toBe(
      'tweede@example.org'
    );
  });
});
