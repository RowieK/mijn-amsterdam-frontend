import { describe, expect, it } from 'vitest';

import {
  formatZaakKanaal,
  getStandaardNotificatieKanalen,
  getVerifiedZaakKanalen,
  getZaakThemaNotificaties,
} from './CommunicatieVoorkeuren-helpers.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenPerTypeFrontend,
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
});
