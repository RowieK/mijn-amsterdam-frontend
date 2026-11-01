import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useSetCommunicatievoorkeur,
  useVerifyCommunicatievoorkeur,
  useCommunicatieVoorkeurVerwijderen,
  useSetZaakKanaalVoorkeur,
  useVerwijderZaakKanaalVoorkeur,
} from './useCommunicatieVoorkeuren.ts';
import type { KlantcontactResponseData } from '../../../../../../../server/services/klantcontact/klantcontact.types.ts';
import { bffApiHost } from '../../../../../../../testing/setup.ts';
import { bffApi } from '../../../../../../../testing/utils.ts';
import type { ApiResponse } from '../../../../../../../universal/helpers/api.ts';
import { BFFApiUrls } from '../../../../config/api.ts';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';

const BFF_ENDPOINTS = {
  create: BFFApiUrls.KLANTCONTACT_CONTACTGEGEVEN_CREATE.replace(
    `${bffApiHost}`,
    ''
  ),
  verify: BFFApiUrls.KLANTCONTACT_CONTACTGEGEVEN_VERIFY.replace(
    `${bffApiHost}`,
    ''
  ),
  delete: BFFApiUrls.KLANTCONTACT_CONTACTGEGEVEN_DELETE.replace(
    `${bffApiHost}`,
    ''
  ),
  zaakVoorkeurSet: BFFApiUrls.KLANTCONTACT_ZAAKVOORKEUR_SET.replace(
    `${bffApiHost}`,
    ''
  ),
  zaakVoorkeurDelete: BFFApiUrls.KLANTCONTACT_ZAAKVOORKEUR_DELETE.replace(
    `${bffApiHost}`,
    ''
  ),
};


function getContactgegevenInStore(
  type: 'Email' | 'Telefoonnummer' | 'Postadres'
) {
  return useAppStateStore.getState().KLANT_CONTACT?.content
    ?.communicatievoorkeuren?.standaardContactgegevens?.[type];
}

describe('useCommunicatieVoorkeuren', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAppStateStore.setState({
      KLANT_CONTACT: {
        status: 'OK',
        content: {
          contactmomenten: [],
          afspraken: [],
          communicatievoorkeuren: {
            standaardContactgegevens: {},
            zaakKanaalVoorkeuren: [],
          },
        },
      } as unknown as ApiResponse<KlantcontactResponseData>,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });


  it('useSetCommunicatievoorkeur updates app state when create succeeds with id', async () => {
    const callback = vi.fn();
    const created = {
      id: 'cg-1',
      type: 'Email',
      value: 'test@example.com',
      isVerified: false,
    };

    bffApi.post(BFF_ENDPOINTS.create).reply(200, {
      status: 'OK',
      content: created,
    });

    const { result } = renderHook(() => useSetCommunicatievoorkeur(callback));

    await act(async () => {
      await result.current.fetch({
        payload: { type: 'Email', value: 'test@example.com' },
      });
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining(created),
      true
    );
    expect(getContactgegevenInStore('Email')).toEqual(
      expect.objectContaining(created)
    );
  });

  it('useSetCommunicatievoorkeur does not update app state when response has no id', async () => {
    const callback = vi.fn();

    bffApi.post(BFF_ENDPOINTS.create).reply(200, {
      status: 'OK',
      content: {
        id: null,
        type: 'Email',
      },
    });

    const { result } = renderHook(() => useSetCommunicatievoorkeur(callback));

    await act(async () => {
      await result.current.fetch({
        payload: { type: 'Email', value: 'test@example.com' },
      });
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ id: null, type: 'Email' }),
      true
    );
    expect(getContactgegevenInStore('Email')).toBeUndefined();
  });

  it('useVerifyCommunicatievoorkeur updates app state when verified', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T12:00:00.000Z'));

    const callback = vi.fn();

    bffApi.post(BFF_ENDPOINTS.verify).reply(200, {
      status: 'OK',
      content: { verified: true },
    });

    const { result } = renderHook(() =>
      useVerifyCommunicatievoorkeur(callback)
    );

    await act(async () => {
      await result.current.fetch({
        payload: { type: 'Email', value: 'test@example.com', code: '1234' },
      });
    });

    expect(callback).toHaveBeenCalledWith(true);
    expect(getContactgegevenInStore('Email')).toEqual(
      expect.objectContaining({
        type: 'Email',
        isVerified: true,
        dateModified: '2026-01-02T12:00:00.000Z',
      })
    );
  });

  it('useVerifyCommunicatievoorkeur does not update app state when not verified', async () => {
    const callback = vi.fn();

    bffApi.post(BFF_ENDPOINTS.verify).reply(200, {
      status: 'OK',
      content: { verified: false },
    });

    const { result } = renderHook(() =>
      useVerifyCommunicatievoorkeur(callback)
    );

    await act(async () => {
      await result.current.fetch({
        payload: { type: 'Email', value: 'test@example.com', code: '1234' },
      });
    });

    expect(callback).toHaveBeenCalledWith(false);
    expect(getContactgegevenInStore('Email')).toBeUndefined();
  });

  it('useCommunicatieVoorkeurVerwijderen clears value in app state when delete succeeds', async () => {
    useAppStateStore.setState({
      KLANT_CONTACT: {
        content: {
          communicatievoorkeuren: {
            standaardContactgegevens: {
              Email: {
                id: 'cg-1',
                type: 'Email',
                value: 'test@example.com',
                isVerified: true,
                dateModified: '2026-01-02T12:00:00.000Z',
                dateModifiedFormatted: '2 januari 2026',
              },
            },
          },
        },
      } as ApiResponse<KlantcontactResponseData>,
    });

    bffApi.post(BFF_ENDPOINTS.delete).reply(200, {
      status: 'OK',
      content: null,
    });

    const contactgegeven = {
      id: 'cg-1',
      type: 'Email',
      value: 'test@example.com',
    };

    const { result } = renderHook(() =>
      useCommunicatieVoorkeurVerwijderen(contactgegeven as never)
    );

    await act(async () => {
      await result.current();
    });

    expect(getContactgegevenInStore('Email')).toEqual(
      expect.objectContaining({
        type: 'Email',
        value: null,
        id: null,
        dateModified: null,
        dateModifiedFormatted: null,
      })
    );
  });

  it('useCommunicatieVoorkeurVerwijderen does not update app state when delete fails', async () => {
    useAppStateStore.setState({
      KLANT_CONTACT: {
        content: {
          communicatievoorkeuren: {
            standaardContactgegevens: {
              Email: {
                id: 'cg-1',
                type: 'Email',
                value: 'test@example.com',
                dateModified: null,
                dateModifiedFormatted: null,
              },
            },
          },
        },
      } as ApiResponse<KlantcontactResponseData>,
    });

    bffApi.post(BFF_ENDPOINTS.delete).reply(200, {
      status: 'ERROR',
      message: 'Delete failed',
      content: null,
    });

    const contactgegeven = {
      id: 'cg-1',
      type: 'Email',
      value: 'test@example.com',
    };

    const { result } = renderHook(() =>
      useCommunicatieVoorkeurVerwijderen(contactgegeven as never)
    );

    await act(async () => {
      await result.current();
    });

    expect(getContactgegevenInStore('Email')).toEqual(
      expect.objectContaining({
        id: 'cg-1',
        type: 'Email',
        value: 'test@example.com',
      })
    );
  });


  it('useSetZaakKanaalVoorkeur adds a preference when API succeeds', async () => {
    const callback = vi.fn();

    const contactgegeven = {
      id: 'cg-zaak-1',
      type: 'Email',
      value: 'test@example.com',
      isVerified: true,
    };

    bffApi.post(BFF_ENDPOINTS.zaakVoorkeurSet).reply(200, {
      status: 'OK',
      content: contactgegeven,
    });

    const { result } = renderHook(() =>
      useSetZaakKanaalVoorkeur(callback)
    );

    await act(async () => {
      await result.current.fetch({
        payload: {
          zaakIdentificatie: 'zaak-123',
          kanaal: 'Email',
          value: 'test@example.com',
        },
      });
    });

    const voorkeuren =
      useAppStateStore.getState().KLANT_CONTACT.content
        ?.communicatievoorkeuren?.zaakKanaalVoorkeuren;

    expect(voorkeuren).toEqual([
      {
        zaakIdentificatie: 'zaak-123',
        contactgegeven,
      },
    ]);

    expect(callback).toHaveBeenCalledWith(contactgegeven, true);
  });


    it('useSetZaakKanaalVoorkeur replaces an existing preference', async () => {
      const callback = vi.fn();

      const huidigeState = useAppStateStore.getState();

  useAppStateStore.setState({
    KLANT_CONTACT: {
      ...huidigeState.KLANT_CONTACT,
      status: 'OK',
      content: {
        ...huidigeState.KLANT_CONTACT.content!,
        communicatievoorkeuren: {
          ...huidigeState.KLANT_CONTACT.content!.communicatievoorkeuren!,
          zaakKanaalVoorkeuren: [
            {
              zaakIdentificatie: 'zaak-123',
              contactgegeven: {
                id: 'cg-old',
                type: 'Email',
                value: 'oud@example.com',
                isVerified: true,
                dateModified: null,
                dateModifiedFormatted: null,
              },
            },
          ],
        },
      },
    },
  });

  const nieuwContactgegeven = {
    id: 'cg-new',
    type: 'Telefoonnummer',
    value: '0612345678',
    isVerified: true,
  };

  bffApi.post(BFF_ENDPOINTS.zaakVoorkeurSet).reply(200, {
    status: 'OK',
    content: nieuwContactgegeven,
  });

  const { result } = renderHook(() =>
    useSetZaakKanaalVoorkeur(callback)
  );

  await act(async () => {
    await result.current.fetch({
      payload: {
        zaakIdentificatie: 'zaak-123',
        kanaal: 'Telefoonnummer',
        value: '0612345678',
      },
    });
  });

  const voorkeuren =
    useAppStateStore.getState().KLANT_CONTACT.content
      ?.communicatievoorkeuren?.zaakKanaalVoorkeuren;

  expect(voorkeuren).toHaveLength(1);

  expect(voorkeuren?.[0]).toEqual({
    zaakIdentificatie: 'zaak-123',
    contactgegeven: nieuwContactgegeven,
  });

  expect(callback).toHaveBeenCalledWith(
    nieuwContactgegeven,
    true
  );
});




  it('useVerwijderZaakKanaalVoorkeur removes only the selected case', async () => {
    const huidigeState = useAppStateStore.getState();

    const voorkeurZaak123 = {
      zaakIdentificatie: 'zaak-123',
      contactgegeven: {
        id: 'cg-123',
        type: 'Email' as const,
        value: 'test@example.com',
        isVerified: true,
        dateModified: null,
        dateModifiedFormatted: null,
      },
    };

    const voorkeurZaak456 = {
      zaakIdentificatie: 'zaak-456',
      contactgegeven: {
        id: 'cg-456',
        type: 'Telefoonnummer' as const,
        value: '0612345678',
        isVerified: true,
        dateModified: null,
        dateModifiedFormatted: null,
      },
    };

    useAppStateStore.setState({
      KLANT_CONTACT: {
        ...huidigeState.KLANT_CONTACT,
        status: 'OK',
        content: {
          ...huidigeState.KLANT_CONTACT.content!,
          communicatievoorkeuren: {
            ...huidigeState.KLANT_CONTACT.content!.communicatievoorkeuren!,
            zaakKanaalVoorkeuren: [
              voorkeurZaak123,
              voorkeurZaak456,
            ],
          },
        },
      },
    });

    bffApi.post(BFF_ENDPOINTS.zaakVoorkeurDelete).reply(200, {
      status: 'OK',
      content: null,
    });

    const { result } = renderHook(() =>
      useVerwijderZaakKanaalVoorkeur('zaak-123')
    );

    await act(async () => {
      await result.current();
    });

    const voorkeuren =
      useAppStateStore.getState().KLANT_CONTACT.content
        ?.communicatievoorkeuren?.zaakKanaalVoorkeuren;

    expect(voorkeuren).toEqual([voorkeurZaak456]);
  });

  
  it('useVerwijderZaakKanaalVoorkeur keeps the preference when delete fails', async () => {
    const huidigeState = useAppStateStore.getState();

    const bestaandeVoorkeur = {
      zaakIdentificatie: 'zaak-123',
      contactgegeven: {
        id: 'cg-123',
        type: 'Email' as const,
        value: 'test@example.com',
        isVerified: true,
        dateModified: null,
        dateModifiedFormatted: null,
      },
    };

    useAppStateStore.setState({
      KLANT_CONTACT: {
        ...huidigeState.KLANT_CONTACT,
        status: 'OK',
        content: {
          ...huidigeState.KLANT_CONTACT.content!,
          communicatievoorkeuren: {
            ...huidigeState.KLANT_CONTACT.content!.communicatievoorkeuren!,
            zaakKanaalVoorkeuren: [bestaandeVoorkeur],
          },
        },
      },
    });

    bffApi.post(BFF_ENDPOINTS.zaakVoorkeurDelete).reply(200, {
      status: 'ERROR',
      message: 'Delete failed',
      content: null,
    });

    const { result } = renderHook(() =>
      useVerwijderZaakKanaalVoorkeur('zaak-123')
    );

    await act(async () => {
      await result.current();
    });

    const voorkeuren =
      useAppStateStore.getState().KLANT_CONTACT.content
        ?.communicatievoorkeuren?.zaakKanaalVoorkeuren;

    expect(voorkeuren).toEqual([bestaandeVoorkeur]);
  });

  it('useSetZaakKanaalVoorkeur keeps the existing preference when API fails', async () => {
    const callback = vi.fn();
    const huidigeState = useAppStateStore.getState();

    const bestaandeVoorkeur = {
      zaakIdentificatie: 'zaak-123',
      contactgegeven: {
        id: 'cg-old',
        type: 'Email' as const,
        value: 'oud@example.com',
        isVerified: true,
        dateModified: null,
        dateModifiedFormatted: null,
      },
    };

    useAppStateStore.setState({
      KLANT_CONTACT: {
        ...huidigeState.KLANT_CONTACT,
        status: 'OK',
        content: {
          ...huidigeState.KLANT_CONTACT.content!,
          communicatievoorkeuren: {
            ...huidigeState.KLANT_CONTACT.content!.communicatievoorkeuren!,
            zaakKanaalVoorkeuren: [bestaandeVoorkeur],
          },
        },
      },
    });

    bffApi.post(BFF_ENDPOINTS.zaakVoorkeurSet).reply(200, {
      status: 'ERROR',
      message: 'Set failed',
      content: null,
    });

    const { result } = renderHook(() =>
      useSetZaakKanaalVoorkeur(callback)
    );

    await act(async () => {
      await result.current.fetch({
        payload: {
          zaakIdentificatie: 'zaak-123',
          kanaal: 'Telefoonnummer',
          value: '0612345678',
        },
      });
    });

    const voorkeuren =
      useAppStateStore.getState().KLANT_CONTACT.content
        ?.communicatievoorkeuren?.zaakKanaalVoorkeuren;

    expect(voorkeuren).toEqual([bestaandeVoorkeur]);
    expect(callback).toHaveBeenCalledWith(null, false);
  });

});