import { Paragraph } from '@amsterdam/design-system-react';

import { Afspraken } from './Afspraken/Afspraken.tsx';
import { CommunicatieVoorkeuren } from './Communicatievoorkeuren/CommunicatieVoorkeuren.tsx';
import { useZaakVoorkeurThemas } from './Communicatievoorkeuren/useZaakVoorkeurThemas.ts';
import { ContactMomenten } from './Contactmomenten/ContactmomentenTable.tsx';
import { useKlantcontactData } from './useKlantcontactData.hook.tsx';
import { PageContentCell } from '../../../../../components/Page/Page.tsx';
import { ThemaPagina } from '../../../../../components/Thema/ThemaPagina.tsx';
import { getRedactedClass } from '../../../../../helpers/cobrowse.ts';
import { useHTMLDocumentTitle } from '../../../../../hooks/useHTMLDocumentTitle.ts';

const PAGE_TITLE = 'Mijn contact met de gemeente';

export function KlantContactThema() {
  const {
    themaConfig,
    isLoading,
    isError,
    dependencyErrors,
    communicatievoorkeuren,
    afspraken,
    contactmomenten,
  } = useKlantcontactData();
  const zaakThemas = useZaakVoorkeurThemas();

  const routeConfig = themaConfig.route;
  useHTMLDocumentTitle(routeConfig);

  const pageContentTop = (
    <PageContentCell spanWide={8}>
      <Paragraph>
        Hier regelt u uw contactvoorkeuren, zoals of u de post van de gemeente
        alleen digitaal wilt ontvangen, het aanpassen van uw afspraken met de
        gemeente en het wijzigen van uw e-mailadres of telefoonnummer.
      </Paragraph>
    </PageContentCell>
  );

  const isPartialError =
    dependencyErrors.afspraken ||
    dependencyErrors.contactmomenten ||
    dependencyErrors.communicatievoorkeuren;

  const pageContentErrorAlert = (
    <>
      Wij kunnen de volgende gegevens nu niet tonen:
      <br />
      {dependencyErrors.afspraken && <>- Uw overzicht van afspraken</>}
      {dependencyErrors.contactmomenten && (
        <>- Uw overzicht van contactmomenten</>
      )}
      {dependencyErrors.communicatievoorkeuren && (
        <>- Uw overzicht van communicatievoorkeuren</>
      )}
    </>
  );

  return (
    <ThemaPagina
      id={themaConfig.id}
      title={PAGE_TITLE}
      pageContentTop={pageContentTop}
      pageLinks={themaConfig.pageLinks}
      isPartialError={isPartialError}
      errorAlertContent={pageContentErrorAlert}
      pageContentMain={
        <>
          {communicatievoorkeuren !== null && (
            <PageContentCell
              spanWide={10}
              className={getRedactedClass(null, 'full')}
            >
              <CommunicatieVoorkeuren
                standaardContactgegevens={
                  communicatievoorkeuren?.standaardContactgegevens
                }
                aangeslotenDiensten={
                  communicatievoorkeuren?.aangeslotenDiensten
                }
                zaakKanaalVoorkeuren={
                  communicatievoorkeuren?.zaakKanaalVoorkeuren
                }
                zaakThemas={zaakThemas}
              />
            </PageContentCell>
          )}
          {themaConfig.featureToggle.afspraken.active && (
            <PageContentCell
              spanWide={10}
              className={getRedactedClass(null, 'full')}
            >
              <Afspraken
                afspraken={afspraken}
                isLoading={isLoading}
                heading="Mijn afspraken bij een stadsloket"
              />
            </PageContentCell>
          )}
          <ContactMomenten contactmomenten={contactmomenten} />
        </>
      }
      isError={!isPartialError && isError}
      isLoading={isLoading}
    />
  );
}
