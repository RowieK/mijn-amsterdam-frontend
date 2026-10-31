import type {
  GemeenteKlantcontactConfig,
  KlantcontactBackend,
  ProfielserviceBackend,
} from './klantcontact-backend-types.ts';
import {
  getMostRecentByContactgegevenType,
  getZaakKanaalVoorkeuren,
  isValidZaakReferentie,
} from './klantcontact-helpers.ts';
import type {
  CommunicatievoorkeurenResponseFrontend,
  ContactgegevenType,
  ZaakKanaalVoorkeurFrontend,
  ZaakKanaalVoorkeurPayloadFrontend,
} from './klantcontact-profieldienst-types.ts';
import { featureToggle } from './klantcontact-service-config.ts';
import {
  apiErrorResult,
  apiPostponeResult,
  type ApiResponse,
  apiSuccessResult,
} from '../../../universal/helpers/api.ts';
import { getFullAddress } from '../../../universal/helpers/brp.ts';
import type { AuthProfileAndToken } from '../../auth/auth-types.ts';
import { fetchMyLocations } from '../bag/my-locations.ts';

export const ContactgegevenTypes = {
  Email: 'Email',
  Telefoonnummer: 'Telefoonnummer',
  ApplicatieId: 'ApplicatieId',
  Berichtenbox: 'Berichtenbox',
  Postadres: 'Postadres',
} as const satisfies Record<ContactgegevenType, ContactgegevenType>;

export const ContactgegevenTypeValues = Object.values(
  ContactgegevenTypes
) as readonly (typeof ContactgegevenTypes)[keyof typeof ContactgegevenTypes][];

export async function fetchCommunicatievoorkeuren(
  authProfileAndToken: AuthProfileAndToken,
  backend: ProfielserviceBackend
): Promise<ApiResponse<CommunicatievoorkeurenResponseFrontend>> {
  if (!featureToggle.communicatievoorkeuren) {
    return apiPostponeResult(null);
  }

  const [locationsResponse, contactgegevens, dienstverlenerResponse] =
    await Promise.all([
      fetchMyLocations(authProfileAndToken),
      backend.fetchContactgegevens(authProfileAndToken),
      backend.fetchDienstverlener(authProfileAndToken),
    ]);

  if (
    locationsResponse.status !== 'OK' &&
    contactgegevens.status !== 'OK' &&
    dienstverlenerResponse.status !== 'OK'
  ) {
    return apiErrorResult(
      'Ophalen van alle communicatievoorkeuren mislukt',
      null
    );
  }

  const email = getMostRecentByContactgegevenType(
    contactgegevens,
    ContactgegevenTypes.Email
  );
  const phone = getMostRecentByContactgegevenType(
    contactgegevens,
    ContactgegevenTypes.Telefoonnummer
  );
  const app = getMostRecentByContactgegevenType(
    contactgegevens,
    ContactgegevenTypes.ApplicatieId
  );

  const standaardContactgegevens = {
    [ContactgegevenTypes.Email]: email,
    [ContactgegevenTypes.Telefoonnummer]: {
      ...phone,
      disabled: true,
    },
    [ContactgegevenTypes.ApplicatieId]: app,
    [ContactgegevenTypes.Postadres]: {
      id: null,
      type: ContactgegevenTypes.Postadres,
      dateModified: null,
      value: locationsResponse.content?.[0]?.address
        ? getFullAddress(locationsResponse.content?.[0]?.address)
        : null,
      dateModifiedFormatted: null,
    },
    // Berichtenbox wordt nog niet ondersteund in de profieldienst.
    [ContactgegevenTypes.Berichtenbox]: {
      id: null,
      type: ContactgegevenTypes.Berichtenbox,
      value: null,
      dateModified: null,
      dateModifiedFormatted: null,
      disabled: true,
    },
  };

  const aangeslotenDiensten = (
    dienstverlenerResponse.content?.diensten ?? []
  ).filter((dienst) => dienst.beschrijving !== 'Alles');

  return apiSuccessResult({
    aangeslotenDiensten,
    standaardContactgegevens,
    zaakKanaalVoorkeuren: getZaakKanaalVoorkeuren(contactgegevens),
  });
}

// Vervangt de voorkeur voor één zaak. Eerst het nieuwe adres aanmaken en dan pas de oude
// verwijderen, zodat er nooit een moment is zonder zaakadres en een fout het oude adres laat staan.
// Het nieuwe adres is ongeverifieerd (createContactgegeven stuurt een verificatiecode).
// Contactgegevens (waarde) komen niet in foutmeldingen of logs.
export async function setZaakKanaalVoorkeur(
  authProfileAndToken: AuthProfileAndToken,
  backend: KlantcontactBackend,
  config: GemeenteKlantcontactConfig,
  { zaakIdentificatie, kanaal, value }: ZaakKanaalVoorkeurPayloadFrontend
): Promise<ApiResponse<ZaakKanaalVoorkeurFrontend>> {
  if (!config.zaakVoorkeur.kanalen.includes(kanaal)) {
    return apiErrorResult(
      'Kanaal is niet toegestaan voor een zaakvoorkeur',
      null
    );
  }

  const referentie = config.zaakVoorkeur.referentie(zaakIdentificatie);

  if (!referentie || !isValidZaakReferentie(referentie)) {
    return apiErrorResult('Ongeldige zaakidentificatie', null);
  }

  const contactgegevens =
    await backend.fetchContactgegevens(authProfileAndToken);

  if (contactgegevens.status !== 'OK') {
    return apiErrorResult('Ophalen van de contactgegevens mislukt', null);
  }

  // Er is geen uniciteit op referentie in OpenKlant: ook duplicaten worden opgeruimd.
  const oudeContactgegevens = contactgegevens.content.filter(
    (contactgegeven) => contactgegeven.referentie === referentie
  );

  const nieuwContactgegeven = await backend.createContactgegeven(
    authProfileAndToken,
    kanaal,
    value,
    { referentie, isDefault: false }
  );

  if (nieuwContactgegeven.status !== 'OK') {
    return apiErrorResult('Aanmaken van de zaakvoorkeur mislukt', null);
  }

  const deleteResponses = await Promise.all(
    oudeContactgegevens.map((oud) =>
      backend.deleteContactgegeven(authProfileAndToken, oud.id)
    )
  );

  if (deleteResponses.some((response) => response.status !== 'OK')) {
    return apiErrorResult('Verwijderen van de oude zaakvoorkeur mislukt', null);
  }

  return apiSuccessResult({
    zaakIdentificatie,
    contactgegeven: nieuwContactgegeven.content,
  });
}
