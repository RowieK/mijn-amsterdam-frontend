import { forTesting } from './zgw-koppelingen-check.ts';
import { remoteApiHost } from '../testing/setup.ts';
import { remoteApi } from '../testing/utils.ts';

const {
  isBasisUrl,
  looksLikeJwt,
  getConfigProblemen,
  checkVerbinding,
  getCatalogiUrl,
  getOnderwerpObjectIds,
  formatKlantcontact,
} = forTesting;

// Header en payload van een HS256-JWT; de handtekening doet er voor de herkenning niet toe.
const JWT = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"iss":"client"}').toString('base64url')}.handtekening`;

const configCompleet = {
  openKlant: {
    url: 'https://openklant.example.nl/klantinteracties/api/v1/',
    token: 'token',
  },
  openZaak: {
    url: 'https://openzaak.example.nl/zaken/api/v1/',
    clientId: 'client',
    jwtSecret: 'secret',
    bronorganisatie: '123456782',
  },
  openNotificaties: {
    url: 'https://opennotificaties.example.nl/api/v1',
    clientId: 'client',
    jwtSecret: 'secret',
  },
};

describe('zgw-koppelingen-check', () => {
  describe('isBasisUrl', () => {
    test.each([
      'https://openklant.example.nl/klantinteracties/api/v1/',
      'https://openzaak.example.nl/zaken/api/v1',
      'https://opennotificaties.example.nl/api/v1/',
    ])('accepteert %s', (url) => {
      expect(isBasisUrl(url)).toBe(true);
    });

    test.each([
      'https://openklant.example.nl/klantinteracties/api/v1/partijen',
      'https://openzaak.example.nl/zaken/api/v1/zaken',
      'https://opennotificaties.example.nl/api/v1/kanaal',
      'geen-url',
    ])('weigert %s', (url) => {
      expect(isBasisUrl(url)).toBe(false);
    });
  });

  describe('looksLikeJwt', () => {
    test('herkent een JWT', () => {
      expect(looksLikeJwt(JWT)).toBe(true);
    });

    test.each(['een-gewone-secret', 'a.b.c', `${JWT}.extra`])(
      'ziet %s niet als JWT',
      (value) => {
        expect(looksLikeJwt(value)).toBe(false);
      }
    );
  });

  describe('getConfigProblemen', () => {
    test('geeft geen problemen bij een complete configuratie', () => {
      expect(getConfigProblemen(configCompleet)).toEqual({
        openKlant: [],
        openZaak: [],
        openNotificaties: [],
      });
    });

    test('meldt ontbrekende variabelen', () => {
      const problemen = getConfigProblemen({
        openKlant: {},
        openZaak: {},
        openNotificaties: {},
      });

      expect(problemen.openKlant).toEqual([
        'BFF_OPENKLANT_BASE_URL ontbreekt',
        'BFF_OPENKLANT_TOKEN ontbreekt',
      ]);
      expect(problemen.openZaak).toHaveLength(3);
      expect(problemen.openNotificaties).toHaveLength(2);
    });

    test('meldt een basis-URL met resourcepad en een JWT als secret', () => {
      const problemen = getConfigProblemen({
        ...configCompleet,
        openKlant: {
          ...configCompleet.openKlant,
          url: 'https://openklant.example.nl/klantinteracties/api/v1/partijen',
        },
        openZaak: { ...configCompleet.openZaak, jwtSecret: JWT },
      });

      expect(problemen.openKlant).toEqual([
        expect.stringContaining('BFF_OPENKLANT_BASE_URL moet eindigen'),
      ]);
      expect(problemen.openZaak).toEqual([
        expect.stringContaining('bevat een JWT'),
      ]);
    });
  });

  describe('getCatalogiUrl', () => {
    test('leidt de Catalogi API af uit de Zaken API van hetzelfde Open Zaak', () => {
      expect(getCatalogiUrl('https://openzaak.example.nl/zaken/api/v1/')).toBe(
        'https://openzaak.example.nl/catalogi/api/v1/'
      );
    });

    test('geeft null als de URL niet naar de Zaken API wijst', () => {
      expect(getCatalogiUrl('https://openzaak.example.nl/api/v1/')).toBeNull();
    });
  });

  describe('klantcontacten van de OMC', () => {
    const klantcontact = {
      uuid: '1',
      kanaal: 'Email',
      onderwerp: 'Zaak ZAAK-2026-0000000166 gewijzigd',
      indicatieContactGelukt: true,
      plaatsgevondenOp: '2026-11-23T10:00:00Z',
      metadata: { notifyNotificationId: 'abc-123' },
    };

    test('leest de objectId van de onderwerpobjecten, in camelCase en snake_case', () => {
      expect(
        getOnderwerpObjectIds({
          ...klantcontact,
          _expand: {
            gingOverOnderwerpobjecten: [
              { onderwerpobjectidentificator: { objectId: 'zaak-uuid' } },
              { onderwerpobjectidentificator: null },
            ],
          },
        })
      ).toEqual(['zaak-uuid']);
      expect(
        getOnderwerpObjectIds({
          ...klantcontact,
          _expand: {
            ging_over_onderwerpobjecten: [
              { onderwerpobjectidentificator: { objectId: 'ZAAK-1' } },
            ],
          },
        })
      ).toEqual(['ZAAK-1']);
      expect(getOnderwerpObjectIds(klantcontact)).toEqual([]);
    });

    test('toont datum, kanaal, of het gelukt is, onderwerp en het bericht-id van NotifyNL', () => {
      expect(formatKlantcontact(klantcontact)).toBe(
        '2026-11-23T10:00:00Z, kanaal Email, gelukt, onderwerp "Zaak ZAAK-2026-0000000166 gewijzigd", bericht abc-123 bij NotifyNL'
      );
    });

    test('laat ontbrekende gegevens weg', () => {
      expect(
        formatKlantcontact({
          ...klantcontact,
          onderwerp: '',
          indicatieContactGelukt: null,
          plaatsgevondenOp: null,
          metadata: null,
        })
      ).toBe('zonder datum, kanaal Email, niet bekend of het gelukt is');
    });
  });

  describe('checkVerbinding', () => {
    const url = `${remoteApiHost}/zaken/api/v1/zaken`;

    test('geeft de data bij een geslaagde aanroep', async () => {
      remoteApi.get('/zaken/api/v1/zaken').reply(200, { count: 0 });

      const verbinding = await checkVerbinding(url, {});

      expect(verbinding).toEqual({
        ok: true,
        melding: 'HTTP 200',
        hint: null,
        data: { count: 0 },
      });
    });

    test('toont de foutcode en het detail van de API met een hint', async () => {
      remoteApi.get('/zaken/api/v1/zaken').reply(403, {
        code: 'jwt-expired',
        detail: 'De JWT die gebruikt is voor dit verzoek is verlopen',
      });

      const verbinding = await checkVerbinding(url, {});

      expect(verbinding).toEqual({
        ok: false,
        melding:
          'HTTP 403 | jwt-expired | De JWT die gebruikt is voor dit verzoek is verlopen',
        hint: expect.stringContaining('client-secret'),
      });
    });

    test('geeft een hint bij een onbekend pad', async () => {
      remoteApi.get('/zaken/api/v1/zaken').reply(404);

      const verbinding = await checkVerbinding(url, {});

      expect(verbinding).toMatchObject({
        ok: false,
        melding: 'HTTP 404',
        hint: expect.stringContaining('basis-URL'),
      });
    });

    test('meldt het als er geen verbinding is', async () => {
      const verbinding = await checkVerbinding(
        'http://onbereikbaar.example.nl/api/v1/',
        {}
      );

      expect(verbinding).toMatchObject({
        ok: false,
        melding: expect.stringContaining('Geen verbinding'),
      });
    });
  });
});
