import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { generatePath, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContactgegevenInstellen } from './ContactgegevenInstellen.tsx';
import type { KlantcontactResponseData } from '../../../../../../../server/services/klantcontact/klantcontact.types.ts';
import { bffApi } from '../../../../../../../testing/utils.ts';
import type { ApiResponse } from '../../../../../../../universal/helpers/api.ts';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
import { themaConfig } from '../KlantContact-thema-config.ts';

function setBaseState() {
  useAppStateStore.setState({
    KLANT_CONTACT: {
      status: 'OK',
      content: {
        afspraken: [],
        contactmomenten: [],
        communicatievoorkeuren: {
          standaardContactgegevens: {
            Email: {
              id: null,
              type: 'Email',
              value: null,
              dateModified: null,
              dateModifiedFormatted: null,
              isVerified: false,
            },
          },
          aangeslotenDiensten: [],
        },
      },
    } as unknown as ApiResponse<KlantcontactResponseData>,
  });
}

function renderWithRoute(routeEntry: string) {
  return render(
    <MemoryRouter initialEntries={[routeEntry]}>
      <Routes>
        <Route
          path={themaConfig.detailPageContactgegevenInstellen.route.path}
          element={<ContactgegevenInstellen />}
        />
        <Route
          path={themaConfig.route.path}
          element={<div>KlantContact Home</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ContactgegevenInstellen integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    setBaseState();
  });

  it('shows NotFound for unknown contactgegeven type', async () => {
    const routeEntry = generatePath(
      themaConfig.detailPageContactgegevenInstellen.route.path,
      {
        contactgegeven: 'OnbekendType',
        step: '1',
      }
    );

    renderWithRoute(routeEntry);

    expect(
      screen.getByRole('heading', { name: 'Pagina niet gevonden' })
    ).toBeInTheDocument();
  });

  it('submits step 1 and navigates to step 2 when create succeeds', async () => {
    const user = userEvent.setup();
    const routeEntry = generatePath(
      themaConfig.detailPageContactgegevenInstellen.route.path,
      {
        contactgegeven: 'Email',
        step: '1',
      }
    );

    const createScope = bffApi
      .post('/services/klantcontact/contactgegeven/create')
      .reply(200, {
        status: 'OK',
        content: {
          id: 'email-1',
          type: 'Email',
          value: 'test@example.com',
          isVerified: false,
        },
      });

    renderWithRoute(routeEntry);

    const valueInput = screen.getByPlaceholderText(
      /Vul hier uw E-mailadres in/i
    );

    await user.clear(valueInput);
    await user.type(valueInput, 'test@example.com');
    await user.click(screen.getByRole('button', { name: 'Versturen' }));

    await waitFor(() => {
      expect(createScope.isDone()).toBe(true);
    });

    expect(await screen.findByText('Vul de code in')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /Wij hebben een code met 6 cijfers gestuurd naar/i
      )
    ).toBeInTheDocument();
  });

  it('updates the default SMS channel without zaken', async () => {
    const user = userEvent.setup();
    const oldNumber = '0612345678';
    const newNumber = '0687654321';
    const code = '123456';
    const { mergeAppState } = useAppStateStore.getState();
    mergeAppState('ERFPACHT', {
      status: 'OK',
      content: { dossiers: { dossiers: [] }, zaken: [] },
    });
    mergeAppState('KLANT_CONTACT', {
      content: {
        communicatievoorkeuren: {
          standaardContactgegevens: {
            Telefoonnummer: {
              id: 'telefoon-1',
              type: 'Telefoonnummer',
              value: oldNumber,
              isVerified: true,
            },
          },
        },
      },
    });

    const contactgegeven = { type: 'Telefoonnummer', value: newNumber };
    bffApi
      .post('/services/klantcontact/contactgegeven/create', contactgegeven)
      .reply(200, {
        status: 'OK',
        content: { ...contactgegeven, id: 'telefoon-2', isVerified: false },
      });
    bffApi
      .post('/services/klantcontact/contactgegeven/verify', {
        ...contactgegeven,
        code,
      })
      .reply(200, { status: 'OK', content: { verified: true } });

    renderWithRoute(
      generatePath(themaConfig.detailPageContactgegevenInstellen.route.path, {
        contactgegeven: 'Telefoonnummer',
        step: '1',
        action: 'wijzigen',
      })
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue(oldNumber);
    await user.clear(input);
    await user.type(input, newNumber);
    await user.click(screen.getByRole('button', { name: 'Versturen' }));

    await screen.findByText('Vul de code in');
    for (const [index, field] of screen.getAllByRole('textbox').entries()) {
      await user.type(field, code.charAt(index));
    }

    expect(await screen.findByText('KlantContact Home')).toBeInTheDocument();
    expect(
      useAppStateStore.getState().KLANT_CONTACT.content?.communicatievoorkeuren
        ?.standaardContactgegevens?.Telefoonnummer
    ).toMatchObject({ value: newNumber, isVerified: true });
  });

  it('shows validation error for invalid email and stays on step 1', async () => {
    const user = userEvent.setup();
    const routeEntry = generatePath(
      themaConfig.detailPageContactgegevenInstellen.route.path,
      {
        contactgegeven: 'Email',
        step: '1',
      }
    );

    renderWithRoute(routeEntry);

    const valueInput = screen.getByPlaceholderText(
      /Vul hier uw E-mailadres in/i
    );

    await user.type(valueInput, 'invalid-email');
    await user.click(screen.getByRole('button', { name: 'Versturen' }));

    expect(
      screen.getByText('Dit lijkt geen valide E-mailadres.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Vul de code in')).not.toBeInTheDocument();
  });

  it('verifies code on step 2 and navigates back to the thema route', async () => {
    const user = userEvent.setup();
    const routeEntry = generatePath(
      themaConfig.detailPageContactgegevenInstellen.route.path,
      {
        contactgegeven: 'Email',
        step: '2',
      }
    );

    sessionStorage.setItem(
      'standaard-Email-voorkeur-instellen',
      JSON.stringify('test@example.com')
    );

    bffApi.post('/services/klantcontact/contactgegeven/verify').reply(200, {
      status: 'OK',
      content: { verified: true },
    });

    // OTP input can trigger submit twice in some environments (on complete + submit).
    bffApi.post('/services/klantcontact/contactgegeven/verify').reply(200, {
      status: 'OK',
      content: { verified: true },
    });

    renderWithRoute(routeEntry);

    const otpInputs = screen.getAllByRole('textbox');
    expect(otpInputs).toHaveLength(6);

    for (let i = 0; i < otpInputs.length; i++) {
      await user.type(otpInputs[i], String(i + 1));
    }

    expect(await screen.findByText('KlantContact Home')).toBeInTheDocument();
  });

  it('shows API error when verify request fails and stays on step 2', async () => {
    const user = userEvent.setup();
    const routeEntry = generatePath(
      themaConfig.detailPageContactgegevenInstellen.route.path,
      {
        contactgegeven: 'Email',
        step: '2',
      }
    );

    sessionStorage.setItem(
      'standaard-Email-voorkeur-instellen',
      JSON.stringify('test@example.com')
    );

    bffApi.post('/services/klantcontact/contactgegeven/verify').reply(500, {
      status: 'ERROR',
      message: 'verify failed',
      content: null,
    });

    bffApi.post('/services/klantcontact/contactgegeven/verify').reply(500, {
      status: 'ERROR',
      message: 'verify failed',
      content: null,
    });

    renderWithRoute(routeEntry);

    const otpInputs = screen.getAllByRole('textbox');
    for (let i = 0; i < otpInputs.length; i++) {
      await user.type(otpInputs[i], String(i + 1));
    }

    expect(
      await screen.findByText(
        /Er is een fout opgetreden bij het checken van de code\./i
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('KlantContact Home')).not.toBeInTheDocument();
  });
});

describe('ContactgegevenInstellen met meerdere e-mailadressen', () => {
  const emailadressen = [
    {
      id: 'email-1',
      type: 'Email',
      value: 'eerste@example.com',
      dateModified: '2026-06-01T10:00:00.000Z',
      dateModifiedFormatted: '1 juni 2026',
      isVerified: true,
    },
    {
      id: 'email-2',
      type: 'Email',
      value: 'tweede@example.com',
      dateModified: '2026-05-01T10:00:00.000Z',
      dateModifiedFormatted: '1 mei 2026',
      isVerified: true,
    },
  ];

  function setStateMetAdressen() {
    useAppStateStore.setState({
      KLANT_CONTACT: {
        status: 'OK',
        content: {
          afspraken: [],
          contactmomenten: [],
          communicatievoorkeuren: {
            standaardContactgegevens: { Email: emailadressen[0] },
            emailadressen,
            aangeslotenDiensten: [],
          },
        },
      } as unknown as ApiResponse<KlantcontactResponseData>,
    });
  }

  function routeVoor(params: { step: string; action: string; id?: string }) {
    return generatePath(
      themaConfig.detailPageContactgegevenInstellen.route.path,
      { contactgegeven: 'Email', ...params }
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    setStateMetAdressen();
  });

  it('start bij toevoegen met een leeg veld, ook al is er al een e-mailadres', () => {
    renderWithRoute(routeVoor({ step: '1', action: 'toevoegen' }));

    expect(
      screen.getByPlaceholderText(/Vul hier uw E-mailadres in/i)
    ).toHaveValue('');
  });

  it('start bij wijzigen met het adres uit de link', () => {
    renderWithRoute(
      routeVoor({ step: '1', action: 'wijzigen', id: 'email-2' })
    );

    expect(
      screen.getByPlaceholderText(/Vul hier uw E-mailadres in/i)
    ).toHaveValue('tweede@example.com');
  });

  it('meldt een dubbel adres zonder iets te versturen', async () => {
    const user = userEvent.setup();
    renderWithRoute(routeVoor({ step: '1', action: 'toevoegen' }));

    await user.type(
      screen.getByPlaceholderText(/Vul hier uw E-mailadres in/i),
      ' Tweede@Example.com '
    );
    await user.click(screen.getByRole('button', { name: 'Versturen' }));

    expect(screen.getByText(/heeft u al toegevoegd/)).toBeInTheDocument();
    expect(screen.queryByText('Vul de code in')).not.toBeInTheDocument();
  });

  it('meldt een ongeldig adres bij toevoegen', async () => {
    const user = userEvent.setup();
    renderWithRoute(routeVoor({ step: '1', action: 'toevoegen' }));

    await user.type(
      screen.getByPlaceholderText(/Vul hier uw E-mailadres in/i),
      'geen@punt'
    );
    await user.click(screen.getByRole('button', { name: 'Versturen' }));

    expect(
      screen.getByText('Dit lijkt geen valide E-mailadres.')
    ).toBeInTheDocument();
  });

  it('verstuurt bij toevoegen de vlag toevoegen mee en gaat naar stap 2', async () => {
    const user = userEvent.setup();
    const createScope = bffApi
      .post('/services/klantcontact/contactgegeven/create', {
        type: 'Email',
        value: 'derde@example.com',
        toevoegen: 'true',
      })
      .reply(200, {
        status: 'OK',
        content: {
          id: 'email-3',
          type: 'Email',
          value: 'derde@example.com',
          isVerified: false,
        },
      });

    renderWithRoute(routeVoor({ step: '1', action: 'toevoegen' }));

    await user.type(
      screen.getByPlaceholderText(/Vul hier uw E-mailadres in/i),
      'derde@example.com'
    );
    await user.click(screen.getByRole('button', { name: 'Versturen' }));

    await waitFor(() => {
      expect(createScope.isDone()).toBe(true);
    });
    expect(await screen.findByText('Vul de code in')).toBeInTheDocument();
  });

  it('verwijdert bij wijzigen na het valideren het oude adres', async () => {
    const user = userEvent.setup();
    // Stap 1 heeft het nieuwe adres al aangemaakt, zodat het in de lijst staat.
    useAppStateStore.setState({
      KLANT_CONTACT: {
        status: 'OK',
        content: {
          afspraken: [],
          contactmomenten: [],
          communicatievoorkeuren: {
            standaardContactgegevens: { Email: emailadressen[0] },
            emailadressen: [
              ...emailadressen,
              {
                id: 'email-3',
                type: 'Email',
                value: 'nieuw@example.com',
                dateModified: null,
                dateModifiedFormatted: null,
                isVerified: false,
              },
            ],
            aangeslotenDiensten: [],
          },
        },
      } as unknown as ApiResponse<KlantcontactResponseData>,
    });
    sessionStorage.setItem(
      'standaard-Email-voorkeur-instellen-email-2',
      JSON.stringify('nieuw@example.com')
    );
    bffApi
      .post('/services/klantcontact/contactgegeven/verify')
      .times(2)
      .reply(200, {
        status: 'OK',
        content: { verified: true },
      });
    // De scope van bffApi wordt gedeeld met de verify-aanroepen, dus isDone() zegt hier niets over deze aanroep.
    const verwijderdeBodies: string[] = [];
    bffApi
      .post('/services/klantcontact/contactgegeven/delete')
      .reply(200, (_uri, body) => {
        verwijderdeBodies.push(String(body));
        return { status: 'OK', content: null };
      });

    renderWithRoute(
      routeVoor({ step: '2', action: 'wijzigen', id: 'email-2' })
    );

    const otpInputs = screen.getAllByRole('textbox');
    for (let i = 0; i < otpInputs.length; i++) {
      await user.type(otpInputs[i], String(i + 1));
    }

    expect(await screen.findByText('KlantContact Home')).toBeInTheDocument();
    expect(verwijderdeBodies).toEqual(['id=email-2']);
  });

  it('verwijdert bij wijzigen niets als het adres hetzelfde blijft', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(
      'standaard-Email-voorkeur-instellen-email-2',
      JSON.stringify('Tweede@example.com')
    );
    bffApi
      .post('/services/klantcontact/contactgegeven/verify')
      .times(2)
      .reply(200, {
        status: 'OK',
        content: { verified: true },
      });
    const verwijderdeBodies: string[] = [];
    bffApi
      .post('/services/klantcontact/contactgegeven/delete')
      .reply(200, (_uri, body) => {
        verwijderdeBodies.push(String(body));
        return { status: 'OK', content: null };
      });

    renderWithRoute(
      routeVoor({ step: '2', action: 'wijzigen', id: 'email-2' })
    );

    const otpInputs = screen.getAllByRole('textbox');
    for (let i = 0; i < otpInputs.length; i++) {
      await user.type(otpInputs[i], String(i + 1));
    }

    expect(await screen.findByText('KlantContact Home')).toBeInTheDocument();
    expect(verwijderdeBodies).toEqual([]);
  });
});
