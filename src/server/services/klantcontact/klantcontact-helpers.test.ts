import type { GemeenteKlantcontactConfig } from './klantcontact-backend-types.ts';
import {
  fetchZaakVoorkeurZaken,
  getAllByContactgegevenType,
  getMostRecentByContactgegevenType,
  getValidZaakReferentie,
  getZaakKanaalVoorkeuren,
  isValidEmail,
  isValidZaakReferentie,
  toZaakVoorkeurZaken,
  zaakIdentificatieAlsReferentie,
} from './klantcontact-helpers.ts';
import type { ContactgegevenSource } from './klantcontact-profieldienst-types.ts';
import { remoteApiHost } from '../../../testing/setup.ts';
import { getAuthProfileAndToken, remoteApi } from '../../../testing/utils.ts';
import {
  apiErrorResult,
  apiSuccessResult,
} from '../../../universal/helpers/api.ts';
import { getOpenZaakConfig } from '../openzaak/openzaak-service-config.ts';
import type { ZaakMetRollenSource } from '../openzaak/openzaak-types.ts';

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
      ['portaalvoorkeur', false],
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

    test('telt het adres met referentie portaalvoorkeur als adres van de partij', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({ id: 'portaal', referentie: 'portaalvoorkeur' }),
      ]);

      const result = getMostRecentByContactgegevenType(
        contactgegevens,
        'Email'
      );

      expect(result.id).toBe('portaal');
    });

    test('kiest zonder datums (Open Klant) het standaardadres', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({
          id: 'ander',
          isDefault: false,
          lastUpdated: null,
        }),
        getContactgegeven({
          id: 'standaard',
          isDefault: true,
          lastUpdated: null,
        }),
      ]);

      const result = getMostRecentByContactgegevenType(
        contactgegevens,
        'Email'
      );

      expect(result.id).toBe('standaard');
    });

    test('geeft een geverifieerd adres voorrang op een ongeverifieerd standaardadres', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({
          id: 'standaard',
          isDefault: true,
          isGeverifieerd: false,
        }),
        getContactgegeven({
          id: 'geverifieerd',
          isDefault: false,
          isGeverifieerd: true,
        }),
      ]);

      const result = getMostRecentByContactgegevenType(
        contactgegevens,
        'Email'
      );

      expect(result.id).toBe('geverifieerd');
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

    test('ziet het adres met referentie portaalvoorkeur niet als zaakvoorkeur', () => {
      const contactgegevens = apiSuccessResult([
        getContactgegeven({ referentie: 'portaalvoorkeur' }),
      ]);

      expect(getZaakKanaalVoorkeuren(contactgegevens)).toEqual([]);
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

  describe('toZaakVoorkeurZaken', () => {
    const ZAAKTYPE_URL =
      'https://openzaak.example.nl/catalogi/api/v1/zaaktypen/1';
    const zaak: ZaakMetRollenSource = {
      url: 'https://openzaak.example.nl/zaken/api/v1/zaken/1',
      uuid: '1',
      identificatie: 'ZAAK-2026-0000000171',
      bronorganisatie: '123456782',
      zaaktype: ZAAKTYPE_URL,
      omschrijving: 'Melding openbare ruimte',
      startdatum: '2026-03-01',
      einddatum: null,
    };
    const zaaktypen = new Map([
      [
        ZAAKTYPE_URL,
        {
          url: ZAAKTYPE_URL,
          identificatie: 'MELDING-OPENBARE-RUIMTE',
          omschrijving: 'Melding openbare ruimte (zaaktype)',
        },
      ],
    ]);

    test('geeft de identificatie, omschrijving en het zaaktype van de open zaken', () => {
      const result = toZaakVoorkeurZaken(
        apiSuccessResult([
          zaak,
          {
            ...zaak,
            identificatie: 'ZAAK-AFGESLOTEN',
            einddatum: '2026-01-01',
          },
        ]),
        zaaktypen
      );

      expect(result).toEqual(
        apiSuccessResult([
          {
            zaakIdentificatie: 'ZAAK-2026-0000000171',
            omschrijving: 'Melding openbare ruimte',
            zaaktype: {
              identificatie: 'MELDING-OPENBARE-RUIMTE',
              omschrijving: 'Melding openbare ruimte (zaaktype)',
            },
          },
        ])
      );
    });

    test('geeft zaaktype null als het zaaktype niet bekend is', () => {
      const result = toZaakVoorkeurZaken(apiSuccessResult([zaak]));

      expect(result.content).toEqual([
        expect.objectContaining({ zaaktype: null }),
      ]);
    });

    test('toont de identificatie als de zaak of het zaaktype geen omschrijving heeft', () => {
      const result = toZaakVoorkeurZaken(
        apiSuccessResult([{ ...zaak, omschrijving: '' }]),
        new Map([
          [
            ZAAKTYPE_URL,
            {
              url: ZAAKTYPE_URL,
              identificatie: 'MELDING-OPENBARE-RUIMTE',
              omschrijving: '',
            },
          ],
        ])
      );

      expect(result.content).toEqual([
        {
          zaakIdentificatie: 'ZAAK-2026-0000000171',
          omschrijving: 'ZAAK-2026-0000000171',
          zaaktype: {
            identificatie: 'MELDING-OPENBARE-RUIMTE',
            omschrijving: 'MELDING-OPENBARE-RUIMTE',
          },
        },
      ]);
    });

    test('geeft een foutresultaat ongewijzigd door', () => {
      const fout = apiErrorResult('Mislukt', null);

      expect(toZaakVoorkeurZaken(fout)).toBe(fout);
    });
  });

  describe('fetchZaakVoorkeurZaken', () => {
    const BSN = '999990019';
    const ZAAKTYPEN_PATH = '/catalogi/api/v1/zaaktypen';
    const authProfileAndToken = getAuthProfileAndToken('private');
    authProfileAndToken.profile.id = BSN;

    function zaakVanGebruiker(
      identificatie: string,
      zaaktypeId: string,
      einddatum: string | null = null
    ): ZaakMetRollenSource {
      return {
        url: `${remoteApiHost}/zaken/api/v1/zaken/${identificatie}`,
        uuid: identificatie,
        identificatie,
        bronorganisatie: '123456782',
        zaaktype: `${remoteApiHost}${ZAAKTYPEN_PATH}/${zaaktypeId}`,
        omschrijving: `Zaak ${identificatie}`,
        startdatum: '2026-03-01',
        einddatum,
        _expand: {
          rollen: [
            {
              url: `${remoteApiHost}/zaken/api/v1/rollen/${identificatie}`,
              zaak: `${remoteApiHost}/zaken/api/v1/zaken/${identificatie}`,
              betrokkeneType: 'natuurlijk_persoon',
              omschrijvingGeneriek: 'initiator',
              betrokkeneIdentificatie: { inpBsn: BSN },
            },
          ],
        },
      };
    }

    function mockZaken(results: ZaakMetRollenSource[]) {
      remoteApi
        .get('/zaken/api/v1/zaken')
        .query(true)
        .reply(200, {
          count: results.length,
          next: null,
          previous: null,
          results,
        });
    }

    test('geeft de open zaken met hun zaaktype, en haalt alleen de zaaktypen van open zaken op', async () => {
      mockZaken([
        zaakVanGebruiker('ZAAK-1', 'melding'),
        zaakVanGebruiker('ZAAK-2', 'afgesloten', '2026-01-01'),
      ]);
      remoteApi.get(`${ZAAKTYPEN_PATH}/melding`).reply(200, {
        url: `${remoteApiHost}${ZAAKTYPEN_PATH}/melding`,
        identificatie: 'MELDING-OPENBARE-RUIMTE',
        omschrijving: 'Melding openbare ruimte',
      });

      const response = await fetchZaakVoorkeurZaken(
        getOpenZaakConfig(),
        authProfileAndToken
      );

      expect(response).toEqual(
        apiSuccessResult([
          {
            zaakIdentificatie: 'ZAAK-1',
            omschrijving: 'Zaak ZAAK-1',
            zaaktype: {
              identificatie: 'MELDING-OPENBARE-RUIMTE',
              omschrijving: 'Melding openbare ruimte',
            },
          },
        ])
      );
    });

    test('geeft de zaak zonder zaaktype als de Catalogi API weigert', async () => {
      mockZaken([zaakVanGebruiker('ZAAK-1', 'melding')]);
      remoteApi.get(`${ZAAKTYPEN_PATH}/melding`).reply(403);

      const response = await fetchZaakVoorkeurZaken(
        getOpenZaakConfig(),
        authProfileAndToken
      );

      expect(response).toEqual(
        apiSuccessResult([
          {
            zaakIdentificatie: 'ZAAK-1',
            omschrijving: 'Zaak ZAAK-1',
            zaaktype: null,
          },
        ])
      );
    });

    test('geeft een foutresultaat als de zaken niet op te halen zijn', async () => {
      remoteApi.get('/zaken/api/v1/zaken').query(true).reply(500);

      const response = await fetchZaakVoorkeurZaken(
        getOpenZaakConfig(),
        authProfileAndToken
      );

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });
  });
});
