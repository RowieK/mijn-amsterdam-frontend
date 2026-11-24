import type {
  GemeenteKlantcontactConfig,
  KlantcontactBackend,
  ProfielserviceBackend,
} from './klantcontact-backend-types.ts';
import {
  getAllByContactgegevenType,
  getMostRecentByContactgegevenType,
  getThemaId,
  getThemaKanaalVoorkeuren,
  getThemaKeuzeThemaIds,
  getValidZaakReferentie,
  getZaakKanaalVoorkeuren,
  withoutThemaContactgegevens,
} from './klantcontact-helpers.ts';
import type {
  CommunicatievoorkeurenResponseFrontend,
  ContactgegevenType,
  ThemaKanaalVoorkeurFrontend,
  ThemaKanaalVoorkeurPayloadFrontend,
  ZaakKanaalVoorkeurFrontend,
  ZaakKanaalVoorkeurPayloadFrontend,
} from './klantcontact-profieldienst-types.ts';
import { featureToggle } from './klantcontact-service-config.ts';
import { validateThemaKeuze } from './klantcontact-thema-voorkeur.ts';
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
  backend: ProfielserviceBackend,
  config?: GemeenteKlantcontactConfig
): Promise<ApiResponse<CommunicatievoorkeurenResponseFrontend>> {
  if (!featureToggle.communicatievoorkeuren) {
    return apiPostponeResult(null);
  }

  const [
    locationsResponse,
    contactgegevens,
    dienstverlenerResponse,
    zakenResponse,
  ] = await Promise.all([
    fetchMyLocations(authProfileAndToken),
    backend.fetchContactgegevens(authProfileAndToken),
    backend.fetchDienstverlener(authProfileAndToken),
    featureToggle.zaakvoorkeuren
      ? backend.fetchZaken(authProfileAndToken)
      : apiSuccessResult([]),
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

  // Zonder profiel kunnen we geen betrouwbare voorkeuren tonen. Een lege lijst
  // zou voor de burger lijken alsof er geen zaakvoorkeuren zijn.
  if (contactgegevens.status !== 'OK') {
    return apiErrorResult('Ophalen van het communicatieprofiel mislukt', null);
  }

  // Een keuze voor een thema is geen standaardadres van de klant.
  const standaardBron = config
    ? withoutThemaContactgegevens(config, contactgegevens)
    : contactgegevens;

  const email = getMostRecentByContactgegevenType(
    standaardBron,
    ContactgegevenTypes.Email
  );
  const phone = getMostRecentByContactgegevenType(
    standaardBron,
    ContactgegevenTypes.Telefoonnummer
  );
  const app = getMostRecentByContactgegevenType(
    standaardBron,
    ContactgegevenTypes.ApplicatieId
  );

  const standaardContactgegevens = {
    [ContactgegevenTypes.Email]: email,
    [ContactgegevenTypes.Telefoonnummer]: phone,
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
    emailadressen: getAllByContactgegevenType(
      standaardBron,
      ContactgegevenTypes.Email
    ),
    zaakKanaalVoorkeuren: getZaakKanaalVoorkeuren(contactgegevens),
    themaKanaalVoorkeuren: config
      ? getThemaKanaalVoorkeuren(config, contactgegevens)
      : [],
    themaKeuzeThemaIds: config ? getThemaKeuzeThemaIds(config) : [],
    // Zonder zaken uit Open Zaak blijft de rest van de voorkeuren bruikbaar.
    zaken: zakenResponse.status === 'OK' ? zakenResponse.content : [],
  });
}

// Het thema waarvoor de gemeente een themakeuze kent, met de scope waaronder die wordt bewaard.
// Een onbekend thema (ook een naam als `constructor`) levert null op: privacy by default.
function getThemaScope(config: GemeenteKlantcontactConfig, themaId: unknown) {
  const themaVoorkeur = config.themaVoorkeur;

  return themaVoorkeur &&
    typeof themaId === 'string' &&
    Object.hasOwn(themaVoorkeur.scopes, themaId)
    ? themaVoorkeur.scopes[themaId]
    : null;
}

// Zet de keuze voor alle zaken van een thema. Net als bij een zaak eerst het nieuwe adres aanmaken en dan
// pas het oude verwijderen. Het adres hoort bij het thema (scope) en heeft geen referentie: een keuze
// voor een zaak (met referentie) gaat daarom voor. Het nieuwe adres is ongeverifieerd.
// Contactgegevens (waarde) komen niet in foutmeldingen of logs.
export async function setThemaKanaalVoorkeur(
  authProfileAndToken: AuthProfileAndToken,
  backend: KlantcontactBackend,
  config: GemeenteKlantcontactConfig,
  { themaId, kanaal, value }: ThemaKanaalVoorkeurPayloadFrontend
): Promise<ApiResponse<ThemaKanaalVoorkeurFrontend>> {
  const scope = getThemaScope(config, themaId);

  if (!config.themaVoorkeur || !scope) {
    return apiErrorResult('Onbekend thema', null);
  }

  if (
    !config.zaakVoorkeur.kanalen.includes(kanaal) ||
    !validateThemaKeuze(config.themaVoorkeur.kanalen, themaId, kanaal).valid
  ) {
    return apiErrorResult('Kanaal is niet toegestaan voor dit thema', null);
  }

  const contactgegevens =
    await backend.fetchContactgegevens(authProfileAndToken);

  if (contactgegevens.status !== 'OK') {
    return apiErrorResult('Ophalen van de contactgegevens mislukt', null);
  }

  const oudeContactgegevens = contactgegevens.content.filter(
    (contactgegeven) => getThemaId(config, contactgegeven) === themaId
  );

  const nieuwContactgegeven = await backend.createContactgegeven(
    authProfileAndToken,
    kanaal,
    value,
    { isDefault: false, scope }
  );

  if (nieuwContactgegeven.status !== 'OK') {
    return apiErrorResult('Aanmaken van de themavoorkeur mislukt', null);
  }

  const deleteResponses = await Promise.all(
    oudeContactgegevens.map((oud) =>
      backend.deleteContactgegeven(authProfileAndToken, oud.id)
    )
  );

  if (deleteResponses.some((response) => response.status !== 'OK')) {
    return apiErrorResult(
      'Verwijderen van de oude themavoorkeur mislukt',
      null
    );
  }

  return apiSuccessResult({
    themaId,
    contactgegeven: nieuwContactgegeven.content,
  });
}

// Verwijdert de keuze voor een thema. Zaken zonder eigen keuze volgen daarna weer het standaardadres.
// Een keuze voor een zaak blijft staan. Is er geen themakeuze, dan is het resultaat een succes.
export async function deleteThemaKanaalVoorkeur(
  authProfileAndToken: AuthProfileAndToken,
  backend: KlantcontactBackend,
  config: GemeenteKlantcontactConfig,
  themaId: string
): Promise<ApiResponse<null>> {
  if (!getThemaScope(config, themaId)) {
    return apiErrorResult('Onbekend thema', null);
  }

  const contactgegevens =
    await backend.fetchContactgegevens(authProfileAndToken);

  if (contactgegevens.status !== 'OK') {
    return apiErrorResult('Ophalen van de contactgegevens mislukt', null);
  }

  const deleteResponses = await Promise.all(
    contactgegevens.content
      .filter(
        (contactgegeven) => getThemaId(config, contactgegeven) === themaId
      )
      .map((contactgegeven) =>
        backend.deleteContactgegeven(authProfileAndToken, contactgegeven.id)
      )
  );

  if (deleteResponses.some((response) => response.status !== 'OK')) {
    return apiErrorResult('Verwijderen van de themavoorkeur mislukt', null);
  }

  return apiSuccessResult(null);
}

// Vervangt de voorkeur voor één zaak. Eerst het nieuwe adres aanmaken en dan pas de oude
// verwijderen, zodat er nooit een moment is zonder zaakadres en een fout het oude adres laat staan.
// Faalt het verwijderen van een oud adres, dan wordt het nieuwe adres weer verwijderd (terugdraaien).
// Faalt ook dat, dan volgt een foutresultaat; de volgende keuze voor dezelfde zaak ruimt alle adressen
// met die referentie op.
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

  const referentie = getValidZaakReferentie(config, zaakIdentificatie);

  if (!referentie) {
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
    // Terugdraaien: anders staan er twee adressen met dezelfde referentie en kiest de OMC er onvoorspelbaar
    // een van. Het oude adres of de oude adressen blijven dan de keuze.
    const nieuwId = nieuwContactgegeven.content.id;
    const terugdraaien = nieuwId
      ? await backend.deleteContactgegeven(authProfileAndToken, nieuwId)
      : null;

    if (terugdraaien?.status !== 'OK') {
      return apiErrorResult(
        'Wijzigen van de zaakvoorkeur mislukt en terugdraaien is niet gelukt. Probeer het later opnieuw',
        null
      );
    }

    return apiErrorResult('Verwijderen van de oude zaakvoorkeur mislukt', null);
  }

  return apiSuccessResult({
    zaakIdentificatie,
    contactgegeven: nieuwContactgegeven.content,
  });
}

// Verwijdert de voorkeur voor één zaak. De OMC valt daarna terug op het standaardadres van de klant.
// Alle adressen met dezelfde referentie gaan weg, ook duplicaten: de OMC pakt het eerste adres met een
// overeenkomende referentie, dus een achtergebleven duplicaat houdt de oude keuze actief.
// Is er geen zaakadres, dan is er niets te verwijderen en is het resultaat een succes.
// Faalt een delete, dan volgt een foutresultaat; opnieuw proberen ruimt de rest op.
// Contactgegevens (waarde) komen niet in foutmeldingen of logs.
export async function deleteZaakKanaalVoorkeur(
  authProfileAndToken: AuthProfileAndToken,
  backend: KlantcontactBackend,
  config: GemeenteKlantcontactConfig,
  zaakIdentificatie: string
): Promise<ApiResponse<null>> {
  const referentie = getValidZaakReferentie(config, zaakIdentificatie);

  if (!referentie) {
    return apiErrorResult('Ongeldige zaakidentificatie', null);
  }

  const contactgegevens =
    await backend.fetchContactgegevens(authProfileAndToken);

  if (contactgegevens.status !== 'OK') {
    return apiErrorResult('Ophalen van de contactgegevens mislukt', null);
  }

  const zaakContactgegevens = contactgegevens.content.filter(
    (contactgegeven) => contactgegeven.referentie === referentie
  );

  const deleteResponses = await Promise.all(
    zaakContactgegevens.map((contactgegeven) =>
      backend.deleteContactgegeven(authProfileAndToken, contactgegeven.id)
    )
  );

  if (deleteResponses.some((response) => response.status !== 'OK')) {
    return apiErrorResult('Verwijderen van de zaakvoorkeur mislukt', null);
  }

  return apiSuccessResult(null);
}
