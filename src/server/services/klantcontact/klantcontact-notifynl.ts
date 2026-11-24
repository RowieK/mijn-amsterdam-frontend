import { HttpStatusCode } from 'axios';

import type { GemeenteKlantcontactConfig } from './klantcontact-backend-types.ts';
import {
  apiErrorResult,
  apiSuccessResult,
  type ApiResponse,
} from '../../../universal/helpers/api.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';
import { hashWithPepper } from '../../helpers/hash.ts';
import { getCustomApiConfig } from '../../helpers/source-api-helpers.ts';
import { requestData } from '../../helpers/source-api-request.ts';
import { joinApiUrl } from '../../helpers/zgw-api-helpers.ts';

// De verificatieservice van Notify NL (technisch_pva.md, open punt 11): Notify NL verstuurt de sms
// met de code en houdt de code zelf bij. Wij bewaren niets.
type NotifyNlConfig = NonNullable<GemeenteKlantcontactConfig['notifyNl']>;
type ConfiguredNotifyNlConfig = NotifyNlConfig & {
  url: string;
  apiKey: string;
};

export type NotifyNlVerifyResult = {
  verified: boolean;
  verifiedOn?: string;
};

const DEFAULT_AUTH_SCHEME = 'ApiKey-v1';

export function isNotifyNlConfigured(
  config: NotifyNlConfig
): config is ConfiguredNotifyNlConfig {
  return !!config.url && !!config.apiKey;
}

export function notifyNlNotConfiguredResult() {
  return apiErrorResult(
    'Notify NL is niet geconfigureerd',
    null,
    HttpStatusCode.ServiceUnavailable
  );
}

function getHeaders({ apiKey, authScheme }: ConfiguredNotifyNlConfig) {
  return {
    Authorization: `${authScheme || DEFAULT_AUTH_SCHEME} ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

// De sleutel waarmee Notify NL het verificatieverzoek terugvindt. Het bevat geen persoonsgegevens (geen BSN of
// telefoonnummer): het is een HMAC van de gebruiker en het nummer, dus per gebruiker en nummer stabiel en
// zonder database terug te rekenen bij het controleren van de code.
export function getVerificationReference(
  authProfileAndToken: AuthProfileAndToken,
  phoneNumber: string
): string {
  return hashWithPepper(`${authProfileAndToken.profile.id}:${phoneNumber}`);
}

function safeReference(
  authProfileAndToken: AuthProfileAndToken,
  phoneNumber: string
): ApiResponse<string> {
  try {
    return apiSuccessResult(
      getVerificationReference(authProfileAndToken, phoneNumber)
    );
  } catch {
    return apiErrorResult(
      'Verificatiereferentie kon niet worden bepaald',
      null,
      HttpStatusCode.InternalServerError
    );
  }
}

// Laat Notify NL een sms met een zescijferige code naar het nummer sturen.
// `phoneNumber` is al een Nederlands mobiel nummer in E.164 (+316...).
export async function sendVerificationCode(
  config: NotifyNlConfig,
  authProfileAndToken: AuthProfileAndToken,
  phoneNumber: string
): Promise<ApiResponse<null>> {
  if (!isNotifyNlConfigured(config)) {
    return notifyNlNotConfiguredResult();
  }

  const reference = safeReference(authProfileAndToken, phoneNumber);

  if (reference.status !== 'OK') {
    return reference;
  }

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'POST',
      data: { phoneNumber, reference: reference.content },
      headers: getHeaders(config),
      formatUrl: ({ url }) => joinApiUrl(String(url), 'verification-requests'),
      transformResponse: () => null,
      enableCache: false,
    }
  );

  return requestData<null>(apiConfig);
}

// Controleert de code bij Notify NL. Een onjuiste of verlopen code (400) of een onbekend verzoek (404)
// is geen fout van de service maar een gewone uitkomst: `verified: false`.
export async function checkVerificationCode(
  config: NotifyNlConfig,
  authProfileAndToken: AuthProfileAndToken,
  phoneNumber: string,
  code: string
): Promise<ApiResponse<NotifyNlVerifyResult>> {
  if (!isNotifyNlConfigured(config)) {
    return notifyNlNotConfiguredResult();
  }

  const reference = safeReference(authProfileAndToken, phoneNumber);

  if (reference.status !== 'OK') {
    return reference;
  }

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'POST',
      data: { code, reference: reference.content },
      headers: getHeaders(config),
      formatUrl: ({ url }) =>
        joinApiUrl(String(url), 'verification-requests/verify'),
      transformResponse: (response: NotifyNlVerifyResult) => ({
        verified: response?.verified === true,
        verifiedOn: response?.verifiedOn,
      }),
      enableCache: false,
    }
  );

  const response = await requestData<NotifyNlVerifyResult>(apiConfig);

  if (
    response.status === 'ERROR' &&
    (response.code === HttpStatusCode.BadRequest ||
      response.code === HttpStatusCode.NotFound)
  ) {
    return apiSuccessResult({ verified: false });
  }

  return response;
}
