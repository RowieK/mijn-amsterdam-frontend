import type { Request } from 'express';
import type { MockInstance } from 'vitest';

import { klantcontactBackend } from './klantcontact-backend.ts';
import { transformContactgegevenSource } from './klantcontact-helpers.ts';
import type { ContactgegevenSource } from './klantcontact-profieldienst-types.ts';
import {
  handleDeleteThemaKanaalVoorkeur,
  handleSetThemaKanaalVoorkeur,
} from './klantcontact-route-handlers.ts';
import { getAmsterdamKlantcontactConfig } from './klantcontact-service-config.ts';
import {
  RequestMock,
  ResponseAuthenticatedMock,
} from '../../../testing/utils.ts';
import {
  apiErrorResult,
  apiSuccessResult,
} from '../../../universal/helpers/api.ts';
import type { ResponseAuthenticated } from '../../routing/route-helpers.ts';

const THEMA = 'ERFPACHT';
const GEVERIFIEERD_ADRES = 'mokum@example.org';
const ONGEVERIFIEERD_ADRES = 'ongeverifieerd@example.org';
const THEMA_ADRES = 'thema@example.org';

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

const themaScope =
  getAmsterdamKlantcontactConfig().themaVoorkeur?.scopes[THEMA];

const themaAdres = getContactgegeven({
  id: 'thema',
  waarde: THEMA_ADRES,
  isDefault: false,
  scopes: [
    {
      partij: { identificatieType: 'BSN', identificatieNummer: '999999999' },
      dienst: { id: themaScope?.dienstNaam ?? '', beschrijving: 'Erfpacht' },
    },
  ],
});

const contactgegevens = [
  getContactgegeven({ id: '1' }),
  getContactgegeven({
    id: '2',
    waarde: ONGEVERIFIEERD_ADRES,
    isGeverifieerd: false,
  }),
  getContactgegeven({
    id: '3',
    waarde: 'zaak@example.org',
    isDefault: false,
    referentie: 'Z-24-1',
  }),
];

const nieuwContactgegeven = transformContactgegevenSource(
  getContactgegeven({ id: 'nieuw', isGeverifieerd: false, isDefault: false }),
  'Email'
);

describe('handleSetThemaKanaalVoorkeur', () => {
  let req: Request;
  let res: ResponseAuthenticated;
  let fetchContactgegevens: MockInstance;
  let createContactgegeven: MockInstance;
  let deleteContactgegeven: MockInstance;

  beforeEach(() => {
    req = RequestMock.new().get();
    res = ResponseAuthenticatedMock.new();
    req.body = { themaId: THEMA, kanaal: 'Email', value: GEVERIFIEERD_ADRES };

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
    { naam: 'thema ontbreekt', body: { themaId: undefined } },
    { naam: 'onbekend thema', body: { themaId: 'ONBEKEND' } },
    {
      naam: 'naam van een object-eigenschap',
      body: { themaId: 'constructor' },
    },
    { naam: 'kanaal ontbreekt', body: { kanaal: undefined } },
    { naam: 'kanaal niet toegestaan', body: { kanaal: 'Postadres' } },
    { naam: 'value ontbreekt', body: { value: undefined } },
  ])('geeft 400 zonder backend-aanroepen: $naam', async ({ body }) => {
    req.body = { ...req.body, ...body };

    await handleSetThemaKanaalVoorkeur(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetchContactgegevens).not.toHaveBeenCalled();
    expect(createContactgegeven).not.toHaveBeenCalled();
  });

  test('weigert een adres dat niet geverifieerd is', async () => {
    req.body = { ...req.body, value: ONGEVERIFIEERD_ADRES };

    await handleSetThemaKanaalVoorkeur(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(createContactgegeven).not.toHaveBeenCalled();
  });

  test('weigert een zaakadres of themaadres als keuze: de klant kiest uit zijn standaardadressen', async () => {
    fetchContactgegevens.mockResolvedValue(
      apiSuccessResult([...contactgegevens, themaAdres])
    );

    req.body = { ...req.body, value: THEMA_ADRES };
    await handleSetThemaKanaalVoorkeur(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    req.body = { ...req.body, value: 'zaak@example.org' };
    await handleSetThemaKanaalVoorkeur(req, res);
    expect(createContactgegeven).not.toHaveBeenCalled();
  });

  test('vraagt het eigenaarschap van een zaak niet op: een thema raakt alleen het eigen profiel', async () => {
    const zaakIsVanGebruiker = vi.spyOn(
      klantcontactBackend,
      'zaakIsVanGebruiker'
    );

    await handleSetThemaKanaalVoorkeur(req, res);

    expect(zaakIsVanGebruiker).not.toHaveBeenCalled();
  });

  test('geeft een foutstatus en maakt niets aan als de profielresponse faalt', async () => {
    fetchContactgegevens.mockResolvedValue(
      apiErrorResult('Profiel ophalen mislukt', null)
    );

    await handleSetThemaKanaalVoorkeur(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(createContactgegeven).not.toHaveBeenCalled();
  });

  test('zet de keuze voor een geverifieerd standaardadres als scope, zonder referentie', async () => {
    await handleSetThemaKanaalVoorkeur(req, res);

    expect(createContactgegeven).toHaveBeenCalledWith(
      res.locals.authProfileAndToken,
      'Email',
      GEVERIFIEERD_ADRES,
      { isDefault: false, scope: themaScope }
    );
    expect(res.send).toHaveBeenCalledWith(
      apiSuccessResult({ themaId: THEMA, contactgegeven: nieuwContactgegeven })
    );
  });

  test('vervangt een bestaande themakeuze: eerst aanmaken, dan verwijderen', async () => {
    fetchContactgegevens.mockResolvedValue(
      apiSuccessResult([...contactgegevens, themaAdres])
    );

    await handleSetThemaKanaalVoorkeur(req, res);

    expect(deleteContactgegeven).toHaveBeenCalledTimes(1);
    expect(deleteContactgegeven).toHaveBeenCalledWith(
      res.locals.authProfileAndToken,
      'thema'
    );
    expect(createContactgegeven.mock.invocationCallOrder[0]).toBeLessThan(
      deleteContactgegeven.mock.invocationCallOrder[0]
    );
  });
});

describe('handleDeleteThemaKanaalVoorkeur', () => {
  let req: Request;
  let res: ResponseAuthenticated;
  let fetchContactgegevens: MockInstance;
  let deleteContactgegeven: MockInstance;

  beforeEach(() => {
    req = RequestMock.new().get();
    res = ResponseAuthenticatedMock.new();
    req.body = { themaId: THEMA };

    fetchContactgegevens = vi
      .spyOn(klantcontactBackend, 'fetchContactgegevens')
      .mockResolvedValue(apiSuccessResult([...contactgegevens, themaAdres]));
    deleteContactgegeven = vi
      .spyOn(klantcontactBackend, 'deleteContactgegeven')
      .mockResolvedValue(apiSuccessResult(null));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each([
    { naam: 'thema ontbreekt', body: {} },
    { naam: 'geen string', body: { themaId: 123 } },
    { naam: 'onbekend thema', body: { themaId: 'ONBEKEND' } },
    {
      naam: 'naam van een object-eigenschap',
      body: { themaId: 'constructor' },
    },
  ])('geeft 400 zonder backend-aanroepen: $naam', async ({ body }) => {
    req.body = body;

    await handleDeleteThemaKanaalVoorkeur(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetchContactgegevens).not.toHaveBeenCalled();
    expect(deleteContactgegeven).not.toHaveBeenCalled();
  });

  test('verwijdert de themakeuze en laat standaardadressen en zaakadressen staan', async () => {
    await handleDeleteThemaKanaalVoorkeur(req, res);

    expect(deleteContactgegeven).toHaveBeenCalledTimes(1);
    expect(deleteContactgegeven).toHaveBeenCalledWith(
      res.locals.authProfileAndToken,
      'thema'
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(apiSuccessResult(null));
  });

  test('geeft een foutstatus als de themakeuze niet verwijderd kan worden', async () => {
    deleteContactgegeven.mockResolvedValue(
      apiErrorResult('Verwijderen mislukt', null)
    );

    await handleDeleteThemaKanaalVoorkeur(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
