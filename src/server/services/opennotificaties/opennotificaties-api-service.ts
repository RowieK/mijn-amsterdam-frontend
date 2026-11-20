import { HttpStatusCode } from 'axios';

import type { OpenNotificatiesConfig } from './opennotificaties-service-config.ts';
import type {
  AbonnementSource,
  KanaalSource,
} from './opennotificaties-types.ts';
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

// Deze client leest alleen: er worden geen abonnementen aangemaakt en geen notificaties verstuurd.
async function fetchFromOpenNotificaties<T>(
  config: OpenNotificatiesConfig,
  path: string
): Promise<ApiResponse<T>> {
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
      formatUrl: ({ url }) => joinApiUrl(String(url), path),
      enableCache: false,
    }
  );

  return requestData<T>(apiConfig);
}

// Haalt de kanalen op (bijvoorbeeld `zaken`, `documenten`).
export function fetchKanalen(
  config: OpenNotificatiesConfig
): Promise<ApiResponse<KanaalSource[]>> {
  return fetchFromOpenNotificaties<KanaalSource[]>(config, 'kanaal');
}

// Haalt de abonnementen op. Daaraan is te zien of de OMC op het kanaal `zaken` is ingetekend (`callbackUrl`).
export function fetchAbonnementen(
  config: OpenNotificatiesConfig
): Promise<ApiResponse<AbonnementSource[]>> {
  return fetchFromOpenNotificaties<AbonnementSource[]>(config, 'abonnement');
}
