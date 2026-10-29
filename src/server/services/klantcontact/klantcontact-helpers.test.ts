import {
  getMostRecentByContactgegevenType,
  getZaakKanaalVoorkeuren,
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
});
