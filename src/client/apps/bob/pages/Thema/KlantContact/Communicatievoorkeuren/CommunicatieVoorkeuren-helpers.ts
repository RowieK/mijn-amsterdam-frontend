import type { ZaakVoorkeurZaak } from './useZaakVoorkeurThemas.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenPerTypeFrontend,
  ThemaKanaalVoorkeurFrontend,
  ZaakKanaal,
  ZaakKanaalVoorkeurFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import { bepaalEffectieveVoorkeur } from '../../../../../../../server/services/klantcontact/klantcontact-thema-voorkeur.ts';

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
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null,
  emailadressen?: ContactgegevenFrontend[]
): VerifiedZaakKanaal[] {
  return (Object.keys(ZAAK_KANAAL_LABELS) as ZaakKanaal[]).flatMap((type) => {
    // Van e-mail kan de klant meerdere adressen hebben, van een telefoonnummer één.
    const contactgegevens =
      type === 'Email'
        ? getEmailadressen(standaardContactgegevens, emailadressen)
        : [standaardContactgegevens?.[type]];

    return contactgegevens.flatMap((contactgegeven) =>
      contactgegeven?.isVerified && contactgegeven.value
        ? [{ ...contactgegeven, type, value: contactgegeven.value }]
        : []
    );
  });
}

// De BFF slaat een telefoonnummer op als +31612345678, terwijl het standaardadres als 0612345678 kan staan.
function normalizeWaarde(
  type: ContactgegevenFrontend['type'],
  value: string | null
): string | null {
  if (type !== 'Telefoonnummer' || !value) {
    return value;
  }
  return value.replace(/[\s()-]/g, '').replace(/^(\+31|0031)/, '0');
}

// De sleutel waaronder een kanaal in een keuzelijst staat. Een klant kan meerdere e-mailadressen hebben,
// dus het type alleen is niet genoeg.
export function getKanaalSleutel({
  type,
  value,
}: Pick<VerifiedZaakKanaal, 'type' | 'value'>): string {
  return `${type}:${value}`;
}

// Een zaak- of themakeuze is een eigen adres met dezelfde waarde als een standaardadres. Het id verschilt dus,
// daarom wordt op kanaal en waarde vergeleken.
export function findKanaalVoorContactgegeven(
  kanalen: VerifiedZaakKanaal[],
  contactgegeven: Pick<ContactgegevenFrontend, 'type' | 'value'>
): VerifiedZaakKanaal | undefined {
  const waarde = normalizeWaarde(contactgegeven.type, contactgegeven.value);
  return kanalen.find(
    (kanaal) =>
      kanaal.type === contactgegeven.type &&
      normalizeWaarde(kanaal.type, kanaal.value) === waarde
  );
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

// Gevalideerde adressen eerst, daarna de meest recent gewijzigde. Hetzelfde adres in een andere schrijfwijze
// (hoofdletters) telt één keer, zoals de BFF dat ook doet.
export function sorteerEmailadressen(
  emailadressen: ContactgegevenFrontend[]
): ContactgegevenFrontend[] {
  const gezien = new Set<string>();

  return emailadressen
    .filter((adres) => !!adres.value)
    .toSorted((a, b) =>
      String(b.dateModified).localeCompare(String(a.dateModified))
    )
    .toSorted((a, b) => Number(!!b.isVerified) - Number(!!a.isVerified))
    .filter((adres) => {
      const sleutel = (adres.value ?? '').trim().toLowerCase();
      if (gezien.has(sleutel)) {
        return false;
      }
      gezien.add(sleutel);
      return true;
    });
}

export const LEEG_EMAILADRES: ContactgegevenFrontend = {
  id: null,
  type: 'Email',
  value: null,
  isVerified: false,
  dateModified: null,
  dateModifiedFormatted: null,
};

// Het eerste adres is het standaardadres. Zonder adressen is dat een leeg adres.
export function getStandaardEmailadres(
  emailadressen: ContactgegevenFrontend[]
): ContactgegevenFrontend {
  return sorteerEmailadressen(emailadressen)[0] ?? LEEG_EMAILADRES;
}

// De BFF geeft alle adressen in `emailadressen`. Ontbreekt die lijst (een oudere response), dan is het
// standaardadres het enige adres.
export function getEmailadressen(
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null,
  emailadressen?: ContactgegevenFrontend[]
): ContactgegevenFrontend[] {
  if (emailadressen) {
    return sorteerEmailadressen(emailadressen);
  }

  const standaard = standaardContactgegevens?.Email;
  return standaard?.value ? [standaard] : [];
}

// Per zaak geldt de keuze voor de zaak zelf, anders de keuze voor het thema, anders de standaardinstelling.
export function getZaakThemaNotificaties(
  zaken: ZaakVoorkeurZaak[],
  voorkeuren: ZaakKanaalVoorkeurFrontend[] = [],
  themaVoorkeur?: ThemaKanaalVoorkeurFrontend
): ZaakThemaNotificaties {
  const effectievePerZaak = zaken.map(({ zaakIdentificatie }) =>
    bepaalEffectieveVoorkeur(
      voorkeuren.find(
        (voorkeur) => voorkeur.zaakIdentificatie === zaakIdentificatie
      ),
      themaVoorkeur
    )
  );

  const kanalen = effectievePerZaak.flatMap(({ contactgegeven }) =>
    contactgegeven
      ? [
          `${formatZaakKanaal(contactgegeven, { compact: true })}${
            contactgegeven.isVerified ? '' : ' (nog niet gevalideerd)'
          }`,
        ]
      : []
  );

  return {
    heeftStandaard:
      effectievePerZaak.length === 0 ||
      effectievePerZaak.some(({ niveau }) => niveau === 'standaard'),
    kanalen: [...new Set(kanalen)],
  };
}
