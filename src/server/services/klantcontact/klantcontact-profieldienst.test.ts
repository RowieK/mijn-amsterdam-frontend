import type { GemeenteKlantcontactConfig } from './klantcontact-backend-types.ts';
import { zaakIdentificatieAlsReferentie } from './klantcontact-helpers.ts';
import type { ContactProfieldienstResponseSource } from './klantcontact-profieldienst-types.ts';
import { createProfielserviceBackend } from './klantcontact-profieldienst.ts';
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
        waarde: '0612345678',
        isDefault: false,
        referentie: 'Z-24-2238078',
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
