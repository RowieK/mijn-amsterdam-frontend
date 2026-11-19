import { HttpStatusCode } from 'axios';

import type { OpenNotificatiesConfig } from './opennotificaties-service-config.ts';
import type { KanaalSource } from './opennotificaties-types.ts';
import {
  apiErrorResult,
  type ApiResponse,
} from '../../../universal/helpers/api.ts';
import { getCustomApiConfig } from '../../helpers/source-api-helpers.ts';
import { requestData } from '../../helpers/source-api-request.ts';
import {
  createZgwJwt,
  hasZgwJwtCredentials,
  joinApiUrl,
} from '../../helpers/zgw-api-helpers.ts';

// Haalt de kanalen op (bijvoorbeeld `zaken`, `documenten`). Deze client leest alleen:
// er worden geen abonnementen aangemaakt en geen notificaties verstuurd.
export async function fetchKanalen(
  config: OpenNotificatiesConfig
): Promise<ApiResponse<KanaalSource[]>> {
  if (!config.url || !hasZgwJwtCredentials(config)) {
    return apiErrorResult(
      'Open Notificaties is niet geconfigureerd',
      null,
      HttpStatusCode.ServiceUnavailable
    );
  }

  const jwt = await createZgwJwt(config);

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
      formatUrl: ({ url }) => joinApiUrl(String(url), 'kanaal'),
      enableCache: false,
    }
  );

  return requestData<KanaalSource[]>(apiConfig);
}
