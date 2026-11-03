import { useEffect, useState } from 'react';
import { useAppStateStore } from '../../../../../../hooks/useAppStateStore.ts';

import {
  Alert,
  Button,
  Heading,
  Paragraph,
} from '@amsterdam/design-system-react';

import {
  useSetZaakKanaalVoorkeur,
  useVerwijderZaakKanaalVoorkeur,
} from './useCommunicatieVoorkeuren.ts';
import type {
  ContactgegevenFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';

type ZaakKanaalVoorkeurProps = {
  zaakIdentificatie: string;
  contactgegevens: ContactgegevenFrontend[];
};

export function ZaakKanaalVoorkeur({
  zaakIdentificatie,
  contactgegevens,
}: ZaakKanaalVoorkeurProps) {
  const [gekozenContactgegeven, setGekozenContactgegeven] =
    useState('standaard');
  const zaakKanaalVoorkeuren = useAppStateStore(
  (state) =>
    state.KLANT_CONTACT.content?.communicatievoorkeuren
      ?.zaakKanaalVoorkeuren
);

const bestaandeVoorkeur = zaakKanaalVoorkeuren?.find(
  (voorkeur) =>
    voorkeur.zaakIdentificatie === zaakIdentificatie
);

useEffect(() => {
  setGekozenContactgegeven(
    bestaandeVoorkeur?.contactgegeven.id ?? 'standaard'
  );
}, [bestaandeVoorkeur?.contactgegeven?.id, zaakIdentificatie]);
  const [isSaved, setIsSaved] = useState(false);
  const [isDeleteError, setIsDeleteError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { fetch, isLoading, isError } = useSetZaakKanaalVoorkeur(
    (_contactgegeven, success) => {
      setIsSaved(success);
    }
  );

  const verwijderZaakKanaalVoorkeur =
    useVerwijderZaakKanaalVoorkeur(zaakIdentificatie);

  const geverifieerdeContactgegevens = contactgegevens.filter(
    (contactgegeven) =>
      contactgegeven.isVerified &&
      contactgegeven.value &&
      (contactgegeven.type === 'Email' ||
        contactgegeven.type === 'Telefoonnummer')
  );

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();
    setIsSaved(false);
    setIsDeleteError(false);

    if (gekozenContactgegeven === 'standaard') {
      setIsDeleting(true);

      try {
        const response = await verwijderZaakKanaalVoorkeur();
        setIsSaved(response.status === 'OK');
        setIsDeleteError(response.status !== 'OK');
      } catch {
        setIsDeleteError(true);
      } finally {
        setIsDeleting(false);
      }

      return;
    }

    const contactgegeven = geverifieerdeContactgegevens.find(
      (item) => item.id === gekozenContactgegeven
    );

    if (
      !contactgegeven?.value ||
      (contactgegeven.type !== 'Email' &&
        contactgegeven.type !== 'Telefoonnummer')
    ) {
      return;
    }

    fetch({
      payload: {
        zaakIdentificatie,
        kanaal: contactgegeven.type,
        value: contactgegeven.value,
      },
    });
  };

  return (
    <section className="ams-mb-l">
      <Heading level={3} className="ams-mb-s">
        Communicatievoorkeur voor deze zaak
      </Heading>

      <Paragraph className="ams-mb-m">
        Zaaknummer: {zaakIdentificatie}
      </Paragraph>

      {geverifieerdeContactgegevens.length === 0 && (
        <Alert
          severity="warning"
          heading="Geen geverifieerde contactgegevens"
          headingLevel={4}
        >
          <Paragraph>
          U heeft nog geen geverifieerd e-mailadres of
          mobiel telefoonnummer ingesteld.
        </Paragraph>
        <Paragraph>
          <a href="/mijn-contact">
          Ga naar Mijn contactgegevens om uw contactgegevens in te stellen.
          </a>
        </Paragraph>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <fieldset className="ams-mb-m">
          <legend>Waar wilt u notificaties ontvangen?</legend>

          <div className="ams-mb-s">
            <label>
              <input
                type="radio"
                name={`kanaal-${zaakIdentificatie}`}
                value="standaard"
                checked={gekozenContactgegeven === 'standaard'}
                onChange={() => {
                  setGekozenContactgegeven('standaard');
                  setIsSaved(false);
                }}
              />
              Standaardinstelling gebruiken
            </label>
          </div>

          {geverifieerdeContactgegevens.map((contactgegeven) => (
            <div className="ams-mb-s" key={contactgegeven.id}>
              <label>
                <input
                  type="radio"
                  name={`kanaal-${zaakIdentificatie}`}
                  value={contactgegeven.id ?? ''}
                  checked={
                    gekozenContactgegeven === contactgegeven.id
                  }
                  onChange={() => {
                    setGekozenContactgegeven(
                      contactgegeven.id ?? 'standaard'
                    );
                    setIsSaved(false);
                  }}
                />
                {contactgegeven.type === 'Email'
                  ? 'E-mail'
                  : 'SMS'}
                {' — '}
                {contactgegeven.value}
              </label>
            </div>
          ))}
        </fieldset>

        <Button
          type="submit"
          variant="primary"
          disabled={isLoading || isDeleting}
        >
          {isLoading || isDeleting ? 'Bezig...' : 'Opslaan'}
        </Button>
      </form>

      {isSaved && (
        <Alert heading="Voorkeur opgeslagen" headingLevel={4}>
          <Paragraph>
            Uw communicatievoorkeur is bijgewerkt.
          </Paragraph>
        </Alert>
      )}

      {(isError || isDeleteError) && (
        <Alert
          severity="error"
          heading="Opslaan mislukt"
          headingLevel={4}
        >
          <Paragraph>
            Uw communicatievoorkeur kon niet worden opgeslagen.
            Probeer het later opnieuw.
          </Paragraph>
        </Alert>
      )}
    </section>
  );
}
