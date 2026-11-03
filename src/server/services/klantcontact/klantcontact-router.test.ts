import express from 'express';
import type { Request, Response } from 'express';

import type * as serviceConfig from './klantcontact-service-config.ts';
import { routes } from './klantcontact-service-config.ts';

// De handlers doen hier niet ter zake: we testen alleen welke routes bereikbaar zijn.
vi.mock('./klantcontact-route-handlers.ts', () => {
  const respondWith = (handler: string) => (_req: Request, res: Response) => {
    res.status(200).send({ handler });
  };

  return {
    handleVerifyContactgegeven: respondWith('verify'),
    handleCreateContactgegeven: respondWith('create'),
    handleDeleteContactgegeven: respondWith('delete'),
    handleSetZaakKanaalVoorkeur: respondWith('zaakvoorkeur-set'),
    handleDeleteZaakKanaalVoorkeur: respondWith('zaakvoorkeur-delete'),
  };
});

async function importRouter({ zaakvoorkeuren }: { zaakvoorkeuren: boolean }) {
  vi.resetModules();
  vi.doMock('./klantcontact-service-config.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof serviceConfig>();

    return {
      ...actual,
      featureToggle: { ...actual.featureToggle, zaakvoorkeuren },
    };
  });

  const { klantcontactRouter } = await import('./klantcontact-router.ts');

  return klantcontactRouter.protected;
}

async function postToRouter(router: express.Router, path: string) {
  const app = express();
  app.use(router);

  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server to a port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: 'POST',
    });

    return { status: response.status, text: await response.text() };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('klantcontact-router', () => {
  describe('met de toggle KLANT_CONTACT.zaakvoorkeuren aan', () => {
    test.each([
      { route: routes.ZAAKVOORKEUR_SET, handler: 'zaakvoorkeur-set' },
      { route: routes.ZAAKVOORKEUR_DELETE, handler: 'zaakvoorkeur-delete' },
    ])('$route is bereikbaar', async ({ route, handler }) => {
      const router = await importRouter({ zaakvoorkeuren: true });

      const response = await postToRouter(router, route);

      expect(response.status).toBe(200);
      expect(JSON.parse(response.text)).toEqual({ handler });
    });
  });

  describe('met de toggle KLANT_CONTACT.zaakvoorkeuren uit', () => {
    test.each([routes.ZAAKVOORKEUR_SET, routes.ZAAKVOORKEUR_DELETE])(
      '%s is niet bereikbaar',
      async (route) => {
        const router = await importRouter({ zaakvoorkeuren: false });

        const response = await postToRouter(router, route);

        expect(response.status).toBe(404);
      }
    );

    test('de bestaande contactgegeven-routes blijven bereikbaar', async () => {
      const router = await importRouter({ zaakvoorkeuren: false });

      const response = await postToRouter(
        router,
        routes.CONTACTGEGEVEN_CREATE
      );

      expect(response.status).toBe(200);
      expect(JSON.parse(response.text)).toEqual({ handler: 'create' });
    });
  });
});
