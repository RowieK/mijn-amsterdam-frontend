import type { GemeenteKlantcontactConfig } from './klantcontact-backend-types.ts';
import { zaakIdentificatieAlsReferentie } from './klantcontact-helpers.ts';
import type { ContactProfieldienstResponseSource } from './klantcontact-profieldienst-types.ts';
import {
  createProfielserviceBackend,
  normalizeDutchMobileNumber,
} from './klantcontact-profieldienst.ts';
import { getAmsterdamKlantcontactConfig } from './klantcontact-service-config.ts';
import { remoteApiHost } from '../../../testing/setup.ts';
import { getAuthProfileAndToken, remoteApi } from '../../../testing/utils.ts';

const fictieveGemeenteConfig: GemeenteKlantcontactConfig = {
  profielservice: { url: `${remoteApiHost}/fictieve-gemeente/profiel` },
  zaakVoorkeur: {
    referentie: (zaakIdentificatie) =>
      zaakIdentificatie.replaceAll('/', '-').slice(0, 50),
    kanalen: ['Email'],
  },
};

// De adapter moet zich bij elke gemeente-config hetzelfde gedragen, alleen de basis-URL verschilt.
describe.each([
  { naam: 'Amsterdam', config: getAmsterdamKlantcontactConfig() },
  { naam: 'fictieve gemeente', config: fictieveGemeenteConfig },
])('klantcontact-profieldienst ($naam)', ({ config }) => {
  const backend = createProfielserviceBackend(config);
  const basePath = new URL(config.profielservice.url ?? '').pathname;
  const authProfileAndToken = getAuthProfileAndToken();

  const contactgegevenResponse = {
    id: '10',
    type: 'Email',
    waarde: 'mokum@example.org',
    isGeverifieerd: false,
    isDefault: true,
    createdAt: '2025-01-01T10:00:00Z',
    lastUpdated: '2025-01-01T10:00:00Z',
    scopes: [],
  };

  describe('fetchContactgegevens', () => {
    test('geeft de contactgegevens uit het profiel', async () => {
      const profiel: ContactProfieldienstResponseSource = {
        partijId: 'partij-1',
        identificaties: [],
        voorkeuren: [],
        contactgegevens: [
          { ...contactgegevenResponse, referentie: 'Z-24-2238078' },
        ] as ContactProfieldienstResponseSource['contactgegevens'],
      };
      remoteApi
        .post(`${basePath}/partij`, {
          identificatieType: 'BSN',
          identificatieNummer: authProfileAndToken.profile.id,
          dienstverlener: 'amsterdam',
        })
        .reply(200, profiel);

      const response = await backend.fetchContactgegevens(authProfileAndToken);

      expect(response.status).toBe('OK');
      expect(response.content).toEqual(profiel.contactgegevens);
    });

    test('geeft een foutresultaat als het profiel niet kan worden opgehaald', async () => {
      const otherAuth = getAuthProfileAndToken('commercial');
      remoteApi
        .post(`${basePath}/partij`, {
          identificatieType: 'KVK',
          identificatieNummer: otherAuth.profile.id,
          dienstverlener: 'amsterdam',
        })
        .reply(500);

      const response = await backend.fetchContactgegevens(otherAuth);

      expect(response.status).toBe('ERROR');
      expect(response.content).toBeNull();
    });
  });

  describe('createContactgegeven', () => {
    test('zonder opties is het contactgegeven het standaardadres zonder referentie', async () => {
      let body: unknown;
      remoteApi
        .post(`${basePath}/contactgegeven`, (requestBody) => {
          body = requestBody;
          return true;
        })
        .reply(200, contactgegevenResponse);

      const response = await backend.createContactgegeven(
        authProfileAndToken,
        'Email',
        'mokum@example.org'
      );

      expect(body).toEqual({
        identificatieType: 'BSN',
        identificatieNummer: authProfileAndToken.profile.id,
        type: 'Email',
        waarde: 'mokum@example.org',
        isDefault: true,
      });
      expect(response.status).toBe('OK');
      expect(response.content).toMatchObject({
        id: '10',
        type: 'Email',
        value: 'mokum@example.org',
        isVerified: false,
      });
    });

    test('met een referentie en isDefault false wordt het een zaakadres', async () => {
      let body: unknown;
      remoteApi
        .post(`${basePath}/contactgegeven`, (requestBody) => {
          body = requestBody;
          return true;
        })
        .reply(200, { ...contactgegevenResponse, isDefault: false });

      await backend.createContactgegeven(
        authProfileAndToken,
        'Telefoonnummer',
        '0612345678',
        { referentie: 'Z-24-2238078', isDefault: false }
      );

      expect(body).toEqual({
        identificatieType: 'BSN',
        identificatieNummer: authProfileAndToken.profile.id,
        type: 'Telefoonnummer',
        waarde: '+31612345678', // een Nederlands mobiel nummer gaat als E.164 naar de profielservice
        isDefault: false,
        referentie: 'Z-24-2238078',
      });
    });

    test('geeft een foutresultaat en doet geen aanroep bij een ongeldig mobiel nummer', async () => {
      const response = await backend.createContactgegeven(
        authProfileAndToken,
        'Telefoonnummer',
        '0201234567',
        { referentie: 'Z-24-2238078', isDefault: false }
      );

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 400,
      });
    });
  });

  describe('deleteContactgegeven', () => {
    test('verwijdert het contactgegeven met het opgegeven id', async () => {
      remoteApi.delete(`${basePath}/contactgegeven/10`).reply(204);

      const response = await backend.deleteContactgegeven(
        authProfileAndToken,
        '10'
      );

      expect(response.status).toBe('OK');
    });
  });

  describe('verifyContactgegeven', () => {
    test('verifieert een e-mailadres met de code', async () => {
      remoteApi
        .post(`${basePath}/emailverificatie`, {
          email: 'mokum@example.org',
          identificatieNummer: authProfileAndToken.profile.id,
          identificatieType: 'BSN',
          verificatieCode: '123456',
        })
        .reply(200);

      const response = await backend.verifyContactgegeven(authProfileAndToken, {
        type: 'Email',
        value: 'mokum@example.org',
        code: '123456',
      });

      expect(response.content).toEqual({ verified: true });
    });

    // TODO: het endpoint voor telefoonverificatie is nog niet bevestigd (plan, open punt 7).
    test('verifieert een telefoonnummer met het genormaliseerde nummer in het veld telefoonnummer', async () => {
      remoteApi
        .post(`${basePath}/emailverificatie`, {
          telefoonnummer: '+31612345678',
          identificatieNummer: authProfileAndToken.profile.id,
          identificatieType: 'BSN',
          verificatieCode: '123456',
        })
        .reply(200);

      const response = await backend.verifyContactgegeven(authProfileAndToken, {
        type: 'Telefoonnummer',
        value: '06 1234 5678',
        code: '123456',
      });

      expect(response.content).toEqual({ verified: true });
    });

    test('geeft een foutresultaat en doet geen aanroep bij een ongeldig mobiel nummer', async () => {
      const response = await backend.verifyContactgegeven(authProfileAndToken, {
        type: 'Telefoonnummer',
        value: '0201234567',
        code: '123456',
      });

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 400,
      });
    });
  });

  describe('fetchDienstverlener', () => {
    test('voegt de tijdelijke zorgned-dienst toe', async () => {
      remoteApi
        .get(`${basePath}/dienstverlener/amsterdam`)
        .reply(200, { naam: 'amsterdam', diensten: [] });

      const response = await backend.fetchDienstverlener(authProfileAndToken);

      expect(response.content?.diensten).toEqual([
        { id: 'zorgned', beschrijving: 'WMO en Jeugdzaken' },
      ]);
    });
  });

  describe('zaakIsVanGebruiker', () => {
    // De profielservice kent geen zaken en er is nog geen OpenZaak-controle (plan WP8).
    // Zonder controle moet de adapter weigeren, en geen HTTP-aanroep doen.
    test('weigert zolang het eigenaarschap niet vast te stellen is (fail closed)', async () => {
      const response = await backend.zaakIsVanGebruiker(
        authProfileAndToken,
        'Z-24-2238078'
      );

      expect(response).toMatchObject({
        status: 'ERROR',
        content: null,
        code: 503,
      });
    });
  });
});

describe('getAmsterdamKlantcontactConfig', () => {
  const config = getAmsterdamKlantcontactConfig();

  test('gebruikt de profielservice uit de omgeving', () => {
    expect(config.profielservice.url).toBe(`${remoteApiHost}/profielservice`);
  });

  test('gebruikt de zaakidentificatie als referentie', () => {
    expect(config.zaakVoorkeur.referentie).toBe(zaakIdentificatieAlsReferentie);
    expect(config.zaakVoorkeur.referentie('Z-24-2238078')).toBe('Z-24-2238078');
    expect(config.zaakVoorkeur.referentie('Z/24/2238078')).toBeNull();
  });

  test('biedt e-mail en telefoonnummer aan als kanaal per zaak', () => {
    expect(config.zaakVoorkeur.kanalen).toEqual(['Email', 'Telefoonnummer']);
  });
});

describe('normalizeDutchMobileNumber', () => {
  test.each([
    ['0612345678', '+31612345678'],
    ['+31612345678', '+31612345678'],
    ['0031612345678', '+31612345678'],
    ['06 1234 5678', '+31612345678'],
    ['06-1234-5678', '+31612345678'],
  ])('accepteert %s', (input, expected) => {
    expect(normalizeDutchMobileNumber(input)).toBe(expected);
  });

  test.each(['061234567', '0201234567', 'abcdefghij', '', '+316123456789'])(
    'weigert %s',
    (input) => {
      expect(() => normalizeDutchMobileNumber(input)).toThrow(
        'Ongeldig Nederlands mobiel telefoonnummer'
      );
    }
  );
});
