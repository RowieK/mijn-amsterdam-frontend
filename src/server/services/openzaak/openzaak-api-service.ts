import { HttpStatusCode } from 'axios';

import {
  ROL_OMSCHRIJVING_GENERIEK_INITIATOR,
  type OpenZaakConfig,
} from './openzaak-service-config.ts';
import type {
  RolSource,
  ZaakMetRollenSource,
  ZaakSource,
  ZaaktypeSource,
} from './openzaak-types.ts';
import {
  apiErrorResult,
  apiSuccessResult,
  type ApiResponse,
} from '../../../universal/helpers/api.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';
import { getCustomApiConfig } from '../../helpers/source-api-helpers.ts';
import { requestData } from '../../helpers/source-api-request.ts';
import {
  createZgwJwt,
  hasZgwJwtCredentials,
  isSameOrigin,
  joinApiUrl,
  requestAllPages,
} from '../../helpers/zgw-api-helpers.ts';

type ConfiguredOpenZaakConfig = OpenZaakConfig & {
  url: string;
  bronorganisatie: string;
  clientId: string;
  jwtSecret: string;
};

function isConfigured(
  config: OpenZaakConfig
): config is ConfiguredOpenZaakConfig {
  return (
    !!config.url && !!config.bronorganisatie && hasZgwJwtCredentials(config)
  );
}

function notConfiguredResult() {
  return apiErrorResult(
    'Open Zaak is niet geconfigureerd',
    null,
    HttpStatusCode.ServiceUnavailable
  );
}

async function getHeaders({ clientId, jwtSecret }: ConfiguredOpenZaakConfig) {
  const jwt = await createZgwJwt({ clientId, jwtSecret });

  return {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/json',
    'Accept-Crs': 'EPSG:4326',
  };
}

// Zoekt een zaak op identificatie binnen de bronorganisatie van de gemeente.
// Geeft `null` als de zaak niet in Open Zaak staat.
export async function fetchZaakByIdentificatie(
  config: OpenZaakConfig,
  zaakIdentificatie: string
): Promise<ApiResponse<ZaakSource | null>> {
  if (!isConfigured(config)) {
    return notConfiguredResult();
  }

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'GET',
      headers: await getHeaders(config),
      params: {
        identificatie: zaakIdentificatie,
        bronorganisatie: config.bronorganisatie,
      },
      formatUrl: ({ url }) => joinApiUrl(String(url), 'zaken'),
      enableCache: false,
    }
  );

  const zaken = await requestAllPages<ZaakSource>(apiConfig);

  if (zaken.status !== 'OK') {
    return zaken;
  }

  // De filters zijn exact, maar we vertrouwen daar niet alleen op bij een eigenaarschapscontrole.
  return apiSuccessResult(
    zaken.content.find(
      (zaak) =>
        zaak.identificatie === zaakIdentificatie &&
        zaak.bronorganisatie === config.bronorganisatie
    ) ?? null
  );
}

// De rollen met omschrijving "initiator" van een zaak, van alle pagina's.
export async function fetchInitiatorRollen(
  config: OpenZaakConfig,
  zaakUrl: string
): Promise<ApiResponse<RolSource[]>> {
  if (!isConfigured(config)) {
    return notConfiguredResult();
  }

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'GET',
      headers: await getHeaders(config),
      params: {
        zaak: zaakUrl,
        omschrijvingGeneriek: ROL_OMSCHRIJVING_GENERIEK_INITIATOR,
      },
      formatUrl: ({ url }) => joinApiUrl(String(url), 'rollen'),
      enableCache: false,
    }
  );

  return requestAllPages<RolSource>(apiConfig);
}

// Is de rol van de ingelogde gebruiker? Een BSN-profiel moet overeenkomen met `inpBsn` van een natuurlijk persoon,
// een KVK-profiel met `kvkNummer` van een niet-natuurlijk persoon of vestiging.
export function rolIsVanProfiel(
  rol: RolSource,
  profile: AuthProfileAndToken['profile']
): boolean {
  const identificatie = rol.betrokkeneIdentificatie;

  if (
    !profile.id ||
    !identificatie ||
    rol.omschrijvingGeneriek !== ROL_OMSCHRIJVING_GENERIEK_INITIATOR
  ) {
    return false;
  }

  if (profile.profileType === 'commercial') {
    return (
      (rol.betrokkeneType === 'niet_natuurlijk_persoon' ||
        rol.betrokkeneType === 'vestiging') &&
      identificatie.kvkNummer === profile.id
    );
  }

  return (
    rol.betrokkeneType === 'natuurlijk_persoon' &&
    identificatie.inpBsn === profile.id
  );
}

// Is de zaak van de ingelogde gebruiker? Dat is zo als de gebruiker de initiator van de zaak is.
// Fail closed: staat de zaak niet in Open Zaak, dan is het antwoord `false`; een fout in een van de
// aanroepen geeft een foutresultaat, nooit `true`.
export async function zaakIsVanGebruiker(
  config: OpenZaakConfig,
  authProfileAndToken: AuthProfileAndToken,
  zaakIdentificatie: string
): Promise<ApiResponse<boolean>> {
  const zaak = await fetchZaakByIdentificatie(config, zaakIdentificatie);

  if (zaak.status !== 'OK') {
    return zaak;
  }

  if (!zaak.content) {
    return apiSuccessResult(false);
  }

  const rollen = await fetchInitiatorRollen(config, zaak.content.url);

  if (rollen.status !== 'OK') {
    return rollen;
  }

  return apiSuccessResult(
    rollen.content.some((rol) =>
      rolIsVanProfiel(rol, authProfileAndToken.profile)
    )
  );
}

// De zaken waarvan de ingelogde gebruiker initiator is, binnen de bronorganisatie van de gemeente.
// Het BSN-filter kijkt naar alle rollen van een zaak, en `rol__omschrijvingGeneriek` hoeft niet dezelfde rol
// te treffen. Daarom komen de rollen mee (`expand=rollen`) en controleren we de initiator zelf.
// Alle pagina's: de burger ziet al zijn zaken.
// Ondernemers volgen later: een KVK-nummer staat bij een niet-natuurlijk persoon of een vestiging, twee filters.
export async function fetchZakenVanGebruiker(
  config: OpenZaakConfig,
  authProfileAndToken: AuthProfileAndToken
): Promise<ApiResponse<ZaakMetRollenSource[]>> {
  if (!isConfigured(config)) {
    return notConfiguredResult();
  }

  const { profile } = authProfileAndToken;

  if (profile.profileType === 'commercial' || !profile.id) {
    return apiSuccessResult([]);
  }

  const apiConfig = getCustomApiConfig(
    { url: config.url },
    {
      method: 'GET',
      headers: await getHeaders(config),
      params: {
        bronorganisatie: config.bronorganisatie,
        rol__betrokkeneIdentificatie__natuurlijkPersoon__inpBsn: profile.id,
        rol__omschrijvingGeneriek: ROL_OMSCHRIJVING_GENERIEK_INITIATOR,
        expand: 'rollen',
      },
      formatUrl: ({ url }) => joinApiUrl(String(url), 'zaken'),
      enableCache: false,
    }
  );

  const zaken = await requestAllPages<ZaakMetRollenSource>(apiConfig);

  if (zaken.status !== 'OK') {
    return zaken;
  }

  return apiSuccessResult(
    zaken.content.filter(
      (zaak) =>
        zaak.bronorganisatie === config.bronorganisatie &&
        (zaak._expand?.rollen ?? []).some((rol) =>
          rolIsVanProfiel(rol, profile)
        )
    )
  );
}

// Een zaaktype uit de Catalogi API van hetzelfde Open Zaak. Daarvoor heeft de client de scope `catalogi.lezen` nodig.
export async function fetchZaaktype(
  config: OpenZaakConfig,
  zaaktypeUrl: string
): Promise<ApiResponse<ZaaktypeSource>> {
  if (!isConfigured(config)) {
    return notConfiguredResult();
  }

  // Ons token gaat alleen naar Open Zaak zelf. Het zaaktype van een zaak kan in een catalogus elders staan.
  if (!isSameOrigin(zaaktypeUrl, config.url)) {
    return apiErrorResult(
      'Het zaaktype staat niet in Open Zaak',
      null,
      HttpStatusCode.BadRequest
    );
  }

  const apiConfig = getCustomApiConfig(
    { url: zaaktypeUrl },
    {
      method: 'GET',
      headers: await getHeaders(config),
      enableCache: false,
    }
  );

  return requestData<ZaaktypeSource>(apiConfig);
}

// Eén aanroep per zaaktype, ook als meer zaken hetzelfde zaaktype hebben. Een zaaktype dat niet op te halen is,
// ontbreekt in het resultaat: de zaak blijft dan zonder zaaktype zichtbaar.
export async function fetchZaaktypen(
  config: OpenZaakConfig,
  zaaktypeUrls: string[]
): Promise<Map<string, ZaaktypeSource>> {
  const urls = [...new Set(zaaktypeUrls)];
  const responses = await Promise.all(
    urls.map((url) => fetchZaaktype(config, url))
  );

  return new Map(
    urls.flatMap((url, index) => {
      const response = responses[index];
      return response.status === 'OK' && response.content.identificatie
        ? [[url, response.content] as const]
        : [];
    })
  );
}
