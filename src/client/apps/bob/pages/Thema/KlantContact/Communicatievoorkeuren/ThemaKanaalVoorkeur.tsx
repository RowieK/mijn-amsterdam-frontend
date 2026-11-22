import { useEffect, useState } from 'react';

import {
  Alert,
  Button,
  Field,
  FieldSet,
  Paragraph,
  Radio,
} from '@amsterdam/design-system-react';

import {
  findKanaalVoorContactgegeven,
  formatZaakKanaal,
  getVerifiedZaakKanalen,
} from './CommunicatieVoorkeuren-helpers.ts';
import {
  useSetThemaKanaalVoorkeur,
  useVerwijderThemaKanaalVoorkeur,
} from './useCommunicatieVoorkeuren.ts';
import type {
  ContactgegevenPerTypeFrontend,
  ThemaKanaalVoorkeurFrontend,
  ZaakKanaal,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import { Spinner } from '../../../../../../components/Spinner/Spinner.tsx';

const STANDAARD = 'standaard';

type Keuze = typeof STANDAARD | ZaakKanaal;

type ThemaKanaalVoorkeurProps = {
  themaId: string;
  themaTitel: string;
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null;
  voorkeur?: ThemaKanaalVoorkeurFrontend;
};

// Eén keuze voor alle zaken van een thema. Een keuze voor een losse zaak gaat hier nog voor.
export function ThemaKanaalVoorkeur({
  themaId,
  themaTitel,
  standaardContactgegevens,
  voorkeur,
}: ThemaKanaalVoorkeurProps) {
  const kanalen = getVerifiedZaakKanalen(standaardContactgegevens);

  // Net als bij een zaak is de themakeuze een eigen adres met dezelfde waarde als een standaardadres.
  const huidigeKeuze: Keuze | null = voorkeur
    ? (findKanaalVoorContactgegeven(kanalen, voorkeur.contactgegeven)?.type ??
      null)
    : STANDAARD;

  const [keuze, setKeuze] = useState<Keuze | null>(huidigeKeuze);
  const [isSaved, setIsSaved] = useState(false);
  const [isDeleteError, setIsDeleteError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setKeuze(huidigeKeuze);
  }, [huidigeKeuze]);

  const {
    fetch: setVoorkeur,
    isLoading: isSaving,
    isError: isSaveError,
  } = useSetThemaKanaalVoorkeur((_voorkeur, success) => {
    setIsSaved(success);
  }, themaId);
  const verwijderVoorkeur = useVerwijderThemaKanaalVoorkeur(themaId);

  const isBusy = isSaving || isDeleting;
  const isChanged = keuze !== null && keuze !== huidigeKeuze;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaved(false);
    setIsDeleteError(false);

    if (keuze === STANDAARD) {
      setIsDeleting(true);
      const response = await verwijderVoorkeur();
      setIsDeleting(false);
      setIsSaved(response.status === 'OK');
      setIsDeleteError(response.status !== 'OK');
      return;
    }

    const kanaal = kanalen.find(({ type }) => type === keuze);

    if (kanaal) {
      setVoorkeur({
        payload: { themaId, kanaal: kanaal.type, value: kanaal.value },
      });
    }
  }

  const name = `themavoorkeur-${themaId}`;
  const hasError = isSaveError || isDeleteError;

  return (
    <form onSubmit={handleSubmit} className="ams-mb-l">
      <FieldSet legend={`Alle zaken van ${themaTitel}`}>
        {voorkeur && (
          <Paragraph size="small" className="ams-mb-s">
            Huidige keuze: {formatZaakKanaal(voorkeur.contactgegeven)}
            {!voorkeur.contactgegeven.isVerified && ' (nog niet gevalideerd)'}
          </Paragraph>
        )}
        <Field>
          <Radio
            name={name}
            value={STANDAARD}
            checked={keuze === STANDAARD}
            onChange={() => {
              setKeuze(STANDAARD);
              setIsSaved(false);
            }}
          >
            Standaardinstelling gebruiken
          </Radio>
        </Field>
        {kanalen.map((kanaal) => (
          <Field key={kanaal.type}>
            <Radio
              name={name}
              value={kanaal.type}
              checked={keuze === kanaal.type}
              onChange={() => {
                setKeuze(kanaal.type);
                setIsSaved(false);
              }}
            >
              {formatZaakKanaal(kanaal)}
            </Radio>
          </Field>
        ))}
      </FieldSet>
      {kanalen.length === 0 && (
        <Paragraph size="small" className="ams-mb-s">
          U heeft nog geen gevalideerd e-mailadres of mobiel telefoonnummer.
          Stel dit eerst in onder Mijn contactgegevens.
        </Paragraph>
      )}
      {isBusy ? (
        <Paragraph>
          <Spinner /> Bezig met opslaan...
        </Paragraph>
      ) : (
        <Button type="submit" disabled={!isChanged}>
          Opslaan
        </Button>
      )}
      {isSaved && !hasError && (
        <Alert
          className="ams-mt-s"
          heading="Voorkeur opgeslagen"
          headingLevel={4}
        >
          <Paragraph>
            Uw voorkeur voor alle zaken van {themaTitel} is bijgewerkt.
          </Paragraph>
        </Alert>
      )}
      {hasError && (
        <Alert
          className="ams-mt-s"
          severity="error"
          heading="Opslaan mislukt"
          headingLevel={4}
        >
          <Paragraph>
            Uw voorkeur voor dit thema kon niet worden opgeslagen. Probeer het
            later opnieuw.
          </Paragraph>
        </Alert>
      )}
    </form>
  );
}
