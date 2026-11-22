import { describe, expect, it } from 'vitest';

import type { ContactgegevenFrontend } from './klantcontact-profieldienst-types.ts';
import type { ScopeKanaalConfig } from './klantcontact-scope-kanalen.ts';
import {
  bepaalEffectieveVoorkeur,
  validateThemaKeuze,
} from './klantcontact-thema-voorkeur.ts';
import type { ThemaKanaalVoorkeurFrontend } from './klantcontact-thema-voorkeur.ts';

// Alleen testdata: verzonnen thema's, zaken en adressen.
function getContactgegeven(
  overrides: Partial<ContactgegevenFrontend> = {}
): ContactgegevenFrontend {
  return {
    id: 'cg-1',
    type: 'Email',
    value: 'test-a@example.org',
    isVerified: true,
    dateModified: null,
    dateModifiedFormatted: null,
    ...overrides,
  };
}

const zaakVoorkeur = {
  zaakIdentificatie: 'TEST-ZAAK-1',
  contactgegeven: getContactgegeven({
    id: 'cg-zaak',
    value: 'zaak@example.org',
  }),
};

const themaVoorkeur: ThemaKanaalVoorkeurFrontend = {
  themaId: 'test-thema-a',
  contactgegeven: getContactgegeven({
    id: 'cg-thema',
    value: 'thema@example.org',
  }),
};

describe('bepaalEffectieveVoorkeur', () => {
  it('geeft de keuze voor de zaak voorrang boven de keuze voor het thema', () => {
    expect(bepaalEffectieveVoorkeur(zaakVoorkeur, themaVoorkeur)).toEqual({
      niveau: 'zaak',
      contactgegeven: zaakVoorkeur.contactgegeven,
    });
  });

  it('gebruikt de keuze voor het thema als de zaak geen eigen keuze heeft', () => {
    expect(bepaalEffectieveVoorkeur(undefined, themaVoorkeur)).toEqual({
      niveau: 'thema',
      contactgegeven: themaVoorkeur.contactgegeven,
    });
  });

  it('valt terug op de zaakkeuze als de keuze voor het thema is verwijderd', () => {
    expect(bepaalEffectieveVoorkeur(zaakVoorkeur, undefined)).toEqual({
      niveau: 'zaak',
      contactgegeven: zaakVoorkeur.contactgegeven,
    });
  });

  it('valt terug op standaard als er geen keuze is voor zaak of thema', () => {
    expect(bepaalEffectieveVoorkeur(undefined, undefined)).toEqual({
      niveau: 'standaard',
      contactgegeven: null,
    });
  });
});

describe('validateThemaKeuze', () => {
  const config: ScopeKanaalConfig = {
    'test-thema-a': ['Email', 'Sms'],
    'test-thema-b': ['Berichtenbox'],
    'test-thema-leeg': [],
  };

  it('accepteert e-mail als het thema e-mail toestaat', () => {
    expect(validateThemaKeuze(config, 'test-thema-a', 'Email')).toEqual({
      valid: true,
    });
  });

  it('behandelt Telefoonnummer als het scope-kanaal Sms', () => {
    expect(
      validateThemaKeuze(config, 'test-thema-a', 'Telefoonnummer')
    ).toEqual({ valid: true });
  });

  it('weigert een kanaal dat het thema niet toestaat', () => {
    expect(validateThemaKeuze(config, 'test-thema-b', 'Email').valid).toBe(
      false
    );
  });

  it('weigert elk kanaal voor een onbekend thema (privacy by default)', () => {
    expect(validateThemaKeuze(config, 'onbekend-thema', 'Email').valid).toBe(
      false
    );
  });

  it('weigert elk kanaal voor een thema zonder toegestane kanalen', () => {
    expect(validateThemaKeuze(config, 'test-thema-leeg', 'Email').valid).toBe(
      false
    );
  });
});
