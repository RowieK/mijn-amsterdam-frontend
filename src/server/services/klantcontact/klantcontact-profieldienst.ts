import { HttpStatusCode } from 'axios';

import type {
  CreateContactgegevenOptions,
  GemeenteKlantcontactConfig,
  ProfielserviceBackend,
  VerifyVerificationRequestProps,
} from './klantcontact-backend-types.ts';
import {
  getIdentificatieType,
  transformContactgegevenSource,
} from './klantcontact-helpers.ts';
import type {
  ContactProfieldienstResponseSource,
  ContactgegevenFrontend,
  ContactgegevenPayloadSource,
  ContactgegevenSource,
  ContactgegevenType,
  VerifyVerificationRequestPayload,
  VerifyVerificationRequestResponse,
} from './klantcontact-profieldienst-types.ts';
import type { DienstverlenerSource } from './klantcontact-profieldienst-types.ts';
import { apiSuccessResult, type ApiResponse, } from '../../../universal/helpers/api.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';
import { getCustomApiConfig } from '../../helpers/source-api-helpers.ts';
import { requestData } from '../../helpers/source-api-request.ts';

const DEFAULT_DIENSTVERLENER = 'amsterdam';

type ProfielserviceConfig = GemeenteKlantcontactConfig['profielservice'];

async function fetchProfiel(
  profielserviceConfig: ProfielserviceConfig,
  authProfileAndToken: AuthProfileAndToken
): Promise<ApiResponse<ContactProfieldienstResponseSource>> {
  const identificatieType = getIdentificatieType(
    authProfileAndToken.profile.profileType
  );

  const apiConfig = getCustomApiConfig(profielserviceConfig, {
    method: 'POST',
    data: {
      identificatieType,
      identificatieNummer: authProfileAndToken.profile.id,
      dienstverlener: DEFAULT_DIENSTVERLENER,
    },
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    formatUrl({ url }) {
      return `${url}/partij`;
    },
  });

  const response = await requestData<ContactProfieldienstResponseSource>(
    apiConfig,
    authProfileAndToken
  );

  return response;
}

async function fetchContactgegevens(
  profielserviceConfig: ProfielserviceConfig,
  authProfileAndToken: AuthProfileAndToken
): Promise<ApiResponse<ContactgegevenSource[]>> {
  const profiel = await fetchProfiel(profielserviceConfig, authProfileAndToken);

  if (profiel.status !== 'OK') {
    return profiel;
  }

  return apiSuccessResult(profiel.content.contactgegevens);
}

async function fetchDienstverlener(
  profielserviceConfig: ProfielserviceConfig,
  authProfileAndToken: AuthProfileAndToken,
  dienstverlenerNaam: string = DEFAULT_DIENSTVERLENER
): Promise<ApiResponse<DienstverlenerSource>> {
  const apiConfig = getCustomApiConfig(profielserviceConfig, {
    method: 'GET',
    formatUrl({ url }) {
      return `${url}/dienstverlener/${dienstverlenerNaam}`;
    },
    enableCache: false, // For testing
    transformResponse: (response: DienstverlenerSource) => {
      return {
        ...response,
        diensten: [
          ...(response.diensten ?? []),
          { id: 'zorgned', beschrijving: 'WMO en Jeugdzaken' }, // TEMPORARY, until we have real data from the API
        ],
      };
    },
  });

  return requestData<DienstverlenerSource>(apiConfig, authProfileAndToken);
}

// This api call also sends a verification request to the given phone or email.
// The data will be added but isGeverifieerd will be false until the user verifies with the received code.
async function createContactgegeven(
  profielserviceConfig: ProfielserviceConfig,
  authProfileAndToken: AuthProfileAndToken,
  contactgegevenType: ContactgegevenType,
  contactgegevenWaarde: string,
  { referentie, isDefault = true }: CreateContactgegevenOptions = {}
): Promise<ApiResponse<ContactgegevenFrontend>> {
  const identificatieType = getIdentificatieType(
    authProfileAndToken.profile.profileType
  );
  const payload: ContactgegevenPayloadSource = {
    identificatieType,
    identificatieNummer: authProfileAndToken.profile.id,
    type: contactgegevenType,
    waarde: contactgegevenWaarde,
    isDefault,
    ...(referentie && { referentie }),
  };

  const apiConfig = getCustomApiConfig(profielserviceConfig, {
    method: 'POST',
    data: payload,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    formatUrl({ url }) {
      return `${url}/contactgegeven`;
    },
    transformResponse: (response) => {
      return transformContactgegevenSource(response, contactgegevenType);
    },
    enableCache: false, // For testing
  });

  return requestData<ContactgegevenFrontend>(apiConfig);
}

async function deleteContactgegeven(
  profielserviceConfig: ProfielserviceConfig,
  authProfileAndToken: AuthProfileAndToken,
  contactgegevenId: ContactgegevenSource['id']
): Promise<ApiResponse<null>> {
  const identificatieType = getIdentificatieType(
    authProfileAndToken.profile.profileType
  );

  const apiConfig = getCustomApiConfig(profielserviceConfig, {
    method: 'DELETE',
    data: {
      identificatieType,
      identificatieNummer: authProfileAndToken.profile.id,
    },
    formatUrl({ url }) {
      return `${url}/contactgegeven/${contactgegevenId}`;
    },
    enableCache: false, // For testing
  });

  return requestData<null>(apiConfig);
}

async function verifyContactgegeven(
  profielserviceConfig: ProfielserviceConfig,
  authProfileAndToken: AuthProfileAndToken,
  { value, code, type }: VerifyVerificationRequestProps
) {
  // TODO: based on type, we might want to send the verification request to a different endpoint or with a different payload structure.
  // For now we only support email verification, but the API supports phone verification as well, and in the future we might want to add more types.
  const identificatieType = getIdentificatieType(
    authProfileAndToken.profile.profileType
  );
  const data: VerifyVerificationRequestPayload = {
    email: value,
    identificatieNummer: authProfileAndToken.profile.id,
    identificatieType,
    verificatieCode: code,
  };

  const apiConfig = getCustomApiConfig(profielserviceConfig, {
    method: 'POST',
    data,
    formatUrl({ url }) {
      return `${url}/emailverificatie`;
    },
    transformResponse: (_response: unknown, _headers, status) => {
      return { verified: status === HttpStatusCode.Ok };
    },
    enableCache: false, // For testing
  });

  return requestData<VerifyVerificationRequestResponse>(apiConfig);
}

export function createProfielserviceBackend({
  profielservice,
}: GemeenteKlantcontactConfig): ProfielserviceBackend {
  return {
    fetchContactgegevens: (authProfileAndToken) =>
      fetchContactgegevens(profielservice, authProfileAndToken),
    fetchDienstverlener: (authProfileAndToken, dienstverlenerNaam) =>
      fetchDienstverlener(
        profielservice,
        authProfileAndToken,
        dienstverlenerNaam
      ),
    createContactgegeven: (
      authProfileAndToken,
      contactgegevenType,
      contactgegevenWaarde,
      options
    ) =>
      createContactgegeven(
        profielservice,
        authProfileAndToken,
        contactgegevenType,
        contactgegevenWaarde,
        options
      ),
    deleteContactgegeven: (authProfileAndToken, contactgegevenId) =>
      deleteContactgegeven(
        profielservice,
        authProfileAndToken,
        contactgegevenId
      ),
    verifyContactgegeven: (authProfileAndToken, props) =>
      verifyContactgegeven(profielservice, authProfileAndToken, props),
  };
}
