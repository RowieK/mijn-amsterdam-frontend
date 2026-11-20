import { jwtVerify } from 'jose';
import type { ReplyFnContext } from 'nock';

import {
  fetchInitiatorRollen,
  fetchZaakByIdentificatie,
  fetchZakenVanGebruiker,
  rolIsVanProfiel,
  zaakIsVanGebruiker,
} from './openzaak-api-service.ts';
import {
  getOpenZaakConfig,
  type OpenZaakConfig,
} from './openzaak-service-config.ts';
import type { RolSource, ZaakMetRollenSource } from './openzaak-types.ts';
import { remoteApiHost } from '../../../testing/setup.ts';
import { getAuthProfileAndToken, remoteApi } from '../../../testing/utils.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';

const BASE_PATH = '/zaken/api/v1';
const ZAAK_IDENTIFICATIE = 'ZAAK-2026-0000000171';
const ZAAK_URL = `${remoteApiHost}${BASE_PATH}/zaken/db7d581d-ad7f-497b-8476-efa4d15e364a`;
const BSN = '999990019';
const KVK = '69599084';

function getAuth(
  profileType: ProfileType = 'private',
  id: string = BSN
): AuthProfileAndToken {
  const authProfileAndToken = getAuthProfileAndToken(profileType);
  return {
    ...authProfileAndToken,
    profile: { ...authProfileAndToken.profile, id },
  };
}

const zaak = {
  url: ZAAK_URL,
  uuid: 'db7d581d-ad7f-497b-8476-efa4d15e364a',
  identificatie: ZAAK_IDENTIFICATIE,
  bronorganisatie: '123456782',
};

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const rolNatuurlijkPersoon: RolSource = {
  url: `${remoteApiHost}${BASE_PATH}/rollen/1`,
  zaak: ZAAK_URL,
  betrokkeneType: 'natuurlijk_persoon',
  omschrijvingGeneriek: 'initiator',
  betrokkeneIdentificatie: { inpBsn: BSN },
};

function mockZaken(results: unknown[]) {
  remoteApi
    .get(`${BASE_PATH}/zaken`)
    .query({
      identificatie: ZAAK_IDENTIFICATIE,
      bronorganisatie: '123456782',
    })
    .reply(200, paginated(results));
}

function mockRollen(results: unknown[]) {
  remoteApi
    .get(`${BASE_PATH}/rollen`)
    .query({ zaak: ZAAK_URL, omschrijvingGeneriek: 'initiator' })
    .reply(200, paginated(results));
}

describe('openzaak-api-service', () => {
  const config = getOpenZaakConfig();

  describe('getOpenZaakConfig', () => {
    test('leest de configuratie uit de omgeving', () => {
      expect(config).toEqual({
        url: `${remoteApiHost}/zaken/api/v1/`,
        clientId: 'test-openzaak-client',
        jwtSecret: 'test-openzaak-jwt-secret',
        bronorganisatie: '123456782',
      });
    });
  });

  describe('fetchZaakByIdentificatie', () => {
    test('zoekt op identificatie en bronorganisatie en geeft de zaak', async () => {
      mockZaken([zaak]);

      const response = await fetchZaakByIdentificatie(
        config,
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: zaak });
    });

    test('authenticeert met een JWT die op de secret van de gemeente is gesigneerd', async () => {
      let authorization: string | undefined;
      remoteApi
        .get(`${BASE_PATH}/zaken`)
        .query(true)
        .reply(function (this: ReplyFnContext) {
          authorization = this.req.headers.authorization as string;
          return [200, paginated([zaak])];
        });

      await fetchZaakByIdentificatie(config, ZAAK_IDENTIFICATIE);

      expect(authorization).toMatch(/^Bearer /);
      const { payload } = await jwtVerify(
        String(authorization).replace('Bearer ', ''),
        new TextEncoder().encode(config.jwtSecret)
      );
      expect(payload).toMatchObject({
        iss: config.clientId,
        client_id: config.clientId,
        user_id: config.clientId,
        user_representation: config.clientId,
      });
    });

    test('geeft null als de zaak niet in Open Zaak staat', async () => {
      mockZaken([]);

      const response = await fetchZaakByIdentificatie(
        config,
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: null });
    });

    test('negeert een zaak met een andere identificatie of bronorganisatie', async () => {
      mockZaken([
        { ...zaak, identificatie: 'ZAAK-2026-0000000999' },
        { ...zaak, bronorganisatie: '000000000' },
      ]);

      const response = await fetchZaakByIdentificatie(
        config,
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: null });
    });

    test('geeft een foutresultaat als Open Zaak een fout geeft', async () => {
      remoteApi.get(`${BASE_PATH}/zaken`).query(true).reply(500);

      const response = await fetchZaakByIdentificatie(
        config,
        ZAAK_IDENTIFICATIE
      );

      expect(response.status).toBe('ERROR');
      expect(response.content).toBeNull();
    });

    test.each<[string, OpenZaakConfig]>([
      ['url', { ...config, url: undefined }],
      ['bronorganisatie', { ...config, bronorganisatie: undefined }],
      ['client-id', { ...config, clientId: undefined }],
      ['secret', { ...config, jwtSecret: undefined }],
    ])(
      'geeft 503 en doet geen aanroep zonder %s in de configuratie',
      async (_naam, incompleteConfig) => {
        const response = await fetchZaakByIdentificatie(
          incompleteConfig,
          ZAAK_IDENTIFICATIE
        );

        expect(response).toMatchObject({
          status: 'ERROR',
          content: null,
          code: 503,
        });
      }
    );
  });

  describe('fetchInitiatorRollen', () => {
    test('haalt alleen de initiator-rollen van de zaak op', async () => {
      mockRollen([rolNatuurlijkPersoon]);

      const response = await fetchInitiatorRollen(config, ZAAK_URL);

      expect(response).toEqual({
        status: 'OK',
        content: [rolNatuurlijkPersoon],
      });
    });

    test('geeft 503 zonder configuratie', async () => {
      const response = await fetchInitiatorRollen({}, ZAAK_URL);

      expect(response).toMatchObject({ status: 'ERROR', code: 503 });
    });
  });

  describe('rolIsVanProfiel', () => {
    const { profile } = getAuth();
    const kvkProfile = getAuth('commercial', KVK).profile;

    test('een BSN-profiel komt overeen met de inpBsn van een natuurlijk persoon', () => {
      expect(rolIsVanProfiel(rolNatuurlijkPersoon, profile)).toBe(true);
      expect(
        rolIsVanProfiel(
          {
            ...rolNatuurlijkPersoon,
            betrokkeneIdentificatie: { inpBsn: '111222333' },
          },
          profile
        )
      ).toBe(false);
    });

    test('ook private-attributes wordt op BSN vergeleken', () => {
      expect(
        rolIsVanProfiel(
          rolNatuurlijkPersoon,
          getAuth('private-attributes').profile
        )
      ).toBe(true);
    });

    test('een BSN-profiel komt nooit overeen met een niet-natuurlijk persoon of vestiging', () => {
      expect(
        rolIsVanProfiel(
          {
            ...rolNatuurlijkPersoon,
            betrokkeneType: 'niet_natuurlijk_persoon',
            betrokkeneIdentificatie: { inpBsn: BSN, kvkNummer: BSN },
          },
          profile
        )
      ).toBe(false);
    });

    test.each(['niet_natuurlijk_persoon', 'vestiging'] as const)(
      'een KVK-profiel komt overeen met het kvkNummer bij %s',
      (betrokkeneType) => {
        const rol: RolSource = {
          ...rolNatuurlijkPersoon,
          betrokkeneType,
          betrokkeneIdentificatie: { kvkNummer: KVK },
        };

        expect(rolIsVanProfiel(rol, kvkProfile)).toBe(true);
        expect(
          rolIsVanProfiel(
            { ...rol, betrokkeneIdentificatie: { kvkNummer: '12345678' } },
            kvkProfile
          )
        ).toBe(false);
      }
    );

    test('een KVK-profiel komt nooit overeen met een natuurlijk persoon', () => {
      expect(
        rolIsVanProfiel(
          {
            ...rolNatuurlijkPersoon,
            betrokkeneIdentificatie: { inpBsn: KVK, kvkNummer: KVK },
          },
          kvkProfile
        )
      ).toBe(false);
    });

    test('een rol die geen initiator is telt niet', () => {
      expect(
        rolIsVanProfiel(
          { ...rolNatuurlijkPersoon, omschrijvingGeneriek: 'belanghebbende' },
          profile
        )
      ).toBe(false);
    });

    test('een rol zonder betrokkeneIdentificatie of een profiel zonder id telt niet', () => {
      expect(
        rolIsVanProfiel(
          { ...rolNatuurlijkPersoon, betrokkeneIdentificatie: null },
          profile
        )
      ).toBe(false);
      expect(
        rolIsVanProfiel(rolNatuurlijkPersoon, { ...profile, id: '' })
      ).toBe(false);
    });
  });

  describe('zaakIsVanGebruiker', () => {
    test('is waar als de ingelogde gebruiker de initiator van de zaak is', async () => {
      mockZaken([zaak]);
      mockRollen([rolNatuurlijkPersoon]);

      const response = await zaakIsVanGebruiker(
        config,
        getAuth(),
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: true });
    });

    test('is waar voor een KVK-profiel dat de initiator van de zaak is', async () => {
      mockZaken([zaak]);
      mockRollen([
        {
          ...rolNatuurlijkPersoon,
          betrokkeneType: 'vestiging',
          betrokkeneIdentificatie: { kvkNummer: KVK },
        },
      ]);

      const response = await zaakIsVanGebruiker(
        config,
        getAuth('commercial', KVK),
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: true });
    });

    test('is onwaar als de initiator iemand anders is', async () => {
      mockZaken([zaak]);
      mockRollen([rolNatuurlijkPersoon]);

      const response = await zaakIsVanGebruiker(
        config,
        getAuth('private', '111222333'),
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: false });
    });

    test('is onwaar als de zaak geen initiator heeft', async () => {
      mockZaken([zaak]);
      mockRollen([]);

      const response = await zaakIsVanGebruiker(
        config,
        getAuth(),
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: false });
    });

    test('is onwaar en haalt geen rollen op als de zaak niet in Open Zaak staat', async () => {
      mockZaken([]);
      const rollenMock = remoteApi
        .get(`${BASE_PATH}/rollen`)
        .query(true)
        .reply(200, paginated([rolNatuurlijkPersoon]));

      const response = await zaakIsVanGebruiker(
        config,
        getAuth(),
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: false });
      expect(rollenMock.pendingMocks()).toHaveLength(1); // de rollen zijn niet opgevraagd
    });

    test('geeft een foutresultaat, nooit waar, als het zoeken van de zaak mislukt', async () => {
      remoteApi.get(`${BASE_PATH}/zaken`).query(true).reply(500);

      const response = await zaakIsVanGebruiker(
        config,
        getAuth(),
        ZAAK_IDENTIFICATIE
      );

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });

    test('geeft een foutresultaat, nooit waar, als het ophalen van de rollen mislukt', async () => {
      mockZaken([zaak]);
      remoteApi.get(`${BASE_PATH}/rollen`).query(true).reply(500);

      const response = await zaakIsVanGebruiker(
        config,
        getAuth(),
        ZAAK_IDENTIFICATIE
      );

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });

    test('weigert met 503 zonder configuratie (fail closed)', async () => {
      const response = await zaakIsVanGebruiker(
        {},
        getAuth(),
        ZAAK_IDENTIFICATIE
      );

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 503,
      });
    });
  });

  describe('fetchZakenVanGebruiker', () => {
    function zaakMetRollen(
      overrides: Partial<ZaakMetRollenSource> = {}
    ): ZaakMetRollenSource {
      return {
        ...zaak,
        omschrijving: 'Melding openbare ruimte',
        startdatum: '2026-03-01',
        einddatum: null,
        _expand: { rollen: [rolNatuurlijkPersoon] },
        ...overrides,
      };
    }

    function mockZakenVanGebruiker(results: unknown[]) {
      let authorization: string | undefined;
      remoteApi
        .get(`${BASE_PATH}/zaken`)
        .query({
          bronorganisatie: '123456782',
          rol__betrokkeneIdentificatie__natuurlijkPersoon__inpBsn: BSN,
          rol__omschrijvingGeneriek: 'initiator',
          expand: 'rollen',
        })
        .reply(function (this: ReplyFnContext) {
          authorization = this.req.headers.authorization as string;
          return [200, paginated(results)];
        });
      return () => authorization;
    }

    test('geeft de zaken waarvan de gebruiker initiator is', async () => {
      const getAuthorization = mockZakenVanGebruiker([zaakMetRollen()]);

      const response = await fetchZakenVanGebruiker(config, getAuth());

      expect(response).toEqual({ status: 'OK', content: [zaakMetRollen()] });
      expect(getAuthorization()).toMatch(/^Bearer /);
    });

    test.each<[string, Partial<ZaakMetRollenSource>]>([
      [
        'de gebruiker is betrokken, maar geen initiator',
        {
          _expand: {
            rollen: [
              {
                ...rolNatuurlijkPersoon,
                omschrijvingGeneriek: 'belanghebbende',
              },
            ],
          },
        },
      ],
      [
        'de initiator is iemand anders',
        {
          _expand: {
            rollen: [
              {
                ...rolNatuurlijkPersoon,
                betrokkeneIdentificatie: { inpBsn: '111222333' },
              },
            ],
          },
        },
      ],
      ['de rollen kwamen niet mee', { _expand: undefined }],
      ['een andere bronorganisatie', { bronorganisatie: '000000000' }],
    ])('laat een zaak weg als %s', async (_naam, overrides) => {
      mockZakenVanGebruiker([zaakMetRollen(overrides)]);

      const response = await fetchZakenVanGebruiker(config, getAuth());

      expect(response).toEqual({ status: 'OK', content: [] });
    });

    test('geeft een lege lijst voor een ondernemer, zonder aanroep', async () => {
      const response = await fetchZakenVanGebruiker(
        config,
        getAuth('commercial', KVK)
      );

      expect(response).toEqual({ status: 'OK', content: [] });
    });

    test('geeft een foutresultaat als Open Zaak een fout geeft', async () => {
      remoteApi.get(`${BASE_PATH}/zaken`).query(true).reply(500);

      const response = await fetchZakenVanGebruiker(config, getAuth());

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });

    test('geeft 503 zonder configuratie', async () => {
      const response = await fetchZakenVanGebruiker({}, getAuth());

      expect(response).toMatchObject({ status: 'ERROR', code: 503 });
    });
  });
});
