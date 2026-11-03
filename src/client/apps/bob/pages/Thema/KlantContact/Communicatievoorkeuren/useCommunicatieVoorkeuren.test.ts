import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useSetCommunicatievoorkeur,
  useVerifyCommunicatievoorkeur,
  useCommunicatieVoorkeurVerwijderen,
  useSetZaakKanaalVoorkeur,
  useVerwijderZaakKanaalVoorkeur,
} from './useCommunicatieVoorkeuren.ts';
import type {
  ContactgegevenFrontend,
  ZaakKanaalVoorkeurFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import type { KlantcontactResponseData } from '../../../../../../../server/services/klantcontact/klantcontact.types.ts';
import { bffApiHost } from '../../../../../../../testing/setup.ts';
import { bffApi } from '../../../../../../../testing/utils.ts';
import type { ApiResponse } from '../../../../../../../universal/helpers/api.ts';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
import { BFFApiUrls } from '../../../../config/api.ts';

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

  describe('zaakvoorkeur', () => {
    function getZaakVoorkeurenInStore() {
      return useAppStateStore.getState().KLANT_CONTACT.content
        ?.communicatievoorkeuren?.zaakKanaalVoorkeuren;
    }

    function setZaakVoorkeurenInStore(
      zaakKanaalVoorkeuren: ZaakKanaalVoorkeurFrontend[]
    ) {
      const { KLANT_CONTACT } = useAppStateStore.getState();
      useAppStateStore.setState({
        KLANT_CONTACT: {
          ...KLANT_CONTACT,
          content: {
            ...KLANT_CONTACT.content!,
            communicatievoorkeuren: {
              ...KLANT_CONTACT.content!.communicatievoorkeuren!,
              zaakKanaalVoorkeuren,
            },
          },
        } as unknown as ApiResponse<KlantcontactResponseData>,
      });
    }

    // Hetzelfde formaat als ZaakKanaalVoorkeurFrontend uit setZaakKanaalVoorkeur en fetchCommunicatievoorkeuren.
    function createVoorkeur(
      zaakIdentificatie: string,
      contactgegeven: Pick<ContactgegevenFrontend, 'id' | 'type' | 'value'> &
        Partial<ContactgegevenFrontend>
    ): ZaakKanaalVoorkeurFrontend {
      return {
        zaakIdentificatie,
        contactgegeven: {
          isVerified: false,
          dateModified: null,
          dateModifiedFormatted: null,
          ...contactgegeven,
        },
      };
    }

    const voorkeurZaak123 = createVoorkeur('Z-24-0000123', {
      id: 'cg-zaak-123',
      type: 'Email',
      value: 'test@example.com',
    });
    const voorkeurZaak456 = createVoorkeur('Z-24-0000456', {
      id: 'cg-zaak-456',
      type: 'Telefoonnummer',
      value: '0612345678',
    });

    it('useSetZaakKanaalVoorkeur sends the payload the BFF expects', async () => {
      bffApi
        .post(BFF_ENDPOINTS.zaakVoorkeurSet, {
          zaakIdentificatie: voorkeurZaak123.zaakIdentificatie,
          kanaal: 'Email',
          value: 'test@example.com',
        })
        .reply(200, { status: 'OK', content: voorkeurZaak123 });

      const { result } = renderHook(() =>
        useSetZaakKanaalVoorkeur(vi.fn(), voorkeurZaak123.zaakIdentificatie)
      );

      await act(async () => {
        await result.current.fetch({
          payload: {
            zaakIdentificatie: voorkeurZaak123.zaakIdentificatie,
            kanaal: 'Email',
            value: 'test@example.com',
          },
        });
      });

      expect(getZaakVoorkeurenInStore()).toEqual([voorkeurZaak123]);
    });

    it('useSetZaakKanaalVoorkeur stores the voorkeur from the BFF response', async () => {
      const callback = vi.fn();

      bffApi
        .post(BFF_ENDPOINTS.zaakVoorkeurSet)
        .reply(200, { status: 'OK', content: voorkeurZaak123 });

      const { result } = renderHook(() =>
        useSetZaakKanaalVoorkeur(callback, voorkeurZaak123.zaakIdentificatie)
      );

      await act(async () => {
        await result.current.fetch({
          payload: {
            zaakIdentificatie: voorkeurZaak123.zaakIdentificatie,
            kanaal: 'Email',
            value: 'test@example.com',
          },
        });
      });

      expect(getZaakVoorkeurenInStore()).toEqual([voorkeurZaak123]);
      expect(callback).toHaveBeenCalledWith(voorkeurZaak123, true);
    });

    it('useSetZaakKanaalVoorkeur replaces the voorkeur of the same zaak and keeps the others', async () => {
      const callback = vi.fn();
      const oudeVoorkeur = createVoorkeur(voorkeurZaak123.zaakIdentificatie, {
        id: 'cg-oud',
        type: 'Telefoonnummer',
        value: '0687654321',
      });
      setZaakVoorkeurenInStore([oudeVoorkeur, voorkeurZaak456]);

      bffApi
        .post(BFF_ENDPOINTS.zaakVoorkeurSet)
        .reply(200, { status: 'OK', content: voorkeurZaak123 });

      const { result } = renderHook(() =>
        useSetZaakKanaalVoorkeur(callback, voorkeurZaak123.zaakIdentificatie)
      );

      await act(async () => {
        await result.current.fetch({
          payload: {
            zaakIdentificatie: voorkeurZaak123.zaakIdentificatie,
            kanaal: 'Email',
            value: 'test@example.com',
          },
        });
      });

      expect(getZaakVoorkeurenInStore()).toEqual([
        voorkeurZaak456,
        voorkeurZaak123,
      ]);
    });

    it('useSetZaakKanaalVoorkeur keeps the existing voorkeuren when the BFF fails', async () => {
      const callback = vi.fn();
      setZaakVoorkeurenInStore([voorkeurZaak123]);

      bffApi
        .post(BFF_ENDPOINTS.zaakVoorkeurSet)
        .reply(200, { status: 'ERROR', message: 'Set failed', content: null });

      const { result } = renderHook(() =>
        useSetZaakKanaalVoorkeur(callback, voorkeurZaak123.zaakIdentificatie)
      );

      await act(async () => {
        await result.current.fetch({
          payload: {
            zaakIdentificatie: voorkeurZaak123.zaakIdentificatie,
            kanaal: 'Telefoonnummer',
            value: '0612345678',
          },
        });
      });

      expect(getZaakVoorkeurenInStore()).toEqual([voorkeurZaak123]);
      expect(callback).toHaveBeenCalledWith(null, false);
    });

    it('useSetZaakKanaalVoorkeur does not touch the state when there are no communicatievoorkeuren', async () => {
      const callback = vi.fn();
      const { KLANT_CONTACT } = useAppStateStore.getState();
      useAppStateStore.setState({
        KLANT_CONTACT: {
          ...KLANT_CONTACT,
          content: { ...KLANT_CONTACT.content!, communicatievoorkeuren: null },
        } as unknown as ApiResponse<KlantcontactResponseData>,
      });

      bffApi
        .post(BFF_ENDPOINTS.zaakVoorkeurSet)
        .reply(200, { status: 'OK', content: voorkeurZaak123 });

      const { result } = renderHook(() =>
        useSetZaakKanaalVoorkeur(callback, voorkeurZaak123.zaakIdentificatie)
      );

      await act(async () => {
        await result.current.fetch({
          payload: {
            zaakIdentificatie: voorkeurZaak123.zaakIdentificatie,
            kanaal: 'Email',
            value: 'test@example.com',
          },
        });
      });

      expect(
        useAppStateStore.getState().KLANT_CONTACT.content
          ?.communicatievoorkeuren
      ).toBeNull();
      expect(callback).toHaveBeenCalledWith(voorkeurZaak123, true);
    });

    it('useSetZaakKanaalVoorkeur houdt isError per zaak bij, zodat één mislukte zaak de andere niet als mislukt toont', async () => {
      bffApi
        .post(BFF_ENDPOINTS.zaakVoorkeurSet)
        .reply(200, { status: 'ERROR', message: 'Set failed', content: null });

      const { result } = renderHook(() => ({
        zaak123: useSetZaakKanaalVoorkeur(
          vi.fn(),
          voorkeurZaak123.zaakIdentificatie
        ),
        zaak456: useSetZaakKanaalVoorkeur(
          vi.fn(),
          voorkeurZaak456.zaakIdentificatie
        ),
      }));

      await act(async () => {
        await result.current.zaak123.fetch({
          payload: {
            zaakIdentificatie: voorkeurZaak123.zaakIdentificatie,
            kanaal: 'Email',
            value: 'test@example.com',
          },
        });
      });

      expect(result.current.zaak123.isError).toBe(true);
      expect(result.current.zaak456.isError).toBe(false);
    });

    it('useVerwijderZaakKanaalVoorkeur sends the zaakIdentificatie and removes only that zaak', async () => {
      setZaakVoorkeurenInStore([voorkeurZaak123, voorkeurZaak456]);

      bffApi
        .post(BFF_ENDPOINTS.zaakVoorkeurDelete, {
          zaakIdentificatie: voorkeurZaak123.zaakIdentificatie,
        })
        .reply(200, { status: 'OK', content: null });

      const { result } = renderHook(() =>
        useVerwijderZaakKanaalVoorkeur(voorkeurZaak123.zaakIdentificatie)
      );

      await act(async () => {
        await result.current();
      });

      expect(getZaakVoorkeurenInStore()).toEqual([voorkeurZaak456]);
    });

    it('useVerwijderZaakKanaalVoorkeur keeps the voorkeur when the BFF fails', async () => {
      setZaakVoorkeurenInStore([voorkeurZaak123]);

      bffApi.post(BFF_ENDPOINTS.zaakVoorkeurDelete).reply(200, {
        status: 'ERROR',
        message: 'Delete failed',
        content: null,
      });

      const { result } = renderHook(() =>
        useVerwijderZaakKanaalVoorkeur(voorkeurZaak123.zaakIdentificatie)
      );

      await act(async () => {
        await result.current();
      });

      expect(getZaakVoorkeurenInStore()).toEqual([voorkeurZaak123]);
    });
  });
});
