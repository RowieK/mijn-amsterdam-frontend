import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunicatieVoorkeuren } from './CommunicatieVoorkeuren.tsx';
import type { ZaakVoorkeurThema } from './useZaakVoorkeurThemas.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenPerTypeFrontend,
  ZaakKanaalVoorkeurFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import type { KlantcontactResponseData } from '../../../../../../../server/services/klantcontact/klantcontact.types.ts';
import { bffApi } from '../../../../../../../testing/utils.ts';
import type { ApiResponse } from '../../../../../../../universal/helpers/api.ts';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';
import { themaConfig } from '../KlantContact-thema-config.ts';

const ZAAK_1 = 'ZAAK-2025-0000011488';
const ZAAK_2 = 'ZAAK-2025-0000010602';

function createContactgegeven(
  contactgegeven: Pick<ContactgegevenFrontend, 'type' | 'value'> &
    Partial<ContactgegevenFrontend>
): ContactgegevenFrontend {
  return {
    id: `${contactgegeven.type.toLowerCase()}-1`,
    isVerified: true,
    dateModified: '2026-06-01T10:00:00.000Z',
    dateModifiedFormatted: '1 juni 2026',
    ...contactgegeven,
  };
}

function getStandaardContactgegevens(
  overrides: Partial<ContactgegevenPerTypeFrontend> = {}
): ContactgegevenPerTypeFrontend {
  return {
    Email: createContactgegeven({
      id: 'email-1',
      type: 'Email',
      value: 'test@example.com',
    }),
    Telefoonnummer: createContactgegeven({
      id: 'telefoon-1',
      type: 'Telefoonnummer',
      value: '0612345678',
    }),
    ApplicatieId: createContactgegeven({
      id: 'app-1',
      type: 'ApplicatieId',
      value: '8593619876',
    }),
    Postadres: createContactgegeven({ type: 'Postadres', value: null }),
    Berichtenbox: createContactgegeven({
      id: null,
      type: 'Berichtenbox',
      value: null,
      disabled: true,
    }),
    ...overrides,
  };
}

const zaakThemas: ZaakVoorkeurThema[] = [
  {
    id: 'ERFPACHT',
    title: 'Erfpacht',
    route: '/erfpacht',
    zaken: [
      { zaakIdentificatie: ZAAK_1, omschrijving: 'Wijzigen erfpachtrecht' },
      { zaakIdentificatie: ZAAK_2, omschrijving: 'Overdracht erfpachtrecht' },
    ],
  },
];

// Zoals de BFF het teruggeeft (ZaakKanaalVoorkeurFrontend): het zaakadres is een eigen record met een eigen id.
function createVoorkeur(
  zaakIdentificatie: string,
  contactgegeven: Pick<ContactgegevenFrontend, 'type' | 'value'> &
    Partial<ContactgegevenFrontend>
): ZaakKanaalVoorkeurFrontend {
  return {
    zaakIdentificatie,
    contactgegeven: createContactgegeven({
      id: 'zaakadres-1',
      ...contactgegeven,
    }),
  };
}

const smsVoorkeur = createVoorkeur(ZAAK_1, {
  type: 'Telefoonnummer',
  value: '0612345678',
});

function setStateInStore(zaakKanaalVoorkeuren: ZaakKanaalVoorkeurFrontend[]) {
  useAppStateStore.setState({
    KLANT_CONTACT: {
      status: 'OK',
      content: {
        contactmomenten: [],
        afspraken: [],
        communicatievoorkeuren: {
          standaardContactgegevens: getStandaardContactgegevens(),
          zaakKanaalVoorkeuren,
        },
      },
    } as unknown as ApiResponse<KlantcontactResponseData>,
  });
}

function getZaakVoorkeurenInStore() {
  return useAppStateStore.getState().KLANT_CONTACT.content
    ?.communicatievoorkeuren?.zaakKanaalVoorkeuren;
}

function setZaakvoorkeurenToggle(active: boolean) {
  (themaConfig.featureToggle.zaakvoorkeuren as { active: boolean }).active =
    active;
}

type Props = Partial<Parameters<typeof CommunicatieVoorkeuren>[0]>;

function renderCommunicatieVoorkeuren(props: Props = {}) {
  return render(
    <MemoryRouter>
      <CommunicatieVoorkeuren
        standaardContactgegevens={getStandaardContactgegevens()}
        aangeslotenDiensten={[]}
        zaakKanaalVoorkeuren={[]}
        zaakThemas={[]}
        {...props}
      />
    </MemoryRouter>
  );
}

function getContactgegevens() {
  return screen
    .getByRole('heading', { level: 2, name: 'Mijn contactgegevens' })
    .closest('section') as HTMLElement;
}

// Het blok van één contactgegeven: de kop, de uitleg en de waarde met de acties.
function getBlock(heading: string) {
  return screen
    .getByRole('heading', { level: 3, name: heading })
    .closest('div') as HTMLElement;
}

function getTable() {
  return screen.getByRole('table', {
    name: 'Mijn communicatievoorkeuren per thema',
  });
}

function getErfpachtRow() {
  return within(getTable()).getByRole('row', { name: /Erfpacht/ });
}

describe('CommunicatieVoorkeuren', () => {
  const originalZaakvoorkeurenToggle =
    themaConfig.featureToggle.zaakvoorkeuren.active;

  beforeEach(() => {
    vi.clearAllMocks();
    setStateInStore([]);
  });

  afterEach(() => {
    setZaakvoorkeurenToggle(originalZaakvoorkeurenToggle);
  });

  describe('Mijn contactgegevens', () => {
    it('toont de blokken uit het wireframe, met uitleg en zonder postadres', () => {
      renderCommunicatieVoorkeuren();

      expect(
        screen.getByRole('heading', { level: 2, name: 'Mijn contactgegevens' })
      ).toBeInTheDocument();

      expect(
        screen
          .getAllByRole('heading', { level: 3 })
          .map((heading) => heading.textContent)
      ).toEqual([
        'E-mailadres',
        'Mobiele telefoonnummer',
        'Amsterdam App',
        'Berichtenbox',
      ]);
      expect(
        screen.getByText(
          'Voor sommige diensten is het belangrijk dat het telefoonnummer actief beheerd wordt.'
        )
      ).toBeInTheDocument();
      expect(screen.queryByText('Postadres')).not.toBeInTheDocument();
    });

    it('toont bij een gevalideerd e-mailadres valideer opnieuw, wijzig en verwijder', () => {
      renderCommunicatieVoorkeuren();

      expect(getBlock('E-mailadres')).toHaveTextContent(
        'test@example.com (laatst gevalideerd op 1 juni 2026)'
      );
      expect(getBlock('Mobiele telefoonnummer')).toHaveTextContent(
        'standaard: 0612345678 (laatst gevalideerd op 1 juni 2026)'
      );

      const hrefs = within(getContactgegevens())
        .getAllByRole('link', { name: 'valideer opnieuw' })
        .map((link) => link.getAttribute('href'));
      expect(hrefs).toEqual([
        '/mijn-contact/contactgegeven-instellen/Email/1/valideren',
        '/mijn-contact/contactgegeven-instellen/Telefoonnummer/1/valideren',
      ]);
      expect(
        within(getContactgegevens())
          .getAllByRole('link', { name: 'wijzig' })
          .map((link) => link.getAttribute('href'))
      ).toEqual([
        '/mijn-contact/contactgegeven-instellen/Email/1/wijzigen',
        '/mijn-contact/contactgegeven-instellen/Telefoonnummer/1/wijzigen',
      ]);
      expect(screen.getByRole('button', { name: 'verwijder' })).toBeVisible();
    });

    it('toont bij een ongevalideerd e-mailadres valideer in plaats van valideer opnieuw', () => {
      renderCommunicatieVoorkeuren({
        standaardContactgegevens: getStandaardContactgegevens({
          Email: createContactgegeven({
            type: 'Email',
            value: 'test@example.com',
            isVerified: false,
          }),
        }),
      });

      expect(
        screen.getByText(/Dit e-mailadres is nog niet gevalideerd/)
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'valideer' })).toHaveAttribute(
        'href',
        '/mijn-contact/contactgegeven-instellen/Email/1/valideren'
      );
    });

    it('vraagt om een telefoonnummer en e-mailadres als ze nog niet bekend zijn', () => {
      renderCommunicatieVoorkeuren({
        standaardContactgegevens: getStandaardContactgegevens({
          Email: createContactgegeven({ id: null, type: 'Email', value: null }),
          Telefoonnummer: createContactgegeven({
            id: null,
            type: 'Telefoonnummer',
            value: null,
          }),
        }),
      });

      expect(
        screen.getByRole('link', { name: 'Geef uw e-mailadres aan ons door' })
      ).toHaveAttribute(
        'href',
        '/mijn-contact/contactgegeven-instellen/Email/1/instellen'
      );
      expect(
        screen.getByRole('link', {
          name: 'Geef uw mobiele telefoonnummer aan ons door',
        })
      ).toHaveAttribute(
        'href',
        '/mijn-contact/contactgegeven-instellen/Telefoonnummer/1/instellen'
      );
    });

    it('toont de Amsterdam App met ontkoppel, en de berichtenbox als nog niet gekoppeld zonder actie', () => {
      renderCommunicatieVoorkeuren();

      expect(getBlock('Amsterdam App')).toHaveTextContent(
        'Amsterdam App ID: 8593619876 (gedownload op 1 juni 2026)'
      );
      expect(screen.getByRole('button', { name: 'ontkoppel' })).toBeVisible();

      const berichtenbox = getBlock('Berichtenbox');
      expect(
        within(berichtenbox).getByText('Nog niet gekoppeld')
      ).toBeVisible();
      expect(within(berichtenbox).queryByRole('link')).not.toBeInTheDocument();
      expect(
        within(berichtenbox).queryByRole('button')
      ).not.toBeInTheDocument();
    });

    it('verstuurt een delete-aanroep als de gebruiker het verwijderen bevestigt', async () => {
      const user = userEvent.setup();
      const deleteScope = bffApi
        .post('/services/klantcontact/contactgegeven/delete', /id=email-1/)
        .reply(200, { status: 'OK', content: null });

      renderCommunicatieVoorkeuren();

      await user.click(screen.getByRole('button', { name: 'verwijder' }));
      expect(
        screen.getByRole('heading', { name: 'E-mailadres verwijderen' })
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ja, verwijderen' }));

      await waitFor(() => {
        expect(deleteScope.isDone()).toBe(true);
      });
    });

    it('toont een foutmelding als het verwijderen mislukt', async () => {
      const user = userEvent.setup();
      const deleteScope = bffApi
        .post('/services/klantcontact/contactgegeven/delete', /id=email-1/)
        .reply(500, {
          status: 'ERROR',
          message: 'Delete failed',
          content: null,
        });

      renderCommunicatieVoorkeuren();

      await user.click(screen.getByRole('button', { name: 'verwijder' }));
      await user.click(screen.getByRole('button', { name: 'Ja, verwijderen' }));

      await waitFor(() => {
        expect(deleteScope.isDone()).toBe(true);
        expect(screen.getByText('Verwijderen mislukt')).toBeInTheDocument();
      });
      expect(
        screen.getByText(
          'Er is iets misgegaan bij het verwijderen van dit e-mailadres. Probeer het later opnieuw.'
        )
      ).toBeInTheDocument();
    });

    it('ontkoppelt de Amsterdam App na bevestiging', async () => {
      const user = userEvent.setup();
      const deleteScope = bffApi
        .post('/services/klantcontact/contactgegeven/delete', /id=app-1/)
        .reply(200, { status: 'OK', content: null });

      renderCommunicatieVoorkeuren();

      await user.click(screen.getByRole('button', { name: 'ontkoppel' }));
      expect(
        screen.getByRole('heading', { name: 'Amsterdam App ontkoppelen' })
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ja, verwijderen' }));

      await waitFor(() => {
        expect(deleteScope.isDone()).toBe(true);
      });
    });
  });

  describe('Mijn communicatievoorkeuren', () => {
    it('toont de kolommen uit het wireframe', () => {
      renderCommunicatieVoorkeuren();

      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Mijn communicatievoorkeuren',
        })
      ).toBeInTheDocument();

      const headers = within(getTable()).getAllByRole('columnheader');
      expect(headers.map((header) => header.textContent)).toEqual([
        expect.stringMatching(/^Thema/),
        expect.stringMatching(/^Bericht locaties/),
        expect.stringMatching(/^Notificaties ontvangen op/),
      ]);
      expect(screen.getByRole('link', { name: '14 020' })).toHaveAttribute(
        'href',
        'tel:14020'
      );
    });

    it('toont de rij Standaard instelling met de standaardkanalen en een link naar Mijn contactgegevens', () => {
      renderCommunicatieVoorkeuren();

      const row = within(getTable()).getByRole('row', {
        name: /Standaard instelling/,
      });
      expect(within(row).getByText('Mijn Amsterdam')).toBeInTheDocument();
      expect(row).toHaveTextContent(
        'test@example.com, sms: 0612345678, de AmsterdamApp'
      );
      expect(within(row).getByRole('link', { name: 'wijzig' })).toHaveAttribute(
        'href',
        '#mijn-contactgegevens'
      );
      expect(document.getElementById('mijn-contactgegevens')).toContainElement(
        screen.getByRole('heading', { name: 'Mijn contactgegevens' })
      );
    });

    it('toont aangesloten diensten met de standaardinstelling en zonder wijzig', () => {
      renderCommunicatieVoorkeuren({
        aangeslotenDiensten: [
          { id: 'parkeren', beschrijving: 'Parkeren' },
          { id: 'afval', beschrijving: 'Afval' },
        ],
      });

      const row = within(getTable()).getByRole('row', { name: /Parkeren/ });
      expect(within(row).getAllByText('standaard')).toHaveLength(2);
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
      expect(within(getTable()).getByText('Afval')).toBeInTheDocument();
    });

    it('toont een dienst niet dubbel als er al een thema met zaken met die naam is', () => {
      renderCommunicatieVoorkeuren({
        aangeslotenDiensten: [{ id: 'erfpacht', beschrijving: 'Erfpacht' }],
        zaakThemas,
      });

      expect(
        within(getTable()).getAllByRole('row', { name: /Erfpacht/ })
      ).toHaveLength(1);
    });

    it('toont een thema met zaken als link naar het thema, met standaard zolang er geen voorkeur is', () => {
      renderCommunicatieVoorkeuren({ zaakThemas });

      const row = getErfpachtRow();
      expect(
        within(row).getByRole('link', { name: 'Erfpacht' })
      ).toHaveAttribute('href', '/erfpacht');
      expect(within(row).getAllByText('standaard')).toHaveLength(2);
    });

    it('toont het gekozen kanaal naast standaard als een deel van de zaken een voorkeur heeft', () => {
      renderCommunicatieVoorkeuren({
        zaakThemas,
        zaakKanaalVoorkeuren: [smsVoorkeur],
      });

      expect(getErfpachtRow()).toHaveTextContent('standaard, sms: 0612345678');
    });

    it('toont geen standaard als elke zaak een voorkeur heeft', () => {
      renderCommunicatieVoorkeuren({
        zaakThemas,
        zaakKanaalVoorkeuren: [
          smsVoorkeur,
          createVoorkeur(ZAAK_2, {
            type: 'Telefoonnummer',
            value: '0612345678',
          }),
        ],
      });

      const cellen = within(getErfpachtRow()).getAllByRole('cell');
      expect(cellen[2]).toHaveTextContent(/^sms: 0612345678/);
    });
  });

  describe('keuze per zaak', () => {
    async function openModal(user: ReturnType<typeof userEvent.setup>) {
      await user.click(
        within(getErfpachtRow()).getByRole('button', { name: 'wijzig' })
      );
      expect(
        screen.getByRole('heading', { name: 'Notificaties voor Erfpacht' })
      ).toBeInTheDocument();
    }

    function getZaakForm(zaakIdentificatie: string) {
      const group = screen.getByRole('group', {
        name: new RegExp(zaakIdentificatie),
      });
      return {
        group,
        form: group.closest('form') as HTMLFormElement,
      };
    }

    beforeEach(() => {
      setZaakvoorkeurenToggle(true);
    });

    it('toont geen wijzig bij een thema als de toggle zaakvoorkeuren uit staat', () => {
      setZaakvoorkeurenToggle(false);
      renderCommunicatieVoorkeuren({ zaakThemas });

      expect(
        within(getErfpachtRow()).queryByRole('button', { name: 'wijzig' })
      ).not.toBeInTheDocument();
    });

    it('toont per zaak de keuze uit standaard en de gevalideerde kanalen', async () => {
      const user = userEvent.setup();
      renderCommunicatieVoorkeuren({ zaakThemas });
      await openModal(user);

      const { group } = getZaakForm(ZAAK_1);
      expect(
        within(group)
          .getAllByRole('radio')
          .map((radio) => radio.getAttribute('value'))
      ).toEqual(['standaard', 'Email', 'Telefoonnummer']);
      expect(
        within(group).getByRole('radio', { name: 'E-mail: test@example.com' })
      ).toBeInTheDocument();
      expect(
        within(group).getByRole('radio', { name: 'SMS: 0612345678' })
      ).toBeInTheDocument();
      expect(getZaakForm(ZAAK_2).group).toBeInTheDocument();
    });

    it('biedt een ongevalideerd kanaal niet aan als keuze', async () => {
      const user = userEvent.setup();
      renderCommunicatieVoorkeuren({
        zaakThemas,
        standaardContactgegevens: getStandaardContactgegevens({
          Telefoonnummer: createContactgegeven({
            type: 'Telefoonnummer',
            value: '0612345678',
            isVerified: false,
          }),
        }),
      });
      await openModal(user);

      expect(
        screen.queryByRole('radio', { name: 'SMS: 0612345678' })
      ).not.toBeInTheDocument();
    });

    it('wijst naar Mijn contactgegevens als er geen gevalideerd kanaal is', async () => {
      const user = userEvent.setup();
      renderCommunicatieVoorkeuren({
        zaakThemas,
        standaardContactgegevens: getStandaardContactgegevens({
          Email: createContactgegeven({ type: 'Email', value: null }),
          Telefoonnummer: createContactgegeven({
            type: 'Telefoonnummer',
            value: null,
          }),
        }),
      });
      await openModal(user);

      expect(
        screen.getAllByText(
          /U heeft nog geen gevalideerd e-mailadres of mobiel telefoonnummer/
        )
      ).toHaveLength(2); // één per zaak
    });

    it('selecteert de bestaande voorkeur op kanaal en waarde, ook al heeft het zaakadres een ander id', async () => {
      const user = userEvent.setup();
      renderCommunicatieVoorkeuren({
        zaakThemas,
        zaakKanaalVoorkeuren: [smsVoorkeur],
      });
      await openModal(user);

      const { group, form } = getZaakForm(ZAAK_1);
      expect(
        within(group).getByRole('radio', { name: 'SMS: 0612345678' })
      ).toBeChecked();
      expect(
        within(form).getByRole('button', { name: 'Opslaan' })
      ).toBeDisabled();
      expect(
        within(form).getByText(/Huidige keuze: SMS: 0612345678/)
      ).toBeVisible();

      // De andere zaak heeft geen voorkeur en volgt de standaardinstelling.
      expect(
        within(getZaakForm(ZAAK_2).group).getByRole('radio', {
          name: 'Standaardinstelling gebruiken',
        })
      ).toBeChecked();
    });

    it('zet de voorkeur met de payload die de BFF verwacht en bewaart het antwoord van de BFF', async () => {
      const user = userEvent.setup();
      const voorkeur = createVoorkeur(ZAAK_1, {
        id: 'nieuw-zaakadres',
        type: 'Telefoonnummer',
        value: '0612345678',
        isVerified: false,
      });
      const setScope = bffApi
        .post('/services/klantcontact/zaakvoorkeur/set', {
          zaakIdentificatie: ZAAK_1,
          kanaal: 'Telefoonnummer',
          value: '0612345678',
        })
        .reply(200, { status: 'OK', content: voorkeur });

      renderCommunicatieVoorkeuren({ zaakThemas });
      await openModal(user);

      const { group, form } = getZaakForm(ZAAK_1);
      const opslaan = within(form).getByRole('button', { name: 'Opslaan' });
      expect(opslaan).toBeDisabled();

      await user.click(
        within(group).getByRole('radio', { name: 'SMS: 0612345678' })
      );
      await user.click(opslaan);

      await waitFor(() => {
        expect(setScope.isDone()).toBe(true);
        expect(screen.getByText('Voorkeur opgeslagen')).toBeInTheDocument();
      });
      expect(getZaakVoorkeurenInStore()).toEqual([voorkeur]);
    });

    it('verwijdert de voorkeur van de zaak als de gebruiker terugkeert naar standaard', async () => {
      const user = userEvent.setup();
      const andereVoorkeur = createVoorkeur(ZAAK_2, {
        type: 'Email',
        value: 'test@example.com',
      });
      setStateInStore([smsVoorkeur, andereVoorkeur]);
      const deleteScope = bffApi
        .post('/services/klantcontact/zaakvoorkeur/delete', {
          zaakIdentificatie: ZAAK_1,
        })
        .reply(200, { status: 'OK', content: null });

      renderCommunicatieVoorkeuren({
        zaakThemas,
        zaakKanaalVoorkeuren: [smsVoorkeur, andereVoorkeur],
      });
      await openModal(user);

      const { group, form } = getZaakForm(ZAAK_1);
      await user.click(
        within(group).getByRole('radio', {
          name: 'Standaardinstelling gebruiken',
        })
      );
      await user.click(within(form).getByRole('button', { name: 'Opslaan' }));

      await waitFor(() => {
        expect(deleteScope.isDone()).toBe(true);
        expect(screen.getByText('Voorkeur opgeslagen')).toBeInTheDocument();
      });
      expect(getZaakVoorkeurenInStore()).toEqual([andereVoorkeur]);
    });

    it('toont een foutmelding en behoudt de voorkeur als de BFF weigert (zoals zolang de zaakcontrole van WP8 ontbreekt)', async () => {
      const user = userEvent.setup();
      setStateInStore([smsVoorkeur]);
      const setScope = bffApi
        .post('/services/klantcontact/zaakvoorkeur/set')
        .reply(503, {
          status: 'ERROR',
          message: 'Controleren van de zaak mislukt',
          content: null,
        });

      renderCommunicatieVoorkeuren({
        zaakThemas,
        zaakKanaalVoorkeuren: [smsVoorkeur],
      });
      await openModal(user);

      const { group, form } = getZaakForm(ZAAK_1);
      await user.click(
        within(group).getByRole('radio', { name: 'E-mail: test@example.com' })
      );
      await user.click(within(form).getByRole('button', { name: 'Opslaan' }));

      await waitFor(() => {
        expect(setScope.isDone()).toBe(true);
        expect(screen.getByText('Opslaan mislukt')).toBeInTheDocument();
      });
      expect(screen.queryByText('Voorkeur opgeslagen')).not.toBeInTheDocument();
      expect(getZaakVoorkeurenInStore()).toEqual([smsVoorkeur]);
    });
  });
});
