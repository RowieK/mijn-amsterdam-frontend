import { formatApiFout, getAuth, maskeerAdres } from './zgw-script-helpers.ts';

describe('zgw-script-helpers', () => {
  describe('maskeerAdres', () => {
    test('toont van een e-mailadres alleen de eerste letter en het domein', () => {
      expect(maskeerAdres('jan@example.nl')).toBe('j***@example.nl');
    });

    test('toont van een telefoonnummer alleen de laatste vier cijfers', () => {
      expect(maskeerAdres('0612345678')).toBe('******5678');
    });
  });

  describe('getAuth', () => {
    test('geeft een DigiD-profiel voor een BSN', () => {
      expect(getAuth({ bsn: '999990019' })?.profile).toMatchObject({
        id: '999990019',
        profileType: 'private',
      });
    });

    test('geeft een eHerkenning-profiel voor een KVK-nummer', () => {
      expect(getAuth({ kvk: '69599084' })?.profile).toMatchObject({
        id: '69599084',
        profileType: 'commercial',
      });
    });

    test('geeft null zonder identificatie', () => {
      expect(getAuth({})).toBeNull();
    });
  });

  describe('formatApiFout', () => {
    test('zet status, code, detail en ongeldige velden op één regel', () => {
      expect(
        formatApiFout(400, {
          code: 'invalid',
          detail: 'Ongeldige invoer',
          invalidParams: [
            { name: 'adres', reason: 'Voer een geldig e-mailadres in.' },
          ],
        })
      ).toBe(
        'HTTP 400 | invalid | Ongeldige invoer | adres: Voer een geldig e-mailadres in.'
      );
    });

    test('geeft alleen de status zonder foutdetails', () => {
      expect(formatApiFout(502, undefined)).toBe('HTTP 502');
    });
  });
});
