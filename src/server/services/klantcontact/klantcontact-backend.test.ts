import { createKlantcontactBackend } from './klantcontact-backend.ts';
import {
  getAmsterdamKlantcontactConfig,
  getKlantcontactBackendNaam,
} from './klantcontact-service-config.ts';
import { getAuthProfileAndToken } from '../../../testing/utils.ts';

describe('getKlantcontactBackendNaam', () => {
  test.each([undefined, '', '   '])(
    'kiest de profielservice als de variabele leeg of niet gezet is (%j)',
    (waarde) => {
      expect(getKlantcontactBackendNaam(waarde)).toBe('profielservice');
    }
  );

  test.each([
    ['profielservice', 'profielservice'],
    ['openklant', 'openklant'],
    [' OpenKlant ', 'openklant'],
  ])('leest %j als %s', (waarde, verwacht) => {
    expect(getKlantcontactBackendNaam(waarde)).toBe(verwacht);
  });

  test('stopt bij een onbekende waarde in plaats van stil terug te vallen op de standaard', () => {
    expect(() => getKlantcontactBackendNaam('open-klant')).toThrow(
      /onbekende waarde/
    );
  });
});

describe('createKlantcontactBackend', () => {
  const config = getAmsterdamKlantcontactConfig();
  const authProfileAndToken = getAuthProfileAndToken();
  const verifyProps = {
    type: 'Email',
    value: 'mokum@example.org',
    code: '123456',
  } as const;

  // Open Klant heeft geen verificatie en weigert direct (501). De profielservice doet er een HTTP-aanroep voor,
  // die in deze test niet is gestubd en dus mislukt zonder 501 te geven.
  test('kiest de Open Klant-backend voor "openklant"', async () => {
    const response = await createKlantcontactBackend(
      'openklant',
      config
    ).verifyContactgegeven(authProfileAndToken, verifyProps);

    expect(response).toMatchObject({ status: 'ERROR', code: 501 });
  });

  test('kiest de profielservice voor "profielservice"', async () => {
    const response = await createKlantcontactBackend(
      'profielservice',
      config
    ).verifyContactgegeven(authProfileAndToken, verifyProps);

    expect(response.status).toBe('ERROR');
    expect(response).not.toMatchObject({ code: 501 });
  });

  test('de profielservice-backend heeft Open Zaak voor zaakIsVanGebruiker', async () => {
    const response = await createKlantcontactBackend('profielservice', {
      ...config,
      openZaak: undefined,
    }).zaakIsVanGebruiker(authProfileAndToken, 'ZAAK-1');

    expect(response).toMatchObject({ status: 'ERROR', code: 503 });
  });
});
