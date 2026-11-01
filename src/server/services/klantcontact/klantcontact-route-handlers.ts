import createDebugger from 'debug';
import type { Request } from 'express';

import {
  klantcontactBackend,
  klantcontactConfig,
} from './klantcontact-backend.ts';
import {
  ContactgegevenTypes,
  ContactgegevenTypeValues,
  fetchCommunicatievoorkeuren,
  setZaakKanaalVoorkeur,
} from './klantcontact-communicatievoorkeuren.ts';
import { isValidZaakReferentie } from './klantcontact-helpers.ts';
import {
  sendBadRequest,
  sendBadRequestInvalidInput,
  sendInternalServerError,
  sendResponse,
  type ResponseAuthenticated,
} from '../../routing/route-helpers.ts';

const debugContactRequestData = createDebugger(
  'contact-api:route-request-data'
);

export async function handleVerifyContactgegeven(
  req: Request,
  res: ResponseAuthenticated
) {
  debugContactRequestData(req.body);

  const { value, code, type } = req.body;

  if (!value || !code || type !== ContactgegevenTypes.Email) {
    return sendBadRequest(res, 'value, type and code are required');
  }

  const response = await klantcontactBackend.verifyContactgegeven(
    res.locals.authProfileAndToken,
    {
      type,
      value,
      code,
    }
  );

  return sendResponse(res, response);
}

export async function handleFetchCommunicatievoorkeuren(
  req: Request,
  res: ResponseAuthenticated
) {
  const communicatievoorkeurenResponse = await fetchCommunicatievoorkeuren(
    res.locals.authProfileAndToken,
    klantcontactBackend
  );

  return sendResponse(res, communicatievoorkeurenResponse);
}

export async function handleCreateContactgegeven(
  req: Request,
  res: ResponseAuthenticated
) {
  const { value, type } = req.body;

  if (!ContactgegevenTypeValues.includes(type) || !value) {
    return sendBadRequestInvalidInput(
      res,
      `payloadType ${type} is not supported`
    );
  }

  const response = await klantcontactBackend.createContactgegeven(
    res.locals.authProfileAndToken,
    type,
    value
  );

  return sendResponse(res, response);
}

export async function handleDeleteContactgegeven(
  req: Request,
  res: ResponseAuthenticated
) {
  const { id } = req.body;

  if (!id) {
    return sendBadRequest(res, 'Contactgegeven ID is required');
  }

  const response = await klantcontactBackend.deleteContactgegeven(
    res.locals.authProfileAndToken,
    id
  );

  return sendResponse(res, response);
}

export async function handleFetchDienstverlener(
  req: Request,
  res: ResponseAuthenticated
) {
  const { naam } = req.params as { naam?: string };
  const response = await klantcontactBackend.fetchDienstverlener(
    res.locals.authProfileAndToken,
    naam
  );
  return sendResponse(res, response);
}

// Zet de voorkeur voor één zaak. Alleen een geverifieerd adres van de klant zelf mag gekozen worden.
// Contactgegevens (value) komen niet in foutmeldingen of logs.
export async function handleSetZaakKanaalVoorkeur(
  req: Request,
  res: ResponseAuthenticated
) {
  const { zaakIdentificatie, kanaal, value } = req.body ?? {};

  if (!klantcontactConfig.zaakVoorkeur.kanalen.includes(kanaal)) {
    return sendBadRequest(res, 'kanaal is not supported for a zaakvoorkeur');
  }

  if (!value || typeof value !== 'string') {
    return sendBadRequest(res, 'value is required');
  }

  const referentie =
    typeof zaakIdentificatie === 'string'
      ? klantcontactConfig.zaakVoorkeur.referentie(zaakIdentificatie)
      : null;

  if (!referentie || !isValidZaakReferentie(referentie)) {
    return sendBadRequest(res, 'zaakIdentificatie is not valid');
  }

  const contactgegevens = await klantcontactBackend.fetchContactgegevens(
    res.locals.authProfileAndToken
  );

  if (contactgegevens.status !== 'OK') {
    return sendInternalServerError(
      res,
      'Ophalen van de contactgegevens mislukt'
    );
  }

  // Een zaakadres (met referentie) telt niet: de klant kiest uit zijn eigen, al geverifieerde adressen.
  const isGeverifieerdAdresVanKlant = contactgegevens.content.some(
    (contactgegeven) =>
      !contactgegeven.referentie &&
      contactgegeven.type === kanaal &&
      contactgegeven.waarde === value &&
      contactgegeven.isGeverifieerd
  );

  if (!isGeverifieerdAdresVanKlant) {
    return sendBadRequest(
      res,
      'Only a verified contactgegeven of the user can be chosen'
    );
  }

  const response = await setZaakKanaalVoorkeur(
    res.locals.authProfileAndToken,
    klantcontactBackend,
    klantcontactConfig,
    { zaakIdentificatie, kanaal, value }
  );

  return sendResponse(res, response);
}
