import type {
  ContactgegevenFrontend,
  ContactgegevenSource,
  ContactgegevenType,
  IdentificatieType,
  ZaakKanaal,
  ZaakKanaalVoorkeurFrontend,
} from './klantcontact-profieldienst-types.ts';
import type { ApiResponse } from '../../../universal/helpers/api.ts';
import { toDateFormatted } from '../../../universal/helpers/date.ts';

// Patroon en maximale lengte van OpenKlant DigitaalAdres.referentie.
export const ZAAK_REFERENTIE_PATTERN = {
  pattern: /^[-a-zA-Z0-9_]+$/,
  maxLength: 50,
} as const;

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

export function isValidZaakReferentie(referentie: string): boolean {
  return (
    referentie.length <= ZAAK_REFERENTIE_PATTERN.maxLength &&
    ZAAK_REFERENTIE_PATTERN.pattern.test(referentie)
  );
}

// Standaard referentiestrategie (NotifyNL-OMC v.2.3.2): de zaakidentificatie is de referentie.
export function zaakIdentificatieAlsReferentie(
  zaakIdentificatie: string
): string | null {
  return isValidZaakReferentie(zaakIdentificatie) ? zaakIdentificatie : null;
}

function isZaakKanaal(
  contactgegevenType: ContactgegevenType
): contactgegevenType is ZaakKanaal {
  return (
    contactgegevenType === 'Email' || contactgegevenType === 'Telefoonnummer'
  );
}

// Een contactgegeven met een referentie hoort bij een zaak en niet bij de partij.
// OpenKlant geeft een lege string als er geen referentie is.
function hasReferentie(contactgegeven: ContactgegevenSource): boolean {
  return !!contactgegeven.referentie;
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
        hasReferentie(contactgegeven) && isZaakKanaal(contactgegeven.type)
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

  const contactgegeven = contactgegevens.content
    .filter((contact) => !hasReferentie(contact))
    .toSorted((a, b) =>
      String(b.lastUpdated).localeCompare(String(a.lastUpdated))
    )
    .toSorted((a, b) => Number(b.isGeverifieerd) - Number(a.isGeverifieerd))
    .find((contact) => contact.type === contactgegevenType);

  return contactgegeven
    ? transformContactgegevenSource(contactgegeven, contactgegevenType)
    : contactGegevenDefault;
}
