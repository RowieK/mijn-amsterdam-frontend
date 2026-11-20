/**
 * Zoekt op de testomgeving open zaken in Open Zaak met een burger als initiator, om een testpersoon te kiezen
 * voor de koppeling met Mijn Amsterdam. Per BSN toont het script de zaken en of er al een partij in Open Klant is,
 * met een geverifieerd e-mailadres. Het script doet alleen GET-aanroepen en wijzigt niets.
 *
 * Gebruik
 * =======
 * pnpm zgw:testzaken            de 10 meest recente initiatoren
 * pnpm zgw:testzaken --max=25   meer initiatoren
 *
 * Het BSN van de OMC-producttests wordt overgeslagen. Kies bij voorkeur een BSN zonder partij in Open Klant:
 * een bestaande partij kan van de tests van iemand anders zijn. `pnpm zgw:seed` maakt de partij aan.
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
import type { GemeenteKlantcontactConfig } from '../server/services/klantcontact/klantcontact-backend-types.ts';
import { isZaakContactgegeven } from '../server/services/klantcontact/klantcontact-helpers.ts';
import {
  fetchPartij,
  getDigitaleAdressen,
} from '../server/services/klantcontact/klantcontact-openklant.ts';
import { getAmsterdamKlantcontactConfig } from '../server/services/klantcontact/klantcontact-service-config.ts';
import type { OpenZaakConfig } from '../server/services/openzaak/openzaak-service-config.ts';
import { ROL_OMSCHRIJVING_GENERIEK_INITIATOR } from '../server/services/openzaak/openzaak-service-config.ts';
import type {
  OpenZaakPaginatedSource,
  ZaakMetRollenSource,
} from '../server/services/openzaak/openzaak-types.ts';

type Testkandidaat = {
  bsn: string;
  zaken: Pick<
    ZaakMetRollenSource,
    'identificatie' | 'omschrijving' | 'startdatum'
  >[];
};

const TIMEOUT_MS = 15_000;
const DEFAULT_MAX = 10;
const ZAKEN_PER_KANDIDAAT = 3;

// Groepeert de zaken per BSN van de initiator, in de volgorde van de zaken (de meest recente eerst).
function getTestkandidaten(
  zaken: ZaakMetRollenSource[],
  max: number
): Testkandidaat[] {
  const kandidaten = new Map<string, Testkandidaat>();

  zaken.forEach((zaak) => {
    (zaak._expand?.rollen ?? [])
      .filter(
        (rol) =>
          rol.omschrijvingGeneriek === ROL_OMSCHRIJVING_GENERIEK_INITIATOR &&
          rol.betrokkeneType === 'natuurlijk_persoon'
      )
      .forEach((rol) => {
        const bsn = rol.betrokkeneIdentificatie?.inpBsn;

        if (!bsn || bsn === OMC_PRODUCTTEST_BSN) {
          return;
        }

        const kandidaat = kandidaten.get(bsn) ?? { bsn, zaken: [] };
        kandidaat.zaken.push({
          identificatie: zaak.identificatie,
          omschrijving: zaak.omschrijving,
          startdatum: zaak.startdatum,
        });
        kandidaten.set(bsn, kandidaat);
      });
  });

  return [...kandidaten.values()].slice(0, max);
}

// De eerste pagina open zaken met een burger als initiator, de meest recente eerst.
async function fetchOpenZakenMetInitiator(
  config: OpenZaakConfig
): Promise<ZaakMetRollenSource[]> {
  if (!config.url || !config.bronorganisatie || !hasZgwJwtCredentials(config)) {
    throw new Error(
      'Open Zaak is niet geconfigureerd. Draai eerst pnpm zgw:check.'
    );
  }

  const response = await axios.get(joinApiUrl(config.url, 'zaken'), {
    headers: {
      Authorization: `Bearer ${await createZgwJwt(config)}`,
      Accept: 'application/json',
      'Accept-Crs': 'EPSG:4326',
    },
    params: {
      bronorganisatie: config.bronorganisatie,
      einddatum__isnull: true,
      rol__omschrijvingGeneriek: ROL_OMSCHRIJVING_GENERIEK_INITIATOR,
      rol__betrokkeneType: 'natuurlijk_persoon',
      expand: 'rollen',
      ordering: '-startdatum',
    },
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (response.status >= 300) {
    throw new Error(
      `Zaken ophalen: ${formatApiFout(response.status, response.data)}`
    );
  }

  return (response.data as OpenZaakPaginatedSource<ZaakMetRollenSource>)
    .results;
}

async function getStatusInOpenKlant(
  openKlant: NonNullable<GemeenteKlantcontactConfig['openKlant']>,
  bsn: string
): Promise<string> {
  const auth = getAuth({ bsn });
  const partij = auth ? await fetchPartij(openKlant, auth) : null;

  if (!partij || partij.status !== 'OK') {
    return `Open Klant: fout (${partij ? foutmelding(partij) : 'geen BSN'})`;
  }

  if (!partij.content) {
    return 'geen partij in Open Klant';
  }

  const heeftGeverifieerdEmail = getDigitaleAdressen(partij.content).some(
    (digitaalAdres) =>
      digitaalAdres.soortDigitaalAdres === 'email' &&
      !!digitaalAdres.verificatieDatum &&
      !isZaakContactgegeven(digitaalAdres)
  );

  return `partij in Open Klant, ${heeftGeverifieerdEmail ? 'met' : 'zonder'} geverifieerd e-mailadres`;
}

async function main() {
  const { values: args } = parseArgs({
    options: { max: { type: 'string' } },
  });
  const max = Number(args.max ?? DEFAULT_MAX) || DEFAULT_MAX;
  const config = getAmsterdamKlantcontactConfig();

  try {
    const zaken = await fetchOpenZakenMetInitiator(config.openZaak ?? {});
    const kandidaten = getTestkandidaten(zaken, max);

    regel(
      `${zaken.length} open zaken met een burger als initiator (eerste pagina), ${kandidaten.length} BSN's getoond.\n`
    );

    for (const kandidaat of kandidaten) {
      const status = config.openKlant
        ? await getStatusInOpenKlant(config.openKlant, kandidaat.bsn)
        : 'Open Klant niet geconfigureerd';

      regel(
        `BSN ${kandidaat.bsn}: ${kandidaat.zaken.length} zaak/zaken, ${status}`
      );
      kandidaat.zaken
        .slice(0, ZAKEN_PER_KANDIDAAT)
        .forEach((zaak) =>
          regel(
            `   ${zaak.identificatie}  ${zaak.startdatum}  ${zaak.omschrijving || '(geen omschrijving)'}`
          )
        );
    }

    regel(
      '\nVolgende stap: pnpm zgw:seed --bsn=<bsn> --email=<adres> --dry-run'
    );
  } catch (error) {
    regel(`FOUT ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}

export const forTesting = { getTestkandidaten, fetchOpenZakenMetInitiator };
