import type { Request } from 'express';
import type { MockInstance } from 'vitest';

import { klantcontactBackend } from './klantcontact-backend.ts';
import { transformContactgegevenSource } from './klantcontact-helpers.ts';
import type { ContactgegevenSource } from './klantcontact-profieldienst-types.ts';
import {
  handleCreateContactgegeven,
  handleDeleteContactgegeven,
  handleDeleteZaakKanaalVoorkeur,
  handleSetZaakKanaalVoorkeur,
  handleVerifyContactgegeven,
} from './klantcontact-route-handlers.ts';
import {
  RequestMock,
  ResponseAuthenticatedMock,
} from '../../../testing/utils.ts';
import {
  apiErrorResult,
  apiSuccessResult,
} from '../../../universal/helpers/api.ts';
import type { ResponseAuthenticated } from '../../routing/route-helpers.ts';

const ZAAK = 'Z-24-2238078';
const GEVERIFIEERD_ADRES = 'mokum@example.org';
const ONGEVERIFIEERD_ADRES = 'ongeverifieerd@example.org';
const ZAAK_ADRES = 'zaak@example.org';

function getContactgegeven(
  overrides: Partial<ContactgegevenSource>
): ContactgegevenSource {
  return {
    id: '1',
    type: 'Email',
    waarde: GEVERIFIEERD_ADRES,
    isGeverifieerd: true,
    isDefault: true,
    createdAt: '2025-01-01T10:00:00Z',
    lastUpdated: '2025-01-01T10:00:00Z',
    scopes: [],
    ...overrides,
  };
}

const contactgegevens = [
  getContactgegeven({ id: '1' }),
  getContactgegeven({
    id: '2',
    waarde: ONGEVERIFIEERD_ADRES,
    isGeverifieerd: false,
  }),
  getContactgegeven({
    id: '3',
    waarde: ZAAK_ADRES,
    isDefault: false,
    referentie: 'Z-24-1',
  }),
];

const nieuwContactgegeven = transformContactgegevenSource(
  getContactgegeven({
    id: 'nieuw',
    waarde: GEVERIFIEERD_ADRES,
    isGeverifieerd: false,
    isDefault: false,
    referentie: ZAAK,
  }),
  'Email'
);

describe('klantcontact-route-handlers', () => {
  describe('handleSetZaakKanaalVoorkeur', () => {
    let req: Request;
    let res: ResponseAuthenticated;
    let zaakIsVanGebruiker: MockInstance;
    let fetchContactgegevens: MockInstance;
    let createContactgegeven: MockInstance;
    let deleteContactgegeven: MockInstance;

    beforeEach(() => {
      req = RequestMock.new().get();
      res = ResponseAuthenticatedMock.new();
      req.body = {
        zaakIdentificatie: ZAAK,
        kanaal: 'Email',
        value: GEVERIFIEERD_ADRES,
      };

      zaakIsVanGebruiker = vi
        .spyOn(klantcontactBackend, 'zaakIsVanGebruiker')
        .mockResolvedValue(apiSuccessResult(true));
      fetchContactgegevens = vi
        .spyOn(klantcontactBackend, 'fetchContactgegevens')
        .mockResolvedValue(apiSuccessResult(contactgegevens));
      createContactgegeven = vi
        .spyOn(klantcontactBackend, 'createContactgegeven')
        .mockResolvedValue(apiSuccessResult(nieuwContactgegeven));
      deleteContactgegeven = vi
        .spyOn(klantcontactBackend, 'deleteContactgegeven')
        .mockResolvedValue(apiSuccessResult(null));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test.each([
      { naam: 'kanaal ontbreekt', body: { kanaal: undefined } },
      { naam: 'kanaal niet toegestaan', body: { kanaal: 'Postadres' } },
      { naam: 'value ontbreekt', body: { value: undefined } },
      { naam: 'zaakidentificatie ontbreekt', body: { zaakIdentificatie: '' } },
      {
        naam: 'ongeldige zaakidentificatie',
        body: { zaakIdentificatie: 'Z/24/1' },
      },
      {
        naam: 'de referentie van het voorkeursadres van de partij',
        body: { zaakIdentificatie: 'portaalvoorkeur' },
      },
    ])('geeft 400 zonder backend-aanroepen: $naam', async ({ body }) => {
      req.body = { ...req.body, ...body };

      await handleSetZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(zaakIsVanGebruiker).not.toHaveBeenCalled();
      expect(fetchContactgegevens).not.toHaveBeenCalled();
      expect(createContactgegeven).not.toHaveBeenCalled();
    });

    test('weigert met 403 en doet verder niets als de zaak niet van de gebruiker is', async () => {
      zaakIsVanGebruiker.mockResolvedValue(apiSuccessResult(false));

      await handleSetZaakKanaalVoorkeur(req, res);

      expect(zaakIsVanGebruiker).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        ZAAK
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(fetchContactgegevens).not.toHaveBeenCalled();
      expect(createContactgegeven).not.toHaveBeenCalled();
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test('weigert met 503 en doet verder niets als het eigenaarschap niet vast te stellen is', async () => {
      zaakIsVanGebruiker.mockResolvedValue(
        apiErrorResult('Controle niet beschikbaar', null, 503)
      );

      await handleSetZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(fetchContactgegevens).not.toHaveBeenCalled();
      expect(createContactgegeven).not.toHaveBeenCalled();
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test.each([
      {
        naam: 'onbekend adres',
        body: { value: 'onbekend@example.org' },
      },
      {
        naam: 'ongeverifieerd standaardadres',
        body: { value: ONGEVERIFIEERD_ADRES },
      },
      {
        naam: 'alleen bekend als zaakadres, niet als standaardadres',
        body: { value: ZAAK_ADRES },
      },
      {
        naam: 'verkeerd kanaal bij een geverifieerd e-mailadres',
        body: { kanaal: 'Telefoonnummer' },
      },
    ])(
      'weigert een waarde die geen geverifieerd standaardadres is: $naam',
      async ({ body }) => {
        req.body = { ...req.body, ...body };

        await handleSetZaakKanaalVoorkeur(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createContactgegeven).not.toHaveBeenCalled();
        expect(deleteContactgegeven).not.toHaveBeenCalled();
        // Het contactgegeven zelf komt niet terug in de foutmelding.
        expect(JSON.stringify(vi.mocked(res.send).mock.calls)).not.toContain(
          '@example.org'
        );
      }
    );

    test('geeft een foutstatus en maakt niets aan als de profielresponse faalt', async () => {
      fetchContactgegevens.mockResolvedValue(
        apiErrorResult('Profiel ophalen mislukt', null)
      );

      await handleSetZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(createContactgegeven).not.toHaveBeenCalled();
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test('zet de voorkeur voor een geverifieerd standaardadres en laat zien dat het nieuwe adres nog bevestigd moet worden', async () => {
      await handleSetZaakKanaalVoorkeur(req, res);

      expect(createContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        'Email',
        GEVERIFIEERD_ADRES,
        { referentie: ZAAK, isDefault: false }
      );
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        apiSuccessResult({
          zaakIdentificatie: ZAAK,
          contactgegeven: nieuwContactgegeven,
        })
      );
      expect(nieuwContactgegeven.isVerified).toBe(false);
    });

    test('accepteert het geverifieerde voorkeursadres van de partij (referentie portaalvoorkeur)', async () => {
      fetchContactgegevens.mockResolvedValue(
        apiSuccessResult([
          getContactgegeven({ id: 'portaal', referentie: 'portaalvoorkeur' }),
        ])
      );

      await handleSetZaakKanaalVoorkeur(req, res);

      expect(createContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        'Email',
        GEVERIFIEERD_ADRES,
        { referentie: ZAAK, isDefault: false }
      );
      // Het voorkeursadres van de partij is geen oud zaakadres en blijft staan.
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test('vervangt een bestaand zaakadres: eerst aanmaken, dan verwijderen', async () => {
      fetchContactgegevens.mockResolvedValue(
        apiSuccessResult([
          ...contactgegevens,
          getContactgegeven({ id: 'oud', isDefault: false, referentie: ZAAK }),
        ])
      );

      await handleSetZaakKanaalVoorkeur(req, res);

      expect(deleteContactgegeven).toHaveBeenCalledTimes(1);
      expect(deleteContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        'oud'
      );
      expect(createContactgegeven.mock.invocationCallOrder[0]).toBeLessThan(
        deleteContactgegeven.mock.invocationCallOrder[0]
      );
    });
  });

  describe('handleDeleteZaakKanaalVoorkeur', () => {
    let req: Request;
    let res: ResponseAuthenticated;
    let zaakIsVanGebruiker: MockInstance;
    let fetchContactgegevens: MockInstance;
    let deleteContactgegeven: MockInstance;

    beforeEach(() => {
      req = RequestMock.new().get();
      res = ResponseAuthenticatedMock.new();
      req.body = { zaakIdentificatie: ZAAK };

      zaakIsVanGebruiker = vi.spyOn(klantcontactBackend, 'zaakIsVanGebruiker');
      fetchContactgegevens = vi
        .spyOn(klantcontactBackend, 'fetchContactgegevens')
        .mockResolvedValue(
          apiSuccessResult([
            ...contactgegevens,
            getContactgegeven({
              id: 'zaakadres',
              isDefault: false,
              referentie: ZAAK,
            }),
          ])
        );
      deleteContactgegeven = vi
        .spyOn(klantcontactBackend, 'deleteContactgegeven')
        .mockResolvedValue(apiSuccessResult(null));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test.each([
      { naam: 'zaakidentificatie ontbreekt', body: {} },
      { naam: 'lege zaakidentificatie', body: { zaakIdentificatie: '' } },
      { naam: 'geen string', body: { zaakIdentificatie: 123 } },
      { naam: 'ongeldig teken', body: { zaakIdentificatie: 'Z/24/1' } },
    ])('geeft 400 zonder backend-aanroepen: $naam', async ({ body }) => {
      req.body = body;

      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(fetchContactgegevens).not.toHaveBeenCalled();
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test('verwijdert het zaakadres en laat de standaardadressen staan', async () => {
      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(deleteContactgegeven).toHaveBeenCalledTimes(1);
      expect(deleteContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        'zaakadres'
      );
      expect(res.status).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith(apiSuccessResult(null));
    });

    test('vraagt het eigenaarschap van de zaak niet op: het raakt alleen het eigen profiel', async () => {
      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(zaakIsVanGebruiker).not.toHaveBeenCalled();
    });

    test('geeft een foutstatus als het zaakadres niet verwijderd kan worden', async () => {
      deleteContactgegeven.mockResolvedValue(
        apiErrorResult('Verwijderen mislukt', null)
      );

      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('handleCreateContactgegeven (telefoonnummer)', () => {
    let req: Request;
    let res: ResponseAuthenticated;
    let createContactgegeven: MockInstance;

    beforeEach(() => {
      req = RequestMock.new().get();
      res = ResponseAuthenticatedMock.new();
      createContactgegeven = vi
        .spyOn(klantcontactBackend, 'createContactgegeven')
        .mockResolvedValue(apiSuccessResult(nieuwContactgegeven));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test.each(['0201234567', '061234567', 'abcdefghij', '+316123456789'])(
      'weigert %s met 400 zonder backend-aanroep (alleen Nederlandse mobiele nummers)',
      async (value) => {
        req.body = { type: 'Telefoonnummer', value };

        await handleCreateContactgegeven(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createContactgegeven).not.toHaveBeenCalled();
      }
    );

    test('weigert een value die geen string is met 400', async () => {
      req.body = { type: 'Email', value: { $ne: null } };

      await handleCreateContactgegeven(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(createContactgegeven).not.toHaveBeenCalled();
    });

    test('maakt een geldig mobiel nummer aan', async () => {
      req.body = { type: 'Telefoonnummer', value: '06 1234 5678' };

      await handleCreateContactgegeven(req, res);

      expect(createContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        'Telefoonnummer',
        '06 1234 5678'
      );
      expect(res.status).not.toHaveBeenCalledWith(400);
    });
  });

  describe('handleVerifyContactgegeven (telefoonnummer)', () => {
    let req: Request;
    let res: ResponseAuthenticated;
    let verifyContactgegeven: MockInstance;

    beforeEach(() => {
      req = RequestMock.new().get();
      res = ResponseAuthenticatedMock.new();
      verifyContactgegeven = vi
        .spyOn(klantcontactBackend, 'verifyContactgegeven')
        .mockResolvedValue(apiSuccessResult({ verified: true }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('staat Telefoonnummer toe en verifieert het genormaliseerde nummer', async () => {
      req.body = {
        type: 'Telefoonnummer',
        value: '06-1234-5678',
        code: '123456',
      };

      await handleVerifyContactgegeven(req, res);

      expect(verifyContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        { type: 'Telefoonnummer', value: '+31612345678', code: '123456' }
      );
    });

    test('verifieert een e-mailadres ongewijzigd', async () => {
      req.body = { type: 'Email', value: GEVERIFIEERD_ADRES, code: '123456' };

      await handleVerifyContactgegeven(req, res);

      expect(verifyContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        { type: 'Email', value: GEVERIFIEERD_ADRES, code: '123456' }
      );
    });

    test.each([
      {
        naam: 'ongeldig mobiel nummer',
        body: { type: 'Telefoonnummer', value: '0201234567', code: '123456' },
      },
      {
        naam: 'niet-ondersteund type',
        body: { type: 'Postadres', value: 'x', code: '123456' },
      },
      {
        naam: 'code ontbreekt',
        body: { type: 'Email', value: GEVERIFIEERD_ADRES },
      },
      {
        naam: 'value is geen string',
        body: { type: 'Email', value: 123, code: '123456' },
      },
    ])('geeft 400 zonder backend-aanroep: $naam', async ({ body }) => {
      req.body = body;

      await handleVerifyContactgegeven(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(verifyContactgegeven).not.toHaveBeenCalled();
    });
  });

  describe('handleCreateContactgegeven (e-mailadres)', () => {
    let req: Request;
    let res: ResponseAuthenticated;
    let createContactgegeven: MockInstance;
    let fetchContactgegevens: MockInstance;

    beforeEach(() => {
      req = RequestMock.new().get();
      res = ResponseAuthenticatedMock.new();
      createContactgegeven = vi
        .spyOn(klantcontactBackend, 'createContactgegeven')
        .mockResolvedValue(apiSuccessResult(nieuwContactgegeven));
      fetchContactgegevens = vi
        .spyOn(klantcontactBackend, 'fetchContactgegevens')
        .mockResolvedValue(apiSuccessResult(contactgegevens));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test.each(['geen-apenstaart', 'a@b', 'a b@example.org', '@example.org'])(
      'weigert %s met 400 zonder backend-aanroep',
      async (value) => {
        req.body = { type: 'Email', value };

        await handleCreateContactgegeven(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createContactgegeven).not.toHaveBeenCalled();
      }
    );

    test('zonder toevoegen (valideer opnieuw of wijzig) wordt niet op dubbel gecontroleerd', async () => {
      req.body = { type: 'Email', value: GEVERIFIEERD_ADRES };

      await handleCreateContactgegeven(req, res);

      expect(fetchContactgegevens).not.toHaveBeenCalled();
      expect(createContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        'Email',
        GEVERIFIEERD_ADRES
      );
    });

    test.each([
      GEVERIFIEERD_ADRES,
      'Mokum@Example.org',
      ` ${ONGEVERIFIEERD_ADRES} `,
    ])(
      'weigert een dubbel adres (%s) bij toevoegen met 409 en maakt niets aan',
      async (value) => {
        req.body = { type: 'Email', value, toevoegen: true };

        await handleCreateContactgegeven(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(createContactgegeven).not.toHaveBeenCalled();
      }
    );

    test('de melding bij een dubbel adres noemt het adres niet', async () => {
      req.body = { type: 'Email', value: GEVERIFIEERD_ADRES, toevoegen: true };

      await handleCreateContactgegeven(req, res);

      expect(JSON.stringify(vi.mocked(res.send).mock.calls)).not.toContain(
        GEVERIFIEERD_ADRES
      );
    });

    test('een zaakadres met dezelfde waarde telt niet als dubbel', async () => {
      req.body = { type: 'Email', value: ZAAK_ADRES, toevoegen: true };

      await handleCreateContactgegeven(req, res);

      expect(res.status).not.toHaveBeenCalledWith(409);
      expect(createContactgegeven).toHaveBeenCalled();
    });

    test('een extra adres naast bestaande adressen wordt geen standaardadres', async () => {
      req.body = {
        type: 'Email',
        value: 'extra@example.org',
        toevoegen: true,
      };

      await handleCreateContactgegeven(req, res);

      expect(createContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        'Email',
        'extra@example.org',
        { isDefault: false }
      );
    });

    test('het eerste adres is wel het standaardadres', async () => {
      fetchContactgegevens.mockResolvedValue(apiSuccessResult([]));
      req.body = {
        type: 'Email',
        value: 'eerste@example.org',
        toevoegen: true,
      };

      await handleCreateContactgegeven(req, res);

      expect(createContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        'Email',
        'eerste@example.org',
        { isDefault: true }
      );
    });

    test('geeft een foutstatus en maakt niets aan als het profiel niet op te halen is', async () => {
      fetchContactgegevens.mockResolvedValue(apiErrorResult('fout', null));
      req.body = {
        type: 'Email',
        value: 'extra@example.org',
        toevoegen: true,
      };

      await handleCreateContactgegeven(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(createContactgegeven).not.toHaveBeenCalled();
    });

    test("herkent toevoegen ook als de tekst 'true' (formulierdata van de client)", async () => {
      req.body = {
        type: 'Email',
        value: GEVERIFIEERD_ADRES,
        toevoegen: 'true',
      };

      await handleCreateContactgegeven(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(createContactgegeven).not.toHaveBeenCalled();
    });

    test.each(['false', 'ja', 1, ''])(
      'behandelt toevoegen=%j als gewone aanmaak zonder dubbelcheck',
      async (toevoegen) => {
        req.body = { type: 'Email', value: GEVERIFIEERD_ADRES, toevoegen };

        await handleCreateContactgegeven(req, res);

        expect(fetchContactgegevens).not.toHaveBeenCalled();
      }
    );
  });

  describe('handleDeleteContactgegeven', () => {
    let req: Request;
    let res: ResponseAuthenticated;
    let deleteContactgegeven: MockInstance;
    let fetchContactgegevens: MockInstance;

    beforeEach(() => {
      req = RequestMock.new().get();
      res = ResponseAuthenticatedMock.new();
      deleteContactgegeven = vi
        .spyOn(klantcontactBackend, 'deleteContactgegeven')
        .mockResolvedValue(apiSuccessResult(null));
      fetchContactgegevens = vi
        .spyOn(klantcontactBackend, 'fetchContactgegevens')
        .mockResolvedValue(apiSuccessResult(contactgegevens));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('verwijdert een adres uit het eigen profiel', async () => {
      req.body = { id: '2' };

      await handleDeleteContactgegeven(req, res);

      expect(deleteContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        '2'
      );
    });

    test('weigert met 403 het id van een ander (niet in het eigen profiel) en verwijdert niets', async () => {
      req.body = { id: 'van-een-ander' };

      await handleDeleteContactgegeven(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test.each([undefined, '', 1, { $ne: null }, ['2']])(
      'weigert id %j met 400',
      async (id) => {
        req.body = { id };

        await handleDeleteContactgegeven(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(deleteContactgegeven).not.toHaveBeenCalled();
      }
    );

    test('weigert met een foutstatus en verwijdert niets als het profiel niet op te halen is (fail closed)', async () => {
      fetchContactgegevens.mockResolvedValue(apiErrorResult('fout', null));
      req.body = { id: '2' };

      await handleDeleteContactgegeven(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });
  });
});
