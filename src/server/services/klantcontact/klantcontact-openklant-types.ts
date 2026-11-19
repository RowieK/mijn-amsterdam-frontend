// Alleen de velden van de Klantinteracties API (0.7.0) die de BFF gebruikt.

export type OpenKlantPaginatedSource<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type SoortDigitaalAdresSource = 'email' | 'telefoonnummer' | 'overig';

type ForeignKeySource = {
  uuid: string;
  url: string;
};

export type DigitaalAdresSource = {
  uuid: string;
  url: string;
  verstrektDoorPartij?: ForeignKeySource | null;
  adres: string; // max 80 tekens
  soortDigitaalAdres: SoortDigitaalAdresSource;
  isStandaardAdres?: boolean;
  referentie?: string | null; // max 50 tekens, bij een zaakvoorkeur de zaakidentificatie
  verificatieDatum?: string | null; // datum zonder tijdstip, bijvoorbeeld 2026-01-31
};

export type DigitaalAdresPayloadSource = {
  verstrektDoorPartij: ForeignKeySource;
  adres: string;
  soortDigitaalAdres: Exclude<SoortDigitaalAdresSource, 'overig'>;
  isStandaardAdres: boolean;
  referentie?: string;
  verificatieDatum?: string;
};

export type PartijIdentificatorSource = {
  codeObjecttype: string;
  codeSoortObjectId: string;
  objectId: string;
};

export type PartijSource = ForeignKeySource & {
  partijIdentificatoren?: { partijIdentificator: PartijIdentificatorSource }[];
  digitaleAdressen?: ForeignKeySource[];
  // Met `expand=digitaleAdressen` staan de volledige adressen hier. De OpenAPI-spec noemt de sleutel
  // `digitale_adressen`, terwijl de rest van de API camelCase gebruikt. We accepteren beide.
  _expand?: {
    digitaleAdressen?: DigitaalAdresSource[];
    digitale_adressen?: DigitaalAdresSource[];
  };
};
