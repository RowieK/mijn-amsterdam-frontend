import type {
  ContactGegevenScopeSource,
  ContactgegevenFrontend,
  ContactgegevenSource,
  ContactgegevenType,
  DienstverlenerSource,
  VerifyVerificationRequestResponse,
  ZaakKanaal,
  ZaakVoorkeurZaakFrontend,
} from './klantcontact-profieldienst-types.ts';
import type { ScopeKanaalConfig } from './klantcontact-scope-kanalen.ts';
import type { ApiResponse } from '../../../universal/helpers/api.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';
import type { OpenZaakConfig } from '../openzaak/openzaak-service-config.ts';

// Zet een zaakidentificatie om naar de `referentie` van een digitaal adres in OpenKlant.
// Geeft null als het resultaat niet geschikt is als referentie.
export type ZaakReferentieStrategy = (
  zaakIdentificatie: string
) => string | null;

// Alles wat per gemeente verschilt. De kern leest zelf geen omgevingsvariabelen.
export type GemeenteKlantcontactConfig = {
  profielservice: { url?: string };
  // Basis-URL en token van de Klantinteracties API. Alleen nodig bij de `openklant`-backend.
  openKlant?: { url?: string; token?: string };
  // Nodig voor `zaakIsVanGebruiker`. Zonder Open Zaak weigert de controle altijd (fail closed).
  openZaak?: OpenZaakConfig;
  zaakVoorkeur: {
    referentie: ZaakReferentieStrategy;
    kanalen: ZaakKanaal[];
  };
  // Een keuze voor alle zaken van een thema. Zonder deze instelling kent de gemeente geen themakeuze.
  // `kanalen` zijn de toegestane kanalen per thema (scope-kanalen), `scopes` koppelt een thema aan de
  // dienst waaronder de profielservice het contactgegeven bewaart.
  themaVoorkeur?: {
    kanalen: ScopeKanaalConfig;
    scopes: Record<string, ContactGegevenScopeSource>;
  };
};

export type CreateContactgegevenOptions = {
  referentie?: string;
  isDefault?: boolean;
  scope?: ContactGegevenScopeSource;
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
  zaakIsVanGebruiker: (
    authProfileAndToken: AuthProfileAndToken,
    zaakIdentificatie: string
  ) => Promise<ApiResponse<boolean>>;
  // De zaken waarvoor de klant een kanaal kan kiezen: de zaken waarvan de klant initiator is.
  fetchZaken: (
    authProfileAndToken: AuthProfileAndToken
  ) => Promise<ApiResponse<ZaakVoorkeurZaakFrontend[]>>;
};

// De profielservice kent ook diensten waarvoor een gebruiker zich heeft aangesloten.
export type ProfielserviceBackend = KlantcontactBackend & {
  fetchDienstverlener: (
    authProfileAndToken: AuthProfileAndToken,
    dienstverlenerNaam?: string
  ) => Promise<ApiResponse<DienstverlenerSource>>;
};
