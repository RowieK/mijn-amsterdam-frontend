import { jwtVerify } from 'jose';

import { getCustomApiConfig } from './source-api-helpers.ts';
import {
  createZgwJwt,
  hasZgwJwtCredentials,
  isSameOrigin,
  joinApiUrl,
  requestAllPages,
} from './zgw-api-helpers.ts';
import { remoteApiHost } from '../../testing/setup.ts';
import { remoteApi } from '../../testing/utils.ts';

describe('zgw-api-helpers', () => {
  describe('createZgwJwt', () => {
    const credentials = {
      clientId: 'mijn-client',
      jwtSecret: 'een-lang-genoeg-geheim-voor-hs256',
    };

    test('maakt een HS256-token met de claims die een ZGW-API verwacht', async () => {
      const jwt = await createZgwJwt(credentials);

      const { payload, protectedHeader } = await jwtVerify(
        jwt,
        new TextEncoder().encode(credentials.jwtSecret)
      );

      expect(protectedHeader).toMatchObject({ alg: 'HS256', typ: 'JWT' });
      expect(payload).toMatchObject({
        iss: 'mijn-client',
        client_id: 'mijn-client',
        user_id: 'mijn-client',
        user_representation: 'mijn-client',
      });
      expect(typeof payload.iat).toBe('number');
    });

    test('is niet te verifiëren met een andere secret', async () => {
      const jwt = await createZgwJwt(credentials);

      await expect(
        jwtVerify(jwt, new TextEncoder().encode('een-andere-secret'))
      ).rejects.toThrow();
    });
  });

  describe('hasZgwJwtCredentials', () => {
    test('is alleen waar als client-id en secret allebei gevuld zijn', () => {
      expect(hasZgwJwtCredentials({ clientId: 'a', jwtSecret: 'b' })).toBe(
        true
      );
      expect(hasZgwJwtCredentials({ clientId: 'a' })).toBe(false);
      expect(hasZgwJwtCredentials({ jwtSecret: 'b' })).toBe(false);
      expect(hasZgwJwtCredentials({ clientId: '', jwtSecret: 'b' })).toBe(
        false
      );
    });
  });

  describe('joinApiUrl', () => {
    test.each([
      ['https://host/api/v1/', 'zaken'],
      ['https://host/api/v1', 'zaken'],
      ['https://host/api/v1//', '/zaken'],
    ])('voegt %s en %s samen met precies één slash', (base, path) => {
      expect(joinApiUrl(base, path)).toBe('https://host/api/v1/zaken');
    });
  });

  describe('isSameOrigin', () => {
    test.each([
      [
        'https://host/zaken/api/v1/zaken?page=2',
        'https://host/zaken/api/v1/',
        true,
      ],
      ['https://andere-host/zaken?page=2', 'https://host/zaken/api/v1/', false],
      ['http://host/zaken?page=2', 'https://host/zaken/api/v1/', false],
      ['geen-url', 'https://host/zaken/api/v1/', false],
    ])('%s op de host van %s is %s', (url, baseUrl, expected) => {
      expect(isSameOrigin(url, baseUrl)).toBe(expected);
    });
  });

  describe('requestAllPages', () => {
    const PATH = '/zaken/api/v1/zaken';
    const pageUrl = (page: number) =>
      `${remoteApiHost}${PATH}?bsn=1&page=${page}`;

    function getConfig() {
      return getCustomApiConfig(
        { url: `${remoteApiHost}${PATH}` },
        {
          method: 'GET',
          headers: { Authorization: 'Bearer token' },
          params: { bsn: '1' },
          enableCache: false,
        }
      );
    }

    function mockPage(page: number, results: string[], next: string | null) {
      remoteApi
        .get(PATH)
        .query(page === 1 ? { bsn: '1' } : { bsn: '1', page: String(page) })
        .reply(200, { count: 5, next, previous: null, results });
    }

    test('volgt next tot de laatste pagina en geeft alle resultaten', async () => {
      mockPage(1, ['a', 'b'], pageUrl(2));
      mockPage(2, ['c', 'd'], pageUrl(3));
      mockPage(3, ['e'], null);

      const response = await requestAllPages<string>(getConfig());

      expect(response).toEqual({
        status: 'OK',
        content: ['a', 'b', 'c', 'd', 'e'],
      });
    });

    test('stuurt het token ook mee naar de volgende pagina', async () => {
      let authorization: string | undefined;
      mockPage(1, ['a'], pageUrl(2));
      remoteApi
        .get(PATH)
        .query({ bsn: '1', page: '2' })
        .reply(function () {
          authorization = this.req.headers.authorization as string;
          return [
            200,
            { count: 2, next: null, previous: null, results: ['b'] },
          ];
        });

      await requestAllPages<string>(getConfig());

      expect(authorization).toBe('Bearer token');
    });

    test('geeft een foutresultaat, geen halve lijst, als een volgende pagina mislukt', async () => {
      mockPage(1, ['a'], pageUrl(2));
      remoteApi.get(PATH).query({ bsn: '1', page: '2' }).reply(500);

      const response = await requestAllPages<string>(getConfig());

      expect(response).toMatchObject({ status: 'ERROR', content: null });
    });

    test.each([
      [
        'next naar een andere host wijst',
        'https://andere-host.example.org/zaken?page=2',
        ['a'],
      ],
      [
        'de API een lege pagina met een volgende geeft',
        `${remoteApiHost}${PATH}?bsn=1&page=2`,
        [],
      ],
    ])('geeft een foutresultaat als %s', async (_naam, next, results) => {
      mockPage(1, results, next);

      const response = await requestAllPages<string>(getConfig());

      expect(response).toMatchObject({ status: 'ERROR', code: 502 });
    });

    test('geeft een foutresultaat als de API een pagina herhaalt', async () => {
      mockPage(1, ['a'], pageUrl(2));
      mockPage(2, ['b'], pageUrl(2));

      const response = await requestAllPages<string>(getConfig());

      expect(response).toMatchObject({ status: 'ERROR', code: 502 });
    });
  });
});
