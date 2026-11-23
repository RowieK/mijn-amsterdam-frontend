import { getFromEnv } from '../../helpers/env.ts';
import type { ZgwJwtCredentials } from '../../helpers/zgw-api-helpers.ts';

export type OpenNotificatiesConfig = ZgwJwtCredentials & {
  url?: string;
};

// De variabelen zijn niet verplicht. Zonder configuratie geeft elke aanroep een foutresultaat.
// Open Notificaties gebruikt dezelfde JWT-client als Open Zaak.
export function getOpenNotificatiesConfig(): OpenNotificatiesConfig {
  return {
    url: getFromEnv('BFF_OPENNOTIFICATIES_BASE_URL', false),
    clientId: getFromEnv('BFF_OPENZAAK_CLIENT_ID', false),
    jwtSecret: getFromEnv('BFF_OPENZAAK_JWT_SECRET', false),
  };
}
