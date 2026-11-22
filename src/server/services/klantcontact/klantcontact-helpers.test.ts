import type { GemeenteKlantcontactConfig } from './klantcontact-backend-types.ts';
import {
  getAllByContactgegevenType,
  getMostRecentByContactgegevenType,
  getValidZaakReferentie,
  getZaakKanaalVoorkeuren,
  isValidEmail,
  isValidZaakReferentie,
  zaakIdentificatieAlsReferentie,
} from './klantcontact-helpers.ts';
import type { ContactgegevenSource } from './klantcontact-profieldienst-types.ts';
import {
  apiErrorResult,
  apiSuccessResult,
} from '../../../universal/helpers/api.ts';

function getContactgegeven(
  overrides: Partial<ContactgegevenSource>
): ContactgegevenSource {
  return {
    id: '1',
    type: 'Email',
    waarde: 'mokum@example.org',
    isGeverifieerd: true,
    isDefault: true,
    createdAt: '2025-01-01T10:00:00Z',
    lastUpdated: '2025-01-01T10:00:00Z',
    scopes: [],
    ...overrides,
  };
}

describe('klantcontact-helpers', () => {
  describe('isValidZaakReferentie', () => {
    test.each([
      ['Z-24-2238078', true],
      ['zaak_1', true],
      ['Z/24/2238078', false],
      ['Z 24', false],
      ['', false],
      ['a'.repeat(50), true],
      ['a'.repeat(51), false],
    ])('%s is %s', (referentie, expected) => {
      expect(isValidZaakReferentie(referentie)).toBe(expected);
    });
  });

  describe('zaakIdentificatieAlsReferentie', () => {
    test('geeft de zaakidentificatie als die in het patroon past', () => {
      expect(zaakIdentificatieAlsReferentie('Z-24-2238078')).toBe(
        'Z-24-2238078'
      );
    });

    test('geeft null als de zaakidentificatie niet in het patroon past', () => {
      expect(zaakIdentificatieAlsReferentie('Z/24/2238078')).toBeNull();
    });
  });

  describe('getValidZaakReferentie', () => {
    function getConfig(
      referentie: GemeenteKlantcontactConfig['zaakVoorkeur']['referentie']
    ): GemeenteKlantcontactConfig {
      return {
        profielservice: {},
        zaakVoorkeur: { referentie, kanalen: ['Email'] },
      };
    }

    test('geeft de referentie volgens de strategie van de config', () => {
      const config = getConfig(zaakIdentificatieAlsReferentie);

      expect(getValidZaakReferentie(config, 'Z-24-2238078')).toBe(
        'Z-24-2238078'
      );
    });

    test('gebruikt de strategie van de gemeente en niet de zaakidentificatie zelf', () => {
      const config = getConfig((zaakIdentificatie) =>
        zaakIdentificatie.replaceAll('/', '-')
      );

      expect(getValidZaakReferentie(config, 'Z/24/1')).toBe('Z-24-1');
    });

    test.each([
      { naam: 'undefined', invoer: undefined },
      { naam: 'null', invoer: null },
      { naam: 'een getal', invoer: 123 },
      { naam: 'een object', invoer: {} },
      { naam: 'een array met een geldige identificatie', invoer: ['Z-24-1'] },
    ])('geeft null als de invoer geen string is: $naam', ({ invoer }) => {
      const config = getConfig(zaakIdentificatieAlsReferentie);

      expect(getValidZaakReferentie(config, invoer)).toBeNull();
    });

    test('geeft null als de strategie null geeft', () => {
      const config = getConfig(zaakIdentificatieAlsReferentie);

      expect(getValidZaakReferentie(config, 'Z/24/2238078')).toBeNull();
    });

    test('geeft null als de uitkomst van de strategie geen geldige referentie is', () => {
      const config = getConfig(() => 'a'.repeat(51));

      expect(getValidZaakReferentie(config, 'Z-24-1')).toBeNull();
    });
  });

  describe('getMostRecentByContactgegevenType', () => {
    test('slaat contactgegevens met een referentie over', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({
          id: 'standaard',
          waarde: 'standaard@example.org',
          lastUpdated: '2025-01-01T10:00:00Z',
        }),
        getContactgegeven({
          id: 'zaak',
          waarde: 'zaak@example.org',
          referentie: 'Z-24-2238078',
          lastUpdated: '2025-02-01T10:00:00Z',
        }),
      ]);

      const result = getMostRecentByContactgegevenType(
        contactgegevens,
        'Email'
      );

      expect(result.id).toBe('standaard');
      expect(result.value).toBe('standaard@example.org');
    });

    test('behandelt een lege referentie als geen referentie', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({ id: 'standaard', referentie: '' }),
      ]);

      const result = getMostRecentByContactgegevenType(
        contactgegevens,
        'Email'
      );

      expect(result.id).toBe('standaard');
    });

    test('geeft een leeg contactgegeven als er alleen zaakadressen zijn', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({ referentie: 'Z-24-2238078' }),
      ]);

      const result = getMostRecentByContactgegevenType(
        contactgegevens,
        'Email'
      );

      expect(result.id).toBeNull();
      expect(result.value).toBeNull();
    });

    test('geeft een leeg contactgegeven bij een mislukte response', () => {
      const result = getMostRecentByContactgegevenType(
        apiErrorResult('Mislukt', null),
        'Email'
      );

      expect(result.id).toBeNull();
      expect(result.value).toBeNull();
    });
  });

  describe('getZaakKanaalVoorkeuren', () => {
    test('zet contactgegevens met een referentie om naar zaakvoorkeuren', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({ id: 'standaard' }),
        getContactgegeven({
          id: 'zaak-email',
          waarde: 'zaak@example.org',
          referentie: 'Z-24-2238078',
        }),
        getContactgegeven({
          id: 'zaak-sms',
          type: 'Telefoonnummer',
          waarde: '0612345678',
          isGeverifieerd: false,
          referentie: 'Z-24-0000001',
        }),
      ]);

      const result = getZaakKanaalVoorkeuren(contactgegevens);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        zaakIdentificatie: 'Z-24-2238078',
        contactgegeven: {
          id: 'zaak-email',
          type: 'Email',
          value: 'zaak@example.org',
          isVerified: true,
        },
      });
      expect(result[1]).toMatchObject({
        zaakIdentificatie: 'Z-24-0000001',
        contactgegeven: {
          id: 'zaak-sms',
          type: 'Telefoonnummer',
          value: '0612345678',
          isVerified: false,
        },
      });
    });

    test('negeert contactgegevens met een ander type dan een zaakkanaal', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({ type: 'ApplicatieId', referentie: 'Z-24-1' }),
      ]);

      expect(getZaakKanaalVoorkeuren(contactgegevens)).toEqual([]);
    });

    test('geeft een lege lijst zonder zaakadressen', () => {
      const contactgegevens = apiSuccessResult([getContactgegeven({})]);

      expect(getZaakKanaalVoorkeuren(contactgegevens)).toEqual([]);
    });

    test('geeft een lege lijst bij een mislukte response', () => {
      expect(getZaakKanaalVoorkeuren(apiErrorResult('Mislukt', null))).toEqual(
        []
      );
    });
  });

  describe('isValidEmail', () => {
    test.each(['mokum@example.org', 'a.b+c@sub.example.nl'])(
      '%s is geldig',
      (value) => {
        expect(isValidEmail(value)).toBe(true);
      }
    );

    test.each([
      '',
      'geen-apenstaart',
      'a@b',
      '@example.org',
      'a b@example.org',
      'a@@example.org',
      `${'a'.repeat(250)}@example.org`,
    ])('%s is ongeldig', (value) => {
      expect(isValidEmail(value)).toBe(false);
    });
  });

  describe('getAllByContactgegevenType', () => {
    test('geeft alle eigen e-mailadressen, gevalideerde eerst en daarna de meest recente', () => {
      const result = getAllByContactgegevenType(
        apiSuccessResult([
          getContactgegeven({
            id: 'oud',
            waarde: 'oud@example.org',
            lastUpdated: '2025-01-01T10:00:00Z',
          }),
          getContactgegeven({
            id: 'nieuw-ongevalideerd',
            waarde: 'nieuw@example.org',
            isGeverifieerd: false,
            lastUpdated: '2025-03-01T10:00:00Z',
          }),
          getContactgegeven({
            id: 'recent',
            waarde: 'recent@example.org',
            lastUpdated: '2025-02-01T10:00:00Z',
          }),
        ]),
        'Email'
      );

      expect(result.map(({ id }) => id)).toEqual([
        'recent',
        'oud',
        'nieuw-ongevalideerd',
      ]);
      expect(result[0]).toMatchObject({
        type: 'Email',
        value: 'recent@example.org',
        isVerified: true,
      });
    });

    test('slaat zaakadressen, andere types en een mislukt profiel over', () => {
      const bron = apiSuccessResult([
        getContactgegeven({ id: '1' }),
        getContactgegeven({ id: '2', referentie: 'Z-24-1', isDefault: false }),
        getContactgegeven({
          id: '3',
          type: 'Telefoonnummer',
          waarde: '0612345678',
        }),
      ]);

      expect(
        getAllByContactgegevenType(bron, 'Email').map(({ id }) => id)
      ).toEqual(['1']);
      expect(
        getAllByContactgegevenType(apiErrorResult('fout', null), 'Email')
      ).toEqual([]);
    });

    test('telt hetzelfde adres in een andere schrijfwijze één keer en houdt de gevalideerde', () => {
      const result = getAllByContactgegevenType(
        apiSuccessResult([
          getContactgegeven({
            id: 'ongevalideerd',
            waarde: 'Mokum@Example.org',
            isGeverifieerd: false,
          }),
          getContactgegeven({ id: 'gevalideerd', waarde: 'mokum@example.org' }),
        ]),
        'Email'
      );

      expect(result.map(({ id }) => id)).toEqual(['gevalideerd']);
    });
  });
});
