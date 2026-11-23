import { render, within } from '@testing-library/react';

import { themaConfig } from './KlantContact-thema-config.ts';
import { KlantContactThema } from './KlantContactThema.tsx';
import type { AfspraakFrontend } from '../../../../../../server/services/klantcontact/klantcontact.types.ts';
import { bffApi } from '../../../../../../testing/utils.ts';
import type { AppState } from '../../../../../../universal/types/App.types.ts';
import { componentCreator } from '../../MockApp.tsx';

const createMijnContactThemaComponent = componentCreator({
  component: KlantContactThema,
  routePath: themaConfig.route.path,
  routeEntry: themaConfig.route.path,
});

function getState(content: {
  afspraken?: AfspraakFrontend[];
  contactmomenten?: Array<Record<string, unknown>>;
  communicatievoorkeuren?: Record<string, unknown> | null;
  failedDependencies?: Record<
    string,
    { status: 'ERROR'; message: string; content: null }
  >;
}): AppState {
  if (!content.afspraken) {
    content.afspraken = [];
  }
  if (!content.contactmomenten) {
    content.contactmomenten = [];
  }
  return {
    KLANT_CONTACT: {
      status: 'OK',
      content: {
        afspraken: content.afspraken,
        contactmomenten: content.contactmomenten,
        communicatievoorkeuren: content.communicatievoorkeuren ?? null,
      },
      failedDependencies: content.failedDependencies,
    },
  } as unknown as AppState;
}

function toggleAfsprakenFeatureToggle(active: boolean) {
  (themaConfig.featureToggle.afspraken as { active: boolean }).active = active;
}

describe('KlantContactThema', () => {
  const originalAfsprakenToggle = themaConfig.featureToggle.afspraken.active;

  beforeEach(() => {
    // Keep request mocking in place for this suite; component itself is state-driven.
    bffApi.post(/\/user-feedback\/collect.*/).reply(200, {
      status: 'OK',
      content: null,
    });
  });

  afterEach(() => {
    toggleAfsprakenFeatureToggle(originalAfsprakenToggle);
  });

  it('shows afspraken section when afspraken feature toggle is active', () => {
    toggleAfsprakenFeatureToggle(true);
    const state = getState({
      afspraken: [],
    });
    const KlantContactThema = createMijnContactThemaComponent(state);
    const screen = render(<KlantContactThema />);

    expect(
      screen.getByRole('heading', { name: 'Mijn afspraken bij een stadsloket' })
    ).toBeInTheDocument();
  });

  it('does not show afspraken section when afspraken feature toggle is inactive', () => {
    toggleAfsprakenFeatureToggle(false);
    const state = getState({
      afspraken: [],
    });
    const KlantContactThema = createMijnContactThemaComponent(state);
    const screen = render(<KlantContactThema />);

    expect(
      screen.queryByRole('heading', {
        name: 'Mijn afspraken bij een stadsloket',
      })
    ).not.toBeInTheDocument();
  });

  test('shows the page title and the sections in the order of the wireframe', () => {
    toggleAfsprakenFeatureToggle(true);
    const state = getState({
      communicatievoorkeuren: { standaardContactgegevens: {} },
    });

    const KlantContactThema = createMijnContactThemaComponent(state);
    const screen = render(<KlantContactThema />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Mijn contact met de gemeente',
      })
    ).toBeInTheDocument();

    const sections = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
      .filter((text) =>
        [
          'Mijn contactgegevens',
          'Mijn communicatievoorkeuren',
          'Mijn afspraken bij een stadsloket',
          'Mijn contactmomenten',
        ].includes(text ?? '')
      );

    expect(sections).toEqual([
      'Mijn contactgegevens',
      'Mijn communicatievoorkeuren',
      'Mijn afspraken bij een stadsloket',
      'Mijn contactmomenten',
    ]);
  });

  test('shows communicatievoorkeuren section when communicatievoorkeuren exist', async () => {
    const state = getState({
      communicatievoorkeuren: {
        standaardContactgegevens: {
          Email: {
            id: 'email-1',
            type: 'Email',
            value: 'test@example.com',
            isVerified: true,
            dateModified: '2026-06-01T12:00:00.000Z',
            dateModifiedFormatted: '1 juni 2026',
          },
        },
        aangeslotenDiensten: [
          {
            id: 'dienst-1',
            beschrijving: 'Belastingen',
          },
        ],
      },
    });

    const KlantContactThema = createMijnContactThemaComponent(state);
    const screen = render(<KlantContactThema />);

    expect(
      screen.getByRole('heading', { name: 'Mijn communicatievoorkeuren' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Mijn contactgegevens' })
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('table', {
          name: 'Mijn communicatievoorkeuren per thema',
        })
      ).getByText('Belastingen')
    ).toBeInTheDocument();
  });

  describe('zaakvoorkeuren per thema', () => {
    const ZAAK_IDENTIFICATIE = 'ZAAK-2026-0000000166';
    const originalZaakvoorkeurenToggle =
      themaConfig.featureToggle.zaakvoorkeuren.active;

    function getStateWithOpenZaakZaak(
      zaakKanaalVoorkeuren: Array<Record<string, unknown>>
    ) {
      return getState({
        communicatievoorkeuren: {
          standaardContactgegevens: {
            Telefoonnummer: {
              id: 'telefoon-1',
              type: 'Telefoonnummer',
              value: '0612345678',
              isVerified: true,
              dateModified: null,
              dateModifiedFormatted: null,
            },
          },
          zaakKanaalVoorkeuren,
          zaken: [
            {
              zaakIdentificatie: ZAAK_IDENTIFICATIE,
              omschrijving: 'Melding openbare ruimte',
            },
          ],
        },
      });
    }

    beforeEach(() => {
      (themaConfig.featureToggle.zaakvoorkeuren as { active: boolean }).active =
        true;
    });

    afterEach(() => {
      (themaConfig.featureToggle.zaakvoorkeuren as { active: boolean }).active =
        originalZaakvoorkeurenToggle;
    });

    test('shows the zaken from Open Zaak as a thema, following the standaardinstelling by default', () => {
      const KlantContactThema = createMijnContactThemaComponent(
        getStateWithOpenZaakZaak([])
      );
      const screen = render(<KlantContactThema />);

      const row = within(
        screen.getByRole('table', {
          name: 'Mijn communicatievoorkeuren per thema',
        })
      ).getByRole('row', { name: /Zaken/ });

      expect(within(row).getAllByText('standaard')).toHaveLength(2);
      expect(
        within(row).getByRole('button', { name: 'wijzig' })
      ).toBeInTheDocument();
    });

    test('does not show Erfpacht as a thema, because its zaken are not in Open Zaak', () => {
      const KlantContactThema = createMijnContactThemaComponent({
        ...getStateWithOpenZaakZaak([]),
        ERFPACHT: {
          status: 'OK',
          content: {
            dossiers: { dossiers: [] },
            zaken: [
              {
                zaakNummer: 'ZAAK-2025-0000011488',
                zaakOmschrijving: 'Wijzigen erfpacht',
              },
            ],
          },
        },
      } as unknown as AppState);
      const screen = render(<KlantContactThema />);

      expect(
        within(
          screen.getByRole('table', {
            name: 'Mijn communicatievoorkeuren per thema',
          })
        ).queryByRole('row', { name: /Erfpacht/ })
      ).not.toBeInTheDocument();
    });

    test('links the voorkeur of the BFF to the zaak on the zaakIdentificatie', () => {
      const KlantContactThema = createMijnContactThemaComponent(
        getStateWithOpenZaakZaak([
          {
            zaakIdentificatie: ZAAK_IDENTIFICATIE,
            contactgegeven: {
              id: 'zaakadres-1',
              type: 'Telefoonnummer',
              value: '0612345678',
              isVerified: true,
              dateModified: null,
              dateModifiedFormatted: null,
            },
          },
        ])
      );
      const screen = render(<KlantContactThema />);

      const row = within(
        screen.getByRole('table', {
          name: 'Mijn communicatievoorkeuren per thema',
        })
      ).getByRole('row', { name: /Zaken/ });

      // Enige zaak van het thema heeft een voorkeur, dus geen 'standaard' meer.
      expect(within(row).getAllByRole('cell')[2]).toHaveTextContent(
        /^sms: 0612345678/
      );
    });

    test('does not show a voorkeur of a zaak that is not in the thema', () => {
      const KlantContactThema = createMijnContactThemaComponent(
        getStateWithOpenZaakZaak([
          {
            zaakIdentificatie: 'Z-24-2238078',
            contactgegeven: {
              id: 'zaakadres-1',
              type: 'Telefoonnummer',
              value: '0612345678',
              isVerified: true,
              dateModified: null,
              dateModifiedFormatted: null,
            },
          },
        ])
      );
      const screen = render(<KlantContactThema />);

      const row = within(
        screen.getByRole('table', {
          name: 'Mijn communicatievoorkeuren per thema',
        })
      ).getByRole('row', { name: /Zaken/ });

      expect(within(row).getAllByText('standaard')).toHaveLength(2);
    });
  });

  test('shows partial error for failed dependencies', async () => {
    const state = getState({
      afspraken: [],
      contactmomenten: [],
      communicatievoorkeuren: null,
      failedDependencies: {
        afspraken: {
          status: 'ERROR',
          message: 'Afspraken dependency failed',
          content: null,
        },
        communicatievoorkeuren: {
          status: 'ERROR',
          message: 'Communicatievoorkeuren dependency failed',
          content: null,
        },
      },
    });

    const KlantContactThema = createMijnContactThemaComponent(state);
    const screen = render(<KlantContactThema />);

    const errorSection = screen
      .getByRole('heading', { name: 'Foutmelding' })
      .closest('section');

    expect(errorSection).not.toBeNull();
    expect(errorSection).toHaveTextContent(
      'Wij kunnen de volgende gegevens nu niet tonen:'
    );
    expect(errorSection).toHaveTextContent('- Uw overzicht van afspraken');
    expect(errorSection).toHaveTextContent(
      '- Uw overzicht van communicatievoorkeuren'
    );
  });
});
