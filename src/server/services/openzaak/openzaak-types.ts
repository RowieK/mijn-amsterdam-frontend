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

// Een zaak uit `GET /zaken?expand=rollen`.
export type ZaakMetRollenSource = ZaakSource & {
  // URL van het zaaktype in de Catalogi API.
  zaaktype: string;
  omschrijving: string;
  startdatum: string;
  einddatum: string | null;
  _expand?: { rollen?: RolSource[] };
};

// Alleen de velden van de Catalogi API (1.x) die de BFF gebruikt. Versies van een zaaktype hebben elk een eigen
// URL, maar dezelfde identificatie.
export type ZaaktypeSource = {
  url: string;
  identificatie: string;
  omschrijving: string;
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
