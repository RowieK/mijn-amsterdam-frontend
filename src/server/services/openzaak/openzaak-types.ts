// Alleen de velden van de Zaken API (1.5.1) die de BFF gebruikt.

export type OpenZaakPaginatedSource<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type ZaakSource = {
  url: string;
  uuid: string;
  identificatie: string;
  bronorganisatie: string;
};

export type RolBetrokkeneType =
  | 'natuurlijk_persoon'
  | 'niet_natuurlijk_persoon'
  | 'vestiging'
  | 'organisatorische_eenheid'
  | 'medewerker';

export type RolSource = {
  url: string;
  zaak: string;
  betrokkeneType: RolBetrokkeneType;
  omschrijvingGeneriek: string;
  // Welke velden er staan hangt af van betrokkeneType: inpBsn bij een natuurlijk persoon,
  // kvkNummer bij een niet-natuurlijk persoon of vestiging.
  betrokkeneIdentificatie?: {
    inpBsn?: string | null;
    kvkNummer?: string | null;
  } | null;
};
