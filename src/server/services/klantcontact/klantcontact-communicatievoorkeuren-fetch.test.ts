import { afterEach, describe, expect, it, vi } from 'vitest';

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
    fetchZaken: vi.fn(async () => apiSuccessResult([])),
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

  describe('zaken', () => {
    const zaak = {
      zaakIdentificatie: 'ZAAK-2026-0000000171',
      omschrijving: 'Melding openbare ruimte',
      zaaktype: {
        identificatie: 'MELDING-OPENBARE-RUIMTE',
        omschrijving: 'Melding openbare ruimte',
      },
    };

    afterEach(() => {
      featureToggle.zaakvoorkeuren = true;
    });

    it('geeft de zaken van de backend mee', async () => {
      featureToggle.communicatievoorkeuren = true;

      const response = await fetchCommunicatievoorkeuren(
        getAuthProfileAndToken(),
        getBackend({ fetchZaken: vi.fn(async () => apiSuccessResult([zaak])) })
      );

      expect(response.content?.zaken).toEqual([zaak]);
    });

    it('geeft een lege lijst zaken, maar wel de rest, als de zaken niet opgehaald kunnen worden', async () => {
      featureToggle.communicatievoorkeuren = true;

      const response = await fetchCommunicatievoorkeuren(
        getAuthProfileAndToken(),
        getBackend({
          fetchZaken: vi.fn(async () =>
            apiErrorResult('Open Zaak niet bereikbaar', null)
          ),
        })
      );

      expect(response.status).toBe('OK');
      expect(response.content?.zaken).toEqual([]);
    });

    it('haalt geen zaken op als de zaakvoorkeuren uit staan', async () => {
      featureToggle.communicatievoorkeuren = true;
      featureToggle.zaakvoorkeuren = false;
      const fetchZaken = vi.fn(async () => apiSuccessResult([zaak]));

      const response = await fetchCommunicatievoorkeuren(
        getAuthProfileAndToken(),
        getBackend({ fetchZaken })
      );

      expect(fetchZaken).not.toHaveBeenCalled();
      expect(response.content?.zaken).toEqual([]);
    });
  });
});
