import type { GemeenteKlantcontactConfig } from './klantcontact-backend-types.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenSource,
  ContactgegevenType,
  IdentificatieType,
  ThemaKanaalVoorkeurFrontend,
  ZaakKanaal,
  ZaakKanaalVoorkeurFrontend,
  ZaakVoorkeurZaakFrontend,
} from './klantcontact-profieldienst-types.ts';
import { validateThemaKeuze } from './klantcontact-thema-voorkeur.ts';
import {
  apiSuccessResult,
  type ApiResponse,
} from '../../../universal/helpers/api.ts';
import { toDateFormatted } from '../../../universal/helpers/date.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';
import {
  fetchZaaktypen,
  fetchZakenVanGebruiker,
} from '../openzaak/openzaak-api-service.ts';
import type { OpenZaakConfig } from '../openzaak/openzaak-service-config.ts';
import type {
  ZaakMetRollenSource,
  ZaaktypeSource,
} from '../openzaak/openzaak-types.ts';

// Patroon en maximale lengte van OpenKlant DigitaalAdres.referentie.
export const ZAAK_REFERENTIE_PATTERN = {
  pattern: /^[-a-zA-Z0-9_]+$/,
  maxLength: 50,
} as const;

// Referentie van het algemene voorkeursadres van de partij (conventie van Den Haag, stap 4 van de adreskeuze
// van de OMC). Dit adres hoort bij de partij en niet bij een zaak.
export const PORTAALVOORKEUR_REFERENTIE = 'portaalvoorkeur';

const identificatieTypeByProfileType: Record<ProfileType, IdentificatieType> = {
  private: 'BSN',
  commercial: 'KVK',
  'private-attributes': 'BSN',
};

export function getIdentificatieType(
  profileType: ProfileType
): IdentificatieType {
  return identificatieTypeByProfileType[profileType];
}

export function transformContactgegevenSource(
  contactgegeven: Partial<Omit<ContactgegevenSource, 'type'>> | null,
  contactgegevenType: ContactgegevenType
): ContactgegevenFrontend {
  return {
    id: contactgegeven?.id ?? null,
    type: contactgegevenType,
    value: contactgegeven?.waarde ?? null,
    isVerified: contactgegeven?.isGeverifieerd ?? false,
    dateModified: contactgegeven?.lastUpdated ?? null,
    dateModifiedFormatted: toDateFormatted(contactgegeven?.lastUpdated),
  };
}

// `portaalvoorkeur` past in het patroon, maar een zaakvoorkeur met die referentie zou het voorkeursadres van de
// partij overschrijven of verwijderen.
export function isValidZaakReferentie(referentie: string): boolean {
  return (
    referentie.length <= ZAAK_REFERENTIE_PATTERN.maxLength &&
    ZAAK_REFERENTIE_PATTERN.pattern.test(referentie) &&
    referentie !== PORTAALVOORKEUR_REFERENTIE
  );
}

// Standaard referentiestrategie (NotifyNL-OMC v.2.3.2): de zaakidentificatie is de referentie.
export function zaakIdentificatieAlsReferentie(
  zaakIdentificatie: string
): string | null {
  return isValidZaakReferentie(zaakIdentificatie) ? zaakIdentificatie : null;
}

// Zet een zaakidentificatie (ongecontroleerde invoer) om naar de `referentie` volgens de strategie van de gemeente.
// Geeft null als de invoer geen string is of de uitkomst niet bruikbaar is als referentie.
export function getValidZaakReferentie(
  config: GemeenteKlantcontactConfig,
  zaakIdentificatie: unknown
): string | null {
  if (typeof zaakIdentificatie !== 'string') {
    return null;
  }

  const referentie = config.zaakVoorkeur.referentie(zaakIdentificatie);

  return referentie && isValidZaakReferentie(referentie) ? referentie : null;
}

function isZaakKanaal(
  contactgegevenType: ContactgegevenType
): contactgegevenType is ZaakKanaal {
  return (
    contactgegevenType === 'Email' || contactgegevenType === 'Telefoonnummer'
  );
}

// Een contactgegeven met een referentie hoort bij een zaak en niet bij de partij, behalve de `portaalvoorkeur`.
// OpenKlant geeft een lege string als er geen referentie is.
export function isZaakContactgegeven(
  contactgegeven: Pick<ContactgegevenSource, 'referentie'>
): boolean {
  return (
    !!contactgegeven.referentie &&
    contactgegeven.referentie !== PORTAALVOORKEUR_REFERENTIE
  );
}

export function getZaakKanaalVoorkeuren(
  contactgegevens: ApiResponse<ContactgegevenSource[]>
): ZaakKanaalVoorkeurFrontend[] {
  if (contactgegevens.status !== 'OK') {
    return [];
  }

  return contactgegevens.content
    .filter(
      (contactgegeven) =>
        isZaakContactgegeven(contactgegeven) &&
        isZaakKanaal(contactgegeven.type)
    )
    .map((contactgegeven) => ({
      // De referentie is de zaakidentificatie zolang de referentiestrategie die ongewijzigd doorgeeft.
      zaakIdentificatie: String(contactgegeven.referentie),
      contactgegeven: transformContactgegevenSource(
        contactgegeven,
        contactgegeven.type
      ),
    }));
}

// Het thema waarvoor een contactgegeven een keuze is, volgens de scopes in de config van de gemeente.
// Een contactgegeven met een referentie is een zaakadres en hoort niet bij een thema.
export function getThemaId(
  config: GemeenteKlantcontactConfig,
  contactgegeven: ContactgegevenSource
): string | null {
  if (!config.themaVoorkeur || isZaakContactgegeven(contactgegeven)) {
    return null;
  }

  const { scopes } = config.themaVoorkeur;

  return (
    Object.keys(scopes).find((themaId) =>
      contactgegeven.scopes.some(
        (scope) => scope.dienst.id === scopes[themaId].dienstNaam
      )
    ) ?? null
  );
}

// De thema's waarvoor de BFF een themakeuze accepteert: met een dienst (scope) en minstens één kanaal dat de
// klant kan kiezen (een zaakkanaal dat ook voor het thema is toegestaan). Voor elk ander thema weigert de BFF
// de keuze, dus toont de frontend die daar niet.
export function getThemaKeuzeThemaIds(
  config: GemeenteKlantcontactConfig
): string[] {
  const themaVoorkeur = config.themaVoorkeur;

  if (!themaVoorkeur) {
    return [];
  }

  return Object.keys(themaVoorkeur.scopes).filter((themaId) =>
    config.zaakVoorkeur.kanalen.some(
      (kanaal) =>
        validateThemaKeuze(themaVoorkeur.kanalen, themaId, kanaal).valid
    )
  );
}

export function getThemaKanaalVoorkeuren(
  config: GemeenteKlantcontactConfig,
  contactgegevens: ApiResponse<ContactgegevenSource[]>
): ThemaKanaalVoorkeurFrontend[] {
  if (contactgegevens.status !== 'OK') {
    return [];
  }

  return contactgegevens.content.flatMap((contactgegeven) => {
    const themaId = getThemaId(config, contactgegeven);

    return themaId && isZaakKanaal(contactgegeven.type)
      ? [
          {
            themaId,
            contactgegeven: transformContactgegevenSource(
              contactgegeven,
              contactgegeven.type
            ),
          },
        ]
      : [];
  });
}

// Een keuze voor een thema is geen standaardadres van de klant.
export function withoutThemaContactgegevens(
  config: GemeenteKlantcontactConfig,
  contactgegevens: ApiResponse<ContactgegevenSource[]>
): ApiResponse<ContactgegevenSource[]> {
  if (contactgegevens.status !== 'OK') {
    return contactgegevens;
  }

  return {
    ...contactgegevens,
    content: contactgegevens.content.filter(
      (contactgegeven) => !getThemaId(config, contactgegeven)
    ),
  };
}

// Alle eigen adressen van een type (zonder zaakadressen), gevalideerde eerst en daarna de meest recente.
// Hetzelfde adres in een andere schrijfwijze (hoofdletters) telt als één adres.
export function getAllByContactgegevenType(
  contactgegevens: ApiResponse<ContactgegevenSource[]>,
  contactgegevenType: ContactgegevenType
): ContactgegevenFrontend[] {
  if (contactgegevens.status !== 'OK') {
    return [];
  }

  const gezien = new Set<string>();

  return contactgegevens.content
    .filter(
      (contact) =>
        contact.type === contactgegevenType && !isZaakContactgegeven(contact)
    )
    .toSorted((a, b) =>
      String(b.lastUpdated).localeCompare(String(a.lastUpdated))
    )
    .toSorted((a, b) => Number(b.isGeverifieerd) - Number(a.isGeverifieerd))
    .filter((contact) => {
      const sleutel = contact.waarde.trim().toLowerCase();
      if (gezien.has(sleutel)) {
        return false;
      }
      gezien.add(sleutel);
      return true;
    })
    .map((contact) =>
      transformContactgegevenSource(contact, contactgegevenType)
    );
}

export function getMostRecentByContactgegevenType(
  contactgegevens: ApiResponse<ContactgegevenSource[]>,
  contactgegevenType: ContactgegevenType
): ContactgegevenFrontend {
  const contactGegevenDefault = transformContactgegevenSource(
    null,
    contactgegevenType
  );

  if (contactgegevens.status !== 'OK') {
    return contactGegevenDefault;
  }

  // Volgorde: geverifieerd, dan het standaardadres, dan het nieuwste. OpenKlant geeft geen datums, dus daar
  // beslist `isStandaardAdres` (isDefault). De sortering is stabiel: de laatste sortering weegt het zwaarst.
  const contactgegeven = contactgegevens.content
    .filter((contact) => !isZaakContactgegeven(contact))
    .toSorted((a, b) =>
      String(b.lastUpdated).localeCompare(String(a.lastUpdated))
    )
    .toSorted((a, b) => Number(b.isDefault) - Number(a.isDefault))
    .toSorted((a, b) => Number(b.isGeverifieerd) - Number(a.isGeverifieerd))
    .find((contact) => contact.type === contactgegevenType);

  return contactgegeven
    ? transformContactgegevenSource(contactgegeven, contactgegevenType)
    : contactGegevenDefault;
}

export { isValidEmail } from '../../../universal/helpers/email.ts';

// Een afgesloten zaak (met einddatum) krijgt geen nieuwe status meer, dus ook geen notificatie.
function isOpenZaak(zaak: ZaakMetRollenSource): boolean {
  return !zaak.einddatum;
}

// Alleen de open zaken. Zonder omschrijving tonen we de identificatie.
export function toZaakVoorkeurZaken(
  zaken: ApiResponse<ZaakMetRollenSource[]>,
  zaaktypen: Map<string, ZaaktypeSource> = new Map()
): ApiResponse<ZaakVoorkeurZaakFrontend[]> {
  if (zaken.status !== 'OK') {
    return zaken;
  }

  return apiSuccessResult(
    zaken.content.filter(isOpenZaak).map((zaak) => {
      const zaaktype = zaaktypen.get(zaak.zaaktype);

      return {
        zaakIdentificatie: zaak.identificatie,
        omschrijving: zaak.omschrijving || zaak.identificatie,
        zaaktype: zaaktype
          ? {
              identificatie: zaaktype.identificatie,
              omschrijving: zaaktype.omschrijving || zaaktype.identificatie,
            }
          : null,
      };
    })
  );
}

// De open zaken van de gebruiker uit Open Zaak, met hun zaaktype. Lukt het ophalen van een zaaktype niet, dan
// blijft de zaak zichtbaar zonder zaaktype: de keuze per zaak hangt er niet van af.
export async function fetchZaakVoorkeurZaken(
  openZaak: OpenZaakConfig,
  authProfileAndToken: AuthProfileAndToken
): Promise<ApiResponse<ZaakVoorkeurZaakFrontend[]>> {
  const zaken = await fetchZakenVanGebruiker(openZaak, authProfileAndToken);

  if (zaken.status !== 'OK') {
    return zaken;
  }

  const zaaktypen = await fetchZaaktypen(
    openZaak,
    zaken.content.filter(isOpenZaak).map((zaak) => zaak.zaaktype)
  );

  return toZaakVoorkeurZaken(zaken, zaaktypen);
}
