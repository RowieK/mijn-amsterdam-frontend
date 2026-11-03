import type { ZaakVoorkeurZaak } from './useZaakVoorkeurThemas.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenPerTypeFrontend,
  ZaakKanaal,
  ZaakKanaalVoorkeurFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';

const ZAAK_KANAAL_LABELS = {
  Email: { label: 'E-mail', compact: 'e-mail' },
  Telefoonnummer: { label: 'SMS', compact: 'sms' },
} as const satisfies Record<ZaakKanaal, { label: string; compact: string }>;

export type VerifiedZaakKanaal = ContactgegevenFrontend & {
  type: ZaakKanaal;
  value: string;
};

// De kanalen die de BFF per zaak toestaat (klantcontactConfig.zaakVoorkeur.kanalen) en waarvoor de klant
// een gevalideerd standaardadres heeft: de BFF weigert een zaakvoorkeur voor een ongevalideerd adres.
export function getVerifiedZaakKanalen(
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null
): VerifiedZaakKanaal[] {
  return (Object.keys(ZAAK_KANAAL_LABELS) as ZaakKanaal[]).flatMap((type) => {
    const contactgegeven = standaardContactgegevens?.[type];
    return contactgegeven?.isVerified && contactgegeven.value
      ? [{ ...contactgegeven, type, value: contactgegeven.value }]
      : [];
  });
}

// Bijvoorbeeld "SMS: 0612345678" in een keuzelijst en "sms: 0612345678" in een lopende tekst.
export function formatZaakKanaal(
  { type, value }: Pick<ContactgegevenFrontend, 'type' | 'value'>,
  { compact = false }: { compact?: boolean } = {}
): string {
  const kanaal =
    type in ZAAK_KANAAL_LABELS ? ZAAK_KANAAL_LABELS[type as ZaakKanaal] : null;
  if (!kanaal) {
    return value ?? '';
  }
  return `${compact ? kanaal.compact : kanaal.label}: ${value}`;
}

// De waarden waarop de klant standaard notificaties ontvangt, zoals de rij "Standaard instelling" ze toont.
export function getStandaardNotificatieKanalen(
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null
): string[] {
  const { Email, Telefoonnummer, ApplicatieId } =
    standaardContactgegevens ?? {};

  return [
    Email?.value,
    Telefoonnummer?.value &&
      formatZaakKanaal(Telefoonnummer, { compact: true }),
    ApplicatieId?.value && 'de AmsterdamApp',
  ].filter((kanaal): kanaal is string => !!kanaal);
}

export type ZaakThemaNotificaties = {
  // Er is minstens één zaak (of er zijn geen zaken) die de standaardinstelling volgt.
  heeftStandaard: boolean;
  // De gekozen kanalen van de zaken met een eigen voorkeur, zonder dubbelen.
  kanalen: string[];
};

export function getZaakThemaNotificaties(
  zaken: ZaakVoorkeurZaak[],
  voorkeuren: ZaakKanaalVoorkeurFrontend[] = []
): ZaakThemaNotificaties {
  const voorkeurenPerZaak = zaken.map(({ zaakIdentificatie }) =>
    voorkeuren.find(
      (voorkeur) => voorkeur.zaakIdentificatie === zaakIdentificatie
    )
  );

  const kanalen = voorkeurenPerZaak.flatMap((voorkeur) =>
    voorkeur
      ? [
          `${formatZaakKanaal(voorkeur.contactgegeven, { compact: true })}${
            voorkeur.contactgegeven.isVerified ? '' : ' (nog niet gevalideerd)'
          }`,
        ]
      : []
  );

  return {
    heeftStandaard:
      voorkeurenPerZaak.length === 0 || voorkeurenPerZaak.some((v) => !v),
    kanalen: [...new Set(kanalen)],
  };
}
