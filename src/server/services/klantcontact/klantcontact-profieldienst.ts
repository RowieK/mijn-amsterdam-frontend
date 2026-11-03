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
import { apiErrorResult, apiSuccessResult, type ApiResponse, } from '../../../universal/helpers/api.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';
import { getCustomApiConfig } from '../../helpers/source-api-helpers.ts';
import { requestData } from '../../helpers/source-api-request.ts';

export function normalizeDutchMobileNumber(value: string): string {
  const normalized = value.replace(/[\s()-]/g, '');

  let phoneNumber = normalized;

  if (/^06\d{8}$/.test(phoneNumber)) {
    phoneNumber = `+31${phoneNumber.slice(1)}`;
  } else if (/^00316\d{8}$/.test(phoneNumber)) {
    phoneNumber = `+${phoneNumber.slice(2)}`;
  }

  if (!/^\+316\d{8}$/.test(phoneNumber)) {
    throw new Error('Ongeldig Nederlands mobiel telefoonnummer');
  }

  return phoneNumber;
}

// De adapter geeft een foutresultaat in plaats van een exception, zodat een ongeldig nummer
// (bijvoorbeeld een bestaand vast nummer dat via een zaakvoorkeur wordt gekozen) geen 500 oplevert.
function normalizeTelefoonnummer(value: string): ApiResponse<string> {
  try {
    return apiSuccessResult(normalizeDutchMobileNumber(value));
  } catch {
    return apiErrorResult(
      'Ongeldig Nederlands mobiel telefoonnummer',
      null,
      HttpStatusCode.BadRequest
    );
  }
}

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
  const waarde =
    contactgegevenType === 'Telefoonnummer'
      ? normalizeTelefoonnummer(contactgegevenWaarde)
      : apiSuccessResult(contactgegevenWaarde);

  if (waarde.status !== 'OK') {
    return waarde;
  }

  const identificatieType = getIdentificatieType(
    authProfileAndToken.profile.profileType
  );
  const payload: ContactgegevenPayloadSource = {
    identificatieType,
    identificatieNummer: authProfileAndToken.profile.id,
    type: contactgegevenType,
    waarde: waarde.content,
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
): Promise<ApiResponse<VerifyVerificationRequestResponse>> {
  // TODO: het endpoint voor telefoonverificatie is nog niet bevestigd (plan, open punt 7).
  // Het payload ondersteunt al e-mail en telefoon; het endpoint is nu voor beide `/emailverificatie`.
  const identificatieType = getIdentificatieType(
    authProfileAndToken.profile.profileType
  );
  const verificationData = {
    identificatieNummer: authProfileAndToken.profile.id,
    identificatieType,
    verificatieCode: code,
  };

  let data: VerifyVerificationRequestPayload;

  if (type === 'Telefoonnummer') {
    const telefoonnummer = normalizeTelefoonnummer(value);

    if (telefoonnummer.status !== 'OK') {
      return telefoonnummer;
    }

    data = { ...verificationData, telefoonnummer: telefoonnummer.content };
  } else {
    data = { ...verificationData, email: value };
  }

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

// De profielservice kent geen zaken en kan dus niet vaststellen van wie een zaak is. De echte controle is een
// OpenZaak-aanroep (plan WP8) en die service bestaat nog niet. Tot dan weigeren we altijd (fail closed):
// liever geen zaakvoorkeur dan een voorkeur voor een zaak waarvan het eigenaarschap niet vaststaat.
function zaakIsVanGebruiker(): Promise<ApiResponse<boolean>> {
  return Promise.resolve(
    apiErrorResult(
      'Controle of de zaak van de gebruiker is, is nog niet beschikbaar',
      null,
      HttpStatusCode.ServiceUnavailable
    )
  );
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
    zaakIsVanGebruiker,
  };
}
