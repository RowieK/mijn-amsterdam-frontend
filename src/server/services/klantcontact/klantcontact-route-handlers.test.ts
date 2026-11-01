import type { Request } from 'express';
import type { MockInstance } from 'vitest';

import { klantcontactBackend } from './klantcontact-backend.ts';
import { transformContactgegevenSource } from './klantcontact-helpers.ts';
import type { ContactgegevenSource } from './klantcontact-profieldienst-types.ts';
import {
  handleDeleteZaakKanaalVoorkeur,
  handleSetZaakKanaalVoorkeur,
} from './klantcontact-route-handlers.ts';
import {
  RequestMock,
  ResponseAuthenticatedMock,
} from '../../../testing/utils.ts';
import {
  apiErrorResult,
  apiSuccessResult,
} from '../../../universal/helpers/api.ts';
import { featureToggle } from '../../config/feature-toggles.ts';
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
      expect(fetchContactgegevens).not.toHaveBeenCalled();
      expect(createContactgegeven).not.toHaveBeenCalled();
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
    let fetchContactgegevens: MockInstance;
    let deleteContactgegeven: MockInstance;

    beforeEach(() => {
      req = RequestMock.new().get();
      res = ResponseAuthenticatedMock.new();
      // Id '3' is een zaakadres (met referentie) van deze gebruiker.
      req.body = { id: '3' };

      fetchContactgegevens = vi
        .spyOn(klantcontactBackend, 'fetchContactgegevens')
        .mockResolvedValue(apiSuccessResult(contactgegevens));
      deleteContactgegeven = vi
        .spyOn(klantcontactBackend, 'deleteContactgegeven')
        .mockResolvedValue(apiSuccessResult(null));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('geeft 400 zonder backend-aanroepen als het id ontbreekt', async () => {
      req.body = {};

      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(fetchContactgegevens).not.toHaveBeenCalled();
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test.each([
      { naam: 'een id van een andere gebruiker', id: '999' },
      {
        naam: 'een standaardadres, dat is geen zaakvoorkeur',
        id: '1',
      },
    ])('geeft 403 en verwijdert niets bij $naam', async ({ id }) => {
      req.body = { id };

      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test('geeft een foutstatus en verwijdert niets als de profielresponse faalt', async () => {
      fetchContactgegevens.mockResolvedValue(
        apiErrorResult('Profiel ophalen mislukt', null)
      );

      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(deleteContactgegeven).not.toHaveBeenCalled();
    });

    test('verwijdert het zaakadres van de ingelogde gebruiker', async () => {
      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(deleteContactgegeven).toHaveBeenCalledTimes(1);
      expect(deleteContactgegeven).toHaveBeenCalledWith(
        res.locals.authProfileAndToken,
        '3'
      );
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith(apiSuccessResult(null));
    });

    test('geeft de fout door als het verwijderen mislukt', async () => {
      deleteContactgegeven.mockResolvedValue(
        apiErrorResult('Verwijderen mislukt', null)
      );

      await handleDeleteZaakKanaalVoorkeur(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('toggle KLANT_CONTACT.zaakvoorkeuren', () => {
    const TOGGLE = 'KLANT_CONTACT.zaakvoorkeuren';
    const ORIGINAL = featureToggle[TOGGLE];
    let fetchContactgegevens: MockInstance;
    let createContactgegeven: MockInstance;
    let deleteContactgegeven: MockInstance;

    beforeEach(() => {
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
      featureToggle[TOGGLE] = ORIGINAL;
      vi.restoreAllMocks();
    });

    test.each([
      {
        naam: 'zetten',
        handler: handleSetZaakKanaalVoorkeur,
        body: {
          zaakIdentificatie: ZAAK,
          kanaal: 'Email',
          value: GEVERIFIEERD_ADRES,
        },
      },
      {
        naam: 'verwijderen',
        handler: handleDeleteZaakKanaalVoorkeur,
        body: { id: '3' },
      },
    ])(
      'doet niets als de toggle uit staat: $naam',
      async ({ handler, body }) => {
        featureToggle[TOGGLE] = false;
        const req = RequestMock.new().get();
        const res = ResponseAuthenticatedMock.new();
        req.body = body;

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(fetchContactgegevens).not.toHaveBeenCalled();
        expect(createContactgegeven).not.toHaveBeenCalled();
        expect(deleteContactgegeven).not.toHaveBeenCalled();
      }
    );
  });
});
