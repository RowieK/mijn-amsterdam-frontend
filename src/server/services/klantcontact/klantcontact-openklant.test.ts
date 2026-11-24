import type { ReplyFnContext } from 'nock';

import type { GemeenteKlantcontactConfig } from './klantcontact-backend-types.ts';
import type {
  DigitaalAdresSource,
  PartijSource,
} from './klantcontact-openklant-types.ts';
import { createOpenKlantBackend } from './klantcontact-openklant.ts';
import { getAmsterdamKlantcontactConfig } from './klantcontact-service-config.ts';
import { remoteApiHost } from '../../../testing/setup.ts';
import { getAuthProfileAndToken, remoteApi } from '../../../testing/utils.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';

const BASE_PATH = '/klantinteracties/api/v1';
const BSN = '999990019';
const KVK = '69599084';
const PARTIJ_UUID = 'e7598ea9-5fd3-4645-8e45-7d08f28d49eb';
const PARTIJ_URL = `${remoteApiHost}${BASE_PATH}/partijen/${PARTIJ_UUID}`;

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

function digitaalAdres(
  overrides: Partial<DigitaalAdresSource> = {}
): DigitaalAdresSource {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    url: `${remoteApiHost}${BASE_PATH}/digitaleadressen/11111111-1111-4111-8111-111111111111`,
    verstrektDoorPartij: { uuid: PARTIJ_UUID, url: PARTIJ_URL },
    adres: 'mokum@example.org',
    soortDigitaalAdres: 'email',
    isStandaardAdres: true,
    referentie: '',
    verificatieDatum: '2026-01-31',
    ...overrides,
  };
}

function partij(
  digitaleAdressen: DigitaalAdresSource[],
  overrides: Partial<PartijSource> = {}
): PartijSource {
  return {
    uuid: PARTIJ_UUID,
    url: PARTIJ_URL,
    partijIdentificatoren: [
      {
        partijIdentificator: {
          codeObjecttype: 'natuurlijk_persoon',
          codeSoortObjectId: 'bsn',
          objectId: BSN,
        },
      },
    ],
    digitaleAdressen: digitaleAdressen.map(({ uuid, url }) => ({ uuid, url })),
    _expand: { digitaleAdressen },
    ...overrides,
  };
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mockPartijen(results: PartijSource[]) {
  remoteApi
    .get(`${BASE_PATH}/partijen`)
    .query({
      partijIdentificator__objectId: BSN,
      partijIdentificator__codeObjecttype: 'natuurlijk_persoon',
      partijIdentificator__codeSoortObjectId: 'bsn',
      expand: 'digitaleAdressen',
    })
    .reply(200, paginated(results));
}

describe('klantcontact-openklant', () => {
  const config = getAmsterdamKlantcontactConfig();
  const backend = createOpenKlantBackend(config);
  const authProfileAndToken = getAuth();

  describe('getAmsterdamKlantcontactConfig', () => {
    test('leest Open Klant uit de omgeving', () => {
      expect(config.openKlant).toEqual({
        url: `${remoteApiHost}/klantinteracties/api/v1/`,
        token: 'test-openklant-token',
      });
    });
  });

  describe('fetchContactgegevens', () => {
    test('zoekt de partij op BSN met de digitale adressen en authenticeert met een token', async () => {
      let authorization: string | undefined;
      remoteApi
        .get(`${BASE_PATH}/partijen`)
        .query(true)
        .reply(function (this: ReplyFnContext) {
          authorization = this.req.headers.authorization as string;
          return [200, paginated([partij([])])];
        });

      await backend.fetchContactgegevens(authProfileAndToken);

      expect(authorization).toBe('Token test-openklant-token');
    });

    test('geeft de e-mail- en telefoonadressen van de partij als contactgegevens', async () => {
      mockPartijen([
        partij([
          digitaalAdres(),
          digitaalAdres({
            uuid: '22222222-2222-4222-8222-222222222222',
            adres: '+31612345678',
            soortDigitaalAdres: 'telefoonnummer',
            isStandaardAdres: false,
            referentie: 'ZAAK-2026-0000000171',
            verificatieDatum: null,
          }),
        ]),
      ]);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response.status).toBe('OK');
      expect(response.content).toEqual([
        {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'Email',
          waarde: 'mokum@example.org',
          isGeverifieerd: true,
          isDefault: true,
          referentie: null, // Open Klant geeft een lege string als er geen referentie is
          createdAt: null,
          lastUpdated: null,
          scopes: [],
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          type: 'Telefoonnummer',
          waarde: '+31612345678',
          isGeverifieerd: false,
          isDefault: false,
          referentie: 'ZAAK-2026-0000000171',
          createdAt: null,
          lastUpdated: null,
          scopes: [],
        },
      ]);
    });

    test('slaat een adres van soort overig over', async () => {
      mockPartijen([
        partij([
          digitaalAdres({ soortDigitaalAdres: 'overig', adres: 'iets anders' }),
        ]),
      ]);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response).toEqual({ status: 'OK', content: [] });
    });

    test('zoekt een KVK-profiel op kvk_nummer van een niet-natuurlijk persoon', async () => {
      remoteApi
        .get(`${BASE_PATH}/partijen`)
        .query({
          partijIdentificator__objectId: KVK,
          partijIdentificator__codeObjecttype: 'niet_natuurlijk_persoon',
          partijIdentificator__codeSoortObjectId: 'kvk_nummer',
          expand: 'digitaleAdressen',
        })
        .reply(
          200,
          paginated([
            partij([digitaalAdres()], {
              partijIdentificatoren: [
                {
                  partijIdentificator: {
                    codeObjecttype: 'niet_natuurlijk_persoon',
                    codeSoortObjectId: 'kvk_nummer',
                    objectId: KVK,
                  },
                },
              ],
            }),
          ])
        );

      const response = await backend.fetchContactgegevens(
        getAuth('commercial', KVK)
      );

      expect(response.status).toBe('OK');
      expect(response.content).toHaveLength(1);
    });

    test('accepteert de sleutel digitale_adressen uit de OpenAPI-spec', async () => {
      mockPartijen([
        partij([], {
          _expand: { digitale_adressen: [digitaalAdres()] },
        }),
      ]);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response.content).toHaveLength(1);
    });

    test('geeft een lege lijst als er geen partij is', async () => {
      mockPartijen([]);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response).toEqual({ status: 'OK', content: [] });
    });

    // Open Klant negeert onbekende queryparameters. Een partij van iemand anders mag nooit worden gebruikt.
    test('negeert een partij die niet bij de ingelogde gebruiker hoort', async () => {
      mockPartijen([
        partij([digitaalAdres()], {
          partijIdentificatoren: [
            {
              partijIdentificator: {
                codeObjecttype: 'natuurlijk_persoon',
                codeSoortObjectId: 'bsn',
                objectId: '111222333',
              },
            },
          ],
        }),
      ]);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response).toEqual({ status: 'OK', content: [] });
    });

    test('geeft een foutresultaat bij meerdere partijen voor dezelfde BSN', async () => {
      mockPartijen([partij([]), partij([], { uuid: 'andere-partij' })]);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 409,
      });
    });

    test('geeft een foutresultaat in plaats van een lege lijst als de adressen niet meekomen', async () => {
      mockPartijen([partij([digitaalAdres()], { _expand: undefined })]);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });

    test('vindt de partij ook op een volgende pagina', async () => {
      const query = {
        partijIdentificator__objectId: BSN,
        partijIdentificator__codeObjecttype: 'natuurlijk_persoon',
        partijIdentificator__codeSoortObjectId: 'bsn',
        expand: 'digitaleAdressen',
      };
      const anderePartij = partij([], {
        url: `${remoteApiHost}${BASE_PATH}/partijen/andere`,
        partijIdentificatoren: [],
      });
      remoteApi
        .get(`${BASE_PATH}/partijen`)
        .query(query)
        .reply(200, {
          count: 2,
          next: `${remoteApiHost}${BASE_PATH}/partijen?${new URLSearchParams({ ...query, page: '2' })}`,
          previous: null,
          results: [anderePartij],
        });
      remoteApi
        .get(`${BASE_PATH}/partijen`)
        .query({ ...query, page: '2' })
        .reply(200, paginated([partij([digitaalAdres()])]));

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response.status).toBe('OK');
      expect(response.content).toHaveLength(1);
    });

    test('geeft een foutresultaat als Open Klant een fout geeft', async () => {
      remoteApi.get(`${BASE_PATH}/partijen`).query(true).reply(500);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });

    test.each<[string, GemeenteKlantcontactConfig['openKlant']]>([
      ['url', { token: 'x' }],
      ['token', { url: `${remoteApiHost}${BASE_PATH}/` }],
    ])('geeft 503 en doet geen aanroep zonder %s', async (_naam, openKlant) => {
      const response = await createOpenKlantBackend({
        ...config,
        openKlant,
      }).fetchContactgegevens(authProfileAndToken);

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 503,
      });
    });
  });

  describe('createContactgegeven', () => {
    function mockCreate(
      onBody: (body: unknown) => void = () => undefined,
      reply: Partial<DigitaalAdresSource> = {}
    ) {
      remoteApi
        .post(`${BASE_PATH}/digitaleadressen`, (body) => {
          onBody(body);
          return true;
        })
        .reply(201, (_uri, body) => ({
          // Open Klant geeft terug wat is aangemaakt: zonder verificatieDatum in het verzoek is het ongeverifieerd.
          ...digitaalAdres({ verificatieDatum: null }),
          ...(body as object),
          uuid: '33333333-3333-4333-8333-333333333333',
          ...reply,
        }));
    }

    test('maakt een zaakadres aan met referentie, zonder standaardadres, bij de partij van de gebruiker', async () => {
      mockPartijen([partij([])]);
      let body: unknown;
      mockCreate((requestBody) => (body = requestBody));

      const response = await backend.createContactgegeven(
        authProfileAndToken,
        'Email',
        'mokum@example.org',
        { referentie: 'ZAAK-2026-0000000171', isDefault: false }
      );

      expect(body).toEqual({
        verstrektDoorPartij: { uuid: PARTIJ_UUID, url: PARTIJ_URL },
        adres: 'mokum@example.org',
        soortDigitaalAdres: 'email',
        isStandaardAdres: false,
        referentie: 'ZAAK-2026-0000000171',
      });
      expect(response.status).toBe('OK');
      expect(response.content).toMatchObject({
        id: '33333333-3333-4333-8333-333333333333',
        type: 'Email',
        value: 'mokum@example.org',
        isVerified: false,
      });
    });

    test('is standaard een standaardadres zonder referentie', async () => {
      mockPartijen([partij([])]);
      let body: unknown;
      mockCreate((requestBody) => (body = requestBody));

      await backend.createContactgegeven(
        authProfileAndToken,
        'Email',
        'mokum@example.org'
      );

      expect(body).toEqual({
        verstrektDoorPartij: { uuid: PARTIJ_UUID, url: PARTIJ_URL },
        adres: 'mokum@example.org',
        soortDigitaalAdres: 'email',
        isStandaardAdres: true,
      });
    });

    test('erft de verificatiedatum van een al geverifieerd adres met dezelfde waarde', async () => {
      mockPartijen([
        partij([digitaalAdres({ verificatieDatum: '2026-01-31' })]),
      ]);
      let body: unknown;
      mockCreate((requestBody) => (body = requestBody));

      const response = await backend.createContactgegeven(
        authProfileAndToken,
        'Email',
        'mokum@example.org',
        { referentie: 'ZAAK-2026-0000000171', isDefault: false }
      );

      expect(body).toMatchObject({ verificatieDatum: '2026-01-31' });
      expect(response.content).toMatchObject({ isVerified: true });
    });

    test('erft geen verificatiedatum van een ongeverifieerd adres of van een ander adres', async () => {
      mockPartijen([
        partij([
          digitaalAdres({ verificatieDatum: null }),
          digitaalAdres({
            uuid: '44444444-4444-4444-8444-444444444444',
            adres: 'iemand-anders@example.org',
          }),
        ]),
      ]);
      let body: unknown;
      mockCreate((requestBody) => (body = requestBody));

      await backend.createContactgegeven(
        authProfileAndToken,
        'Email',
        'mokum@example.org',
        { referentie: 'ZAAK-2026-0000000171', isDefault: false }
      );

      expect(body).not.toHaveProperty('verificatieDatum');
    });

    test('zet een Nederlands mobiel nummer om naar E.164 en erft de verificatie van het nummer in dezelfde schrijfwijze', async () => {
      mockPartijen([
        partij([
          digitaalAdres({
            adres: '0612345678',
            soortDigitaalAdres: 'telefoonnummer',
          }),
        ]),
      ]);
      let body: unknown;
      mockCreate((requestBody) => (body = requestBody));

      await backend.createContactgegeven(
        authProfileAndToken,
        'Telefoonnummer',
        '0612345678',
        { referentie: 'ZAAK-2026-0000000171', isDefault: false }
      );

      expect(body).toMatchObject({
        adres: '+31612345678',
        soortDigitaalAdres: 'telefoonnummer',
        verificatieDatum: '2026-01-31',
      });
    });

    test('geeft een foutresultaat en doet geen aanroep bij een ongeldig mobiel nummer', async () => {
      const response = await backend.createContactgegeven(
        authProfileAndToken,
        'Telefoonnummer',
        '0201234567'
      );

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 400,
      });
    });

    test.each(['Berichtenbox', 'Postadres', 'ApplicatieId'] as const)(
      'ondersteunt %s niet en doet geen aanroep',
      async (type) => {
        const response = await backend.createContactgegeven(
          authProfileAndToken,
          type,
          'waarde'
        );

        expect(response).toMatchObject({
          status: 'ERROR',
          content: null,
          code: 400,
        });
      }
    );

    test('maakt niets aan als de gebruiker geen partij heeft', async () => {
      mockPartijen([]);
      const createMock = remoteApi
        .post(`${BASE_PATH}/digitaleadressen`)
        .reply(201, digitaalAdres());

      const response = await backend.createContactgegeven(
        authProfileAndToken,
        'Email',
        'mokum@example.org'
      );

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 404,
      });
      expect(createMock.pendingMocks()).toHaveLength(1); // niet aangeroepen
    });

    test('geeft een foutresultaat als Open Klant het adres weigert', async () => {
      mockPartijen([partij([])]);
      remoteApi.post(`${BASE_PATH}/digitaleadressen`).reply(400, {});

      const response = await backend.createContactgegeven(
        authProfileAndToken,
        'Email',
        'mokum@example.org'
      );

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });
  });

  describe('deleteContactgegeven', () => {
    const eigenAdres = digitaalAdres();

    test('verwijdert een digitaal adres van de partij van de gebruiker', async () => {
      mockPartijen([partij([eigenAdres])]);
      const deleteMock = remoteApi
        .delete(`${BASE_PATH}/digitaleadressen/${eigenAdres.uuid}`)
        .reply(204);

      const response = await backend.deleteContactgegeven(
        authProfileAndToken,
        eigenAdres.uuid
      );

      expect(response).toEqual({ status: 'OK', content: null });
      expect(deleteMock.isDone()).toBe(true);
    });

    // Open Klant kent geen eigenaarschap per gebruiker: zonder deze controle kan iedereen elk adres verwijderen.
    test('verwijdert nooit een digitaal adres dat niet bij de gebruiker hoort', async () => {
      mockPartijen([partij([eigenAdres])]);
      const andermansUuid = '99999999-9999-4999-8999-999999999999';
      const deleteMock = remoteApi
        .delete(`${BASE_PATH}/digitaleadressen/${andermansUuid}`)
        .reply(204);

      const response = await backend.deleteContactgegeven(
        authProfileAndToken,
        andermansUuid
      );

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 404,
      });
      expect(deleteMock.pendingMocks()).toHaveLength(1); // niet aangeroepen
    });

    test('verwijdert niets als de gebruiker geen partij heeft', async () => {
      mockPartijen([]);

      const response = await backend.deleteContactgegeven(
        authProfileAndToken,
        eigenAdres.uuid
      );

      expect(response).toMatchObject({ status: 'ERROR', code: 404 });
    });

    test('geeft een foutresultaat als het verwijderen mislukt', async () => {
      mockPartijen([partij([eigenAdres])]);
      remoteApi
        .delete(`${BASE_PATH}/digitaleadressen/${eigenAdres.uuid}`)
        .reply(500);

      const response = await backend.deleteContactgegeven(
        authProfileAndToken,
        eigenAdres.uuid
      );

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });
  });

  describe('verifyContactgegeven', () => {
    test('wordt niet ondersteund en doet geen aanroep', async () => {
      const response = await backend.verifyContactgegeven(authProfileAndToken, {
        type: 'Email',
        value: 'mokum@example.org',
        code: '123456',
      });

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 501,
      });
    });
  });

  describe('fetchDienstverlener', () => {
    test('geeft een dienstverlener zonder diensten', async () => {
      const response = await backend.fetchDienstverlener(authProfileAndToken);

      expect(response).toEqual({
        status: 'OK',
        content: { naam: 'openklant', diensten: [] },
      });
    });
  });

  describe('zaakIsVanGebruiker', () => {
    const ZAAK_IDENTIFICATIE = 'ZAAK-2026-0000000171';
    const ZAAK_URL = `${remoteApiHost}/zaken/api/v1/zaken/db7d581d-ad7f-497b-8476-efa4d15e364a`;

    test('controleert het eigenaarschap in Open Zaak', async () => {
      remoteApi
        .get('/zaken/api/v1/zaken')
        .query({
          identificatie: ZAAK_IDENTIFICATIE,
          bronorganisatie: '123456782',
        })
        .reply(
          200,
          paginated([
            {
              url: ZAAK_URL,
              uuid: 'db7d581d-ad7f-497b-8476-efa4d15e364a',
              identificatie: ZAAK_IDENTIFICATIE,
              bronorganisatie: '123456782',
            },
          ])
        );
      remoteApi
        .get('/zaken/api/v1/rollen')
        .query({ zaak: ZAAK_URL, omschrijvingGeneriek: 'initiator' })
        .reply(
          200,
          paginated([
            {
              url: `${remoteApiHost}/zaken/api/v1/rollen/1`,
              zaak: ZAAK_URL,
              betrokkeneType: 'natuurlijk_persoon',
              omschrijvingGeneriek: 'initiator',
              betrokkeneIdentificatie: { inpBsn: BSN },
            },
          ])
        );

      const response = await backend.zaakIsVanGebruiker(
        authProfileAndToken,
        ZAAK_IDENTIFICATIE
      );

      expect(response).toEqual({ status: 'OK', content: true });
    });

    test('weigert met 503 zonder Open Zaak-configuratie', async () => {
      const response = await createOpenKlantBackend({
        ...config,
        openZaak: undefined,
      }).zaakIsVanGebruiker(authProfileAndToken, ZAAK_IDENTIFICATIE);

      expect(response).toMatchObject({ status: 'ERROR', code: 503 });
    });
  });
});
