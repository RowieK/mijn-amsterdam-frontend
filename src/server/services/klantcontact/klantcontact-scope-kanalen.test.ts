import { describe, expect, it } from 'vitest';

import {
  getToegestaneKanalen,
  validateScopeKeuze,
} from './klantcontact-scope-kanalen.ts';
import type { ScopeKanaalConfig } from './klantcontact-scope-kanalen.ts';

// Alleen testdata: verzonnen scopes, geen echte gegevens.
const config: ScopeKanaalConfig = {
  'test-scope-a': ['Email', 'Sms'],
  'test-scope-b': ['Berichtenbox'],
  'test-scope-leeg': [],
};

describe('getToegestaneKanalen', () => {
  it('geeft de toegestane kanalen van een scope', () => {
    expect(getToegestaneKanalen(config, 'test-scope-a')).toEqual([
      'Email',
      'Sms',
    ]);
  });

  it('geeft standaard geen enkel kanaal voor een onbekende scope (privacy by default)', () => {
    expect(getToegestaneKanalen(config, 'onbekende-scope')).toEqual([]);
  });

  it('geeft geen kanaal voor een scope zonder toegestane kanalen', () => {
    expect(getToegestaneKanalen(config, 'test-scope-leeg')).toEqual([]);
  });
});

describe('validateScopeKeuze', () => {
  it('accepteert één toegestaan kanaal', () => {
    expect(validateScopeKeuze(config, 'test-scope-a', ['Email'])).toEqual({
      valid: true,
    });
  });

  it('weigert meer dan één kanaal voor een scope', () => {
    const result = validateScopeKeuze(config, 'test-scope-a', ['Email', 'Sms']);
    expect(result.valid).toBe(false);
  });

  it('weigert een kanaal dat voor de scope niet is toegestaan', () => {
    const result = validateScopeKeuze(config, 'test-scope-a', ['Brief']);
    expect(result.valid).toBe(false);
  });

  it('weigert elk kanaal voor een onbekende scope', () => {
    const result = validateScopeKeuze(config, 'onbekende-scope', ['Email']);
    expect(result.valid).toBe(false);
  });

  it('accepteert een lege keuze: standaard staat er geen kanaal open', () => {
    expect(validateScopeKeuze(config, 'test-scope-a', [])).toEqual({
      valid: true,
    });
  });
});
