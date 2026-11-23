// Gedeeld door de zgw-scripts (zgw:check, zgw:seed, zgw:testzaken).
import type { AuthProfileAndToken } from '../server/auth/auth-types.ts';
import type { ApiResponse } from '../universal/helpers/api.ts';

// De producttests van de OMC gebruiken dit BSN op de gedeelde testomgeving. Wij schrijven er niets op.
export const OMC_PRODUCTTEST_BSN = '999993653';

export function regel(tekst = '') {
  process.stdout.write(`${tekst}\n`);
}

export function foutmelding(response: ApiResponse<unknown>): string {
  return response.status === 'ERROR' ? response.message : response.status;
}

// Een foutantwoord van een ZGW-API als één regel: status, `code`, `detail` en de velden uit `invalidParams`.
// De API zet geen ingevoerde waarden in deze velden, dus er komen geen contactgegevens in de uitvoer.
export function formatApiFout(status: number, data: unknown): string {
  const { code, detail, invalidParams } = (data ?? {}) as {
    code?: string;
    detail?: string;
    invalidParams?: { name: string; reason: string }[];
  };

  return [
    `HTTP ${status}`,
    code,
    detail,
    ...(invalidParams ?? []).map(({ name, reason }) => `${name}: ${reason}`),
  ]
    .filter(Boolean)
    .join(' | ');
}

export function maskeerAdres(adres: string): string {
  const [lokaal, domein] = adres.split('@');

  if (domein !== undefined) {
    return `${lokaal.slice(0, 1)}***@${domein}`;
  }

  return `${'*'.repeat(Math.max(adres.length - 4, 0))}${adres.slice(-4)}`;
}

// Een ingelogde gebruiker zonder echte login, zodat een script dezelfde servicecode kan draaien als de BFF.
export function getAuth({
  bsn,
  kvk,
}: {
  bsn?: string;
  kvk?: string;
}): AuthProfileAndToken | null {
  const sid = 'zgw-script';

  if (bsn) {
    return {
      token: '',
      expiresAtMilliseconds: 0,
      profile: { id: bsn, authMethod: 'digid', profileType: 'private', sid },
    };
  }

  if (kvk) {
    return {
      token: '',
      expiresAtMilliseconds: 0,
      profile: {
        id: kvk,
        authMethod: 'eherkenning',
        profileType: 'commercial',
        sid,
      },
    };
  }

  return null;
}
