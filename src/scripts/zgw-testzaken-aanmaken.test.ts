import type { ReplyFnContext } from 'nock';

import { forTesting } from './zgw-testzaken-aanmaken.ts';
import { getOpenZaakConfig } from '../server/services/openzaak/openzaak-service-config.ts';
import type {
  RolSource,
  ZaakMetRollenSource,
} from '../server/services/openzaak/openzaak-types.ts';
import { remoteApiHost } from '../testing/setup.ts';
import { remoteApi } from '../testing/utils.ts';

const { checkInvoer, getCatalogiUrl, maakPlan, maakZakenAan } = forTesting;

const ZAKEN_PATH = '/zaken/api/v1';
const CATALOGI_PATH = '/catalogi/api/v1';
const BSN = '999990019';
const BRONORGANISATIE = '123456782';
const config = getOpenZaakConfig() as Required<
  ReturnType<typeof getOpenZaakConfig>
>;

function getZaaktypeUrl(id: string) {
  return `${remoteApiHost}${CATALOGI_PATH}/zaaktypen/${id}`;
}

const ZAAKTYPE = getZaaktypeUrl('zaaktype-1');

function getRoltype(zaaktypeId = 'zaaktype-1') {
  return {
    url: `${remoteApiHost}${CATALOGI_PATH}/roltypen/initiator-${zaaktypeId}`,
    zaaktype: getZaaktypeUrl(zaaktypeId),
    zaaktypeIdentificatie: zaaktypeId.toUpperCase(),
    omschrijving: 'Aanvrager',
    omschrijvingGeneriek: 'initiator',
  };
}

const ROLTYPE = getRoltype();

function getZaak(
  identificatie: string,
  overrides: Partial<ZaakMetRollenSource & { zaaktype: string }> = {}
) {
  const rol: RolSource = {
    url: `${remoteApiHost}${ZAKEN_PATH}/rollen/${identificatie}`,
    zaak: `${remoteApiHost}${ZAKEN_PATH}/zaken/${identificatie}`,
    betrokkeneType: 'natuurlijk_persoon',
    omschrijvingGeneriek: 'initiator',
    betrokkeneIdentificatie: { inpBsn: BSN },
  };

  return {
    url: `${remoteApiHost}${ZAKEN_PATH}/zaken/${identificatie}`,
    uuid: identificatie,
    identificatie,
    bronorganisatie: BRONORGANISATIE,
    zaaktype: ZAAKTYPE,
    omschrijving: `Zaak ${identificatie}`,
    startdatum: '2026-03-01',
    einddatum: null,
    _expand: { rollen: [rol] },
    ...overrides,
  };
}

function paginated<T>(results: T[], next: string | null = null) {
  return { count: results.length, next, previous: null, results };
}

// De zaken van de testpersoon, zoals de BFF ze opvraagt.
function mockZakenVanGebruiker(zaken: ReturnType<typeof getZaak>[]) {
  remoteApi
    .get(`${ZAKEN_PATH}/zaken`)
    .query({
      bronorganisatie: BRONORGANISATIE,
      rol__betrokkeneIdentificatie__natuurlijkPersoon__inpBsn: BSN,
      rol__omschrijvingGeneriek: 'initiator',
      expand: 'rollen',
    })
    .reply(200, paginated(zaken));
}

function mockRecenteZaak() {
  remoteApi
    .get(`${ZAKEN_PATH}/zaken`)
    .query({
      bronorganisatie: BRONORGANISATIE,
      einddatum__isnull: true,
      rol__omschrijvingGeneriek: 'initiator',
      rol__betrokkeneType: 'natuurlijk_persoon',
      ordering: '-startdatum',
    })
    .reply(200, paginated([getZaak('ZAAK-ANDER')]));
}

function mockRoltypenVanZaaktype(roltypen: ReturnType<typeof getRoltype>[]) {
  remoteApi
    .get(`${CATALOGI_PATH}/roltypen`)
    .query({ zaaktype: ZAAKTYPE, omschrijvingGeneriek: 'initiator' })
    .reply(200, paginated(roltypen));
}

// Legt de bodies van alle schrijfaanroepen op een pad vast, zodat de test de payload kan controleren.
function mockPost(
  path: string,
  antwoorden: object[]
): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  remoteApi
    .post(path)
    .times(antwoorden.length)
    .reply(function (this: ReplyFnContext, _uri, requestBody) {
      bodies.push(requestBody as Record<string, unknown>);
      return [201, antwoorden[bodies.length - 1]];
    });
  return bodies;
}

function getPlan(aantal = 2) {
  return {
    bsn: BSN,
    bestaandeZaken: [],
    zaken: Array.from({ length: aantal }, (_, index) => ({
      zaaktype: ZAAKTYPE,
      roltype: ROLTYPE,
      omschrijving: `Testzaak Mijn Amsterdam ${index + 1} (2026-11-23)`,
    })),
  };
}

describe('zgw-testzaken-aanmaken', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkInvoer', () => {
    test.each([
      [{ bsn: BSN }],
      [{ bsn: BSN, aantal: '10' }],
      [{ bsn: BSN, zaaktype: ZAAKTYPE }],
      [{ bsn: BSN, alleZaaktypen: true }],
    ])('accepteert %o', (invoer) => {
      expect(checkInvoer(invoer)).toEqual([]);
    });

    test.each([
      [{}, '--bsn ontbreekt'],
      [{ bsn: '12345' }, '9 cijfers'],
      [{ bsn: '999993653' }, 'producttests van de OMC'],
      [{ bsn: BSN, aantal: '0' }, '--aantal'],
      [{ bsn: BSN, aantal: '11' }, '--aantal'],
      [{ bsn: BSN, aantal: 'drie' }, '--aantal'],
      [{ bsn: BSN, zaaktype: 'zaaktype-1' }, '--zaaktype'],
      [{ bsn: BSN, aantal: '2', alleZaaktypen: true }, '--alle-zaaktypen'],
      [
        { bsn: BSN, zaaktype: ZAAKTYPE, alleZaaktypen: true },
        '--alle-zaaktypen',
      ],
    ])('weigert %o', (invoer, melding) => {
      expect(checkInvoer(invoer)).toEqual([expect.stringContaining(melding)]);
    });
  });

  describe('getCatalogiUrl', () => {
    test('leidt de Catalogi API af van de URL van het zaaktype', () => {
      expect(getCatalogiUrl(ZAAKTYPE)).toBe(`${remoteApiHost}${CATALOGI_PATH}`);
    });

    test('geeft null als het geen URL van een zaaktype is', () => {
      expect(getCatalogiUrl(`${remoteApiHost}${ZAKEN_PATH}/zaken/1`)).toBe(
        null
      );
    });
  });

  describe('maakPlan', () => {
    test('neemt het zaaktype over van de meest recente zaak met een burger als initiator', async () => {
      mockZakenVanGebruiker([
        getZaak('ZAAK-1'),
        getZaak('ZAAK-2', { einddatum: '2026-04-01' }),
      ]);
      mockRecenteZaak();
      mockRoltypenVanZaaktype([ROLTYPE]);

      const plan = await maakPlan(config, { bsn: BSN, aantal: 3 });

      expect(plan.bestaandeZaken).toEqual(['ZAAK-1']);
      expect(plan.zaken).toHaveLength(3);
      expect(plan.zaken[2]).toEqual({
        zaaktype: ZAAKTYPE,
        roltype: ROLTYPE,
        omschrijving: expect.stringMatching(/^Testzaak Mijn Amsterdam 3 \(/),
      });
    });

    test('gebruikt een meegegeven zaaktype', async () => {
      mockZakenVanGebruiker([]);
      mockRoltypenVanZaaktype([ROLTYPE]);

      const plan = await maakPlan(config, {
        bsn: BSN,
        aantal: 1,
        zaaktype: ZAAKTYPE,
      });

      expect(plan.zaken.map(({ zaaktype }) => zaaktype)).toEqual([ZAAKTYPE]);
      expect(plan.bestaandeZaken).toEqual([]);
    });

    test('weigert een zaaktype zonder roltype initiator', async () => {
      mockZakenVanGebruiker([]);
      mockRoltypenVanZaaktype([]);

      await expect(
        maakPlan(config, { bsn: BSN, aantal: 1, zaaktype: ZAAKTYPE })
      ).rejects.toThrow('geen roltype "initiator"');
    });

    test('geeft de foutmelding van de Catalogi API door', async () => {
      mockZakenVanGebruiker([]);
      remoteApi
        .get(`${CATALOGI_PATH}/roltypen`)
        .query(true)
        .reply(403, { code: 'permission_denied', detail: 'Geen toestemming' });

      await expect(
        maakPlan(config, { bsn: BSN, aantal: 1, zaaktype: ZAAKTYPE })
      ).rejects.toThrow('HTTP 403 | permission_denied | Geen toestemming');
    });

    test("maakt met alleZaaktypen één zaak per zaaktype met een initiator, in de nieuwste versie, over alle pagina's", async () => {
      mockZakenVanGebruiker([]);
      mockRecenteZaak();
      const tweedePagina = `${remoteApiHost}${CATALOGI_PATH}/zaaktypen?page=2`;
      remoteApi
        .get(`${CATALOGI_PATH}/zaaktypen`)
        .query({ status: 'definitief' })
        .reply(
          200,
          paginated(
            [
              {
                url: getZaaktypeUrl('zaaktype-1-oud'),
                identificatie: 'ZT-1',
                omschrijving: 'Melding openbare ruimte (oud)',
                beginGeldigheid: '2024-01-01',
                eindeGeldigheid: '2024-12-31',
              },
              {
                url: getZaaktypeUrl('zaaktype-1'),
                identificatie: 'ZT-1',
                omschrijving: 'Melding openbare ruimte',
                beginGeldigheid: '2025-01-01',
                eindeGeldigheid: '2025-12-31',
              },
              {
                url: getZaaktypeUrl('zonder-initiator'),
                identificatie: 'ZT-2',
                omschrijving: 'Intern',
                beginGeldigheid: '2025-01-01',
              },
            ],
            tweedePagina
          )
        );
      remoteApi
        .get(`${CATALOGI_PATH}/zaaktypen`)
        .query({ page: 2 })
        .reply(
          200,
          paginated([
            {
              url: getZaaktypeUrl('zaaktype-3'),
              identificatie: 'ZT-3',
              omschrijving: '',
              beginGeldigheid: '2025-01-01',
              eindeGeldigheid: null,
            },
          ])
        );
      remoteApi
        .get(`${CATALOGI_PATH}/roltypen`)
        .query({ status: 'definitief', omschrijvingGeneriek: 'initiator' })
        .reply(
          200,
          paginated([
            getRoltype('zaaktype-1-oud'),
            getRoltype('zaaktype-1'),
            getRoltype('zaaktype-3'),
          ])
        );

      const plan = await maakPlan(config, { bsn: BSN, alleZaaktypen: true });

      expect(plan.zaken).toEqual([
        {
          zaaktype: getZaaktypeUrl('zaaktype-1'),
          roltype: getRoltype('zaaktype-1'),
          omschrijving: 'Testzaak: Melding openbare ruimte',
          geldigTot: '2025-12-31',
        },
        {
          zaaktype: getZaaktypeUrl('zaaktype-3'),
          roltype: getRoltype('zaaktype-3'),
          omschrijving: 'Testzaak: ZT-3',
          geldigTot: null,
        },
      ]);
    });
  });

  describe('maakZakenAan', () => {
    test('maakt per zaak een zaak en een initiator met het BSN aan', async () => {
      const zaakBodies = mockPost(`${ZAKEN_PATH}/zaken`, [
        getZaak('ZAAK-NIEUW-1'),
        getZaak('ZAAK-NIEUW-2'),
      ]);
      const rolBodies = mockPost(`${ZAKEN_PATH}/rollen`, [{}, {}]);

      expect(await maakZakenAan(config, getPlan())).toEqual({
        aangemaakt: ['ZAAK-NIEUW-1', 'ZAAK-NIEUW-2'],
        fouten: [],
      });

      expect(zaakBodies).toHaveLength(2);
      expect(zaakBodies[0]).toEqual({
        bronorganisatie: BRONORGANISATIE,
        verantwoordelijkeOrganisatie: BRONORGANISATIE,
        zaaktype: ZAAKTYPE,
        startdatum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        omschrijving: 'Testzaak Mijn Amsterdam 1 (2026-11-23)',
        toelichting: expect.stringContaining('zgw:testzaken-aanmaken'),
      });
      expect(rolBodies[1]).toEqual({
        zaak: `${remoteApiHost}${ZAKEN_PATH}/zaken/ZAAK-NIEUW-2`,
        betrokkeneType: 'natuurlijk_persoon',
        roltype: ROLTYPE.url,
        roltoelichting: 'Testpersoon Mijn Amsterdam',
        betrokkeneIdentificatie: { inpBsn: BSN },
      });
    });

    test('gaat door na een fout en meldt een zaak zonder initiator', async () => {
      remoteApi
        .post(`${ZAKEN_PATH}/zaken`)
        .reply(403, { code: 'permission_denied', detail: 'Geen toestemming' });
      mockPost(`${ZAKEN_PATH}/zaken`, [
        getZaak('ZAAK-NIEUW-2'),
        getZaak('ZAAK-NIEUW-3'),
      ]);
      remoteApi
        .post(`${ZAKEN_PATH}/rollen`)
        .reply(400, { code: 'invalid', detail: 'Ongeldige invoer' });
      mockPost(`${ZAKEN_PATH}/rollen`, [{}]);

      expect(await maakZakenAan(config, getPlan(3))).toEqual({
        aangemaakt: ['ZAAK-NIEUW-3'],
        fouten: [
          expect.stringContaining(
            'Testzaak Mijn Amsterdam 1 (2026-11-23): POST /zaken/api/v1/zaken: HTTP 403'
          ),
          expect.stringContaining(
            'Zaak ZAAK-NIEUW-2 is aangemaakt, maar zonder initiator. POST /zaken/api/v1/rollen: HTTP 400'
          ),
        ],
      });
    });
  });
});
