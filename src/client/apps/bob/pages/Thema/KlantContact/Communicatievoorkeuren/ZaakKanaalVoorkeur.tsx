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
  getKanaalSleutel,
  getVerifiedZaakKanalen,
} from './CommunicatieVoorkeuren-helpers.ts';
import {
  useSetZaakKanaalVoorkeur,
  useVerwijderZaakKanaalVoorkeur,
} from './useCommunicatieVoorkeuren.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenPerTypeFrontend,
  ThemaKanaalVoorkeurFrontend,
  ZaakKanaalVoorkeurFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import { bepaalEffectieveVoorkeur } from '../../../../../../../server/services/klantcontact/klantcontact-thema-voorkeur.ts';
import { Spinner } from '../../../../../../components/Spinner/Spinner.tsx';

const STANDAARD = 'standaard';

// De waarde `standaard`, of de sleutel van een kanaal (getKanaalSleutel).
type Keuze = string;

type ZaakKanaalVoorkeurProps = {
  zaakIdentificatie: string;
  omschrijving?: string;
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null;
  emailadressen?: ContactgegevenFrontend[];
  voorkeur?: ZaakKanaalVoorkeurFrontend;
  // De keuze voor het hele thema. De keuze voor de zaak zelf gaat voor.
  themaVoorkeur?: ThemaKanaalVoorkeurFrontend;
};

export function ZaakKanaalVoorkeur({
  zaakIdentificatie,
  omschrijving,
  standaardContactgegevens,
  emailadressen,
  voorkeur,
  themaVoorkeur,
}: ZaakKanaalVoorkeurProps) {
  const kanalen = getVerifiedZaakKanalen(
    standaardContactgegevens,
    emailadressen
  );
  const effectief = bepaalEffectieveVoorkeur(voorkeur, themaVoorkeur);

  // De voorkeur van de zaak is een eigen adres met dezelfde waarde als een standaardadres. Het id verschilt dus,
  // daarom wordt op kanaal en waarde vergeleken.
  const huidigKanaal = voorkeur
    ? findKanaalVoorContactgegeven(kanalen, voorkeur.contactgegeven)
    : undefined;
  const huidigeKeuze: Keuze | null = !voorkeur
    ? STANDAARD
    : ((huidigKanaal && getKanaalSleutel(huidigKanaal)) ?? null);

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
  } = useSetZaakKanaalVoorkeur((_voorkeur, success) => {
    setIsSaved(success);
  }, zaakIdentificatie);
  const verwijderVoorkeur = useVerwijderZaakKanaalVoorkeur(zaakIdentificatie);

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

    const kanaal = kanalen.find((k) => getKanaalSleutel(k) === keuze);

    if (kanaal) {
      setVoorkeur({
        payload: {
          zaakIdentificatie,
          kanaal: kanaal.type,
          value: kanaal.value,
        },
      });
    }
  }

  const name = `zaakvoorkeur-${zaakIdentificatie}`;
  const hasError = isSaveError || isDeleteError;

  return (
    <form onSubmit={handleSubmit} className="ams-mb-l">
      <FieldSet
        legend={
          omschrijving
            ? `${omschrijving} (${zaakIdentificatie})`
            : zaakIdentificatie
        }
      >
        {effectief.contactgegeven && (
          <Paragraph size="small" className="ams-mb-s">
            Huidige keuze: {formatZaakKanaal(effectief.contactgegeven)}
            {!effectief.contactgegeven.isVerified && ' (nog niet gevalideerd)'}
            {effectief.niveau === 'thema' && ' (ingesteld voor het hele thema)'}
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
            {themaVoorkeur
              ? 'De keuze voor het hele thema volgen'
              : 'Standaardinstelling gebruiken'}
          </Radio>
        </Field>
        {kanalen.map((kanaal) => (
          <Field key={getKanaalSleutel(kanaal)}>
            <Radio
              name={name}
              value={getKanaalSleutel(kanaal)}
              checked={keuze === getKanaalSleutel(kanaal)}
              onChange={() => {
                setKeuze(getKanaalSleutel(kanaal));
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
          <Paragraph>Uw voorkeur voor deze zaak is bijgewerkt.</Paragraph>
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
            Uw voorkeur voor deze zaak kon niet worden opgeslagen. Probeer het
            later opnieuw.
          </Paragraph>
        </Alert>
      )}
    </form>
  );
}
