import { ZaakKanaalVoorkeur } from '../KlantContact/Communicatievoorkeuren/ZaakKanaalVoorkeur.tsx';
import { useAppStateStore } from '../../../../../hooks/useAppStateStore.ts';
import { useZaakDetailData } from './useErfpachtZaakData.hook.ts';
import { Datalist, type Row } from '../../../../../components/Datalist/Datalist.tsx';
import { PageContentCell } from '../../../../../components/Page/Page.tsx';
import { TableV2 } from '../../../../../components/Table/TableV2.tsx';
import { ThemaDetailPagina } from '../../../../../components/Thema/ThemaDetailPagina.tsx';
import { useHTMLDocumentTitle } from '../../../../../hooks/useHTMLDocumentTitle.ts';

export function ErfpachtZaakDetail() {
  const standaardContactgegevens = useAppStateStore(
    (state) =>
      state.KLANT_CONTACT.content?.communicatievoorkeuren
        ?.standaardContactgegevens
  );

  const contactgegevens = Object.values(
    standaardContactgegevens ?? {}
  );
  const {
    zaak,
    dossiers,
    isLoading,
    isError,
    isLoadingThemaData,
    isErrorThemaData,
    themaId,
    title,
    breadcrumbs,
    tableConfig,
    themaConfig,
  } = useZaakDetailData();

  useHTMLDocumentTitle(themaConfig.detailPageZaak.route);

  const rows: Row[] = [
    { label: 'Zaaknummer', content: zaak?.zaakNummer ?? '-' },
    {
      label: 'Erfpachtdossier(s)',
      content: (
        <TableV2
          items={dossiers}
          displayProps={tableConfig['erfpacht-dossiers']?.displayProps ?? []}
        />
      ),
      isVisible: dossiers.length > 0,
    },
    {
      label: 'Resultaat',
      content: zaak?.resultaat,
      isVisible: !!zaak?.resultaat,
    },
  ];

  return (
    <ThemaDetailPagina
      themaId={themaId}
      title={title}
      zaak={zaak}
      isError={isError || isErrorThemaData}
      isLoading={isLoading || isLoadingThemaData}
      pageContentMain={
  !!zaak && (
    <PageContentCell spanWide={8}>
      <Datalist rows={rows} />

      {zaak.zaakNummer && (
        <ZaakKanaalVoorkeur
          zaakIdentificatie={zaak.zaakNummer}
          contactgegevens={contactgegevens}
        />
      )}
    </PageContentCell>
  )
}
      breadcrumbs={breadcrumbs}
      showStatusStepsSubstepHeading={false}
    />
  );
}
