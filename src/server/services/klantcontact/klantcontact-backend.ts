import type {
  GemeenteKlantcontactConfig,
  ProfielserviceBackend,
} from './klantcontact-backend-types.ts';
import { createOpenKlantBackend } from './klantcontact-openklant.ts';
import { createProfielserviceBackend } from './klantcontact-profieldienst.ts';
import {
  getAmsterdamKlantcontactConfig,
  getKlantcontactBackendNaam,
  type KlantcontactBackendNaam,
} from './klantcontact-service-config.ts';

export function createKlantcontactBackend(
  naam: KlantcontactBackendNaam,
  config: GemeenteKlantcontactConfig
): ProfielserviceBackend {
  switch (naam) {
    case 'openklant':
      return createOpenKlantBackend(config);
    case 'profielservice':
      return createProfielserviceBackend(config);
  }
}

// De backend volgt uit BFF_KLANTCONTACT_BACKEND: standaard de profielservice, `openklant` voor Open Klant.
// Een andere gemeente krijgt hier een eigen config.
export const klantcontactConfig = getAmsterdamKlantcontactConfig();
export const klantcontactBackend = createKlantcontactBackend(
  getKlantcontactBackendNaam(),
  klantcontactConfig
);
