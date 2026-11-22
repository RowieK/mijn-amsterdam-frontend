import { describe, expect, it } from 'vitest';

import {
  formatZaakKanaal,
  getStandaardNotificatieKanalen,
  findKanaalVoorContactgegeven,
  getEmailadressen,
  getKanaalSleutel,
  getStandaardEmailadres,
  getVerifiedZaakKanalen,
  getZaakThemaNotificaties,
  LEEG_EMAILADRES,
  sorteerEmailadressen,
} from './CommunicatieVoorkeuren-helpers.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenPerTypeFrontend,
  ThemaKanaalVoorkeurFrontend,
  ZaakKanaalVoorkeurFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';

function createContactgegeven(
  contactgegeven: Pick<ContactgegevenFrontend, 'type' | 'value'> &
    Partial<ContactgegevenFrontend>
): ContactgegevenFrontend {
  return {
    id: `${contactgegeven.type}-1`,
    isVerified: true,
    dateModified: null,
    dateModifiedFormatted: null,
    ...contactgegeven,
  };
}

function createStandaard(
  overrides: Partial<ContactgegevenPerTypeFrontend> = {}
): ContactgegevenPerTypeFrontend {
  return {
    Email: createContactgegeven({ type: 'Email', value: 'a@example.com' }),
    Telefoonnummer: createContactgegeven({
      type: 'Telefoonnummer',
      value: '0612345678',
    }),
    ApplicatieId: createContactgegeven({ type: 'ApplicatieId', value: null }),
    Postadres: createContactgegeven({ type: 'Postadres', value: null }),
    Berichtenbox: createContactgegeven({
      type: 'Berichtenbox',
      value: null,
      disabled: true,
    }),
    ...overrides,
  };
}

function createVoorkeur(
  zaakIdentificatie: string,
  contactgegeven: Pick<ContactgegevenFrontend, 'type' | 'value'> &
    Partial<ContactgegevenFrontend>
): ZaakKanaalVoorkeurFrontend {
  return {
    zaakIdentificatie,
    contactgegeven: createContactgegeven({ id: 'zaak-cg', ...contactgegeven }),
  };
}

describe('findKanaalVoorContactgegeven', () => {
  const kanalen = getVerifiedZaakKanalen(createStandaard());

  it('vindt het kanaal met hetzelfde type en dezelfde waarde', () => {
    expect(
      findKanaalVoorContactgegeven(
        kanalen,
        createContactgegeven({ type: 'Email', value: 'a@example.com' })
      )?.type
    ).toBe('Email');
  });

  it.each(['+31612345678', '0031612345678', '06 12345678', '0612345678'])(
    'ziet het telefoonnummer %s als hetzelfde nummer als 0612345678',
    (value) => {
      expect(
        findKanaalVoorContactgegeven(
          kanalen,
          createContactgegeven({ type: 'Telefoonnummer', value })
        )?.type
      ).toBe('Telefoonnummer');
    }
  );

  it('vindt niets bij een ander nummer of een andere waarde', () => {
    expect(
      findKanaalVoorContactgegeven(
        kanalen,
        createContactgegeven({ type: 'Telefoonnummer', value: '0687654321' })
      )
    ).toBeUndefined();
    expect(
      findKanaalVoorContactgegeven(
        kanalen,
        createContactgegeven({ type: 'Email', value: 'ander@example.com' })
      )
    ).toBeUndefined();
  });
});

describe('formatZaakKanaal', () => {
  it('geeft het kanaal als label in een keuzelijst', () => {
    expect(formatZaakKanaal({ type: 'Email', value: 'a@example.com' })).toBe(
      'E-mail: a@example.com'
    );
    expect(
      formatZaakKanaal({ type: 'Telefoonnummer', value: '0612345678' })
    ).toBe('SMS: 0612345678');
  });

  it('geeft het kanaal compact in een lopende tekst en laat de waarde ongemoeid', () => {
    expect(
      formatZaakKanaal(
        { type: 'Telefoonnummer', value: '0612345678' },
        { compact: true }
      )
    ).toBe('sms: 0612345678');
    expect(
      formatZaakKanaal(
        { type: 'Email', value: 'Jan.Jansen@Example.com' },
        { compact: true }
      )
    ).toBe('e-mail: Jan.Jansen@Example.com');
  });
});

describe('getVerifiedZaakKanalen', () => {
  it('geeft alleen gevalideerde e-mail en telefoon met een waarde', () => {
    expect(
      getVerifiedZaakKanalen(createStandaard()).map(({ type }) => type)
    ).toEqual(['Email', 'Telefoonnummer']);
  });

  it('slaat een ongevalideerd adres en een adres zonder waarde over', () => {
    const standaard = createStandaard({
      Email: createContactgegeven({
        type: 'Email',
        value: 'a@example.com',
        isVerified: false,
      }),
      Telefoonnummer: createContactgegeven({
        type: 'Telefoonnummer',
        value: null,
      }),
    });

    expect(getVerifiedZaakKanalen(standaard)).toEqual([]);
  });

  it('geeft niets als er geen standaardcontactgegevens zijn', () => {
    expect(getVerifiedZaakKanalen(null)).toEqual([]);
  });
});

describe('getStandaardNotificatieKanalen', () => {
  it('noemt e-mail, sms en de app zoals in het wireframe', () => {
    const standaard = createStandaard({
      ApplicatieId: createContactgegeven({
        type: 'ApplicatieId',
        value: '8593619876',
      }),
    });

    expect(getStandaardNotificatieKanalen(standaard)).toEqual([
      'a@example.com',
      'sms: 0612345678',
      'de AmsterdamApp',
    ]);
  });

  it('laat kanalen zonder waarde weg', () => {
    expect(
      getStandaardNotificatieKanalen(
        createStandaard({
          Telefoonnummer: createContactgegeven({
            type: 'Telefoonnummer',
            value: null,
          }),
        })
      )
    ).toEqual(['a@example.com']);
    expect(getStandaardNotificatieKanalen(null)).toEqual([]);
  });
});

describe('getZaakThemaNotificaties', () => {
  const zaken = [
    { zaakIdentificatie: 'ZAAK-1', omschrijving: 'Eerste' },
    { zaakIdentificatie: 'ZAAK-2', omschrijving: 'Tweede' },
  ];
  const sms = { type: 'Telefoonnummer', value: '0612345678' } as const;

  it('volgt de standaardinstelling zonder voorkeuren', () => {
    expect(getZaakThemaNotificaties(zaken, [])).toEqual({
      heeftStandaard: true,
      kanalen: [],
    });
  });

  it('volgt de standaardinstelling als een thema geen zaken heeft', () => {
    expect(getZaakThemaNotificaties([], [])).toEqual({
      heeftStandaard: true,
      kanalen: [],
    });
  });

  it('toont standaard en het gekozen kanaal als een deel van de zaken een voorkeur heeft', () => {
    expect(
      getZaakThemaNotificaties(zaken, [createVoorkeur('ZAAK-1', sms)])
    ).toEqual({ heeftStandaard: true, kanalen: ['sms: 0612345678'] });
  });

  it('toont geen standaard en geen dubbelen als elke zaak hetzelfde kanaal heeft', () => {
    expect(
      getZaakThemaNotificaties(zaken, [
        createVoorkeur('ZAAK-1', sms),
        createVoorkeur('ZAAK-2', sms),
      ])
    ).toEqual({ heeftStandaard: false, kanalen: ['sms: 0612345678'] });
  });

  it('negeert voorkeuren van zaken die niet in het thema staan', () => {
    expect(
      getZaakThemaNotificaties(zaken, [createVoorkeur('ANDERE-ZAAK', sms)])
    ).toEqual({ heeftStandaard: true, kanalen: [] });
  });

  it('markeert een voorkeur waarvan het adres nog niet gevalideerd is', () => {
    expect(
      getZaakThemaNotificaties(zaken, [
        createVoorkeur('ZAAK-1', { ...sms, isVerified: false }),
      ]).kanalen
    ).toEqual(['sms: 0612345678 (nog niet gevalideerd)']);
  });

  describe('met een keuze voor het hele thema', () => {
    const themaSms: ThemaKanaalVoorkeurFrontend = {
      themaId: 'TEST-THEMA',
      contactgegeven: createContactgegeven({
        id: 'thema-cg',
        ...sms,
      }),
    };
    const email = { type: 'Email', value: 'a@example.com' } as const;

    it('past de themakeuze toe op alle zaken zonder eigen keuze', () => {
      expect(getZaakThemaNotificaties(zaken, [], themaSms)).toEqual({
        heeftStandaard: false,
        kanalen: ['sms: 0612345678'],
      });
    });

    it('laat de keuze voor een zaak voorgaan op de themakeuze', () => {
      expect(
        getZaakThemaNotificaties(
          zaken,
          [createVoorkeur('ZAAK-1', email)],
          themaSms
        )
      ).toEqual({
        heeftStandaard: false,
        kanalen: ['e-mail: a@example.com', 'sms: 0612345678'],
      });
    });

    it('toont standaard zolang een thema geen zaken heeft', () => {
      expect(getZaakThemaNotificaties([], [], themaSms).heeftStandaard).toBe(
        true
      );
    });
  });
});

describe('meerdere e-mailadressen', () => {
  const oudGevalideerd = createContactgegeven({
    id: 'oud',
    type: 'Email',
    value: 'oud@example.com',
    dateModified: '2026-01-01T10:00:00Z',
  });
  const recentGevalideerd = createContactgegeven({
    id: 'recent',
    type: 'Email',
    value: 'recent@example.com',
    dateModified: '2026-03-01T10:00:00Z',
  });
  const nieuwOngevalideerd = createContactgegeven({
    id: 'nieuw',
    type: 'Email',
    value: 'nieuw@example.com',
    isVerified: false,
    dateModified: '2026-05-01T10:00:00Z',
  });

  describe('sorteerEmailadressen', () => {
    it('zet gevalideerde adressen eerst en daarna de meest recent gewijzigde', () => {
      expect(
        sorteerEmailadressen([
          nieuwOngevalideerd,
          oudGevalideerd,
          recentGevalideerd,
        ]).map(({ id }) => id)
      ).toEqual(['recent', 'oud', 'nieuw']);
    });

    it('telt hetzelfde adres in een andere schrijfwijze één keer en houdt het gevalideerde', () => {
      expect(
        sorteerEmailadressen([
          createContactgegeven({
            id: 'hoofdletters',
            type: 'Email',
            value: 'OUD@Example.com',
            isVerified: false,
          }),
          oudGevalideerd,
        ]).map(({ id }) => id)
      ).toEqual(['oud']);
    });

    it('laat adressen zonder waarde weg', () => {
      expect(
        sorteerEmailadressen([
          createContactgegeven({ type: 'Email', value: null }),
        ])
      ).toEqual([]);
    });
  });

  describe('getStandaardEmailadres', () => {
    it('is het eerste adres van de gesorteerde lijst', () => {
      expect(
        getStandaardEmailadres([nieuwOngevalideerd, oudGevalideerd]).id
      ).toBe('oud');
    });

    it('is een leeg adres zonder adressen', () => {
      expect(getStandaardEmailadres([])).toEqual(LEEG_EMAILADRES);
    });
  });

  describe('getEmailadressen', () => {
    it('geeft de lijst van de BFF, gesorteerd', () => {
      expect(
        getEmailadressen(createStandaard(), [
          nieuwOngevalideerd,
          recentGevalideerd,
        ]).map(({ id }) => id)
      ).toEqual(['recent', 'nieuw']);
    });

    it('valt zonder lijst terug op het standaardadres', () => {
      expect(
        getEmailadressen(createStandaard()).map(({ value }) => value)
      ).toEqual(['a@example.com']);
    });

    it('geeft niets als er geen lijst en geen standaardadres is', () => {
      expect(getEmailadressen(null)).toEqual([]);
      expect(
        getEmailadressen(
          createStandaard({
            Email: createContactgegeven({ type: 'Email', value: null }),
          })
        )
      ).toEqual([]);
    });
  });

  describe('getVerifiedZaakKanalen met meerdere adressen', () => {
    it('biedt elk gevalideerd e-mailadres aan, maar geen ongevalideerd adres', () => {
      expect(
        getVerifiedZaakKanalen(createStandaard(), [
          recentGevalideerd,
          oudGevalideerd,
          nieuwOngevalideerd,
        ]).map(getKanaalSleutel)
      ).toEqual([
        'Email:recent@example.com',
        'Email:oud@example.com',
        'Telefoonnummer:0612345678',
      ]);
    });

    it('gebruikt zonder lijst het standaardadres', () => {
      expect(
        getVerifiedZaakKanalen(createStandaard()).map(getKanaalSleutel)
      ).toEqual(['Email:a@example.com', 'Telefoonnummer:0612345678']);
    });
  });

  it('findKanaalVoorContactgegeven kiest het adres met dezelfde waarde, ook bij meerdere adressen', () => {
    const kanalen = getVerifiedZaakKanalen(createStandaard(), [
      recentGevalideerd,
      oudGevalideerd,
    ]);

    expect(
      findKanaalVoorContactgegeven(
        kanalen,
        createContactgegeven({
          id: 'kopie',
          type: 'Email',
          value: 'oud@example.com',
        })
      )?.id
    ).toBe('oud');
  });
});
