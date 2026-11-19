import { jwtVerify } from 'jose';

import {
  createZgwJwt,
  hasZgwJwtCredentials,
  joinApiUrl,
} from './zgw-api-helpers.ts';

describe('zgw-api-helpers', () => {
  describe('createZgwJwt', () => {
    const credentials = {
      clientId: 'mijn-client',
      jwtSecret: 'een-lang-genoeg-geheim-voor-hs256',
    };

    test('maakt een HS256-token met de claims die een ZGW-API verwacht', async () => {
      const jwt = await createZgwJwt(credentials);

      const { payload, protectedHeader } = await jwtVerify(
        jwt,
        new TextEncoder().encode(credentials.jwtSecret)
      );

      expect(protectedHeader).toMatchObject({ alg: 'HS256', typ: 'JWT' });
      expect(payload).toMatchObject({
        iss: 'mijn-client',
        client_id: 'mijn-client',
        user_id: 'mijn-client',
        user_representation: 'mijn-client',
      });
      expect(typeof payload.iat).toBe('number');
    });

    test('is niet te verifiëren met een andere secret', async () => {
      const jwt = await createZgwJwt(credentials);

      await expect(
        jwtVerify(jwt, new TextEncoder().encode('een-andere-secret'))
      ).rejects.toThrow();
    });
  });

  describe('hasZgwJwtCredentials', () => {
    test('is alleen waar als client-id en secret allebei gevuld zijn', () => {
      expect(hasZgwJwtCredentials({ clientId: 'a', jwtSecret: 'b' })).toBe(
        true
      );
      expect(hasZgwJwtCredentials({ clientId: 'a' })).toBe(false);
      expect(hasZgwJwtCredentials({ jwtSecret: 'b' })).toBe(false);
      expect(hasZgwJwtCredentials({ clientId: '', jwtSecret: 'b' })).toBe(
        false
      );
    });
  });

  describe('joinApiUrl', () => {
    test.each([
      ['https://host/api/v1/', 'zaken'],
      ['https://host/api/v1', 'zaken'],
      ['https://host/api/v1//', '/zaken'],
    ])('voegt %s en %s samen met precies één slash', (base, path) => {
      expect(joinApiUrl(base, path)).toBe('https://host/api/v1/zaken');
    });
  });
});
