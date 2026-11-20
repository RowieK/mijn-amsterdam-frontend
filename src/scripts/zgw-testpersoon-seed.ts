/**
 * Maakt op de testomgeving een testpersoon klaar in Open Klant: een partij met het BSN en een geverifieerd
 * e-mailadres als standaardadres. Daarna kan die persoon in Mijn Amsterdam per zaak een kanaal kiezen.
 *
 * Open Klant kent geen verificatie. Het script zet de `verificatieDatum` daarom zelf. Dat is een shortcut voor de
 * testomgeving, zolang de verificatie via NotifyNL er niet is.
 *
 * Gebruik
 * =======
 * pnpm zgw:seed --bsn=<bsn> --email=<adres> --dry-run   laat zien wat het script zou doen, zonder iets te schrijven
 * pnpm zgw:seed --bsn=<bsn> --email=<adres>             voert het uit
 *
 * Het script draait alleen in de ontwikkelomgeving en weigert het BSN van de OMC-producttests.
 * Het e-mailadres wordt gemaskeerd getoond. Twee keer draaien is veilig: wat al klopt, blijft staan.
 */
import '../server/helpers/load-env.ts';

import { parseArgs } from 'node:util';

import axios from 'axios';

import {
  OMC_PRODUCTTEST_BSN,
  formatApiFout,
  foutmelding,
  getAuth,
  maskeerAdres,
  regel,
} from './zgw-script-helpers.ts';
import type { AuthProfileAndToken } from '../server/auth/auth-types.ts';
import { joinApiUrl } from '../server/helpers/zgw-api-helpers.ts';
import { isZaakContactgegeven } from '../server/services/klantcontact/klantcontact-helpers.ts';
import type {
  DigitaalAdresSource,
  PartijSource,
} from '../server/services/klantcontact/klantcontact-openklant-types.ts';
import {
  fetchPartij,
  getDigitaleAdressen,
} from '../server/services/klantcontact/klantcontact-openklant.ts';
import { getAmsterdamKlantcontactConfig } from '../server/services/klantcontact/klantcontact-service-config.ts';
import { IS_DEVELOPMENT } from '../universal/config/env.ts';

type OpenKlantConfig = { url: string; token: string };

type SeedPlan = {
  maakPartij: boolean;
  adres:
    | { soort: 'aanmaken' }
    | { soort: 'bijwerken'; uuid: string }
    | { soort: 'in-orde'; uuid: string };
  waarschuwingen: string[];
};

const TIMEOUT_MS = 15_000;
const OMSCHRIJVING_TESTADRES = 'Testadres (zgw:seed)';

function checkInvoer({ bsn, email }: { bsn?: string; email?: string }) {
  return [
    !bsn && '--bsn ontbreekt',
    bsn && !/^\d{9}$/.test(bsn) && 'Een BSN heeft 9 cijfers',
    bsn === OMC_PRODUCTTEST_BSN &&
      `${OMC_PRODUCTTEST_BSN} gebruiken de producttests van de OMC. Kies een ander BSN.`,
    !email && '--email ontbreekt',
    // De maximale lengte van DigitaalAdres.adres in Open Klant.
    email &&
      (!email.includes('@') || email.length > 80) &&
      'Geen geldig e-mailadres (maximaal 80 tekens)',
  ].filter((probleem): probleem is string => !!probleem);
}

function getAdresActie(bestaand?: DigitaalAdresSource): SeedPlan['adres'] {
  if (!bestaand) {
    return { soort: 'aanmaken' };
  }

  return bestaand.verificatieDatum && bestaand.isStandaardAdres
    ? { soort: 'in-orde', uuid: bestaand.uuid }
    : { soort: 'bijwerken', uuid: bestaand.uuid };
}

// Bepaalt wat er moet gebeuren. Zaakadressen (met de referentie van een zaak) blijven buiten beschouwing.
function planSeed(partij: PartijSource | null, email: string): SeedPlan {
  const emailAdressen = (partij ? getDigitaleAdressen(partij) : []).filter(
    (digitaalAdres) =>
      digitaalAdres.soortDigitaalAdres === 'email' &&
      !isZaakContactgegeven(digitaalAdres)
  );
  const bestaand = emailAdressen.find(
    (digitaalAdres) => digitaalAdres.adres.toLowerCase() === email.toLowerCase()
  );
  const andereStandaardAdressen = emailAdressen.filter(
    (digitaalAdres) =>
      digitaalAdres !== bestaand && digitaalAdres.isStandaardAdres
  );

  return {
    maakPartij: !partij,
    adres: getAdresActie(bestaand),
    waarschuwingen: andereStandaardAdressen.length
      ? [
          `De partij heeft nog ${andereStandaardAdressen.length} ander(e) standaard-e-mailadres(sen). Welk adres de OMC dan kiest, is niet vastgelegd.`,
        ]
      : [],
  };
}

function vandaag(): string {
  return new Date().toISOString().slice(0, 10);
}

async function openKlantRequest<T>(
  config: OpenKlantConfig,
  method: 'POST' | 'PATCH',
  path: string,
  data: unknown
): Promise<T> {
  const response = await axios.request({
    method,
    url: joinApiUrl(config.url, path),
    data,
    headers: {
      Authorization: `Token ${config.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (response.status >= 300) {
    throw new Error(
      `${method} ${path}: ${formatApiFout(response.status, response.data)}`
    );
  }

  return response.data as T;
}

// Een persoon met alleen een contactnaam; de BRP-gegevens horen niet in een testpersoon.
async function maakPartij(
  config: OpenKlantConfig,
  bsn: string
): Promise<PartijSource> {
  const partij = await openKlantRequest<PartijSource>(
    config,
    'POST',
    'partijen',
    {
      soortPartij: 'persoon',
      indicatieActief: true,
      indicatieGeheimhouding: false,
      voorkeurstaal: 'nld',
      digitaleAdressen: [],
      rekeningnummers: [],
      voorkeursDigitaalAdres: null,
      voorkeursRekeningnummer: null,
      partijIdentificatoren: [],
      partijIdentificatie: {
        contactnaam: {
          voorletters: 'T',
          voornaam: 'Test',
          voorvoegselAchternaam: '',
          achternaam: 'Mijn Amsterdam',
        },
      },
    }
  );

  // Dezelfde identificator die de BFF gebruikt om de partij van een ingelogde burger te vinden.
  // Mislukt die, dan staat er een partij zonder BSN: opnieuw draaien vindt hem niet en maakt een nieuwe.
  try {
    await openKlantRequest(config, 'POST', 'partij-identificatoren', {
      identificeerdePartij: { uuid: partij.uuid, url: partij.url },
      anderePartijIdentificator: '',
      partijIdentificator: {
        codeObjecttype: 'natuurlijk_persoon',
        codeSoortObjectId: 'bsn',
        objectId: bsn,
        codeRegister: 'brp',
      },
      subIdentificatorVan: null,
    });
  } catch (error) {
    throw new Error(
      `Partij ${partij.uuid} is aangemaakt, maar zonder BSN. ${(error as Error).message}`
    );
  }

  return partij;
}

async function voerAdresUit(
  config: OpenKlantConfig,
  partij: PartijSource,
  adres: SeedPlan['adres'],
  email: string
) {
  switch (adres.soort) {
    case 'aanmaken':
      return openKlantRequest<DigitaalAdresSource>(
        config,
        'POST',
        'digitaleadressen',
        {
          verstrektDoorPartij: { uuid: partij.uuid, url: partij.url },
          verstrektDoorBetrokkene: null,
          adres: email,
          soortDigitaalAdres: 'email',
          isStandaardAdres: true,
          omschrijving: OMSCHRIJVING_TESTADRES,
          verificatieDatum: vandaag(),
        }
      );
    case 'bijwerken':
      return openKlantRequest<DigitaalAdresSource>(
        config,
        'PATCH',
        `digitaleadressen/${adres.uuid}`,
        { isStandaardAdres: true, verificatieDatum: vandaag() }
      );
    case 'in-orde':
      return null;
  }
}

function toonPlan(plan: SeedPlan, bsn: string, email: string) {
  regel(
    plan.maakPartij
      ? `  - partij aanmaken voor ${bsn}`
      : `  - partij voor ${bsn} bestaat al`
  );
  regel(
    {
      aanmaken: `  - e-mailadres ${maskeerAdres(email)} aanmaken als geverifieerd standaardadres`,
      bijwerken: `  - e-mailadres ${maskeerAdres(email)} bestaat; markeren als geverifieerd standaardadres`,
      'in-orde': `  - e-mailadres ${maskeerAdres(email)} is al een geverifieerd standaardadres`,
    }[plan.adres.soort]
  );
  plan.waarschuwingen.forEach((waarschuwing) => regel(`  ! ${waarschuwing}`));
}

async function seed(
  config: OpenKlantConfig,
  auth: AuthProfileAndToken,
  email: string,
  { dryRun }: { dryRun: boolean }
): Promise<boolean> {
  const bsn = auth.profile.id;
  const partij = await fetchPartij(config, auth);

  if (partij.status !== 'OK') {
    regel(`FOUT partij ophalen: ${foutmelding(partij)}`);
    return false;
  }

  const plan = planSeed(partij.content, email);
  regel(`Plan voor ${bsn}:`);
  toonPlan(plan, bsn, email);

  if (dryRun) {
    regel('\nDry-run: er is niets geschreven.');
    return true;
  }

  const doelPartij = partij.content ?? (await maakPartij(config, bsn));
  await voerAdresUit(config, doelPartij, plan.adres, email);

  regel(
    `\nKlaar. Controleer met: pnpm zgw:check --bsn=${bsn}\nZet daarna een dev-account voor dit BSN in MA_TEST_ACCOUNTS (naam=${bsn}).`
  );
  return true;
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      bsn: { type: 'string' },
      email: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  if (!IS_DEVELOPMENT) {
    regel('Dit script draait alleen in de ontwikkelomgeving.');
    process.exitCode = 1;
    return;
  }

  const problemen = checkInvoer(args);
  const openKlant = getAmsterdamKlantcontactConfig().openKlant;
  const url = openKlant?.url;
  const token = openKlant?.token;

  if (!url || !token) {
    problemen.push('BFF_OPENKLANT_BASE_URL of BFF_OPENKLANT_TOKEN ontbreekt');
  }

  const auth = getAuth({ bsn: args.bsn });

  if (problemen.length || !auth || !args.email || !url || !token) {
    problemen.forEach((probleem) => regel(`FOUT ${probleem}`));
    process.exitCode = 1;
    return;
  }

  try {
    const geslaagd = await seed({ url, token }, auth, args.email, {
      dryRun: args['dry-run'],
    });
    process.exitCode = geslaagd ? 0 : 1;
  } catch (error) {
    regel(`FOUT ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}

export const forTesting = { checkInvoer, planSeed, seed };
