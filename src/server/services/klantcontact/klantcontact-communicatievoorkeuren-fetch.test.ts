import { describe, expect, it, vi } from 'vitest';

import type { ProfielserviceBackend } from './klantcontact-backend-types.ts';
import { fetchCommunicatievoorkeuren } from './klantcontact-communicatievoorkeuren.ts';
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
});
