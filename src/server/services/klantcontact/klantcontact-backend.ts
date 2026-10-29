import { createProfielserviceBackend } from './klantcontact-profieldienst.ts';
import { getAmsterdamKlantcontactConfig } from './klantcontact-service-config.ts';

// Amsterdam gebruikt de profielservice. Een andere gemeente krijgt hier een eigen config en backend.
export const klantcontactConfig = getAmsterdamKlantcontactConfig();
export const klantcontactBackend =
  createProfielserviceBackend(klantcontactConfig);
