import { Paragraph, Table } from '@amsterdam/design-system-react';

import { CONTACTGEGEVENS_ANCHOR } from './CommunicatieVoorkeuren-config.ts';
import {
  getStandaardNotificatieKanalen,
  getZaakThemaNotificaties,
} from './CommunicatieVoorkeuren-helpers.ts';
import styles from './CommunicatieVoorkeuren.module.scss';
import type { ZaakVoorkeurThema } from './useZaakVoorkeurThemas.ts';
import { ZaakKanaalVoorkeur } from './ZaakKanaalVoorkeur.tsx';
import type {
  ContactgegevenPerTypeFrontend,
  DienstSource,
  ZaakKanaalVoorkeurFrontend,
} from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import {
  MaLink,
  MaRouterLink,
} from '../../../../../../components/MaLink/MaLink.tsx';
import { ModalAndButton } from '../../../../../../components/Modal/Modal.tsx';
import { themaConfig } from '../KlantContact-thema-config.ts';

const STANDAARD = 'standaard';

type CommunicatieVoorkeurenTabelProps = {
  standaardContactgegevens: ContactgegevenPerTypeFrontend | null;
  aangeslotenDiensten?: DienstSource[];
  zaakKanaalVoorkeuren?: ZaakKanaalVoorkeurFrontend[];
  zaakThemas?: ZaakVoorkeurThema[];
};

function ColumnHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Table.HeaderCell scope="col" className={styles.ColumnHeader}>
      {title}
      <Paragraph size="small" className={styles.ColumnDescription}>
        {description}
      </Paragraph>
    </Table.HeaderCell>
  );
}

export function CommunicatieVoorkeurenTabel({
  standaardContactgegevens,
  aangeslotenDiensten = [],
  zaakKanaalVoorkeuren = [],
  zaakThemas = [],
}: CommunicatieVoorkeurenTabelProps) {
  const isZaakVoorkeurActive = themaConfig.featureToggle.zaakvoorkeuren.active;
  const standaardKanalen = getStandaardNotificatieKanalen(
    standaardContactgegevens
  );

  // Een dienst die al als thema met zaken in de tabel staat, hoeft er niet nog een keer in.
  const themaTitles = new Set(
    zaakThemas.map(({ title }) => title.toLowerCase())
  );
  const diensten = aangeslotenDiensten.filter(
    ({ beschrijving }) => !themaTitles.has(beschrijving.toLowerCase())
  );

  return (
    <Table>
      <Table.Caption className="ams-visually-hidden">
        Mijn communicatievoorkeuren per thema
      </Table.Caption>
      <Table.Header>
        <Table.Row>
          <ColumnHeader
            title="Thema"
            description="Dit zijn de thema's waarvoor u via Mijn Amsterdam uw digitale voorkeur kunt doorgeven."
          />
          <ColumnHeader
            title="Bericht locaties"
            description="Belangrijke berichten zoals besluitdocumenten en vergunningen kunnen zowel per post als digitaal worden aangeboden."
          />
          <ColumnHeader
            title="Notificaties ontvangen op"
            description="Via welk medium u geïnformeerd wilt worden als er bijvoorbeeld een bericht voor u klaar staat of een status van een product is veranderd."
          />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell>
            <span className={styles.Muted}>Standaard instelling</span>
          </Table.Cell>
          <Table.Cell>Mijn Amsterdam</Table.Cell>
          <Table.Cell>
            {standaardKanalen.length ? (
              standaardKanalen.join(', ')
            ) : (
              <em>Nog niet ingesteld</em>
            )}
            <span className={styles.Actions}>
              <MaLink href={`#${CONTACTGEGEVENS_ANCHOR}`}>wijzig</MaLink>
            </span>
          </Table.Cell>
        </Table.Row>
        {zaakThemas.map((thema) => {
          const { heeftStandaard, kanalen } = getZaakThemaNotificaties(
            thema.zaken,
            zaakKanaalVoorkeuren
          );
          return (
            <Table.Row key={thema.id}>
              <Table.Cell>
                <MaRouterLink href={thema.route}>{thema.title}</MaRouterLink>
              </Table.Cell>
              <Table.Cell>{STANDAARD}</Table.Cell>
              <Table.Cell>
                {[heeftStandaard && STANDAARD, ...kanalen]
                  .filter(Boolean)
                  .join(', ')}
                {isZaakVoorkeurActive && (
                  <span className={styles.Actions}>
                    <ModalAndButton
                      buttonLabel="wijzig"
                      buttonVariant="ma-link-like"
                      modal={{ title: `Notificaties voor ${thema.title}` }}
                    >
                      <Paragraph className="ams-mb-m">
                        Kies per zaak waar u notificaties over de voortgang van
                        uw zaak wilt ontvangen.
                      </Paragraph>
                      {thema.zaken.map((zaak) => (
                        <ZaakKanaalVoorkeur
                          key={zaak.zaakIdentificatie}
                          zaakIdentificatie={zaak.zaakIdentificatie}
                          omschrijving={zaak.omschrijving}
                          standaardContactgegevens={standaardContactgegevens}
                          voorkeur={zaakKanaalVoorkeuren.find(
                            (voorkeur) =>
                              voorkeur.zaakIdentificatie ===
                              zaak.zaakIdentificatie
                          )}
                        />
                      ))}
                    </ModalAndButton>
                  </span>
                )}
              </Table.Cell>
            </Table.Row>
          );
        })}
        {diensten.map((dienst) => (
          <Table.Row key={dienst.id}>
            <Table.Cell>{dienst.beschrijving}</Table.Cell>
            <Table.Cell>{STANDAARD}</Table.Cell>
            <Table.Cell>{STANDAARD}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
