import { HttpStatusCode } from 'axios';
import { SignJWT } from 'jose';

import { requestData } from './source-api-request.ts';
import {
  apiErrorResult,
  apiSuccessResult,
  type ApiResponse,
} from '../../universal/helpers/api.ts';
import type { DataRequestConfig } from '../config/source-api.ts';

// Gedeelde helpers voor de ZGW-APIs (Open Zaak, Open Notificaties) die met een JWT (HS256) authenticeren.

export type ZgwJwtCredentials = {
  clientId?: string;
  jwtSecret?: string;
};

export function hasZgwJwtCredentials<T extends ZgwJwtCredentials>(
  credentials: T
): credentials is T & Required<ZgwJwtCredentials> {
  return !!credentials.clientId && !!credentials.jwtSecret;
}

// Maakt per aanroep een nieuw token. De secret blijft in het geheugen en komt nergens in een log of foutmelding.
export async function createZgwJwt({
  clientId,
  jwtSecret,
}: Required<ZgwJwtCredentials>): Promise<string> {
  return new SignJWT({
    client_id: clientId,
    user_id: clientId,
    user_representation: clientId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(clientId)
    .setIssuedAt()
    .sign(new TextEncoder().encode(jwtSecret));
}

// De basis-URL's uit de omgeving eindigen meestal op een slash. Dit voorkomt een dubbele slash in het pad.
export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

// Zit de URL op dezelfde host als de basis-URL? Een URL uit een antwoord (een volgende pagina, een zaaktype)
// kan naar een andere host wijzen, en ons token mag alleen naar de API zelf.
export function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

// Een lijst uit een ZGW-API (Zaken, Catalogi, Klantinteracties) komt in pagina's, met de URL van de volgende pagina
// in `next`.
type ZgwPaginatedSource<T> = {
  next: string | null;
  results: T[];
};

// Haalt alle pagina's van een lijst op door `next` te volgen, tot de API geen volgende pagina meer geeft. Er is geen
// vast maximum: het aantal pagina's bepaalt de API. `config` is de eerste pagina; de URL in `next` bevat de filters al.
// Een fout op een pagina geeft een foutresultaat, nooit een halve lijst. Dat geldt ook als `next` naar een andere
// host wijst, of als de API een pagina herhaalt of een lege pagina met een volgende geeft (anders stopt de lus nooit).
export async function requestAllPages<T>(
  config: DataRequestConfig
): Promise<ApiResponse<T[]>> {
  const results: T[] = [];
  const opgehaaldeUrls = new Set<string>();
  let pageConfig = config;

  for (;;) {
    const page = await requestData<ZgwPaginatedSource<T>>(pageConfig);

    if (page.status !== 'OK') {
      return page;
    }

    results.push(...page.content.results);

    const { next } = page.content;

    if (!next) {
      return apiSuccessResult(results);
    }

    if (
      !isSameOrigin(next, String(config.url)) ||
      opgehaaldeUrls.has(next) ||
      !page.content.results.length
    ) {
      return apiErrorResult(
        'De volgende pagina van de lijst kon niet worden opgehaald',
        null,
        HttpStatusCode.BadGateway
      );
    }

    opgehaaldeUrls.add(next);
    pageConfig = { ...config, url: next, params: undefined };
  }
}
