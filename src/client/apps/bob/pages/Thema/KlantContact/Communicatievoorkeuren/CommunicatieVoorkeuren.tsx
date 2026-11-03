import { Heading, Paragraph } from '@amsterdam/design-system-react';

import {
  CONTACTGEGEVENS_ANCHOR,
  ContactgegevenByTypeLabels,
} from './CommunicatieVoorkeuren-config.ts';
import { CommunicatieVoorkeurenTabel } from './CommunicatieVoorkeurenTabel.tsx';
import { ContactgegevenValue } from './ContactgegevenValue.tsx';
import type { ZaakVoorkeurThema } from './useZaakVoorkeurThemas.ts';
import type {
  ContactgegevenFrontend,
  ContactgegevenPerTypeFrontend,
  ContactgegevenType,
  DienstSource,
  ZaakKanaalVoorkeurFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import { MaLink } from '../../../../../../components/MaLink/MaLink.tsx';

const NOTIFICATIE_UITLEG =
  'Via welk medium u geïnformeerd wilt worden als er bijvoorbeeld een bericht voor u klaar staat of een status van een product is veranderd.';

const CONTACTGEGEVEN_BLOKKEN = [
  {
    type: 'Email',
    uitleg:
      'Voor sommige diensten is het belangrijk dat het e-mailadres actief beheerd wordt.',
  },
  {
    type: 'Telefoonnummer',
    uitleg:
      'Voor sommige diensten is het belangrijk dat het telefoonnummer actief beheerd wordt.',
  },
  {
    type: 'ApplicatieId',
    uitleg:
      'Als u de Amsterdam App downloadt en toestemming geeft om meldingen van Mijn Amsterdam te versturen.',
  },
  {
    type: 'Berichtenbox',
    uitleg:
      'Als u de Berichtenbox toestemming heeft gegeven om berichten namens de gemeente Amsterdam te versturen.',
  },
] as const satisfies readonly { type: ContactgegevenType; uitleg: string }[];

function getContactgegeven(
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null,
  type: ContactgegevenType
): ContactgegevenFrontend {
  return (
    standaardContactgegevens?.[type] ?? {
      id: null,
      type,
      value: null,
      dateModified: null,
      dateModifiedFormatted: null,
    }
  );
}

type CommunicatieVoorkeurenProps = {
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null;
  aangeslotenDiensten?: DienstSource[];
  zaakKanaalVoorkeuren?: ZaakKanaalVoorkeurFrontend[];
  zaakThemas?: ZaakVoorkeurThema[];
};

export function CommunicatieVoorkeuren({
  standaardContactgegevens,
  aangeslotenDiensten,
  zaakKanaalVoorkeuren,
  zaakThemas,
}: CommunicatieVoorkeurenProps) {
  return (
    <>
      <section id={CONTACTGEGEVENS_ANCHOR} className="ams-mb-xl">
        <Heading level={2} className="ams-mb-s">
          Mijn contactgegevens
        </Heading>
        <Paragraph className="ams-mb-m">{NOTIFICATIE_UITLEG}</Paragraph>
        {CONTACTGEGEVEN_BLOKKEN.map(({ type, uitleg }) => (
          <div key={type} className="ams-mb-m">
            <Heading level={3} size="level-4">
              {ContactgegevenByTypeLabels[type]}
            </Heading>
            <Paragraph size="small" className="ams-mb-xs">
              {uitleg}
            </Paragraph>
            <ContactgegevenValue
              contactgegeven={getContactgegeven(standaardContactgegevens, type)}
            />
          </div>
        ))}
      </section>
      <section className="ams-mb-xl">
        <Heading level={2} className="ams-mb-s">
          Mijn communicatievoorkeuren
        </Heading>
        <Paragraph className="ams-mb-m">
          Nog niet alle diensten van de gemeente zijn aangesloten bij de
          generieke communicatievoorkeuren. Het kan dus zijn dat er nog elders
          binnen de gemeente contactgegevens van u worden gebruikt voor
          berichtgeving over thema&apos;s die niet hieronder staan benoemd.
          Heeft u daar vragen over, bel dan naar{' '}
          <MaLink href="tel:14020">14 020</MaLink>.
        </Paragraph>
        <CommunicatieVoorkeurenTabel
          standaardContactgegevens={standaardContactgegevens}
          aangeslotenDiensten={aangeslotenDiensten}
          zaakKanaalVoorkeuren={zaakKanaalVoorkeuren}
          zaakThemas={zaakThemas}
        />
      </section>
    </>
  );
}
