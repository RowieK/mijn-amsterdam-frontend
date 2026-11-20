import type { ReplyFnContext } from 'nock';

import { getAuth } from './zgw-script-helpers.ts';
import { forTesting } from './zgw-testpersoon-seed.ts';
import type {
  DigitaalAdresSource,
  PartijSource,
} from '../server/services/klantcontact/klantcontact-openklant-types.ts';
import { remoteApiHost } from '../testing/setup.ts';
import { remoteApi } from '../testing/utils.ts';

const { checkInvoer, planSeed, seed } = forTesting;

const BASE_PATH = '/klantinteracties/api/v1';
const BSN = '999990019';
const EMAIL = 'test@example.org';
const config = { url: `${remoteApiHost}${BASE_PATH}/`, token: 'token' };
const auth = getAuth({ bsn: BSN })!;

function getAdres(
  overrides: Partial<DigitaalAdresSource> = {}
): DigitaalAdresSource {
  return {
    uuid: 'adres-1',
    url: `${remoteApiHost}${BASE_PATH}/digitaleadressen/adres-1`,
    adres: EMAIL,
    soortDigitaalAdres: 'email',
    isStandaardAdres: true,
    referentie: '',
    verificatieDatum: '2026-01-01',
    ...overrides,
  };
}

function getPartij(digitaleAdressen: DigitaalAdresSource[] = []): PartijSource {
  return {
    uuid: 'partij-1',
    url: `${remoteApiHost}${BASE_PATH}/partijen/partij-1`,
    partijIdentificatoren: [
      {
        partijIdentificator: {
          codeObjecttype: 'natuurlijk_persoon',
          codeSoortObjectId: 'bsn',
          objectId: BSN,
        },
      },
    ],
    digitaleAdressen,
    _expand: { digitaleAdressen },
  };
}

function mockPartijen(partijen: PartijSource[]) {
  remoteApi.get(`${BASE_PATH}/partijen`).query(true).reply(200, {
    count: partijen.length,
    next: null,
    previous: null,
    results: partijen,
  });
}

// Legt de body van een schrijfaanroep vast, zodat de test de payload kan controleren.
function mockSchrijf(
  method: 'post' | 'patch',
  path: string,
  antwoord: object
): () => Record<string, unknown> | undefined {
  let body: Record<string, unknown> | undefined;
  remoteApi[method](`${BASE_PATH}/${path}`).reply(function (
    this: ReplyFnContext,
    _uri,
    requestBody
  ) {
    body = requestBody as Record<string, unknown>;
    return [201, antwoord];
  });
  return () => body;
}

describe('zgw-testpersoon-seed', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkInvoer', () => {
    test('accepteert een BSN en een e-mailadres', () => {
      expect(checkInvoer({ bsn: BSN, email: EMAIL })).toEqual([]);
    });

    test.each([
      [{ email: EMAIL }, '--bsn ontbreekt'],
      [{ bsn: '12345', email: EMAIL }, '9 cijfers'],
      [{ bsn: '999993653', email: EMAIL }, 'producttests van de OMC'],
      [{ bsn: BSN }, '--email ontbreekt'],
      [{ bsn: BSN, email: 'geen-adres' }, 'Geen geldig e-mailadres'],
    ])('weigert %o', (invoer, melding) => {
      expect(checkInvoer(invoer)).toEqual([expect.stringContaining(melding)]);
    });
  });

  describe('planSeed', () => {
    test('maakt partij en adres aan als er geen partij is', () => {
      expect(planSeed(null, EMAIL)).toEqual({
        maakPartij: true,
        adres: { soort: 'aanmaken' },
        waarschuwingen: [],
      });
    });

    test('laat een geverifieerd standaardadres staan, ook met andere hoofdletters', () => {
      const plan = planSeed(getPartij([getAdres()]), 'Test@Example.org');

      expect(plan.adres).toEqual({ soort: 'in-orde', uuid: 'adres-1' });
      expect(plan.maakPartij).toBe(false);
    });

    test.each([
      ['niet geverifieerd', { verificatieDatum: null }],
      ['geen standaardadres', { isStandaardAdres: false }],
    ])('werkt een bestaand adres bij dat %s is', (_naam, overrides) => {
      const plan = planSeed(getPartij([getAdres(overrides)]), EMAIL);

      expect(plan.adres).toEqual({ soort: 'bijwerken', uuid: 'adres-1' });
    });

    test('ziet een zaakadres met dezelfde waarde niet als het standaardadres', () => {
      const plan = planSeed(
        getPartij([getAdres({ referentie: 'ZAAK-1' })]),
        EMAIL
      );

      expect(plan.adres).toEqual({ soort: 'aanmaken' });
    });

    test('waarschuwt voor een ander standaard-e-mailadres', () => {
      const plan = planSeed(
        getPartij([getAdres({ uuid: 'ander', adres: 'ander@example.org' })]),
        EMAIL
      );

      expect(plan.waarschuwingen).toEqual([
        expect.stringContaining('ander(e) standaard-e-mailadres'),
      ]);
    });
  });

  describe('seed', () => {
    test('schrijft niets bij een dry-run', async () => {
      mockPartijen([]);

      expect(await seed(config, auth, EMAIL, { dryRun: true })).toBe(true);
    });

    test('maakt een partij met het BSN en een geverifieerd standaardadres aan', async () => {
      const partij = getPartij();
      mockPartijen([]);
      const partijBody = mockSchrijf('post', 'partijen', partij);
      const identificatorBody = mockSchrijf(
        'post',
        'partij-identificatoren',
        {}
      );
      const adresBody = mockSchrijf('post', 'digitaleadressen', getAdres());

      expect(await seed(config, auth, EMAIL, { dryRun: false })).toBe(true);

      expect(partijBody()).toMatchObject({
        soortPartij: 'persoon',
        indicatieActief: true,
      });
      expect(identificatorBody()).toEqual({
        identificeerdePartij: { uuid: partij.uuid, url: partij.url },
        anderePartijIdentificator: '',
        partijIdentificator: {
          codeObjecttype: 'natuurlijk_persoon',
          codeSoortObjectId: 'bsn',
          objectId: BSN,
          codeRegister: 'brp',
        },
        subIdentificatorVan: null,
      });
      expect(adresBody()).toMatchObject({
        verstrektDoorPartij: { uuid: partij.uuid, url: partij.url },
        adres: EMAIL,
        soortDigitaalAdres: 'email',
        isStandaardAdres: true,
        verificatieDatum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(adresBody()).not.toHaveProperty('referentie');
    });

    test('werkt een bestaand, ongeverifieerd adres bij', async () => {
      mockPartijen([getPartij([getAdres({ verificatieDatum: null })])]);
      const patchBody = mockSchrijf(
        'patch',
        'digitaleadressen/adres-1',
        getAdres()
      );

      expect(await seed(config, auth, EMAIL, { dryRun: false })).toBe(true);

      expect(patchBody()).toEqual({
        isStandaardAdres: true,
        verificatieDatum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });

    test('meldt een partij zonder BSN als de identificator niet aangemaakt kan worden', async () => {
      mockPartijen([]);
      mockSchrijf('post', 'partijen', getPartij());
      remoteApi
        .post(`${BASE_PATH}/partij-identificatoren`)
        .reply(400, { code: 'invalid', detail: 'Ongeldige invoer' });

      await expect(
        seed(config, auth, EMAIL, { dryRun: false })
      ).rejects.toThrow('Partij partij-1 is aangemaakt, maar zonder BSN');
    });

    test('geeft false als de partij niet opgehaald kan worden', async () => {
      remoteApi.get(`${BASE_PATH}/partijen`).query(true).reply(500);

      expect(await seed(config, auth, EMAIL, { dryRun: false })).toBe(false);
    });
  });
});
