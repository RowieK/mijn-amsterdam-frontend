import { zaakIsVanGebruiker } from './openzaak-api-service.ts';
import {
  getOpenZaakConfig,
  type OpenZaakConfig,
} from './openzaak-service-config.ts';
import type { RolSource, ZaakSource } from './openzaak-types.ts';
import { remoteApiHost } from '../../../testing/setup.ts';
import { getAuthProfileAndToken, remoteApi } from '../../../testing/utils.ts';
import { createProfielserviceBackend } from '../klantcontact/klantcontact-profieldienst.ts';
import { getAmsterdamKlantcontactConfig } from '../klantcontact/klantcontact-service-config.ts';

const BASE_PATH = '/zaken/api/v1';
const BSN = '999990019';
const ANDER_BSN = '999990020';

const config = {
  url: `${remoteApiHost}${BASE_PATH}/`,
  bronorganisatie: '123456782',
  clientId: 'test-openzaak-client',
  jwtSecret: 'test-openzaak-jwt-secret',
} satisfies OpenZaakConfig;

const auth = getAuthProfileAndToken();
auth.profile.id = BSN;

const zaak: ZaakSource = {
  uuid: '00000000-0000-4000-8000-000000000001',
  url: `${remoteApiHost}${BASE_PATH}/zaken/00000000-0000-4000-8000-000000000001`,
  identificatie: 'ZAAK-WP5-1',
  bronorganisatie: config.bronorganisatie,
};

function gepagineerd<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function maakInitiator(gevondenZaak: ZaakSource, inpBsn: string): RolSource {
  return {
    url: `${remoteApiHost}${BASE_PATH}/rollen/${gevondenZaak.uuid}`,
    zaak: gevondenZaak.url,
    betrokkeneType: 'natuurlijk_persoon',
    omschrijvingGeneriek: 'initiator',
    betrokkeneIdentificatie: { inpBsn },
  };
}

function mockZaakZoekopdracht() {
  return remoteApi.get(`${BASE_PATH}/zaken`).query({
    identificatie: zaak.identificatie,
    bronorganisatie: config.bronorganisatie,
  });
}

function mockInitiatorZoekopdracht(gevondenZaak: ZaakSource) {
  return remoteApi
    .get(`${BASE_PATH}/rollen`)
    .query({ zaak: gevondenZaak.url, omschrijvingGeneriek: 'initiator' });
}

describe('zaakIsVanGebruiker', () => {
  test('gebruikt OpenZaak via de profielservicebackend', async () => {
    const amsterdamConfig = getAmsterdamKlantcontactConfig();
    expect(amsterdamConfig.openZaak).toEqual(getOpenZaakConfig());

    const backend = createProfielserviceBackend({
      ...amsterdamConfig,
      openZaak: config,
    });
    mockZaakZoekopdracht().reply(200, gepagineerd([zaak]));
    mockInitiatorZoekopdracht(zaak).reply(
      200,
      gepagineerd([maakInitiator(zaak, BSN)])
    );

    const result = await backend.zaakIsVanGebruiker(auth, zaak.identificatie);

    expect(result).toEqual({ status: 'OK', content: true });
    expect(remoteApi.isDone()).toBe(true);
  });

  test.each([
    { naam: 'staat de ingelogde initiator toe', inpBsn: BSN, toegestaan: true },
    { naam: 'weigert andermans zaak', inpBsn: ANDER_BSN, toegestaan: false },
  ])('$naam', async ({ inpBsn, toegestaan }) => {
    mockZaakZoekopdracht().reply(200, gepagineerd([zaak]));
    mockInitiatorZoekopdracht(zaak).reply(
      200,
      gepagineerd([maakInitiator(zaak, inpBsn)])
    );

    const result = await zaakIsVanGebruiker(config, auth, zaak.identificatie);

    expect(result).toEqual({ status: 'OK', content: toegestaan });
  });

  test('geeft een fout als het ophalen van de zaak mislukt', async () => {
    mockZaakZoekopdracht().reply(503);

    const result = await zaakIsVanGebruiker(config, auth, zaak.identificatie);

    expect(result).toMatchObject({ status: 'ERROR', content: null });
  });

  test('geeft een fout als het ophalen van de initiator mislukt', async () => {
    mockZaakZoekopdracht().reply(200, gepagineerd([zaak]));
    mockInitiatorZoekopdracht(zaak).reply(503);

    const result = await zaakIsVanGebruiker(config, auth, zaak.identificatie);

    expect(result).toMatchObject({ status: 'ERROR', content: null });
  });

  test('weigert toegang als dezelfde zaakidentificatie alleen bij een andere bronorganisatie van de burger is', async () => {
    const zaakBijAndereOrganisatie: ZaakSource = {
      ...zaak,
      uuid: '00000000-0000-4000-8000-000000000002',
      url: `${remoteApiHost}${BASE_PATH}/zaken/00000000-0000-4000-8000-000000000002`,
      bronorganisatie: '000000000',
    };
    mockZaakZoekopdracht().reply(
      200,
      gepagineerd([zaakBijAndereOrganisatie, zaak])
    );
    mockInitiatorZoekopdracht(zaak).reply(
      200,
      gepagineerd([maakInitiator(zaak, ANDER_BSN)])
    );
    mockInitiatorZoekopdracht(zaakBijAndereOrganisatie)
      .optionally()
      .reply(200, gepagineerd([maakInitiator(zaakBijAndereOrganisatie, BSN)]));

    const result = await zaakIsVanGebruiker(config, auth, zaak.identificatie);

    expect(result).toEqual({ status: 'OK', content: false });
    expect(remoteApi.isDone()).toBe(true);
  });
});
