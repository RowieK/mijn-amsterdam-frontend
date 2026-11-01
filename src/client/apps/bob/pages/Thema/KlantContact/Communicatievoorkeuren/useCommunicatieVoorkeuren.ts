import { useCallback } from 'react';

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
import { BFFApiUrls } from '../../../../config/api.ts';
import {
  sendFormPostRequest,
  useBffApi,
} from '../../../../../../hooks/api/useBffApi.ts';
import {
  useAppStateStore,
  type AppStateStore,
} from '../../../../../../hooks/useAppStateStore.ts';
import {
  type InstelAction,
  themaConfig,
} from '../KlantContact-thema-config.ts';


type UpdateProps =
  | {
      contactgegeven: Partial<Omit<ContactgegevenFrontend, 'type'>> & {
        type: ContactgegevenType;
      };
      appState: AppStateStore;
      zaakKanaalVoorkeuren?: never;
    }
  | {
      contactgegeven?: never;
      appState: AppStateStore;
      zaakKanaalVoorkeuren: ZaakKanaalVoorkeurFrontend[];
    };

function updateCommunicatievoorkeurState(props: UpdateProps) {
  const { appState } = props;

  if (props.zaakKanaalVoorkeuren !== undefined) {
    const klantContact = appState.KLANT_CONTACT;

    if (!klantContact?.content?.communicatievoorkeuren) {
      return;
    }

    appState.setAppState({
      KLANT_CONTACT: {
        ...klantContact,
        content: {
          ...klantContact.content,
          communicatievoorkeuren: {
            ...klantContact.content.communicatievoorkeuren,
            zaakKanaalVoorkeuren: props.zaakKanaalVoorkeuren,
          },
        },
      },
    });

    return;
  }

  if (props.contactgegeven) {
    appState.mergeAppState('KLANT_CONTACT', {
      content: {
        communicatievoorkeuren: {
          standaardContactgegevens: {
            [props.contactgegeven.type]: props.contactgegeven,
          },
        },
      },
    });
  }
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
    contactgegeven: ContactgegevenFrontend | null,
    success: boolean
  ) => void
) {
  const appState = useAppStateStore();

  return useBffApi<
    ContactgegevenFrontend,
    ZaakKanaalVoorkeurPayloadFrontend
  >(BFFApiUrls.KLANTCONTACT_ZAAKVOORKEUR_SET, {
    fetchImmediately: false,
    sendRequest: async (url, init) => {
      return sendFormPostRequest<ContactgegevenFrontend>(
        url,
        init
      ).then((response) => {
        if (
          response.status === 'OK' &&
          response.content?.id &&
          init?.payload
        ) {
          const huidigeVoorkeuren =
            appState.KLANT_CONTACT.content
              ?.communicatievoorkeuren
              ?.zaakKanaalVoorkeuren ?? [];

          const zaakIdentificatie =
            init.payload.zaakIdentificatie;

          const nieuweVoorkeuren = [
            ...huidigeVoorkeuren.filter(
              (voorkeur: ZaakKanaalVoorkeurFrontend) =>
                voorkeur.zaakIdentificatie !== zaakIdentificatie
            ),
            {
              zaakIdentificatie,
              contactgegeven: response.content,
            },
          ];

          updateCommunicatievoorkeurState({
            appState,
            zaakKanaalVoorkeuren: nieuweVoorkeuren,
          });
        }

        onCallback(
          response.content ?? null,
          response.status === 'OK'
        );

        return response;
      });
    },
  });
}


export function useVerwijderZaakKanaalVoorkeur(
  zaakIdentificatie: string
) {
  const appState = useAppStateStore();

  return function handleDelete() {
    return sendFormPostRequest<null>(
      BFFApiUrls.KLANTCONTACT_ZAAKVOORKEUR_DELETE,
      {
        payload: {
          zaakIdentificatie,
        },
      }
    ).then((response) => {
      if (response.status === 'OK') {
        const huidigeVoorkeuren =
          appState.KLANT_CONTACT.content
            ?.communicatievoorkeuren
            ?.zaakKanaalVoorkeuren ?? [];

        const nieuweVoorkeuren = huidigeVoorkeuren.filter(
          (voorkeur: ZaakKanaalVoorkeurFrontend) =>
            voorkeur.zaakIdentificatie !== zaakIdentificatie
        );

        updateCommunicatievoorkeurState({
          appState,
          zaakKanaalVoorkeuren: nieuweVoorkeuren,
        });
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

export function useCommunicatieVoorkeurBevestigen() {
  const confirmSetting = useCallback(function confirmSetting(
    isChecked: boolean
  ) {
    // eslint-disable-next-line no-console -- To be implemented
    console.info('Confirm setting:', isChecked);
  }, []);
  return {
    confirmSetting,
  };
}
