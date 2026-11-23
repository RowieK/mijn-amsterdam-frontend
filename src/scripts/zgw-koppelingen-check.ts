/**
 * Test vanuit dit project de koppelingen met Open Klant, Open Zaak en Open Notificaties,
 * met de configuratie uit .env.local. Het script doet alleen GET-aanroepen en wijzigt niets.
 *
 * Gebruik
 * =======
 * pnpm zgw:check                                configuratie, verbinding en authenticatie per API
 * pnpm zgw:check --bsn=999990019                ook de contactgegevens van die burger in Open Klant
 * pnpm zgw:check --kvk=69599084                 hetzelfde voor een ondernemer
 * pnpm zgw:check --bsn=999990019 --zaak=ZAAK-1  ook of die zaak in Open Zaak van die burger is
 *
 * Per API zijn er twee stappen. De verbinding is een losse aanroep die de foutmelding van de API toont
 * (bijvoorbeeld `jwt-expired`). Daarna draait dezelfde servicecode als in de BFF.
 * Adressen worden gemaskeerd getoond. Mislukt een controle, dan stopt het script met exitcode 1.
 */
import '../server/helpers/load-env.ts';

import { parseArgs } from 'node:util';

import axios from 'axios';

import {
  foutmelding,
  getAuth,
  maskeerAdres,
  regel,
} from './zgw-script-helpers.ts';
import type { AuthProfileAndToken } from '../server/auth/auth-types.ts';
import {
  joinApiUrl,
  type ZgwJwtCredentials,
  createZgwJwt,
  hasZgwJwtCredentials,
} from '../server/helpers/zgw-api-helpers.ts';
import type { GemeenteKlantcontactConfig } from '../server/services/klantcontact/klantcontact-backend-types.ts';
import { createOpenKlantBackend } from '../server/services/klantcontact/klantcontact-openklant.ts';
import {
  getAmsterdamKlantcontactConfig,
  getKlantcontactBackendNaam,
} from '../server/services/klantcontact/klantcontact-service-config.ts';
import {
  fetchAbonnementen,
  fetchKanalen,
} from '../server/services/opennotificaties/opennotificaties-api-service.ts';
import {
  getOpenNotificatiesConfig,
  type OpenNotificatiesConfig,
} from '../server/services/opennotificaties/opennotificaties-service-config.ts';
import {
  fetchZaakByIdentificatie,
  zaakIsVanGebruiker,
} from '../server/services/openzaak/openzaak-api-service.ts';
import type { OpenZaakConfig } from '../server/services/openzaak/openzaak-service-config.ts';

type OpenKlantConfig = NonNullable<GemeenteKlantcontactConfig['openKlant']>;

type Verbinding = {
  ok: boolean;
  melding: string;
  hint: string | null;
  data?: unknown;
};

const TIMEOUT_MS = 15_000;
const KANAAL_ZAKEN = 'zaken';

const HINT_BY_ZGW_FOUTCODE: Record<string, string> = {
  'jwt-expired':
    'De JWT is verlopen. Staat in BFF_OPENZAAK_JWT_SECRET een kant-en-klare JWT? Zet daar de client-secret: de BFF maakt per aanroep een nieuwe JWT.',
  'invalid-jwt-signature':
    'Client-id of secret wordt niet herkend. Controleer BFF_OPENZAAK_CLIENT_ID en BFF_OPENZAAK_JWT_SECRET.',
};

// De basis-URL eindigt op de API-versie, bijvoorbeeld .../klantinteracties/api/v1/. De services plakken het
// resourcepad (`partijen`, `zaken`, `kanaal`) er zelf achter.
function isBasisUrl(url: string): boolean {
  try {
    return /\/api\/v\d+\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// Een vooraf gemaakte JWT in plaats van de secret. De BFF ondertekent daar een nieuwe JWT mee, en die wordt geweigerd.
function looksLikeJwt(value: string): boolean {
  const [header, payload, signature, ...rest] = value.split('.');

  if (!header || !payload || !signature || rest.length) {
    return false;
  }

  try {
    return 'alg' in JSON.parse(Buffer.from(header, 'base64url').toString());
  } catch {
    return false;
  }
}

function getUrlProblemen(envKey: string, url?: string): string[] {
  if (!url) {
    return [`${envKey} ontbreekt`];
  }

  if (!isBasisUrl(url)) {
    return [
      `${envKey} moet eindigen op de API-versie (bijvoorbeeld .../api/v1/), zonder resourcepad zoals /partijen of /zaken`,
    ];
  }

  return [];
}

function getJwtProblemen(credentials: ZgwJwtCredentials): string[] {
  if (!hasZgwJwtCredentials(credentials)) {
    return ['BFF_OPENZAAK_CLIENT_ID of BFF_OPENZAAK_JWT_SECRET ontbreekt'];
  }

  if (looksLikeJwt(credentials.jwtSecret)) {
    return [
      'BFF_OPENZAAK_JWT_SECRET bevat een JWT in plaats van de client-secret. Een vooraf gemaakte JWT verloopt; de BFF maakt er per aanroep zelf een.',
    ];
  }

  return [];
}

function getConfigProblemen({
  openKlant,
  openZaak,
  openNotificaties,
}: {
  openKlant: OpenKlantConfig;
  openZaak: OpenZaakConfig;
  openNotificaties: OpenNotificatiesConfig;
}) {
  return {
    openKlant: [
      ...getUrlProblemen('BFF_OPENKLANT_BASE_URL', openKlant.url),
      ...(openKlant.token ? [] : ['BFF_OPENKLANT_TOKEN ontbreekt']),
    ],
    openZaak: [
      ...getUrlProblemen('BFF_OPENZAAK_BASE_URL', openZaak.url),
      ...getJwtProblemen(openZaak),
      ...(openZaak.bronorganisatie
        ? []
        : [
            'BFF_OPENZAAK_BRONORGANISATIE ontbreekt: zonder RSIN weigert de zaakcontrole altijd (503)',
          ]),
    ],
    openNotificaties: [
      ...getUrlProblemen('BFF_OPENNOTIFICATIES_BASE_URL', openNotificaties.url),
      ...getJwtProblemen(openNotificaties),
    ],
  };
}

function getHint(status: number, foutcode?: string): string | null {
  if (foutcode && HINT_BY_ZGW_FOUTCODE[foutcode]) {
    return HINT_BY_ZGW_FOUTCODE[foutcode];
  }

  if (status === 401 || status === 403) {
    return 'De API weigert de authenticatie, of de client heeft geen rechten op deze resource. Vraag het na bij de beheerder van de testomgeving.';
  }

  if (status === 404) {
    return 'Pad niet gevonden. Klopt de basis-URL (eindigt op /api/v1/)?';
  }

  return null;
}

// Een losse GET, zodat de foutmelding van de API zichtbaar wordt. `requestData` geeft die niet door.
async function checkVerbinding(
  url: string,
  headers: Record<string, string>,
  params?: Record<string, string | number>
): Promise<Verbinding> {
  try {
    const response = await axios.get(url, {
      headers,
      params,
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });

    if (response.status < 300) {
      return {
        ok: true,
        melding: `HTTP ${response.status}`,
        hint: null,
        data: response.data,
      };
    }

    // De ZGW-API's geven bij een fout een `code` en `detail`, bijvoorbeeld `jwt-expired`.
    const { code, detail } = (response.data ?? {}) as {
      code?: string;
      detail?: string;
    };

    return {
      ok: false,
      melding: [`HTTP ${response.status}`, code, detail]
        .filter(Boolean)
        .join(' | '),
      hint: getHint(response.status, code),
    };
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };

    return {
      ok: false,
      melding: `Geen verbinding: ${code ?? message}`,
      hint: 'Is de host bereikbaar vanaf deze machine?',
    };
  }
}

function toonVerbinding(verbinding: Verbinding, extra = '') {
  regel(
    `  ${verbinding.ok ? 'OK  ' : 'FOUT'} verbinding: ${verbinding.melding}${extra}`
  );
  if (verbinding.hint) {
    regel(`       ${verbinding.hint}`);
  }
}

function toonProblemen(problemen: string[]) {
  problemen.forEach((probleem) => regel(`  FOUT configuratie: ${probleem}`));
}

async function checkOpenKlant(
  config: GemeenteKlantcontactConfig,
  problemen: string[],
  auth: AuthProfileAndToken | null
): Promise<boolean> {
  const { url, token } = config.openKlant ?? {};
  regel('\nOpen Klant (Klantinteracties API)');
  toonProblemen(problemen);

  if (!url || !token) {
    return false;
  }

  const verbinding = await checkVerbinding(
    joinApiUrl(url, 'partijen'),
    { Authorization: `Token ${token}`, Accept: 'application/json' },
    { pageSize: 1 }
  );
  const count = (verbinding.data as { count?: number } | undefined)?.count;
  toonVerbinding(verbinding, count === undefined ? '' : `, ${count} partijen`);

  if (!verbinding.ok || !auth) {
    return verbinding.ok && !problemen.length;
  }

  const contactgegevens =
    await createOpenKlantBackend(config).fetchContactgegevens(auth);

  if (contactgegevens.status !== 'OK') {
    regel(
      `  FOUT contactgegevens van ${auth.profile.id}: ${foutmelding(contactgegevens)}`
    );
    return false;
  }

  regel(
    `  OK   contactgegevens van ${auth.profile.id}: ${contactgegevens.content.length}`
  );

  if (!contactgegevens.content.length) {
    regel(
      '       Geen adressen. Staat deze identificatie als partij in Open Klant?'
    );
  }

  contactgegevens.content.forEach((contactgegeven) => {
    const kenmerken = [
      contactgegeven.isDefault && 'standaard',
      contactgegeven.isGeverifieerd ? 'geverifieerd' : 'niet geverifieerd',
      contactgegeven.referentie && `referentie ${contactgegeven.referentie}`,
    ].filter(Boolean);

    regel(
      `       - ${contactgegeven.type} ${maskeerAdres(contactgegeven.waarde)} (${kenmerken.join(', ')})`
    );
  });

  return !problemen.length;
}

async function checkOpenZaak(
  config: OpenZaakConfig,
  problemen: string[],
  auth: AuthProfileAndToken | null,
  zaakIdentificatie?: string
): Promise<boolean> {
  regel('\nOpen Zaak (Zaken API)');
  toonProblemen(problemen);

  if (!config.url || !hasZgwJwtCredentials(config)) {
    return false;
  }

  const verbinding = await checkVerbinding(
    joinApiUrl(config.url, 'zaken'),
    {
      Authorization: `Bearer ${await createZgwJwt(config)}`,
      Accept: 'application/json',
      'Accept-Crs': 'EPSG:4326',
    },
    { page: 1 }
  );
  const zaken = verbinding.data as
    { count?: number; results?: { bronorganisatie: string }[] } | undefined;
  toonVerbinding(
    verbinding,
    zaken?.count === undefined ? '' : `, ${zaken.count} zaken`
  );

  // Helpt bij het invullen van BFF_OPENZAAK_BRONORGANISATIE.
  if (verbinding.ok && !config.bronorganisatie && zaken?.results?.length) {
    const bronorganisaties = new Set(
      zaken.results.map((zaak) => zaak.bronorganisatie)
    );
    regel(
      `       Bronorganisaties op de eerste pagina: ${[...bronorganisaties].join(', ')}`
    );
  }

  if (!verbinding.ok || !zaakIdentificatie) {
    return verbinding.ok && !problemen.length;
  }

  const zaak = await fetchZaakByIdentificatie(config, zaakIdentificatie);

  if (zaak.status !== 'OK') {
    regel(`  FOUT zaak ${zaakIdentificatie}: ${foutmelding(zaak)}`);
    return false;
  }

  regel(
    `  ${zaak.content ? 'OK  ' : 'FOUT'} zaak ${zaakIdentificatie}: ${zaak.content ? 'gevonden' : 'niet gevonden binnen de bronorganisatie'}`
  );

  if (!zaak.content || !auth) {
    return !!zaak.content && !problemen.length;
  }

  const isVanGebruiker = await zaakIsVanGebruiker(
    config,
    auth,
    zaakIdentificatie
  );

  if (isVanGebruiker.status !== 'OK') {
    regel(`  FOUT eigenaarschap: ${foutmelding(isVanGebruiker)}`);
    return false;
  }

  regel(
    `  OK   ${auth.profile.id} is ${isVanGebruiker.content ? '' : 'niet '}de initiator van de zaak`
  );

  return !problemen.length;
}

async function checkOpenNotificaties(
  config: OpenNotificatiesConfig,
  problemen: string[]
): Promise<boolean> {
  regel('\nOpen Notificaties');
  toonProblemen(problemen);

  if (!config.url || !hasZgwJwtCredentials(config)) {
    return false;
  }

  const verbinding = await checkVerbinding(joinApiUrl(config.url, 'kanaal'), {
    Authorization: `Bearer ${await createZgwJwt(config)}`,
    Accept: 'application/json',
  });
  toonVerbinding(verbinding);

  if (!verbinding.ok) {
    return false;
  }

  const [kanalen, abonnementen] = await Promise.all([
    fetchKanalen(config),
    fetchAbonnementen(config),
  ]);

  if (kanalen.status !== 'OK') {
    regel(`  FOUT kanalen: ${foutmelding(kanalen)}`);
    return false;
  }

  regel(
    `  OK   kanalen: ${kanalen.content.map((kanaal) => kanaal.naam).join(', ')}`
  );

  if (abonnementen.status !== 'OK') {
    regel(`  FOUT abonnementen: ${foutmelding(abonnementen)}`);
    return false;
  }

  // De OMC krijgt alleen events als hij op het kanaal `zaken` is ingetekend.
  const opZaken = abonnementen.content.filter((abonnement) =>
    abonnement.kanalen.some((kanaal) => kanaal.naam === KANAAL_ZAKEN)
  );

  regel(
    `  ${opZaken.length ? 'OK  ' : 'FOUT'} abonnementen op kanaal '${KANAAL_ZAKEN}': ${opZaken.length}`
  );
  opZaken.forEach((abonnement) => regel(`       - ${abonnement.callbackUrl}`));

  return !!opZaken.length && !problemen.length;
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      bsn: { type: 'string' },
      kvk: { type: 'string' },
      zaak: { type: 'string' },
    },
  });

  const klantcontactConfig = getAmsterdamKlantcontactConfig();
  const openNotificatiesConfig = getOpenNotificatiesConfig();
  const problemen = getConfigProblemen({
    openKlant: klantcontactConfig.openKlant ?? {},
    openZaak: klantcontactConfig.openZaak ?? {},
    openNotificaties: openNotificatiesConfig,
  });
  const auth = getAuth(args);

  regel(
    `Klantcontact-backend van de BFF (BFF_KLANTCONTACT_BACKEND): ${getKlantcontactBackendNaam()}`
  );

  const resultaten = [
    await checkOpenKlant(klantcontactConfig, problemen.openKlant, auth),
    await checkOpenZaak(
      klantcontactConfig.openZaak ?? {},
      problemen.openZaak,
      auth,
      args.zaak
    ),
    await checkOpenNotificaties(
      openNotificatiesConfig,
      problemen.openNotificaties
    ),
  ];

  const geslaagd = resultaten.every(Boolean);
  regel(
    `\n${geslaagd ? 'Alle koppelingen werken.' : 'Niet alle koppelingen werken, zie FOUT hierboven.'}`
  );
  process.exitCode = geslaagd ? 0 : 1;
}

if (import.meta.main) {
  await main();
}

export const forTesting = {
  isBasisUrl,
  looksLikeJwt,
  getConfigProblemen,
  checkVerbinding,
};
