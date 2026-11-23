import { forTesting } from './zgw-testzaken.ts';
import { getOpenZaakConfig } from '../server/services/openzaak/openzaak-service-config.ts';
import type {
  RolSource,
  ZaakMetRollenSource,
} from '../server/services/openzaak/openzaak-types.ts';
import { remoteApiHost } from '../testing/setup.ts';
import { remoteApi } from '../testing/utils.ts';

const { getTestkandidaten, fetchOpenZakenMetInitiator } = forTesting;

const BASE_PATH = '/zaken/api/v1';

function getRol(overrides: Partial<RolSource> = {}): RolSource {
  return {
    url: `${remoteApiHost}${BASE_PATH}/rollen/1`,
    zaak: `${remoteApiHost}${BASE_PATH}/zaken/1`,
    betrokkeneType: 'natuurlijk_persoon',
    omschrijvingGeneriek: 'initiator',
    betrokkeneIdentificatie: { inpBsn: '999990019' },
    ...overrides,
  };
}

function getZaak(
  identificatie: string,
  rollen: RolSource[]
): ZaakMetRollenSource {
  return {
    url: `${remoteApiHost}${BASE_PATH}/zaken/${identificatie}`,
    uuid: identificatie,
    identificatie,
    bronorganisatie: '123456782',
    omschrijving: `Zaak ${identificatie}`,
    startdatum: '2026-03-01',
    einddatum: null,
    _expand: { rollen },
  };
}

describe('zgw-testzaken', () => {
  describe('getTestkandidaten', () => {
    test('groepeert de zaken per BSN van de initiator', () => {
      const kandidaten = getTestkandidaten(
        [
          getZaak('ZAAK-1', [getRol()]),
          getZaak('ZAAK-2', [
            getRol({ betrokkeneIdentificatie: { inpBsn: '111222333' } }),
          ]),
          getZaak('ZAAK-3', [getRol()]),
        ],
        10
      );

      expect(kandidaten).toEqual([
        {
          bsn: '999990019',
          zaken: [
            expect.objectContaining({ identificatie: 'ZAAK-1' }),
            expect.objectContaining({ identificatie: 'ZAAK-3' }),
          ],
        },
        {
          bsn: '111222333',
          zaken: [expect.objectContaining({ identificatie: 'ZAAK-2' })],
        },
      ]);
    });

    test.each([
      [
        'het BSN van de OMC-producttests',
        getRol({ betrokkeneIdentificatie: { inpBsn: '999993653' } }),
      ],
      [
        'een andere rol dan initiator',
        getRol({ omschrijvingGeneriek: 'belanghebbende' }),
      ],
      [
        'een organisatie',
        getRol({ betrokkeneType: 'niet_natuurlijk_persoon' }),
      ],
      ['een rol zonder BSN', getRol({ betrokkeneIdentificatie: null })],
    ])('slaat %s over', (_naam, rol) => {
      expect(getTestkandidaten([getZaak('ZAAK-1', [rol])], 10)).toEqual([]);
    });

    test('geeft hoogstens max kandidaten', () => {
      const zaken = ['111111111', '222222222', '333333333'].map((bsn) =>
        getZaak(bsn, [getRol({ betrokkeneIdentificatie: { inpBsn: bsn } })])
      );

      expect(getTestkandidaten(zaken, 2).map(({ bsn }) => bsn)).toEqual([
        '111111111',
        '222222222',
      ]);
    });
  });

  describe('fetchOpenZakenMetInitiator', () => {
    const config = getOpenZaakConfig();

    test('vraagt open zaken met een burger als initiator op, met de rollen erbij', async () => {
      const zaak = getZaak('ZAAK-1', [getRol()]);
      remoteApi
        .get(`${BASE_PATH}/zaken`)
        .query({
          bronorganisatie: '123456782',
          einddatum__isnull: true,
          rol__omschrijvingGeneriek: 'initiator',
          rol__betrokkeneType: 'natuurlijk_persoon',
          expand: 'rollen',
          ordering: '-startdatum',
        })
        .reply(200, { count: 1, next: null, previous: null, results: [zaak] });

      expect(await fetchOpenZakenMetInitiator(config)).toEqual([zaak]);
    });

    test('geeft de foutmelding van de API door', async () => {
      remoteApi
        .get(`${BASE_PATH}/zaken`)
        .query(true)
        .reply(403, { code: 'permission_denied', detail: 'Geen toestemming' });

      await expect(fetchOpenZakenMetInitiator(config)).rejects.toThrow(
        'HTTP 403 | permission_denied | Geen toestemming'
      );
    });

    test('weigert zonder configuratie', async () => {
      await expect(fetchOpenZakenMetInitiator({})).rejects.toThrow(
        'niet geconfigureerd'
      );
    });
  });
});
