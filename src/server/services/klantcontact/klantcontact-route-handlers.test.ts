import type { Request } from 'express';
import type { MockInstance } from 'vitest';

import { klantcontactBackend } from './klantcontact-backend.ts';
import { transformContactgegevenSource } from './klantcontact-helpers.ts';
import type { ContactgegevenSource } from './klantcontact-profieldienst-types.ts';
import {
  handleCreateContactgegeven,
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
});
