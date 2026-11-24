import { HttpStatusCode } from 'axios';

import type {
  CreateContactgegevenOptions,
  GemeenteKlantcontactConfig,
  ProfielserviceBackend,
  VerifyVerificationRequestProps,
} from './klantcontact-backend-types.ts';
import {
  fetchZaakVoorkeurZaken,
  transformContactgegevenSource,
} from './klantcontact-helpers.ts';
import type {
  DigitaalAdresPayloadSource,
  DigitaalAdresSource,
  PartijSource,
} from './klantcontact-openklant-types.ts';
import {
  checkVerificationCode,
  isNotifyNlConfigured,
  notifyNlNotConfiguredResult,
  sendVerificationCode,
} from './klantcontact-notifynl.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenSource,
  ContactgegevenType,
  DienstverlenerSource,
  VerifyVerificationRequestResponse,
} from './klantcontact-profieldienst-types.ts';
import { normalizeTelefoonnummer } from './klantcontact-profieldienst.ts';
import {
  apiErrorResult,
  apiSuccessResult,
  type ApiResponse,
} from '../../../universal/helpers/api.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';
import { getCustomApiConfig } from '../../helpers/source-api-helpers.ts';
import { requestData } from '../../helpers/source-api-request.ts';
import { joinApiUrl, requestAllPages } from '../../helpers/zgw-api-helpers.ts';
import { zaakIsVanGebruiker as zaakIsVanGebruikerInOpenZaak } from '../openzaak/openzaak-api-service.ts';

type OpenKlantConfig = NonNullable<GemeenteKlantcontactConfig['openKlant']>;
type NotifyNlConfig = NonNullable<GemeenteKlantcontactConfig['notifyNl']>;
type ConfiguredOpenKlantConfig = { url: string; token: string };

const DEFAULT_DIENSTVERLENER = 'openklant';

// Hoe Open Klant een BSN of KVK-nummer van een partij vastlegt (`partijIdentificatoren`).
const PARTIJ_IDENTIFICATOR_BY_PROFILE_TYPE: Record<
  ProfileType,
  { codeObjecttype: string; codeSoortObjectId: string }
> = {
  private: { codeObjecttype: 'natuurlijk_persoon', codeSoortObjectId: 'bsn' },
  'private-attributes': {
    codeObjecttype: 'natuurlijk_persoon',
    codeSoortObjectId: 'bsn',
  },
  commercial: {
    codeObjecttype: 'niet_natuurlijk_persoon',
    codeSoortObjectId: 'kvk_nummer',
  },
};

const SOORT_DIGITAAL_ADRES_BY_TYPE: Partial<
  Record<ContactgegevenType, DigitaalAdresPayloadSource['soortDigitaalAdres']>
> = {
  Email: 'email',
  Telefoonnummer: 'telefoonnummer',
};

const TYPE_BY_SOORT_DIGITAAL_ADRES: Partial<
  Record<DigitaalAdresSource['soortDigitaalAdres'], ContactgegevenType>
> = {
  email: 'Email',
  telefoonnummer: 'Telefoonnummer',
};

function isConfigured(
  config: OpenKlantConfig
): config is ConfiguredOpenKlantConfig {
  return !!config.url && !!config.token;
}

function notConfiguredResult() {
  return apiErrorResult(
    'Open Klant is niet geconfigureerd',
    null,
    HttpStatusCode.ServiceUnavailable
  );
}

function getHeaders({ token }: ConfiguredOpenKlantConfig) {
  return {
    Authorization: `Token ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

// Een DigitaalAdres heeft geen aanmaak- of wijzigingsdatum, dus die zijn leeg.
// `overig` (geen e-mail of telefoon) heeft geen equivalent in de frontend en wordt overgeslagen.
function toContactgegevenSource(
  digitaalAdres: DigitaalAdresSource
): ContactgegevenSource | null {
  const type = TYPE_BY_SOORT_DIGITAAL_ADRES[digitaalAdres.soortDigitaalAdres];

  if (!type) {
    return null;
  }

  return {
    id: digitaalAdres.uuid,
    type,
    waarde: digitaalAdres.adres,
    isGeverifieerd: !!digitaalAdres.verificatieDatum,
    isDefault: !!digitaalAdres.isStandaardAdres,
    referentie: digitaalAdres.referentie || null,
    createdAt: null,
    lastUpdated: null,
    scopes: [],
  };
}

function toContactgegevenFrontend(
  digitaalAdres: DigitaalAdresSource,
  contactgegevenType: ContactgegevenType
): ContactgegevenFrontend {
  return transformContactgegevenSource(
    toContactgegevenSource(digitaalAdres),
    contactgegevenType
  );
}

export function getDigitaleAdressen(
  partij: PartijSource
): DigitaalAdresSource[] {
  return (
    partij._expand?.digitaleAdressen ?? partij._expand?.digitale_adressen ?? []
  );
}

// De filters van Open Klant negeren onbekende queryparameters. Daarom controleren we zelf dat de partij echt
// bij de ingelogde gebruiker hoort: een partij van iemand anders mag nooit het uitgangspunt van een wijziging zijn.
function partijHoortBijProfiel(
  partij: PartijSource,
  profile: AuthProfileAndToken['profile']
): boolean {
  const { codeObjecttype, codeSoortObjectId } =
    PARTIJ_IDENTIFICATOR_BY_PROFILE_TYPE[profile.profileType];

  return !!partij.partijIdentificatoren?.some(
    ({ partijIdentificator }) =>
      partijIdentificator.codeObjecttype === codeObjecttype &&
      partijIdentificator.codeSoortObjectId === codeSoortObjectId &&
      partijIdentificator.objectId === profile.id
  );
}

// Geeft de partij van de ingelogde gebruiker, inclusief de digitale adressen, of `null` als er geen partij is.
// Ook gebruikt door het seedscript (zgw:seed).
export async function fetchPartij(
  config: OpenKlantConfig,
  authProfileAndToken: AuthProfileAndToken
): Promise<ApiResponse<PartijSource | null>> {
  if (!isConfigured(config)) {
    return notConfiguredResult();
  }

  const { profile } = authProfileAndToken;

  if (!profile.id) {
    return apiErrorResult(
      'Geen identificatie van de gebruiker',
      null,
      HttpStatusCode.BadRequest
    );
  }

  const { codeObjecttype, codeSoortObjectId } =
    PARTIJ_IDENTIFICATOR_BY_PROFILE_TYPE[profile.profileType];

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'GET',
      headers: getHeaders(config),
      params: {
        partijIdentificator__objectId: profile.id,
        partijIdentificator__codeObjecttype: codeObjecttype,
        partijIdentificator__codeSoortObjectId: codeSoortObjectId,
        expand: 'digitaleAdressen',
      },
      formatUrl: ({ url }) => joinApiUrl(String(url), 'partijen'),
      enableCache: false,
    }
  );

  // Alle pagina's: negeert Open Klant een filter, dan kan de partij van de gebruiker op een latere pagina staan.
  const response = await requestAllPages<PartijSource>(apiConfig);

  if (response.status !== 'OK') {
    return response;
  }

  const partijen = response.content.filter((partij) =>
    partijHoortBijProfiel(partij, profile)
  );

  if (partijen.length > 1) {
    return apiErrorResult(
      'Meerdere partijen gevonden voor dezelfde identificatie',
      null,
      HttpStatusCode.Conflict
    );
  }

  const partij = partijen[0] ?? null;

  // Staan er adressen op de partij, maar kwamen ze niet mee, dan zouden we ten onrechte een lege lijst tonen.
  if (partij && !partij._expand && partij.digitaleAdressen?.length) {
    return apiErrorResult(
      'De digitale adressen van de partij konden niet worden opgehaald',
      null,
      HttpStatusCode.BadGateway
    );
  }

  return apiSuccessResult(partij);
}

async function fetchContactgegevens(
  config: OpenKlantConfig,
  authProfileAndToken: AuthProfileAndToken
): Promise<ApiResponse<ContactgegevenSource[]>> {
  const partij = await fetchPartij(config, authProfileAndToken);

  if (partij.status !== 'OK') {
    return partij;
  }

  if (!partij.content) {
    return apiSuccessResult([]);
  }

  return apiSuccessResult(
    getDigitaleAdressen(partij.content)
      .map(toContactgegevenSource)
      .filter((contactgegeven) => contactgegeven !== null)
  );
}

// Open Klant kent geen verificatie van een adres, alleen een `verificatieDatum`. Een zaakadres met dezelfde waarde
// als een al geverifieerd adres van dezelfde partij erft die datum. Anders is het nieuwe adres ongeverifieerd.
// Bij een telefoonnummer dat nog niet geverifieerd is, laat Notify NL eerst een sms met een code versturen.
// Lukt dat niet, dan wordt er geen adres aangemaakt.
async function createContactgegeven(
  config: OpenKlantConfig,
  notifyNl: NotifyNlConfig,
  authProfileAndToken: AuthProfileAndToken,
  contactgegevenType: ContactgegevenType,
  contactgegevenWaarde: string,
  { referentie, isDefault = true }: CreateContactgegevenOptions = {}
): Promise<ApiResponse<ContactgegevenFrontend>> {
  if (!isConfigured(config)) {
    return notConfiguredResult();
  }

  const soortDigitaalAdres = SOORT_DIGITAAL_ADRES_BY_TYPE[contactgegevenType];

  if (!soortDigitaalAdres) {
    return apiErrorResult(
      'Dit type contactgegeven wordt niet ondersteund door Open Klant',
      null,
      HttpStatusCode.BadRequest
    );
  }

  const adres =
    contactgegevenType === 'Telefoonnummer'
      ? normalizeTelefoonnummer(contactgegevenWaarde)
      : apiSuccessResult(contactgegevenWaarde);

  if (adres.status !== 'OK') {
    return adres;
  }

  const partij = await fetchPartij(config, authProfileAndToken);

  if (partij.status !== 'OK') {
    return partij;
  }

  if (!partij.content) {
    return apiErrorResult(
      'Geen partij gevonden voor de ingelogde gebruiker',
      null,
      HttpStatusCode.NotFound
    );
  }

  const geverifieerdAdres = getDigitaleAdressen(partij.content).find(
    (digitaalAdres) =>
      digitaalAdres.soortDigitaalAdres === soortDigitaalAdres &&
      !!digitaalAdres.verificatieDatum &&
      (digitaalAdres.adres === adres.content ||
        digitaalAdres.adres === contactgegevenWaarde)
  );

  if (contactgegevenType === 'Telefoonnummer' && !geverifieerdAdres) {
    const codeVerstuurd = await sendVerificationCode(
      notifyNl,
      authProfileAndToken,
      adres.content
    );

    if (codeVerstuurd.status !== 'OK') {
      return codeVerstuurd;
    }
  }

  const payload: DigitaalAdresPayloadSource = {
    verstrektDoorPartij: { uuid: partij.content.uuid, url: partij.content.url },
    adres: adres.content,
    soortDigitaalAdres,
    isStandaardAdres: isDefault,
    ...(referentie && { referentie }),
    ...(geverifieerdAdres?.verificatieDatum && {
      verificatieDatum: geverifieerdAdres.verificatieDatum,
    }),
  };

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'POST',
      data: payload,
      headers: getHeaders(config),
      formatUrl: ({ url }) => joinApiUrl(String(url), 'digitaleadressen'),
      transformResponse: (response: DigitaalAdresSource) =>
        toContactgegevenFrontend(response, contactgegevenType),
      enableCache: false,
    }
  );

  return requestData<ContactgegevenFrontend>(apiConfig);
}

// Het id komt uit een request van de gebruiker. Een digitaal adres wordt daarom alleen verwijderd als het
// bij de partij van de ingelogde gebruiker hoort; Open Klant zelf kent geen eigenaarschap per gebruiker.
async function deleteContactgegeven(
  config: OpenKlantConfig,
  authProfileAndToken: AuthProfileAndToken,
  contactgegevenId: ContactgegevenSource['id']
): Promise<ApiResponse<null>> {
  if (!isConfigured(config)) {
    return notConfiguredResult();
  }

  const partij = await fetchPartij(config, authProfileAndToken);

  if (partij.status !== 'OK') {
    return partij;
  }

  const isAdresVanPartij =
    !!partij.content &&
    getDigitaleAdressen(partij.content).some(
      (digitaalAdres) => digitaalAdres.uuid === contactgegevenId
    );

  if (!isAdresVanPartij) {
    return apiErrorResult(
      'Contactgegeven niet gevonden',
      null,
      HttpStatusCode.NotFound
    );
  }

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'DELETE',
      headers: getHeaders(config),
      formatUrl: ({ url }) =>
        joinApiUrl(String(url), `digitaleadressen/${contactgegevenId}`),
      transformResponse: () => null,
      enableCache: false,
    }
  );

  return requestData<null>(apiConfig);
}

function toVerificatieDatum(verifiedOn?: string): string {
  // OpenKlant bewaart een datum zonder tijdstip.
  return verifiedOn && /^\d{4}-\d{2}-\d{2}/.test(verifiedOn)
    ? verifiedOn.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
}

// Controleert de code die per sms is verstuurd en zet daarna de `verificatieDatum` van het adres in Open Klant.
// Alleen een telefoonnummer dat bij de partij van de ingelogde gebruiker hoort kan geverifieerd worden.
// De waarde (het nummer) en de code komen niet in foutmeldingen of logs.
async function verifyContactgegeven(
  config: OpenKlantConfig,
  notifyNl: NotifyNlConfig,
  authProfileAndToken: AuthProfileAndToken,
  { value, code, type }: VerifyVerificationRequestProps
): Promise<ApiResponse<VerifyVerificationRequestResponse>> {
  // E-mail wordt nog niet via Notify NL geverifieerd.
  if (type !== 'Telefoonnummer') {
    return apiErrorResult(
      'Verificatie van dit type contactgegeven wordt niet ondersteund door de Open Klant-backend',
      null,
      HttpStatusCode.NotImplemented
    );
  }

  if (!isConfigured(config)) {
    return notConfiguredResult();
  }

  if (!isNotifyNlConfigured(notifyNl)) {
    return notifyNlNotConfiguredResult();
  }

  const telefoonnummer = normalizeTelefoonnummer(value);

  if (telefoonnummer.status !== 'OK') {
    return telefoonnummer;
  }

  const partij = await fetchPartij(config, authProfileAndToken);

  if (partij.status !== 'OK') {
    return partij;
  }

  const adressen = partij.content
    ? getDigitaleAdressen(partij.content).filter(
        (digitaalAdres) =>
          digitaalAdres.soortDigitaalAdres === 'telefoonnummer' &&
          (digitaalAdres.adres === telefoonnummer.content ||
            digitaalAdres.adres === value)
      )
    : [];

  if (adressen.length === 0) {
    return apiErrorResult(
      'Contactgegeven niet gevonden',
      null,
      HttpStatusCode.NotFound
    );
  }

  const teVerifierenAdressen = adressen.filter(
    (digitaalAdres) => !digitaalAdres.verificatieDatum
  );

  // Alles is al geverifieerd: de code hoeft niet meer gecontroleerd te worden.
  if (teVerifierenAdressen.length === 0) {
    return apiSuccessResult({ verified: true });
  }

  const controle = await checkVerificationCode(
    notifyNl,
    authProfileAndToken,
    telefoonnummer.content,
    code
  );

  if (controle.status !== 'OK') {
    return controle;
  }

  if (!controle.content.verified) {
    return apiSuccessResult({ verified: false });
  }

  const verificatieDatum = toVerificatieDatum(controle.content.verifiedOn);

  // Meerdere ongeverifieerde adressen met hetzelfde nummer (bijvoorbeeld na opnieuw invoeren) krijgen dezelfde datum.
  for (const digitaalAdres of teVerifierenAdressen) {
    const apiConfig = getCustomApiConfig(
      { url: config.url },
      {
        method: 'PATCH',
        data: { verificatieDatum },
        headers: getHeaders(config),
        formatUrl: ({ url }) =>
          joinApiUrl(String(url), `digitaleadressen/${digitaalAdres.uuid}`),
        transformResponse: () => null,
        enableCache: false,
      }
    );

    const patchResponse = await requestData<null>(apiConfig);

    if (patchResponse.status !== 'OK') {
      return patchResponse;
    }
  }

  return apiSuccessResult({ verified: true });
}

export function createOpenKlantBackend({
  openKlant = {},
  notifyNl = {},
  openZaak = {},
}: GemeenteKlantcontactConfig): ProfielserviceBackend {
  return {
    fetchContactgegevens: (authProfileAndToken) =>
      fetchContactgegevens(openKlant, authProfileAndToken),
    createContactgegeven: (
      authProfileAndToken,
      contactgegevenType,
      contactgegevenWaarde,
      options
    ) =>
      createContactgegeven(
        openKlant,
        notifyNl,
        authProfileAndToken,
        contactgegevenType,
        contactgegevenWaarde,
        options
      ),
    deleteContactgegeven: (authProfileAndToken, contactgegevenId) =>
      deleteContactgegeven(openKlant, authProfileAndToken, contactgegevenId),
    // Open Klant heeft geen verificatie-endpoint (plan, open punt 11): een code versturen en controleren
    // gebeurt via Notify NL, waarna wij de `verificatieDatum` in Open Klant zetten.
    verifyContactgegeven: (authProfileAndToken, props) =>
      verifyContactgegeven(openKlant, notifyNl, authProfileAndToken, props),
    zaakIsVanGebruiker: (authProfileAndToken, zaakIdentificatie) =>
      zaakIsVanGebruikerInOpenZaak(
        openZaak,
        authProfileAndToken,
        zaakIdentificatie
      ),
    fetchZaken: (authProfileAndToken) =>
      fetchZaakVoorkeurZaken(openZaak, authProfileAndToken),
    // Open Klant kent geen diensten waarop een gebruiker is aangesloten.
    fetchDienstverlener: (_authProfileAndToken, dienstverlenerNaam) =>
      Promise.resolve(
        apiSuccessResult<DienstverlenerSource>({
          naam: dienstverlenerNaam ?? DEFAULT_DIENSTVERLENER,
          diensten: [],
        })
      ),
  };
}
