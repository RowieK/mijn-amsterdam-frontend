import { useParams } from 'react-router';

import { ContactgegevenByTypeLabels } from './CommunicatieVoorkeuren-config.ts';
import type {
  ContactgegevenType,
  ContactgegevenFrontend,
  VerifyVerificationRequestResponse,
  ZaakKanaalVoorkeurFrontend,
  ZaakKanaalVoorkeurPayloadFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import {
  capitalizeFirstLetter,
  lowercaseFirstLetter,
} from '../../../../../../../universal/helpers/text.ts';
import {
  sendFormPostRequest,
  useBffApi,
} from '../../../../../../hooks/api/useBffApi.ts';
import {
  useAppStateStore,
  type AppStateStore,
} from '../../../../../../hooks/useAppStateStore.ts';
import { BFFApiUrls } from '../../../../config/api.ts';
import {
  type InstelAction,
  themaConfig,
} from '../KlantContact-thema-config.ts';

type UpdateProps = {
  contactgegeven: Partial<Omit<ContactgegevenFrontend, 'type'>> & {
    type: ContactgegevenType;
  };
  appState: AppStateStore;
};

function updateCommunicatievoorkeurState({
  contactgegeven,
  appState,
}: UpdateProps) {
  appState.mergeAppState('KLANT_CONTACT', {
    content: {
      communicatievoorkeuren: {
        standaardContactgegevens: {
          [contactgegeven.type]: contactgegeven,
        },
      },
    },
  });
}

// mergeAppState voegt arrays per index samen, dus de lijst met zaakvoorkeuren wordt vervangen.
// De store wordt hier direct gelezen: na een request is de render-snapshot van de hook verouderd.
function updateZaakKanaalVoorkeurenState(
  update: (
    huidige: ZaakKanaalVoorkeurFrontend[]
  ) => ZaakKanaalVoorkeurFrontend[]
) {
  const { KLANT_CONTACT, setAppState } = useAppStateStore.getState();
  const communicatievoorkeuren = KLANT_CONTACT.content?.communicatievoorkeuren;

  if (!KLANT_CONTACT.content || !communicatievoorkeuren) {
    return;
  }

  setAppState({
    KLANT_CONTACT: {
      ...KLANT_CONTACT,
      content: {
        ...KLANT_CONTACT.content,
        communicatievoorkeuren: {
          ...communicatievoorkeuren,
          zaakKanaalVoorkeuren: update(
            communicatievoorkeuren.zaakKanaalVoorkeuren ?? []
          ),
        },
      },
    },
  });
}

export function useSetCommunicatievoorkeur(
  onCallback: (
    contactgegeven: ContactgegevenFrontend | null,
    success: boolean
  ) => void
) {
  const appState = useAppStateStore();
  return useBffApi<ContactgegevenFrontend>(
    BFFApiUrls.KLANTCONTACT_CONTACTGEGEVEN_CREATE,
    {
      fetchImmediately: false,
      sendRequest: async (url, init) => {
        return sendFormPostRequest<ContactgegevenFrontend>(url, init).then(
          (response) => {
            if (response.content?.id) {
              updateCommunicatievoorkeurState({
                contactgegeven: response.content,
                appState,
              });
            }
            onCallback(response.content ?? null, response.status === 'OK');
            return response;
          }
        );
      },
    }
  );
}

export function useSetZaakKanaalVoorkeur(
  onCallback: (
    voorkeur: ZaakKanaalVoorkeurFrontend | null,
    success: boolean
  ) => void,
  zaakIdentificatie: string
) {
  // useBffApi bewaart isLoading en isError per cacheKey. Een eigen key per zaak voorkomt dat het opslaan van de
  // ene zaak bij alle andere zaken op de pagina als bezig of mislukt wordt getoond.
  return useBffApi<
    ZaakKanaalVoorkeurFrontend,
    ZaakKanaalVoorkeurPayloadFrontend
  >(`zaakvoorkeur-set-${zaakIdentificatie}`, {
    url: BFFApiUrls.KLANTCONTACT_ZAAKVOORKEUR_SET,
    fetchImmediately: false,
    sendRequest: async (url, init) => {
      return sendFormPostRequest<ZaakKanaalVoorkeurFrontend>(url, init).then(
        (response) => {
          const voorkeur = response.content;
          if (response.status === 'OK' && voorkeur) {
            updateZaakKanaalVoorkeurenState((huidige) => [
              ...huidige.filter(
                (v) => v.zaakIdentificatie !== voorkeur.zaakIdentificatie
              ),
              voorkeur,
            ]);
          }
          onCallback(voorkeur ?? null, response.status === 'OK');
          return response;
        }
      );
    },
  });
}

export function useVerwijderZaakKanaalVoorkeur(zaakIdentificatie: string) {
  return function handleDelete() {
    return sendFormPostRequest<null>(
      BFFApiUrls.KLANTCONTACT_ZAAKVOORKEUR_DELETE,
      { payload: { zaakIdentificatie } }
    ).then((response) => {
      if (response.status === 'OK') {
        updateZaakKanaalVoorkeurenState((huidige) =>
          huidige.filter((v) => v.zaakIdentificatie !== zaakIdentificatie)
        );
      }
      return response;
    });
  };
}

export function useVerifyCommunicatievoorkeur(
  onCallback: (verified: boolean) => void
) {
  const appState = useAppStateStore();
  return useBffApi<
    VerifyVerificationRequestResponse,
    { type: ContactgegevenType; value: string; code: string }
  >(BFFApiUrls.KLANTCONTACT_CONTACTGEGEVEN_VERIFY, {
    fetchImmediately: false,
    sendRequest: async (url, init) => {
      return sendFormPostRequest<VerifyVerificationRequestResponse>(
        url,
        init
      ).then((response) => {
        const success = response.content?.verified ?? false;
        if (success && init?.payload) {
          updateCommunicatievoorkeurState({
            contactgegeven: {
              type: init.payload.type,
              isVerified: true,
              dateModified: new Date().toISOString(),
              dateModifiedFormatted: new Date().toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
            },
            appState,
          });
        }
        onCallback(success);
        return response;
      });
    },
  });
}

export function useCommunicatieVoorkeurVerwijderen(
  contactgegeven: ContactgegevenFrontend
) {
  const appState = useAppStateStore();
  return function handleDelete() {
    return sendFormPostRequest<ContactgegevenFrontend>(
      BFFApiUrls.KLANTCONTACT_CONTACTGEGEVEN_DELETE,
      {
        payload: {
          id: contactgegeven.id,
        },
      }
    ).then((response) => {
      if (response.status === 'OK') {
        updateCommunicatievoorkeurState({
          contactgegeven: {
            type: contactgegeven.type,
            value: null,
            id: null,
            dateModified: null,
            dateModifiedFormatted: null,
            isVerified: false,
          },
          appState,
        });
      }
      return response;
    });
  };
}

export function useCommunicatieVoorkeurInstellen() {
  const params = useParams<{
    contactgegeven: ContactgegevenType;
    action: InstelAction;
    id?: string;
  }>();
  return {
    title: `${params.action ? capitalizeFirstLetter(params.action) : 'Instellen'} ${params.contactgegeven ? lowercaseFirstLetter(ContactgegevenByTypeLabels[params.contactgegeven] ?? '') : 'contactgegeven'}`,
    routeConfig: themaConfig.detailPageContactgegevenInstellen.route,
    contactgegevenType: params.contactgegeven,
  };
}
