export type ContactgegevenType =
  | 'Email'
  | 'Telefoonnummer'
  | 'ApplicatieId'
  // MA specifieke types, worden niet ondersteund in de profieldienst maar zijn wel onderdeel van de FE logica
  | 'Berichtenbox'
  | 'Postadres';

export type IdentificatieType = 'BSN' | 'KVK' | 'RSIN';

export type PartijIdentificatieSource = {
  identificatieType: string;
  identificatieNummer: string;
};

export type IdentificatieSource = PartijIdentificatieSource;

export type DienstSource = {
  id: string;
  beschrijving: string;
};

export type DienstverlenerSource = {
  naam: string;
  oin?: string;
  diensten?: DienstSource[];
};

export type ScopeSource = {
  partij: PartijIdentificatieSource;
  dienst: DienstSource;
};

export type VoorkeurSource = {
  id: string;
  voorkeurType: string;
  waarde: string;
  createdAt: string; // ISO date string
  lastUpdated: string; // ISO date string
  scopes: ScopeSource[];
};

export type ContactgegevenSource = {
  id: string;
  type: ContactgegevenType;
  waarde: string;
  isGeverifieerd: boolean;
  isDefault: boolean;
  referentie?: string | null; // OpenKlant DigitaalAdres.referentie, bij een zaakvoorkeur de zaakidentificatie
  createdAt: string; // ISO date string
  lastUpdated: string; // ISO date string
  scopes: ScopeSource[];
};

export type ContactProfieldienstResponseSource = {
  partijId: string;
  identificaties: IdentificatieSource[];
  voorkeuren: VoorkeurSource[];
  contactgegevens: ContactgegevenSource[];
};

export type ContactgegevenFrontend = {
  id: ContactgegevenSource['id'] | null;
  type: ContactgegevenType;
  value: string | null;
  dateModified: string | null; // ISO date string
  dateModifiedFormatted: string | null;
  isVerified?: boolean;
  disabled?: boolean;
};

type ContactGegevenScopeSource = {
  dienstverlenerNaam: string;
  dienstNaam: string;
};

export type ContactgegevenPayloadSource = {
  identificatieType: IdentificatieType;
  identificatieNummer: string; // BSN of KVK nummer
  type: ContactgegevenSource['type'];
  waarde: string;
  scope?: ContactGegevenScopeSource;
  isDefault: boolean;
  referentie?: string; // De zaakidentificatie, zie ContactgegevenSource
};

export type ContactgegevenPerTypeFrontend = Record<
  ContactgegevenType,
  ContactgegevenFrontend
>;

// De kanalen die de OMC (NotifyNL) per zaak kan bedienen.
export type ZaakKanaal = Extract<
  ContactgegevenType,
  'Email' | 'Telefoonnummer'
>;

export type ZaakKanaalVoorkeurFrontend = {
  zaakIdentificatie: string;
  contactgegeven: ContactgegevenFrontend;
};

export type ZaakKanaalVoorkeurPayloadFrontend = {
  zaakIdentificatie: string;
  kanaal: ZaakKanaal;
  value: string;
};

export type CommunicatievoorkeurenResponseFrontend = {
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null;
  zaakKanaalVoorkeuren: ZaakKanaalVoorkeurFrontend[];
  aangeslotenDiensten?: DienstSource[];
};

export type DeleteContactgegevenResponseFrontend = {
  success: boolean;
};

export type VerifyVerificationRequestPayload = {
  email: string;
  identificatieNummer: string;
  identificatieType: IdentificatieType;
  verificatieCode: string;
};

export type VerifyVerificationRequestResponse = {
  verified: boolean;
};
