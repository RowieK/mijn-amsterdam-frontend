import type { GemeenteKlantcontactConfig } from './klantcontact-backend-types.ts';
import { zaakIdentificatieAlsReferentie } from './klantcontact-helpers.ts';
import { isEnabled } from '../../config/azure-appconfiguration.ts';
import { getFromEnv } from '../../helpers/env.ts';
import { getOpenZaakConfig } from '../openzaak/openzaak-service-config.ts';

export const featureToggle = {
  afspraken: isEnabled('KLANT_CONTACT.afspraken'),
  communicatievoorkeuren: isEnabled('KLANT_CONTACT.communicatievoorkeuren'),
  zaakvoorkeuren: isEnabled('KLANT_CONTACT.zaakvoorkeuren'),
};

export const KLANTCONTACT_BACKENDS = ['profielservice', 'openklant'] as const;
export type KlantcontactBackendNaam = (typeof KLANTCONTACT_BACKENDS)[number];
const DEFAULT_KLANTCONTACT_BACKEND: KlantcontactBackendNaam = 'profielservice';

// Leeg of niet gezet geeft de profielservice. Een onbekende waarde (een typefout) laat de BFF niet
// stilletjes op de standaard terugvallen, maar stopt bij het opstarten.
export function getKlantcontactBackendNaam(
  waarde: string | undefined = getFromEnv('BFF_KLANTCONTACT_BACKEND', false)
): KlantcontactBackendNaam {
  const naam = waarde?.trim().toLowerCase() || DEFAULT_KLANTCONTACT_BACKEND;

  if (!(KLANTCONTACT_BACKENDS as readonly string[]).includes(naam)) {
    throw new Error(
      `BFF_KLANTCONTACT_BACKEND heeft een onbekende waarde: "${naam}". Kies uit: ${KLANTCONTACT_BACKENDS.join(', ')}.`
    );
  }

  return naam as KlantcontactBackendNaam;
}

const BASE_ROUTE = '/services/klantcontact';

export const routes = {
  BASE: BASE_ROUTE,
  CONTACTGEGEVEN_VERIFY: `${BASE_ROUTE}/contactgegeven/verify`,
  CONTACTGEGEVEN_CREATE: `${BASE_ROUTE}/contactgegeven/create`,
  CONTACTGEGEVEN_DELETE: `${BASE_ROUTE}/contactgegeven/delete`,
  ZAAKVOORKEUR_SET: `${BASE_ROUTE}/zaakvoorkeur/set`,
  ZAAKVOORKEUR_DELETE: `${BASE_ROUTE}/zaakvoorkeur/delete`,
  THEMAVOORKEUR_SET: `${BASE_ROUTE}/themavoorkeur/set`,
  THEMAVOORKEUR_DELETE: `${BASE_ROUTE}/themavoorkeur/delete`,
} as const;

export const salesforceDataRequestConfig = {
  // contactmomenten and afspraken are fetched from the same API, so we can use the same config for both.
  url: getFromEnv('BFF_CONTACTMOMENTEN_BASE_URL'),
  headers: {
    apiKey: getFromEnv('BFF_ENABLEU_API_KEY'),
  },
};

export function getAmsterdamKlantcontactConfig(): GemeenteKlantcontactConfig {
  return {
    profielservice: {
      url: getFromEnv('BFF_PROFIEL_API_BASE_URL'),
    },
    // Niet verplicht: alleen de `openklant`-backend en de zaakcontrole gebruiken deze configuratie.
    openKlant: {
      url: getFromEnv('BFF_OPENKLANT_BASE_URL', false),
      token: getFromEnv('BFF_OPENKLANT_TOKEN', false),
    },
    openZaak: getOpenZaakConfig(),
    zaakVoorkeur: {
      referentie: zaakIdentificatieAlsReferentie,
      kanalen: ['Email', 'Telefoonnummer'],
    },
    // Een keuze voor alle zaken van een thema. Nu alleen Erfpacht, net als de zaakvoorkeur in het scherm.
    // De dienstnamen volgen de profielservice (dienstverlener `amsterdam`).
    themaVoorkeur: {
      kanalen: { ERFPACHT: ['Email', 'Sms'] },
      scopes: {
        ERFPACHT: { dienstverlenerNaam: 'amsterdam', dienstNaam: 'erfpacht' },
      },
    },
  };
}
