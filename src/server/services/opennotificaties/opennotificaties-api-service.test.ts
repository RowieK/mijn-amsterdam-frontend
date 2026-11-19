import { jwtVerify } from 'jose';
import type { ReplyFnContext } from 'nock';

import { fetchKanalen } from './opennotificaties-api-service.ts';
import {
  getOpenNotificatiesConfig,
  type OpenNotificatiesConfig,
} from './opennotificaties-service-config.ts';
import type { KanaalSource } from './opennotificaties-types.ts';
import { remoteApiHost } from '../../../testing/setup.ts';
import { remoteApi } from '../../../testing/utils.ts';

const BASE_PATH = '/notificaties/api/v1';

const kanalen: KanaalSource[] = [
  {
    url: `${remoteApiHost}${BASE_PATH}/kanaal/e069e3f0-6d5b-40ac-91fb-ad16384c5851`,
    naam: 'zaken',
    documentatieLink: '',
    filters: [],
  },
  {
    url: `${remoteApiHost}${BASE_PATH}/kanaal/132e72c8-59b4-46c3-ab77-3c9b43738d51`,
    naam: 'documenten',
    documentatieLink: '',
    filters: [],
  },
];

describe('opennotificaties-api-service', () => {
  const config = getOpenNotificatiesConfig();

  describe('getOpenNotificatiesConfig', () => {
    test('gebruikt de URL van Open Notificaties en de JWT-client van Open Zaak', () => {
      expect(config).toEqual({
        url: `${remoteApiHost}/notificaties/api/v1/`,
        clientId: 'test-openzaak-client',
        jwtSecret: 'test-openzaak-jwt-secret',
      });
    });
  });

  describe('fetchKanalen', () => {
    test('geeft de kanalen en authenticeert met een JWT', async () => {
      let authorization: string | undefined;
      remoteApi.get(`${BASE_PATH}/kanaal`).reply(function (
        this: ReplyFnContext
      ) {
        authorization = this.req.headers.authorization as string;
        return [200, kanalen];
      });

      const response = await fetchKanalen(config);

      expect(response).toEqual({ status: 'OK', content: kanalen });
      const { payload } = await jwtVerify(
        String(authorization).replace('Bearer ', ''),
        new TextEncoder().encode(config.jwtSecret)
      );
      expect(payload).toMatchObject({ client_id: config.clientId });
    });

    test('geeft een foutresultaat als Open Notificaties een fout geeft', async () => {
      remoteApi.get(`${BASE_PATH}/kanaal`).reply(403);

      const response = await fetchKanalen(config);

      expect(response.status).toBe('ERROR');
      expect(response.content).toBeNull();
    });

    test.each<[string, OpenNotificatiesConfig]>([
      ['url', { ...config, url: undefined }],
      ['client-id', { ...config, clientId: undefined }],
      ['secret', { ...config, jwtSecret: undefined }],
    ])(
      'geeft 503 en doet geen aanroep zonder %s',
      async (_naam, incompleteConfig) => {
        const response = await fetchKanalen(incompleteConfig);

        expect(response).toMatchObject({
          status: 'ERROR',
          content: null,
          code: 503,
        });
      }
    );
  });
});
