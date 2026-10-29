import type {
  ContactgegevenFrontend,
  ContactgegevenSource,
  ContactgegevenType,
  DienstverlenerSource,
  VerifyVerificationRequestResponse,
  ZaakKanaal,
} from './klantcontact-profieldienst-types.ts';
import type { ApiResponse } from '../../../universal/helpers/api.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';

// Zet een zaakidentificatie om naar de `referentie` van een digitaal adres in OpenKlant.
// Geeft null als het resultaat niet geschikt is als referentie.
export type ZaakReferentieStrategy = (
  zaakIdentificatie: string
) => string | null;

// Alles wat per gemeente verschilt. De kern leest zelf geen omgevingsvariabelen.
export type GemeenteKlantcontactConfig = {
  profielservice: { url?: string };
  zaakVoorkeur: {
    referentie: ZaakReferentieStrategy;
    kanalen: ZaakKanaal[];
  };
};

export type CreateContactgegevenOptions = {
  referentie?: string;
  isDefault?: boolean;
};

export type VerifyVerificationRequestProps = {
  value: string;
  code: string;
  type: ContactgegevenType;
};

// De operaties die de kern nodig heeft van het systeem waar de contactgegevens in staan.
export type KlantcontactBackend = {
  fetchContactgegevens: (
    authProfileAndToken: AuthProfileAndToken
  ) => Promise<ApiResponse<ContactgegevenSource[]>>;
  createContactgegeven: (
    authProfileAndToken: AuthProfileAndToken,
    contactgegevenType: ContactgegevenType,
    contactgegevenWaarde: string,
    options?: CreateContactgegevenOptions
  ) => Promise<ApiResponse<ContactgegevenFrontend>>;
  deleteContactgegeven: (
    authProfileAndToken: AuthProfileAndToken,
    contactgegevenId: ContactgegevenSource['id']
  ) => Promise<ApiResponse<null>>;
  verifyContactgegeven: (
    authProfileAndToken: AuthProfileAndToken,
    props: VerifyVerificationRequestProps
  ) => Promise<ApiResponse<VerifyVerificationRequestResponse>>;
};

// De profielservice kent ook diensten waarvoor een gebruiker zich heeft aangesloten.
export type ProfielserviceBackend = KlantcontactBackend & {
  fetchDienstverlener: (
    authProfileAndToken: AuthProfileAndToken,
    dienstverlenerNaam?: string
  ) => Promise<ApiResponse<DienstverlenerSource>>;
};
