import { generatePath, useNavigate, useParams } from 'react-router';

import {
  getEmailadressen,
  LEEG_EMAILADRES,
} from './CommunicatieVoorkeuren-helpers.ts';
import {
  useCommunicatieVoorkeurInstellen,
  useCommunicatieVoorkeurVerwijderen,
} from './useCommunicatieVoorkeuren.ts';
import {
  ContactgegevenForm,
  ContactgegevenVerify,
} from './ValueInputAndValidation.tsx';
import { PageContentCell } from '../../../../../../components/Page/Page.tsx';
import { ThemaDetailPagina } from '../../../../../../components/Thema/ThemaDetailPagina.tsx';
import { useSessionStorage } from '../../../../../../hooks/storage.hook.ts';
import { useHTMLDocumentTitle } from '../../../../../../hooks/useHTMLDocumentTitle.ts';
import { useKlantcontactData } from '../useKlantcontactData.hook.tsx';
import { ContactgegevenTypeEnum } from './CommunicatieVoorkeuren-config.ts';
import { NotFound } from '../../../NotFound/NotFound.tsx';
import type { InstelAction } from '../KlantContact-thema-config.ts';

export function ContactgegevenInstellen() {
  const navigate = useNavigate();
  const { themaConfig, breadcrumbs, communicatievoorkeuren } =
    useKlantcontactData();
  const { contactgegevenType, contactgegevenId, title, routeConfig } =
    useCommunicatieVoorkeurInstellen();

  useHTMLDocumentTitle(routeConfig);

  const { step = '1', action = 'instellen' } = useParams<{
    step: string;
    action: InstelAction;
  }>();

  // Elk adres en elke toevoegactie heeft zijn eigen bewaarde waarde, zodat een afgebroken actie een andere niet
  // overschrijft. De gewone actie houdt de oorspronkelijke sleutel.
  let sleutelSuffix = '';
  if (contactgegevenId) {
    sleutelSuffix = `-${contactgegevenId}`;
  } else if (action === 'toevoegen') {
    sleutelSuffix = '-toevoegen';
  }
  const [valueLocal, setValueLocal] = useSessionStorage(
    `standaard-${contactgegevenType}-voorkeur-instellen${sleutelSuffix}`,
    ''
  );

  const emailadressen = getEmailadressen(
    communicatievoorkeuren?.standaardContactgegevens ?? null,
    communicatievoorkeuren?.emailadressen
  );
  // Bij wijzigen wordt het oude adres vervangen: na het valideren van het nieuwe adres verwijderen we het oude.
  const oudAdres =
    action === 'wijzigen' && contactgegevenId
      ? emailadressen.find((adres) => adres.id === contactgegevenId)
      : undefined;
  const verwijderOudAdres = useCommunicatieVoorkeurVerwijderen(
    oudAdres ?? LEEG_EMAILADRES
  );

  if (
    (contactgegevenType && !(contactgegevenType in ContactgegevenTypeEnum)) ||
    !contactgegevenType
  ) {
    return <NotFound />;
  }

  const getCurrentValue = () => {
    if (action === 'toevoegen') {
      return '';
    }

    if (contactgegevenType === 'Email' && contactgegevenId) {
      return emailadressen.find((adres) => adres.id === contactgegevenId)
        ?.value;
    }

    return communicatievoorkeuren?.standaardContactgegevens?.[
      contactgegevenType
    ]?.value;
  };
  const currentValue = getCurrentValue();

  function navigateToStep(step: '1' | '2') {
    navigate(
      generatePath(themaConfig.detailPageContactgegevenInstellen.route.path, {
        step,
        contactgegeven: contactgegevenType,
        action,
        ...(contactgegevenId && { id: contactgegevenId }),
      })
    );
  }

  return (
    <ThemaDetailPagina
      title={title}
      themaId={themaConfig.id}
      zaak={{}}
      isLoading={false}
      isError={false}
      breadcrumbs={breadcrumbs}
      pageContentMain={
        contactgegevenType && (
          <PageContentCell spanWide={8}>
            {step === '1' && (
              <ContactgegevenForm
                value={valueLocal || currentValue || ''}
                type={contactgegevenType}
                toevoegen={action === 'toevoegen'}
                bestaandeWaarden={emailadressen.flatMap(({ value }) =>
                  value ? [value] : []
                )}
                onCallback={({ type, value }, success) => {
                  setValueLocal(value ?? ''); // If we reload the page after setting the email in session storage, we can prefill the email field with the previously entered value.
                  if (success) {
                    navigateToStep('2');
                  }
                }}
              />
            )}
            {step === '2' && (
              <ContactgegevenVerify
                value={valueLocal}
                type={contactgegevenType}
                onVerified={async ({ value }) => {
                  const isAnderAdres =
                    !!oudAdres &&
                    oudAdres.value?.trim().toLowerCase() !==
                      value.trim().toLowerCase();

                  if (isAnderAdres) {
                    // Mislukt het opruimen, dan blijft het oude adres gewoon staan en kan de klant het zelf
                    // verwijderen. Het nieuwe adres is dan al gevalideerd.
                    try {
                      await verwijderOudAdres();
                    } catch {
                      // Bewust genegeerd: de klant gaat gewoon door naar het overzicht.
                    }
                  }
                  setValueLocal('');
                  navigate(themaConfig.route.path);
                }}
              />
            )}
          </PageContentCell>
        )
      }
    />
  );
}
