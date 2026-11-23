/**
 * Koppelt testzaken aan een testpersoon: maakt op de testomgeving nieuwe zaken in Open Zaak aan met het BSN als
 * initiator. Daarna staan die zaken in Mijn Amsterdam bij Mijn contact (thema Zaken) en kan de testpersoon er per
 * zaak een kanaal voor kiezen.
 *
 * Het script maakt altijd nieuwe zaken. Het zet het BSN niet als initiator op bestaande zaken: die horen bij de
 * tests van iemand anders, en een zaak heeft hoogstens één initiator.
 *
 * Zonder --zaaktype neemt het script het zaaktype over van de meest recente open zaak met een burger als initiator.
 * Met --alle-zaaktypen maakt het één zaak per gepubliceerd zaaktype met een roltype "initiator", in de nieuwste versie.
 * De zaaktypen en roltypen komen uit de Catalogi API van hetzelfde Open Zaak.
 *
 * Gebruik
 * =======
 * pnpm zgw:testzaken-aanmaken --bsn=<bsn> --dry-run          laat zien wat het script zou doen, zonder iets te schrijven
 * pnpm zgw:testzaken-aanmaken --bsn=<bsn>                    maakt 3 zaken aan
 * pnpm zgw:testzaken-aanmaken --bsn=<bsn> --aantal=5         een ander aantal (maximaal 10)
 * pnpm zgw:testzaken-aanmaken --bsn=<bsn> --zaaktype=<url>   met een eigen zaaktype
 * pnpm zgw:testzaken-aanmaken --bsn=<bsn> --alle-zaaktypen   één zaak per zaaktype (maximaal 50)
 *
 * Het script draait alleen in de ontwikkelomgeving en weigert het BSN van de OMC-producttests.
 * Elke nieuwe zaak gaat via Open Notificaties naar de OMC. Staat het zaaktype in de whitelist van de OMC, dan kan
 * die een bericht sturen naar het standaardadres van de testpersoon.
 */
import '../server/helpers/load-env.ts';

import { parseArgs } from 'node:util';

import axios from 'axios';

import {
  OMC_PRODUCTTEST_BSN,
  formatApiFout,
  foutmelding,
  getAuth,
  regel,
} from './zgw-script-helpers.ts';
import {
  createZgwJwt,
  hasZgwJwtCredentials,
  joinApiUrl,
} from '../server/helpers/zgw-api-helpers.ts';
import { fetchZakenVanGebruiker } from '../server/services/openzaak/openzaak-api-service.ts';
import {
  ROL_OMSCHRIJVING_GENERIEK_INITIATOR,
  getOpenZaakConfig,
  type OpenZaakConfig,
} from '../server/services/openzaak/openzaak-service-config.ts';
import type {
  OpenZaakPaginatedSource,
  ZaakSource,
} from '../server/services/openzaak/openzaak-types.ts';
import { IS_DEVELOPMENT } from '../universal/config/env.ts';

type ConfiguredOpenZaakConfig = Required<OpenZaakConfig>;

type ZaakMetZaaktypeSource = ZaakSource & { zaaktype: string };

type ZaaktypeSource = {
  url: string;
  identificatie: string;
  omschrijving: string;
  beginGeldigheid: string;
  eindeGeldigheid?: string | null;
};

type RoltypeSource = {
  url: string;
  zaaktype: string;
  zaaktypeIdentificatie?: string;
  omschrijving: string;
  omschrijvingGeneriek: string;
};

type TeMakenZaak = {
  zaaktype: string;
  roltype: RoltypeSource;
  omschrijving: string;
  geldigTot?: string | null;
};

type Plan = {
  bsn: string;
  bestaandeZaken: string[];
  zaken: TeMakenZaak[];
};

type Invoer = {
  bsn?: string;
  aantal?: string;
  zaaktype?: string;
  alleZaaktypen?: boolean;
};

const TIMEOUT_MS = 15_000;
const DEFAULT_AANTAL = 3;
const MAX_AANTAL = 10;
// Een grens voor --alle-zaaktypen, zodat een grote catalogus de gedeelde testomgeving niet volschrijft.
const MAX_ZAAKTYPEN = 50;
const MAX_PAGINAS = 20;
const OMSCHRIJVING_MAX_LENGTE = 80;
const OMSCHRIJVING_TESTZAAK = 'Testzaak Mijn Amsterdam';
const TOELICHTING_TESTZAAK =
  'Aangemaakt door zgw:testzaken-aanmaken voor de koppeling met Mijn Amsterdam.';
const ROLTOELICHTING = 'Testpersoon Mijn Amsterdam';

function isConfigured(
  config: OpenZaakConfig
): config is ConfiguredOpenZaakConfig {
  return (
    !!config.url && !!config.bronorganisatie && hasZgwJwtCredentials(config)
  );
}

// De Catalogi API hoort bij hetzelfde Open Zaak: …/catalogi/api/v1/zaaktypen/<uuid> geeft …/catalogi/api/v1.
function getCatalogiUrl(zaaktype: string): string | null {
  const index = zaaktype.indexOf('/zaaktypen/');
  return /^https?:\/\//.test(zaaktype) && index > 0
    ? zaaktype.slice(0, index)
    : null;
}

function checkInvoer({ bsn, aantal, zaaktype, alleZaaktypen }: Invoer) {
  const aantalGetal = Number(aantal ?? DEFAULT_AANTAL);

  return [
    !bsn && '--bsn ontbreekt',
    bsn && !/^\d{9}$/.test(bsn) && 'Een BSN heeft 9 cijfers',
    bsn === OMC_PRODUCTTEST_BSN &&
      `${OMC_PRODUCTTEST_BSN} gebruiken de producttests van de OMC. Kies een ander BSN.`,
    (!Number.isInteger(aantalGetal) ||
      aantalGetal < 1 ||
      aantalGetal > MAX_AANTAL) &&
      `--aantal moet tussen 1 en ${MAX_AANTAL} liggen`,
    zaaktype !== undefined &&
      !getCatalogiUrl(zaaktype) &&
      '--zaaktype moet de URL van een zaaktype zijn (…/catalogi/api/v1/zaaktypen/<uuid>)',
    alleZaaktypen &&
      (aantal !== undefined || zaaktype !== undefined) &&
      '--alle-zaaktypen gaat niet samen met --aantal of --zaaktype',
  ].filter((probleem): probleem is string => !!probleem);
}

function vandaag(): string {
  return new Date().toISOString().slice(0, 10);
}

async function openZaakRequest<T>(
  config: ConfiguredOpenZaakConfig,
  method: 'GET' | 'POST',
  url: string,
  { params, data }: { params?: Record<string, unknown>; data?: unknown } = {}
): Promise<T> {
  const response = await axios.request({
    method,
    url,
    params,
    data,
    headers: {
      Authorization: `Bearer ${await createZgwJwt(config)}`,
      Accept: 'application/json',
      'Accept-Crs': 'EPSG:4326',
      // Een nieuwe zaak vraagt om Content-Crs, ook zonder zaakgeometrie.
      ...(data !== undefined && {
        'Content-Type': 'application/json',
        'Content-Crs': 'EPSG:4326',
      }),
    },
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (response.status >= 300) {
    throw new Error(
      `${method} ${new URL(url).pathname}: ${formatApiFout(response.status, response.data)}`
    );
  }

  return response.data as T;
}

// Volgt `next` tot de laatste pagina. `next` is een volledige URL met de filters er al in.
async function fetchAllePaginas<T>(
  config: ConfiguredOpenZaakConfig,
  url: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const resultaten: T[] = [];
  let pagina = await openZaakRequest<OpenZaakPaginatedSource<T>>(
    config,
    'GET',
    url,
    { params }
  );
  resultaten.push(...pagina.results);

  for (let nummer = 2; pagina.next; nummer++) {
    if (nummer > MAX_PAGINAS) {
      throw new Error(
        `Meer dan ${MAX_PAGINAS} pagina's bij ${new URL(url).pathname}`
      );
    }
    pagina = await openZaakRequest<OpenZaakPaginatedSource<T>>(
      config,
      'GET',
      pagina.next
    );
    resultaten.push(...pagina.results);
  }

  return resultaten;
}

// Het zaaktype van de meest recente open zaak met een burger als initiator. Dat zaaktype kent dus een initiator.
async function fetchRecentZaaktype(
  config: ConfiguredOpenZaakConfig
): Promise<string | null> {
  const response = await openZaakRequest<
    OpenZaakPaginatedSource<ZaakMetZaaktypeSource>
  >(config, 'GET', joinApiUrl(config.url, 'zaken'), {
    params: {
      bronorganisatie: config.bronorganisatie,
      einddatum__isnull: true,
      rol__omschrijvingGeneriek: ROL_OMSCHRIJVING_GENERIEK_INITIATOR,
      rol__betrokkeneType: 'natuurlijk_persoon',
      ordering: '-startdatum',
    },
  });

  return response.results[0]?.zaaktype ?? null;
}

function getCatalogiUrlOfFout(zaaktype: string): string {
  const catalogiUrl = getCatalogiUrl(zaaktype);

  if (!catalogiUrl) {
    throw new Error(`Geen URL van een zaaktype: ${zaaktype}`);
  }

  return catalogiUrl;
}

async function fetchInitiatorRoltype(
  config: ConfiguredOpenZaakConfig,
  zaaktype: string
): Promise<RoltypeSource | null> {
  const response = await openZaakRequest<
    OpenZaakPaginatedSource<RoltypeSource>
  >(config, 'GET', joinApiUrl(getCatalogiUrlOfFout(zaaktype), 'roltypen'), {
    params: {
      zaaktype,
      omschrijvingGeneriek: ROL_OMSCHRIJVING_GENERIEK_INITIATOR,
    },
  });

  return (
    response.results.find(
      (roltype) =>
        roltype.omschrijvingGeneriek === ROL_OMSCHRIJVING_GENERIEK_INITIATOR
    ) ?? null
  );
}

// Van een zaaktype met meerdere versies telt alleen de nieuwste.
function getNieuwsteVersies(zaaktypen: ZaaktypeSource[]): ZaaktypeSource[] {
  const nieuwste = new Map<string, ZaaktypeSource>();

  zaaktypen.forEach((zaaktype) => {
    const huidige = nieuwste.get(zaaktype.identificatie);

    if (!huidige || zaaktype.beginGeldigheid > huidige.beginGeldigheid) {
      nieuwste.set(zaaktype.identificatie, zaaktype);
    }
  });

  return [...nieuwste.values()];
}

// Eén zaak per gepubliceerd zaaktype, in de nieuwste versie. Een zaaktype zonder initiator valt af:
// zonder initiator ziet de testpersoon de zaak niet. Op de testomgeving is de geldigheid van zaaktypen vaak
// verlopen; daarom filtert het script daar niet op, maar toont het de einddatum in het plan.
async function planAlleZaaktypen(
  config: ConfiguredOpenZaakConfig,
  catalogiUrl: string
): Promise<TeMakenZaak[]> {
  const [zaaktypen, roltypen] = await Promise.all([
    fetchAllePaginas<ZaaktypeSource>(
      config,
      joinApiUrl(catalogiUrl, 'zaaktypen'),
      { status: 'definitief' }
    ),
    fetchAllePaginas<RoltypeSource>(
      config,
      joinApiUrl(catalogiUrl, 'roltypen'),
      {
        status: 'definitief',
        omschrijvingGeneriek: ROL_OMSCHRIJVING_GENERIEK_INITIATOR,
      }
    ),
  ]);

  const zaken = getNieuwsteVersies(zaaktypen).flatMap((zaaktype) => {
    const roltype = roltypen.find(
      (kandidaat) =>
        kandidaat.zaaktype === zaaktype.url &&
        kandidaat.omschrijvingGeneriek === ROL_OMSCHRIJVING_GENERIEK_INITIATOR
    );

    return roltype
      ? [
          {
            zaaktype: zaaktype.url,
            roltype,
            omschrijving:
              `Testzaak: ${zaaktype.omschrijving || zaaktype.identificatie}`.slice(
                0,
                OMSCHRIJVING_MAX_LENGTE
              ),
            geldigTot: zaaktype.eindeGeldigheid,
          },
        ]
      : [];
  });

  if (!zaken.length) {
    throw new Error(
      `Geen zaaktype met een roltype "initiator" gevonden (${zaaktypen.length} gepubliceerde zaaktypen, ${roltypen.length} roltypen "initiator").`
    );
  }

  return zaken;
}

async function planEenZaaktype(
  config: ConfiguredOpenZaakConfig,
  zaaktype: string,
  aantal: number
): Promise<TeMakenZaak[]> {
  const roltype = await fetchInitiatorRoltype(config, zaaktype);

  if (!roltype) {
    throw new Error(
      'Het zaaktype heeft geen roltype "initiator". Kies een ander zaaktype met --zaaktype.'
    );
  }

  return Array.from({ length: aantal }, (_, index) => ({
    zaaktype,
    roltype,
    omschrijving: `${OMSCHRIJVING_TESTZAAK} ${index + 1} (${vandaag()})`,
  }));
}

// Doet alleen GET-aanroepen. Een dry-run controleert zo ook of de client zaken, zaaktypen en roltypen mag lezen.
async function maakPlan(
  config: ConfiguredOpenZaakConfig,
  {
    bsn,
    aantal = DEFAULT_AANTAL,
    zaaktype,
    alleZaaktypen = false,
  }: {
    bsn: string;
    aantal?: number;
    zaaktype?: string;
    alleZaaktypen?: boolean;
  }
): Promise<Plan> {
  // Dezelfde aanroep als de BFF: wat hier staat, ziet de testpersoon na het inloggen.
  const bestaand = await fetchZakenVanGebruiker(config, getAuth({ bsn })!);

  if (bestaand.status !== 'OK') {
    throw new Error(`Zaken van ${bsn} ophalen: ${foutmelding(bestaand)}`);
  }

  const gekozenZaaktype = zaaktype ?? (await fetchRecentZaaktype(config));

  if (!gekozenZaaktype) {
    throw new Error(
      'Geen open zaak met een burger als initiator gevonden om het zaaktype van over te nemen. Geef er een mee met --zaaktype.'
    );
  }

  const zaken = alleZaaktypen
    ? await planAlleZaaktypen(config, getCatalogiUrlOfFout(gekozenZaaktype))
    : await planEenZaaktype(config, gekozenZaaktype, aantal);

  if (!zaken.length) {
    throw new Error(
      'Geen geldig zaaktype met een roltype "initiator" gevonden.'
    );
  }

  if (zaken.length > MAX_ZAAKTYPEN) {
    throw new Error(
      `${zaken.length} zaaktypen gevonden, meer dan de grens van ${MAX_ZAAKTYPEN}. Kies er een met --zaaktype.`
    );
  }

  return {
    bsn,
    bestaandeZaken: bestaand.content
      .filter((zaak) => !zaak.einddatum)
      .map((zaak) => zaak.identificatie),
    zaken,
  };
}

function toonPlan(plan: Plan) {
  regel(`Plan voor ${plan.bsn}:`);
  regel(
    plan.bestaandeZaken.length
      ? `  - nu initiator van ${plan.bestaandeZaken.length} open zaak/zaken: ${plan.bestaandeZaken.join(', ')}`
      : '  - nu initiator van geen enkele open zaak'
  );
  regel(`  - ${plan.zaken.length} zaak/zaken aanmaken:`);
  plan.zaken.forEach(({ omschrijving, roltype, zaaktype, geldigTot }) =>
    regel(
      `      ${omschrijving}  (zaaktype ${roltype.zaaktypeIdentificatie || zaaktype}, initiator "${roltype.omschrijving}"${geldigTot ? `, geldig tot ${geldigTot}` : ''})`
    )
  );
  regel(
    '  ! Elke nieuwe zaak gaat via Open Notificaties naar de OMC. Staat het zaaktype in de whitelist van de OMC, dan kan die een bericht sturen naar het standaardadres van deze persoon.'
  );
}

// Per zaak eerst de zaak, dan de rol. Een fout stopt de rest niet: bij --alle-zaaktypen kan de client voor het
// ene zaaktype wel rechten hebben en voor het andere niet. Mislukt de rol, dan staat er een zaak zonder
// initiator: die ziet niemand in Mijn Amsterdam.
async function maakZakenAan(
  config: ConfiguredOpenZaakConfig,
  plan: Plan
): Promise<{ aangemaakt: string[]; fouten: string[] }> {
  const aangemaakt: string[] = [];
  const fouten: string[] = [];
  const startdatum = vandaag();

  for (const { zaaktype, roltype, omschrijving } of plan.zaken) {
    let zaak: ZaakSource;

    try {
      zaak = await openZaakRequest<ZaakSource>(
        config,
        'POST',
        joinApiUrl(config.url, 'zaken'),
        {
          data: {
            bronorganisatie: config.bronorganisatie,
            verantwoordelijkeOrganisatie: config.bronorganisatie,
            zaaktype,
            startdatum,
            omschrijving,
            toelichting: TOELICHTING_TESTZAAK,
          },
        }
      );
    } catch (error) {
      fouten.push(`${omschrijving}: ${(error as Error).message}`);
      regel(`  x ${omschrijving}`);
      continue;
    }

    try {
      await openZaakRequest(config, 'POST', joinApiUrl(config.url, 'rollen'), {
        data: {
          zaak: zaak.url,
          betrokkeneType: 'natuurlijk_persoon',
          roltype: roltype.url,
          roltoelichting: ROLTOELICHTING,
          betrokkeneIdentificatie: { inpBsn: plan.bsn },
        },
      });
    } catch (error) {
      fouten.push(
        `Zaak ${zaak.identificatie} is aangemaakt, maar zonder initiator. ${(error as Error).message}`
      );
      regel(`  x ${zaak.identificatie}  ${omschrijving}`);
      continue;
    }

    regel(`  + ${zaak.identificatie}  ${omschrijving}`);
    aangemaakt.push(zaak.identificatie);
  }

  return { aangemaakt, fouten };
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      bsn: { type: 'string' },
      aantal: { type: 'string' },
      zaaktype: { type: 'string' },
      'alle-zaaktypen': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  if (!IS_DEVELOPMENT) {
    regel('Dit script draait alleen in de ontwikkelomgeving.');
    process.exitCode = 1;
    return;
  }

  const invoer: Invoer = {
    bsn: args.bsn,
    aantal: args.aantal,
    zaaktype: args.zaaktype,
    alleZaaktypen: args['alle-zaaktypen'],
  };
  const problemen = checkInvoer(invoer);
  const config = getOpenZaakConfig();

  if (!isConfigured(config)) {
    problemen.push(
      'BFF_OPENZAAK_BASE_URL, BFF_OPENZAAK_CLIENT_ID, BFF_OPENZAAK_JWT_SECRET of BFF_OPENZAAK_BRONORGANISATIE ontbreekt'
    );
  }

  if (problemen.length || !args.bsn || !isConfigured(config)) {
    problemen.forEach((probleem) => regel(`FOUT ${probleem}`));
    process.exitCode = 1;
    return;
  }

  try {
    const plan = await maakPlan(config, {
      bsn: args.bsn,
      aantal: Number(args.aantal ?? DEFAULT_AANTAL),
      zaaktype: args.zaaktype,
      alleZaaktypen: args['alle-zaaktypen'],
    });
    toonPlan(plan);

    if (args['dry-run']) {
      regel('\nDry-run: er is niets geschreven.');
      return;
    }

    regel('');
    const { aangemaakt, fouten } = await maakZakenAan(config, plan);

    regel(
      `\n${aangemaakt.length} van ${plan.zaken.length} zaak/zaken aangemaakt met ${plan.bsn} als initiator.`
    );
    fouten.forEach((fout) => regel(`FOUT ${fout}`));

    if (aangemaakt.length) {
      regel(
        `\nControleer met: pnpm zgw:check --bsn=${plan.bsn} --zaak=${aangemaakt[0]}\nLog daarna in met het dev-account van dit BSN en ga naar Mijn contact.`
      );
    }

    process.exitCode = fouten.length ? 1 : 0;
  } catch (error) {
    regel(`FOUT ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}

export const forTesting = {
  checkInvoer,
  getCatalogiUrl,
  maakPlan,
  maakZakenAan,
};
