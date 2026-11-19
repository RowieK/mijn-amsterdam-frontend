import { getFromEnv } from '../../helpers/env.ts';
import type { ZgwJwtCredentials } from '../../helpers/zgw-api-helpers.ts';

export type OpenZaakConfig = ZgwJwtCredentials & {
  url?: string;
  // RSIN van de organisatie die de zaken registreert. Een zaakidentificatie is alleen uniek binnen een bronorganisatie.
  bronorganisatie?: string;
};

export const ROL_OMSCHRIJVING_GENERIEK_INITIATOR = 'initiator';

// De variabelen zijn niet verplicht: een gemeente zonder Open Zaak start de BFF gewoon op.
// Zonder configuratie geeft elke aanroep een foutresultaat.
export function getOpenZaakConfig(): OpenZaakConfig {
  return {
    url: getFromEnv('BFF_OPENZAAK_BASE_URL', false),
    clientId: getFromEnv('BFF_OPENZAAK_CLIENT_ID', false),
    jwtSecret: getFromEnv('BFF_OPENZAAK_JWT_SECRET', false),
    bronorganisatie: getFromEnv('BFF_OPENZAAK_BRONORGANISATIE', false),
  };
}
