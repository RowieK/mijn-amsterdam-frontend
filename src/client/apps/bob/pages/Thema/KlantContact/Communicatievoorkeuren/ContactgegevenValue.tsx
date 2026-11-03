import { useState } from 'react';

import { Alert, Badge, Paragraph } from '@amsterdam/design-system-react';
import { generatePath } from 'react-router';

import { ContactgegevenTypeEnum } from './CommunicatieVoorkeuren-config.ts';
import styles from './CommunicatieVoorkeuren.module.scss';
import { useCommunicatieVoorkeurVerwijderen } from './useCommunicatieVoorkeuren.ts';
import type { ContactgegevenFrontend } from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import { MaRouterLink } from '../../../../../../components/MaLink/MaLink.tsx';
import { ModalAndButton } from '../../../../../../components/Modal/Modal.tsx';
import { Spinner } from '../../../../../../components/Spinner/Spinner.tsx';
import {
  themaConfig,
  type InstelAction,
} from '../KlantContact-thema-config.ts';

type CommunicatieMediumValueProps = {
  contactgegeven: ContactgegevenFrontend;
  noValueText?: string;
};

function Value({
  contactgegeven,
  noValueText = 'Nog niet ingesteld',
}: CommunicatieMediumValueProps) {
  return (
    <>{contactgegeven.value ? contactgegeven.value : <em>{noValueText}</em>} </>
  );
}

const REMOVE_TEXTS = {
  Email: {
    buttonLabel: 'verwijder',
    title: 'E-mailadres verwijderen',
    question:
      'Weet u zeker dat u dit e-mailadres wilt verwijderen? U ontvangt dan geen e-mails meer van de gemeente Amsterdam.',
    error:
      'Er is iets misgegaan bij het verwijderen van dit e-mailadres. Probeer het later opnieuw.',
  },
  ApplicatieId: {
    buttonLabel: 'ontkoppel',
    title: 'Amsterdam App ontkoppelen',
    question:
      'Weet u zeker dat u de Amsterdam App wilt ontkoppelen? U ontvangt dan geen meldingen meer van Mijn Amsterdam in de app.',
    error:
      'Er is iets misgegaan bij het ontkoppelen van de Amsterdam App. Probeer het later opnieuw.',
  },
} as const;

function ContactgegevenRemoveModal({
  contactgegeven,
  texts,
}: {
  contactgegeven: ContactgegevenFrontend;
  texts: (typeof REMOVE_TEXTS)[keyof typeof REMOVE_TEXTS];
}) {
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const handleDelete = useCommunicatieVoorkeurVerwijderen(contactgegeven);

  return (
    <ModalAndButton
      buttonLabel={texts.buttonLabel}
      buttonVariant="ma-link-like"
      modal={{ title: texts.title }}
      actions={[
        {
          label: isLoading ? (
            <>
              <Spinner /> Bezig met verwijderen...
            </>
          ) : (
            'Ja, verwijderen'
          ),
          disabled: isLoading,
          buttonVariant: 'primary',
          onClick: async () => {
            setIsError(false);
            setIsLoading(true);
            const response = await handleDelete();
            setIsLoading(false);
            if (response.status !== 'OK') {
              setIsError(true);
              return false;
            }

            return true;
          },
          doCloseModalOnClick: true,
        },
        {
          label: 'Nee, niet verwijderen',
          buttonVariant: 'tertiary',
          doCloseModalOnClick: true,
        },
      ]}
    >
      <Paragraph className="ams-mb-m">{texts.question}</Paragraph>
      {isError && (
        <Alert
          severity="error"
          className="ams-mb-m"
          heading="Verwijderen mislukt"
          headingLevel={2}
        >
          <Paragraph>{texts.error}</Paragraph>
        </Alert>
      )}
    </ModalAndButton>
  );
}

type ContactgegevenValueProps = {
  contactgegeven: ContactgegevenFrontend;
};

export function ContactgegevenValue({
  contactgegeven,
}: ContactgegevenValueProps) {
  const getRoute = (step: '1' | '2', action: InstelAction = 'instellen') =>
    generatePath(themaConfig.detailPageContactgegevenInstellen.route.path, {
      contactgegeven: contactgegeven.type,
      step,
      action,
    });

  const hasValue = !!contactgegeven.value;

  switch (contactgegeven.type) {
    case ContactgegevenTypeEnum.Email:
    case ContactgegevenTypeEnum.Telefoonnummer: {
      const isEmail = contactgegeven.type === ContactgegevenTypeEnum.Email;
      return (
        <div>
          {!isEmail && hasValue && (
            <span className={styles.Muted}>standaard: </span>
          )}
          <Value contactgegeven={contactgegeven} />
          {hasValue && contactgegeven.isVerified && (
            <>(laatst gevalideerd op {contactgegeven.dateModifiedFormatted})</>
          )}
          {hasValue && !contactgegeven.isVerified && (
            <>
              <Badge label="!" color="red" />{' '}
              {isEmail ? 'Dit e-mailadres' : 'Dit telefoonnummer'} is nog niet
              gevalideerd.
            </>
          )}
          <span className={styles.Actions}>
            {hasValue ? (
              <>
                <MaRouterLink href={getRoute('1', 'valideren')}>
                  {contactgegeven.isVerified ? 'valideer opnieuw' : 'valideer'}
                </MaRouterLink>
                <MaRouterLink href={getRoute('1', 'wijzigen')}>
                  wijzig
                </MaRouterLink>
                {isEmail && (
                  <ContactgegevenRemoveModal
                    contactgegeven={contactgegeven}
                    texts={REMOVE_TEXTS.Email}
                  />
                )}
              </>
            ) : (
              <MaRouterLink href={getRoute('1', 'instellen')}>
                {isEmail
                  ? 'Geef uw e-mailadres aan ons door'
                  : 'Geef uw mobiele telefoonnummer aan ons door'}
              </MaRouterLink>
            )}
          </span>
        </div>
      );
    }
    case ContactgegevenTypeEnum.ApplicatieId: {
      return (
        <div>
          {hasValue && <>Amsterdam App ID: </>}
          <Value
            contactgegeven={contactgegeven}
            noValueText="Nog niet gekoppeld"
          />
          {hasValue && contactgegeven.isVerified && (
            <>(gedownload op {contactgegeven.dateModifiedFormatted})</>
          )}
          {hasValue && (
            <span className={styles.Actions}>
              <ContactgegevenRemoveModal
                contactgegeven={contactgegeven}
                texts={REMOVE_TEXTS.ApplicatieId}
              />
            </span>
          )}
        </div>
      );
    }
    // De profielservice ondersteunt de berichtenbox nog niet (de BFF zet hem op disabled): er is nog niets om te koppelen.
    case ContactgegevenTypeEnum.Berichtenbox: {
      return (
        <div>
          <Value
            contactgegeven={contactgegeven}
            noValueText="Nog niet gekoppeld"
          />
        </div>
      );
    }
    case ContactgegevenTypeEnum.Postadres: {
      return (
        <div>
          <Value
            contactgegeven={contactgegeven}
            noValueText="Geen postadres bekend"
          />
        </div>
      );
    }
    default:
      return null;
  }
}
