
import type { Request } from 'express';

import {
  ContactgegevenTypes,
  ContactgegevenTypeValues,
  fetchCommunicatievoorkeuren,
} from './klantcontact-communicatievoorkeuren.ts';
import {
  createContactgegeven,
  deleteContactgegeven,
  fetchDienstverlener,
  normalizeDutchMobileNumber,
  verifyContactgegeven,
} from './klantcontact-profieldienst.ts';
import {
  sendBadRequest,
  sendBadRequestInvalidInput,
  sendResponse,
  type ResponseAuthenticated,
} from '../../routing/route-helpers.ts';


export async function handleVerifyContactgegeven(
  req: Request,
  res: ResponseAuthenticated
) {
  const { value, code, type } = req.body;

  const isSupportedType =
    type === ContactgegevenTypes.Email ||
    type === ContactgegevenTypes.Telefoonnummer;

  if (
    typeof value !== 'string' ||
    !value.trim() ||
    typeof code !== 'string' ||
    !code.trim() ||
    !isSupportedType
  ) {
    return sendBadRequest(
      res,
      'A valid value, type and code are required'
    );
  }

  let normalizedValue = value;

  if (type === ContactgegevenTypes.Telefoonnummer) {
    try {
      normalizedValue = normalizeDutchMobileNumber(value);
    } catch {
      return sendBadRequest(
        res,
        'Voer een geldig Nederlands mobiel telefoonnummer in'
      );
    }
  }

  const response = await verifyContactgegeven(res.locals.authProfileAndToken, {
    type,
    value: normalizedValue,
    code,
  });

  return sendResponse(res, response);
}

export async function handleFetchCommunicatievoorkeuren(
  req: Request,
  res: ResponseAuthenticated
) {
  const communicatievoorkeurenResponse = await fetchCommunicatievoorkeuren(
    res.locals.authProfileAndToken
  );

  return sendResponse(res, communicatievoorkeurenResponse);
}

export async function handleCreateContactgegeven(
  req: Request,
  res: ResponseAuthenticated
) {
  const { value, type } = req.body;

  if (
    !ContactgegevenTypeValues.includes(type) ||
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return sendBadRequestInvalidInput(
      res,
      `payloadType ${type} is not supported or value is invalid`
    );
  }

  if (type === ContactgegevenTypes.Telefoonnummer) {
    try {
      normalizeDutchMobileNumber(value);
    } catch {
      return sendBadRequest(
        res,
        'Voer een geldig Nederlands mobiel telefoonnummer in'
      );
    }
  }

  const response = await createContactgegeven(
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

  const response = await deleteContactgegeven(
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
  const response = await fetchDienstverlener(
    res.locals.authProfileAndToken,
    naam
  );
  return sendResponse(res, response);
}
