import type {
  ContactgegevenFrontend,
  ThemaKanaalVoorkeurFrontend,
  ZaakKanaal,
  ZaakKanaalVoorkeurFrontend,
} from './klantcontact-profieldienst-types.ts';
import { validateScopeKeuze } from './klantcontact-scope-kanalen.ts';
import type {
  ScopeKanaal,
  ScopeKanaalConfig,
  ScopeKeuzeResult,
} from './klantcontact-scope-kanalen.ts';

export type { ThemaKanaalVoorkeurFrontend };

export type VoorkeurNiveau = 'zaak' | 'thema' | 'standaard';

export type EffectieveVoorkeur = {
  niveau: VoorkeurNiveau;
  contactgegeven: ContactgegevenFrontend | null;
};

// De zaakkanalen heten anders dan de kanalen in de scope-config: een telefoonnummer is een sms.
const ZAAK_KANAAL_NAAR_SCOPE_KANAAL = {
  Email: 'Email',
  Telefoonnummer: 'Sms',
} as const satisfies Record<ZaakKanaal, ScopeKanaal>;

// Een keuze voor de zaak gaat voor een keuze voor het thema. Zonder keuze volgt de zaak
// het standaardadres van de klant.
export function bepaalEffectieveVoorkeur(
  zaakVoorkeur: Pick<ZaakKanaalVoorkeurFrontend, 'contactgegeven'> | undefined,
  themaVoorkeur: Pick<ThemaKanaalVoorkeurFrontend, 'contactgegeven'> | undefined
): EffectieveVoorkeur {
  if (zaakVoorkeur) {
    return { niveau: 'zaak', contactgegeven: zaakVoorkeur.contactgegeven };
  }

  if (themaVoorkeur) {
    return { niveau: 'thema', contactgegeven: themaVoorkeur.contactgegeven };
  }

  return { niveau: 'standaard', contactgegeven: null };
}

// De toegestane kanalen per thema volgen de scope-kanalen (privacy by default: een onbekend
// thema staat geen enkel kanaal toe).
export function validateThemaKeuze(
  config: ScopeKanaalConfig,
  themaId: string,
  kanaal: ZaakKanaal
): ScopeKeuzeResult {
  return validateScopeKeuze(config, themaId, [
    ZAAK_KANAAL_NAAR_SCOPE_KANAAL[kanaal],
  ]);
}
