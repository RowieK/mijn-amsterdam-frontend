import { UnorderedList } from '@amsterdam/design-system-react';
import { generatePath } from 'react-router';

import { LEEG_EMAILADRES } from './CommunicatieVoorkeuren-helpers.ts';
import { ContactgegevenValue } from './ContactgegevenValue.tsx';
import type { ContactgegevenFrontend } from '../../../../../../../server/services/klantcontact/klantcontact-profieldienst-types.ts';
import { MaRouterLink } from '../../../../../../components/MaLink/MaLink.tsx';
import { themaConfig } from '../KlantContact-thema-config.ts';

type EmailadressenLijstProps = {
  emailadressen: ContactgegevenFrontend[];
};

// Alle e-mailadressen van de klant, elk met zijn eigen acties, en een link om er nog een toe te voegen.
export function EmailadressenLijst({ emailadressen }: EmailadressenLijstProps) {
  if (emailadressen.length === 0) {
    return <ContactgegevenValue contactgegeven={LEEG_EMAILADRES} />;
  }

  const toevoegenRoute = generatePath(
    themaConfig.detailPageContactgegevenInstellen.route.path,
    { contactgegeven: 'Email', step: '1', action: 'toevoegen' }
  );

  return (
    <>
      <UnorderedList markers={false} className="ams-mb-xs">
        {emailadressen.map((emailadres) => (
          <UnorderedList.Item key={emailadres.id}>
            <ContactgegevenValue contactgegeven={emailadres} />
          </UnorderedList.Item>
        ))}
      </UnorderedList>
      <MaRouterLink href={toevoegenRoute}>
        Voeg nog een e-mailadres toe
      </MaRouterLink>
    </>
  );
}
