export type ScopeKanaal = 'Email' | 'Sms' | 'Berichtenbox' | 'Brief';

/**
 * Per scope (thema) de kanalen die een gemeente toestaat.
 * Een scope die ontbreekt of een lege lijst heeft, staat geen enkel kanaal toe
 * (privacy by default, AVG art. 25).
 */
export type ScopeKanaalConfig = Record<string, ScopeKanaal[]>;

export type ScopeKeuzeResult =
  { valid: true } | { valid: false; reason: string };

const MAX_KANALEN_PER_SCOPE = 1;

export function getToegestaneKanalen(
  config: ScopeKanaalConfig,
  scope: string
): ScopeKanaal[] {
  return config[scope] ?? [];
}

export function validateScopeKeuze(
  config: ScopeKanaalConfig,
  scope: string,
  kanalen: ScopeKanaal[]
): ScopeKeuzeResult {
  if (kanalen.length > MAX_KANALEN_PER_SCOPE) {
    return { valid: false, reason: 'Een scope kan maar één kanaal hebben' };
  }

  const toegestaan = getToegestaneKanalen(config, scope);
  if (kanalen.some((kanaal) => !toegestaan.includes(kanaal))) {
    return {
      valid: false,
      reason: 'Kanaal is niet toegestaan voor deze scope',
    };
  }

  return { valid: true };
}
